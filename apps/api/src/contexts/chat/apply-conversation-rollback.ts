import type { PrismaClient } from '@zivith/database';
import type { MemoryService } from '../memory/service.js';
import {
  appliedEntitiesFromProposal,
  rollbackCut,
  wasStudioEdited,
} from './conversation-rollback.js';

export type RollbackMode = 'withdraw' | 'keep';

const REVERSIBLE_KINDS = new Set([
  'create_world_event',
  'create_relationship',
  'create_character',
  'create_location',
]);

export async function applyConversationRollback(
  db: PrismaClient,
  input: {
    threadId: string;
    targetMessageId: string;
    mode: RollbackMode;
    memory?: MemoryService | null;
  },
): Promise<{
  head_message_id: string | null;
  suppressed_ids: string[];
  reverted: Array<{ entity_id: string; title: string; kind: string }>;
  skipped: Array<{ entity_id: string; title: string; reason: string }>;
}> {
  const live = await db.creatorChatMessage.findMany({
    where: { threadId: input.threadId, suppressed: false },
    orderBy: { createdAt: 'asc' },
  });
  const cut = rollbackCut({
    messages: live.map((row) => ({ id: row.id, role: row.role })),
    targetMessageId: input.targetMessageId,
    mode: input.mode,
  });
  if (cut.suppressIds.length === 0 && !live.some((row) => row.id === input.targetMessageId)) {
    return { head_message_id: cut.headMessageId, suppressed_ids: [], reverted: [], skipped: [] };
  }

  const suppressSet = new Set(cut.suppressIds);
  const toSuppress = live.filter((row) => suppressSet.has(row.id));
  const reverted: Array<{ entity_id: string; title: string; kind: string }> = [];
  const skipped: Array<{ entity_id: string; title: string; reason: string }> = [];

  for (const message of toSuppress) {
    if (message.proposalState === 'pending') {
      await db.creatorChatMessage.update({
        where: { id: message.id },
        data: { proposalState: 'rejected' },
      });
    }
    if (message.proposalState !== 'applied') continue;
    for (const entity of appliedEntitiesFromProposal(message.proposal)) {
      if (!REVERSIBLE_KINDS.has(entity.kind) || !entity.entityId) {
        skipped.push({
          entity_id: entity.entityId,
          title: entity.title,
          reason: entity.kind === 'create_project' ? '不能回退整个世界' : '这类写入本切片不自动撤',
        });
        continue;
      }
      const outcome = await revertCreatedEntity(db, entity);
      if (outcome === 'reverted') {
        reverted.push({ entity_id: entity.entityId, title: entity.title, kind: entity.kind });
      } else {
        skipped.push({ entity_id: entity.entityId, title: entity.title, reason: outcome });
      }
    }
  }

  if (cut.suppressIds.length > 0) {
    await db.creatorChatMessage.updateMany({
      where: { id: { in: cut.suppressIds } },
      data: { suppressed: true },
    });
  }
  await db.creatorChatThread.update({
    where: { id: input.threadId },
    data: { activeHeadMessageId: cut.headMessageId, updatedAt: new Date() },
  });

  if (input.memory && cut.suppressIds.length > 0) {
    await input.memory.invalidateAtomsFromMessages(cut.suppressIds);
  }

  return {
    head_message_id: cut.headMessageId,
    suppressed_ids: cut.suppressIds,
    reverted,
    skipped,
  };
}

async function revertCreatedEntity(
  db: PrismaClient,
  entity: { kind: string; entityId: string; entityType: string; title: string },
): Promise<'reverted' | string> {
  if (entity.kind === 'create_world_event' || entity.entityType === 'world_event') {
    const row = await db.worldEvent.findFirst({ where: { id: entity.entityId } });
    if (!row || row.deletedAt) return '已经不在时间线上';
    const anchored = await db.roleplayThread.findFirst({
      where: { anchoredWorldEventId: row.id, status: 'active' },
    });
    if (anchored) return '别的扮演还锚在这件事上';
    if (wasStudioEdited(row.createdAt, row.updatedAt)) return '后来在 Studio 里改过';
    await db.worldEvent.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
    return 'reverted';
  }
  if (entity.kind === 'create_relationship' || entity.entityType === 'relationship') {
    const row = await db.relationship.findFirst({ where: { id: entity.entityId } });
    if (!row || row.deletedAt) return '已经不在关系里';
    if (wasStudioEdited(row.createdAt, row.updatedAt)) return '后来在 Studio 里改过';
    await db.relationship.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
    return 'reverted';
  }
  if (
    entity.kind === 'create_character' ||
    entity.kind === 'create_location' ||
    entity.entityType === 'asset'
  ) {
    const row = await db.asset.findFirst({ where: { id: entity.entityId } });
    if (!row || row.deletedAt) return '已经不在世界里';
    if (wasStudioEdited(row.createdAt, row.updatedAt)) return '后来在 Studio 里改过';
    await db.asset.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
    return 'reverted';
  }
  return '这类写入本切片不自动撤';
}
