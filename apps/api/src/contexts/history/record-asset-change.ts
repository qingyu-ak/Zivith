import type { Asset, Prisma, PrismaClient } from '@zivith/database';
import type { EntityChangeKind, HistoryEntityType } from '@zivith/domain';
import { ApiError } from '../../errors.js';
import {
  recordEntityChange,
  type RecordEntityChangeInput,
  type RecordEntityChangeResult,
} from './record-entity-change.js';

type Db = PrismaClient | Prisma.TransactionClient;

export type WorldAssetType = 'character' | 'location';

export function historyEntityTypeForAsset(type: string): WorldAssetType | null {
  if (type === 'character' || type === 'location') return type;
  return null;
}

export interface RecordAssetHistoryInput {
  asset: Asset;
  changeKind: Extract<EntityChangeKind, 'baseline' | 'create' | 'update'>;
  eventType: 'entity.created' | 'entity.changed';
  idempotencyKey: string;
  actorId?: string | null;
  actorType?: 'user' | 'system' | 'agent';
  sourceType?: string;
  sourceId?: string;
  asOfWorldEventId?: string | null;
  stageLabel?: string | null;
  changedFields?: string[];
}

function overlayRow(
  asset: Asset,
  asOfWorldEventId: string | null,
  asOfPresentationOrder: number | null,
  stageLabel: string | null,
): Record<string, unknown> {
  return {
    ...asset,
    asOfWorldEventId,
    asOfPresentationOrder,
    stageLabel,
  };
}

export async function recordAssetHistory(
  db: Db,
  input: RecordAssetHistoryInput,
): Promise<RecordEntityChangeResult | undefined> {
  const entityType = historyEntityTypeForAsset(input.asset.type);
  if (!entityType) return undefined;

  const asOfWorldEventId = input.asOfWorldEventId ?? null;
  let asOfPresentationOrder: number | null = null;
  if (asOfWorldEventId) {
    const event = await db.worldEvent.findFirst({
      where: { id: asOfWorldEventId, projectId: input.asset.projectId, deletedAt: null },
      select: { id: true, presentationOrder: true },
    });
    if (!event) {
      throw new ApiError(400, 'WORLD_EVENT_NOT_FOUND', '锚定的世界事件不存在');
    }
    asOfPresentationOrder = event.presentationOrder ?? null;
  }

  const stageLabel = input.stageLabel?.trim() ? input.stageLabel.trim() : null;

  const payload: RecordEntityChangeInput = {
    projectId: input.asset.projectId,
    entityType,
    entityId: input.asset.id,
    row: overlayRow(input.asset, asOfWorldEventId, asOfPresentationOrder, stageLabel),
    changeKind: input.changeKind,
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    actorId: input.actorId ?? null,
    actorType: input.actorType ?? 'system',
  };
  if (input.sourceType) payload.sourceType = input.sourceType;
  if (input.sourceId) payload.sourceId = input.sourceId;
  if (input.changedFields) payload.changedFields = input.changedFields;

  return recordEntityChange(db, payload, { mode: 'dual' });
}

export async function ensureAssetBaseline(
  db: Db,
  asset: Asset,
  options?: { sourceType?: string; actorId?: string | null },
): Promise<RecordEntityChangeResult | undefined> {
  const entityType: HistoryEntityType | null = historyEntityTypeForAsset(asset.type);
  if (!entityType) return undefined;
  const existing = await db.entityRevision.findFirst({
    where: { entityType, entityId: asset.id },
    select: { id: true },
  });
  if (existing) return undefined;
  return recordAssetHistory(db, {
    asset,
    changeKind: 'baseline',
    eventType: 'entity.created',
    idempotencyKey: `baseline:${entityType}:${asset.id}`,
    actorType: 'system',
    actorId: options?.actorId ?? null,
    sourceType: options?.sourceType ?? 'ensure_baseline',
  });
}
