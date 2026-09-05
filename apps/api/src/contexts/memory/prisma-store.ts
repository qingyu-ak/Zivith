import type { PrismaClient } from '@zivith/database';
import { buildWorldContext } from '../world-builder/world-context.js';
import type {
  CreateAtomInput,
  CreateConflictInput,
  MemoryAtomRecord,
  MemoryConflictRecord,
  MemoryCoreRecord,
  MemoryPipelineStateRecord,
  MemoryStore,
  MemoryPipelineStateRecord as PipelineRecord,
  ThreadContextStateRecord,
  UpsertCoreInput,
} from './store.js';

export class PrismaMemoryStore implements MemoryStore {
  constructor(private readonly db: PrismaClient) {}

  async findActiveAtoms(
    projectId: string,
    filter?: { entityType?: string | null; entityId?: string | null; factType?: string },
    take = 500,
  ): Promise<MemoryAtomRecord[]> {
    const rows = await this.db.memoryAtom.findMany({
      where: {
        projectId,
        status: 'active',
        ...(filter?.entityType !== undefined ? { entityType: filter.entityType } : {}),
        ...(filter?.entityId !== undefined ? { entityId: filter.entityId } : {}),
        ...(filter?.factType ? { factType: filter.factType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows;
  }

  async findAtomsByMessage(messageId: string): Promise<MemoryAtomRecord[]> {
    return this.db.memoryAtom.findMany({
      where: { sourceMessageId: messageId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createAtom(input: CreateAtomInput): Promise<MemoryAtomRecord> {
    return this.db.memoryAtom.create({ data: input });
  }

  async updateAtom(
    id: string,
    patch: Partial<
      Pick<
        MemoryAtomRecord,
        | 'status'
        | 'supersededById'
        | 'validTo'
        | 'memoryOp'
        | 'content'
        | 'factType'
        | 'entityType'
        | 'entityId'
        | 'confidence'
        | 'dedupHash'
      >
    >,
  ): Promise<void> {
    await this.db.memoryAtom.update({ where: { id }, data: patch });
  }

  async invalidateAtom(id: string): Promise<boolean> {
    const updated = await this.db.memoryAtom.updateMany({
      where: { id, status: 'active' },
      data: { status: 'invalidated', validTo: new Date() },
    });
    return updated.count > 0;
  }

  async listAtoms(
    projectId: string,
    options: { entityType?: string; entityId?: string; page: number; pageSize: number },
  ): Promise<{ items: MemoryAtomRecord[]; total: number }> {
    const where = {
      projectId,
      status: 'active',
      ...(options.entityType ? { entityType: options.entityType } : {}),
      ...(options.entityId ? { entityId: options.entityId } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.memoryAtom.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      }),
      this.db.memoryAtom.count({ where }),
    ]);
    return { items, total };
  }

  async upsertPipelineState(
    messageId: string,
    patch: Partial<Pick<PipelineRecord, 'status' | 'extractionMode' | 'level1At'>>,
  ): Promise<void> {
    await this.db.memoryPipelineState.upsert({
      where: { messageId },
      create: { messageId, ...patch },
      update: patch,
    });
  }

  async markPipelineFailure(messageId: string, error: string): Promise<void> {
    const existing = await this.db.memoryPipelineState.findUnique({ where: { messageId } });
    const attempts = (existing?.attempts ?? 0) + 1;
    await this.db.memoryPipelineState.upsert({
      where: { messageId },
      create: { messageId, status: 'failed', attempts: 1, lastError: error.slice(0, 500) },
      update: {
        status: attempts >= 3 ? 'failed' : 'pending',
        attempts,
        lastError: error.slice(0, 500),
      },
    });
  }

  async getPipelineState(messageId: string): Promise<MemoryPipelineStateRecord | null> {
    return this.db.memoryPipelineState.findUnique({ where: { messageId } });
  }

  async getMessageWithProject(
    messageId: string,
  ): Promise<{ id: string; content: string; projectId: string | null } | null> {
    const message = await this.db.creatorChatMessage.findFirst({
      where: { id: messageId },
      include: { thread: { select: { projectId: true } } },
    });
    if (!message) return null;
    return { id: message.id, content: message.content, projectId: message.thread.projectId };
  }

  async upsertCore(input: UpsertCoreInput): Promise<void> {
    const existing = await this.db.memoryCore.findFirst({
      where: { projectId: input.projectId, kind: input.kind, topic: input.topic },
      select: { id: true, version: true },
    });
    if (existing) {
      await this.db.memoryCore.update({
        where: { id: existing.id },
        data: {
          content: input.content,
          sourceAtomIds: input.sourceAtomIds,
          version: existing.version + 1,
        },
      });
      return;
    }
    await this.db.memoryCore.create({ data: input });
  }

  async listCores(projectId: string): Promise<MemoryCoreRecord[]> {
    return this.db.memoryCore.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } });
  }

  async findAtomsByIds(ids: string[]): Promise<MemoryAtomRecord[]> {
    if (ids.length === 0) return [];
    return this.db.memoryAtom.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: 'asc' } });
  }

  async createConflict(input: CreateConflictInput): Promise<MemoryConflictRecord> {
    return this.db.memoryConflict.create({ data: input });
  }

  async findConflict(id: string): Promise<MemoryConflictRecord | null> {
    return this.db.memoryConflict.findUnique({ where: { id } });
  }

  async listConflicts(
    projectId: string,
    options?: { status?: string; threadId?: string },
  ): Promise<MemoryConflictRecord[]> {
    return this.db.memoryConflict.findMany({
      where: {
        projectId,
        ...(options?.status ? { status: options.status } : {}),
        ...(options?.threadId ? { threadId: options.threadId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async updateConflict(
    id: string,
    patch: Partial<
      Pick<MemoryConflictRecord, 'status' | 'decision' | 'resolvedAtomId' | 'resolvedAt'>
    >,
  ): Promise<void> {
    await this.db.memoryConflict.update({ where: { id }, data: patch });
  }

  async buildWorldContext(projectId: string) {
    return buildWorldContext(this.db, projectId);
  }

  async findContextState(threadId: string): Promise<ThreadContextStateRecord | null> {
    return this.db.threadContextState.findUnique({ where: { threadId } });
  }

  async upsertContextState(
    threadId: string,
    patch: Partial<
      Pick<
        ThreadContextStateRecord,
        'rollingSummary' | 'summarizedUntilMessageId' | 'summaryVersion' | 'tokenEstimate'
      >
    >,
  ): Promise<void> {
    await this.db.threadContextState.upsert({
      where: { threadId },
      create: { threadId, ...patch },
      update: patch,
    });
  }
}
