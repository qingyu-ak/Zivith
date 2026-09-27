import type { Prisma, PrismaClient } from '@zivith/database';
import {
  HISTORY_ENTITY_TYPES,
  pickAssetRevisionAtOrder,
  type HistoryEntityType,
} from '@zivith/domain';
import { ApiError } from '../../errors.js';
import { ensureAssetBaseline } from './record-asset-change.js';

type Db = PrismaClient | Prisma.TransactionClient;

function isHistoryEntityType(value: string): value is HistoryEntityType {
  return (HISTORY_ENTITY_TYPES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface EntityRevisionDTO {
  id: string;
  revision: number;
  change_kind: string;
  created_at: Date;
  stage_label: string | null;
  as_of_world_event_id: string | null;
  as_of_presentation_order: number | null;
  snapshot: Record<string, unknown>;
}

export function entityRevisionDto(row: {
  id: string;
  revision: number;
  changeKind: string;
  createdAt: Date;
  snapshot: unknown;
}): EntityRevisionDTO {
  const snapshot = isRecord(row.snapshot) ? row.snapshot : {};
  return {
    id: row.id,
    revision: row.revision,
    change_kind: row.changeKind,
    created_at: row.createdAt,
    stage_label: typeof snapshot.stage_label === 'string' ? snapshot.stage_label : null,
    as_of_world_event_id:
      typeof snapshot.as_of_world_event_id === 'string' ? snapshot.as_of_world_event_id : null,
    as_of_presentation_order:
      typeof snapshot.as_of_presentation_order === 'number'
        ? snapshot.as_of_presentation_order
        : null,
    snapshot,
  };
}

export async function listEntityRevisions(
  db: Db,
  projectId: string,
  entityType: string,
  entityId: string,
  query?: { asOfWorldEventId?: string; presentationOrder?: number },
): Promise<{
  entity_type: HistoryEntityType;
  entity_id: string;
  revisions: EntityRevisionDTO[];
  at: EntityRevisionDTO | null;
}> {
  if (!isHistoryEntityType(entityType)) {
    throw new ApiError(400, 'UNSUPPORTED_ENTITY_TYPE', '不支持的实体类型');
  }

  if (entityType === 'character' || entityType === 'location') {
    const asset = await db.asset.findFirst({
      where: { id: entityId, projectId, type: entityType, deletedAt: null },
    });
    if (!asset) throw new ApiError(404, 'ENTITY_NOT_FOUND', '实体不存在');
    await ensureAssetBaseline(db, asset, { sourceType: 'revisions_read' });
  }

  const rows = await db.entityRevision.findMany({
    where: { projectId, entityType, entityId, branchId: null },
    orderBy: { revision: 'asc' },
  });
  const revisions = rows.map(entityRevisionDto);

  let at: EntityRevisionDTO | null = null;
  if (query?.asOfWorldEventId || query?.presentationOrder !== undefined) {
    let order = query.presentationOrder ?? null;
    if (query.asOfWorldEventId) {
      const event = await db.worldEvent.findFirst({
        where: { id: query.asOfWorldEventId, projectId, deletedAt: null },
        select: { presentationOrder: true },
      });
      if (!event) throw new ApiError(400, 'WORLD_EVENT_NOT_FOUND', '锚定的世界事件不存在');
      order = event.presentationOrder ?? null;
    }
    at = pickAssetRevisionAtOrder(revisions, order);
  }

  return { entity_type: entityType, entity_id: entityId, revisions, at };
}

export async function getEntityRevision(
  db: Db,
  projectId: string,
  entityType: string,
  entityId: string,
  revision: number,
): Promise<EntityRevisionDTO> {
  const listed = await listEntityRevisions(db, projectId, entityType, entityId);
  const found = listed.revisions.find((item) => item.revision === revision);
  if (!found) throw new ApiError(404, 'REVISION_NOT_FOUND', '该修订不存在');
  return found;
}
