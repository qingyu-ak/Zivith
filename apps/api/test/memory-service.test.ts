import { describe, expect, it } from 'vitest';
import type { MemoryIngestOps } from '@zivith/domain';
import { MemoryService } from '../src/contexts/memory/service.js';
import { ApiError } from '../src/errors.js';
import type {
  CreateAtomInput,
  CreateConflictInput,
  MemoryAtomRecord,
  MemoryConflictRecord,
  MemoryCoreRecord,
  MemoryStore,
  ThreadContextStateRecord,
} from '../src/contexts/memory/store.js';

class FakeStore implements MemoryStore {
  atoms: MemoryAtomRecord[] = [];
  cores: MemoryCoreRecord[] = [];
  pipelineStates = new Map<string, { status: string; attempts: number }>();
  contextStates = new Map<string, ThreadContextStateRecord>();

  async findActiveAtoms(
    projectId: string,
    filter?: { entityType?: string | null; entityId?: string | null; factType?: string },
  ) {
    return this.atoms.filter(
      (atom) =>
        atom.projectId === projectId &&
        atom.status === 'active' &&
        (filter?.entityType === undefined || atom.entityType === filter.entityType) &&
        (filter?.entityId === undefined || atom.entityId === filter.entityId) &&
        (!filter?.factType || atom.factType === filter.factType),
    );
  }
  async findAtomsByMessage(messageId: string) {
    return this.atoms.filter((atom) => atom.sourceMessageId === messageId);
  }
  async createAtom(input: CreateAtomInput) {
    const atom: MemoryAtomRecord = {
      ...input,
      id: `atom-${this.atoms.length + 1}`,
      status: 'active',
      supersededById: null,
      validFrom: new Date(),
      validTo: null,
      createdAt: new Date(),
    };
    this.atoms.push(atom);
    return atom;
  }
  async updateAtom(id: string, patch: Partial<MemoryAtomRecord>) {
    const atom = this.atoms.find((item) => item.id === id);
    if (atom) Object.assign(atom, patch);
  }
  async invalidateAtom(id: string) {
    const atom = this.atoms.find((item) => item.id === id);
    if (atom && atom.status === 'active') {
      atom.status = 'invalidated';
      atom.validTo = new Date();
      return true;
    }
    return false;
  }
  async listAtoms(projectId: string, options: { page: number; pageSize: number }) {
    const items = this.atoms.filter((a) => a.projectId === projectId && a.status === 'active');
    return {
      items: items.slice((options.page - 1) * options.pageSize, options.page * options.pageSize),
      total: items.length,
    };
  }
  async upsertPipelineState(messageId: string, patch: { status?: string }) {
    const current = this.pipelineStates.get(messageId) ?? { status: 'pending', attempts: 0 };
    this.pipelineStates.set(messageId, { ...current, ...patch });
  }
  async markPipelineFailure(messageId: string, error: string) {
    const current = this.pipelineStates.get(messageId) ?? { status: 'pending', attempts: 0 };
    this.pipelineStates.set(messageId, {
      status: current.attempts + 1 >= 3 ? 'failed' : 'pending',
      attempts: current.attempts + 1,
    });
    void error;
  }
  async getPipelineState(messageId: string) {
    const state = this.pipelineStates.get(messageId);
    return state
      ? {
          messageId,
          level1At: null,
          extractionMode: 'rule',
          status: state.status,
          attempts: state.attempts,
          lastError: null,
        }
      : null;
  }
  async getMessageWithProject(messageId: string) {
    return { id: messageId, content: '林澈性格冷静。', projectId: 'p1' };
  }
  async upsertCore(input: {
    projectId?: string;
    kind: string;
    topic: string;
    content: string;
    sourceAtomIds: string[];
  }) {
    const existing = this.cores.find(
      (core) => core.kind === input.kind && core.topic === input.topic,
    );
    if (existing) {
      existing.content = input.content;
      existing.sourceAtomIds = input.sourceAtomIds;
      existing.version += 1;
      return;
    }
    this.cores.push({
      id: `core-${this.cores.length + 1}`,
      projectId: 'p1',
      kind: input.kind,
      topic: input.topic,
      content: input.content,
      version: 1,
      sourceAtomIds: input.sourceAtomIds,
      updatedAt: new Date(),
    });
  }
  async findCore(id: string) {
    return this.cores.find((core) => core.id === id) ?? null;
  }
  async updateCore(id: string, patch: { content: string }) {
    const core = this.cores.find((item) => item.id === id);
    if (!core) return null;
    core.content = patch.content;
    core.version += 1;
    core.updatedAt = new Date();
    return core;
  }
  async listCores(projectId: string) {
    return this.cores.filter((core) => core.projectId === projectId);
  }
  conflicts: MemoryConflictRecord[] = [];
  async findAtomsByIds(ids: string[]) {
    return this.atoms.filter((atom) => ids.includes(atom.id));
  }
  async createConflict(input: CreateConflictInput) {
    const conflict: MemoryConflictRecord = {
      ...input,
      id: `conflict-${this.conflicts.length + 1}`,
      status: 'pending',
      decision: null,
      resolvedAtomId: null,
      createdAt: new Date(),
      resolvedAt: null,
    };
    this.conflicts.push(conflict);
    return conflict;
  }
  async findConflict(id: string) {
    return this.conflicts.find((conflict) => conflict.id === id) ?? null;
  }
  async listConflicts(projectId: string, options?: { status?: string; threadId?: string }) {
    return this.conflicts.filter(
      (conflict) =>
        conflict.projectId === projectId &&
        (!options?.status || conflict.status === options.status) &&
        (!options?.threadId || conflict.threadId === options.threadId),
    );
  }
  async updateConflict(
    id: string,
    patch: Partial<
      Pick<MemoryConflictRecord, 'status' | 'decision' | 'resolvedAtomId' | 'resolvedAt'>
    >,
  ) {
    const conflict = this.conflicts.find((item) => item.id === id);
    if (conflict) Object.assign(conflict, patch);
  }
  async buildWorldContext(projectId: string) {
    void projectId;
    return world;
  }
  async findContextState(threadId: string) {
    return this.contextStates.get(threadId) ?? null;
  }
  async upsertContextState(threadId: string, patch: Partial<ThreadContextStateRecord>) {
    const current = this.contextStates.get(threadId) ?? {
      threadId,
      rollingSummary: '',
      summarizedUntilMessageId: null,
      summaryVersion: 0,
      tokenEstimate: 0,
    };
    this.contextStates.set(threadId, { ...current, ...patch });
  }
}

const world = {
  projectId: 'p1',
  projectName: '测试世界',
  worldview: { rules: [] },
  stories: [],
  characters: [{ id: 'c1', name: '林澈', description: null, tags: [] }],
  locations: [],
  scenes: [],
  worldEvents: [],
  relationships: [],
} as NonNullable<Parameters<MemoryService['ingest']>[0]['world']>;

function makeService(store: FakeStore) {
  const enqueued: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const service = new MemoryService({
    store,
    queue: {
      enqueue: async (job) => {
        enqueued.push({ type: job.type, payload: job.payload as Record<string, unknown> });
        return { job_id: job.idempotency_key };
      },
      cancel: async () => {},
    },
  });
  return { service, enqueued };
}

describe('MemoryService.ingest（同步快速路径）', () => {
  it('archives linked atoms and enqueues refine job', async () => {
    const store = new FakeStore();
    const { service, enqueued } = makeService(store);
    const ops: MemoryIngestOps = await service.ingest({
      messageId: 'm1',
      threadId: 't1',
      projectId: 'p1',
      content: '林澈性格冷静。他渴望成为仙人。',
      world,
    });
    expect(ops.added).toBe(2);
    expect(store.atoms).toHaveLength(2);
    expect(store.atoms[0]).toMatchObject({ entityType: 'character', entityId: 'c1' });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({ type: 'memory_refine', payload: { message_id: 'm1' } });
  });

  it('second identical ingest is NOOP (no new atoms, no enqueue)', async () => {
    const store = new FakeStore();
    const { service, enqueued } = makeService(store);
    await service.ingest({
      messageId: 'm1',
      threadId: 't1',
      projectId: 'p1',
      content: '林澈性格冷静。',
      world,
    });
    await service.ingest({
      messageId: 'm2',
      threadId: 't1',
      projectId: 'p1',
      content: '林澈性格冷静！',
      world,
    });
    expect(store.atoms).toHaveLength(1);
    expect(enqueued).toHaveLength(1);
  });

  it('antonym conflict is reported, not written', async () => {
    const store = new FakeStore();
    const { service } = makeService(store);
    await service.ingest({
      messageId: 'm1',
      threadId: 't1',
      projectId: 'p1',
      content: '林澈性格阴郁。',
      world,
    });
    const ops = await service.ingest({
      messageId: 'm2',
      threadId: 't1',
      projectId: 'p1',
      content: '林澈性格开朗。',
      world,
    });
    expect(ops.conflicts).toHaveLength(1);
    expect(store.atoms).toHaveLength(1);
  });
});

describe('MemoryService 冲突清单（D4）', () => {
  async function seedConflict(store: FakeStore) {
    const { service } = makeService(store);
    await service.ingest({
      messageId: 'm1',
      threadId: 't1',
      projectId: 'p1',
      content: '林澈性格阴郁。',
      world,
    });
    const ops = await service.ingest({
      messageId: 'm2',
      threadId: 't1',
      projectId: 'p1',
      content: '林澈性格开朗。',
      world,
    });
    return { service, ops };
  }

  it('ingest 落库冲突并带回 id 与实体信息', async () => {
    const store = new FakeStore();
    const { service, ops } = await seedConflict(store);
    expect(ops.conflicts).toHaveLength(1);
    expect(ops.conflicts[0]).toMatchObject({
      id: 'conflict-1',
      content: '林澈性格开朗。',
      existing_content: '林澈性格阴郁。',
      entity_type: 'character',
      entity_id: 'c1',
      fact_type: 'trait',
      status: 'pending',
    });
    expect(store.conflicts).toHaveLength(1);
    expect(store.conflicts[0]).toMatchObject({
      existingAtomId: 'atom-1',
      threadId: 't1',
      sourceMessageId: 'm2',
      factType: 'trait',
    });
    expect(store.atoms).toHaveLength(1); // 冲突不写原子
    expect((await service.listConflicts('p1', { status: 'pending' })).length).toBe(1);
  });

  it('keep_new：新原子取代旧卡，旧卡 superseded', async () => {
    const store = new FakeStore();
    const { service, ops } = await seedConflict(store);
    const conflictId = ops.conflicts[0]!.id!;

    const resolved = await service.resolveConflict(conflictId, 'keep_new');

    expect(resolved.status).toBe('resolved');
    expect(resolved.decision).toBe('keep_new');
    expect(resolved.resolvedAtomId).toBe('atom-2');
    expect(resolved.resolvedAt).not.toBeNull();
    const active = store.atoms.filter((atom) => atom.status === 'active');
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      id: 'atom-2',
      content: '林澈性格开朗。',
      memoryOp: 'UPDATE',
    });
    expect(store.atoms[0]).toMatchObject({
      id: 'atom-1',
      status: 'superseded',
      supersededById: 'atom-2',
    });
  });

  it('keep_new 时旧卡已失效则直接新增、不再取代', async () => {
    const store = new FakeStore();
    const { service, ops } = await seedConflict(store);
    await service.invalidateAtom('atom-1');

    const resolved = await service.resolveConflict(ops.conflicts[0]!.id!, 'keep_new');

    expect(resolved.resolvedAtomId).toBe('atom-2');
    expect(store.atoms.find((atom) => atom.id === 'atom-2')).toMatchObject({
      memoryOp: 'ADD',
      status: 'active',
    });
    expect(store.atoms[0]!.status).toBe('invalidated');
  });

  it('keep_existing：不写原子，冲突标 discarded', async () => {
    const store = new FakeStore();
    const { service, ops } = await seedConflict(store);

    const resolved = await service.resolveConflict(ops.conflicts[0]!.id!, 'keep_existing');

    expect(resolved.status).toBe('discarded');
    expect(resolved.decision).toBe('keep_existing');
    expect(resolved.resolvedAtomId).toBeNull();
    expect(store.atoms).toHaveLength(1);
  });

  it('已裁决的冲突不能重复处理；不存在的冲突 404', async () => {
    const store = new FakeStore();
    const { service, ops } = await seedConflict(store);
    const conflictId = ops.conflicts[0]!.id!;
    await service.resolveConflict(conflictId, 'keep_existing');

    await expect(service.resolveConflict(conflictId, 'keep_new')).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.resolveConflict('missing', 'keep_new')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('MemoryService.processRefine（深加工）', () => {
  it('refines atoms via LLM, aggregates L2 cores and marks done (mock rule path)', async () => {
    const store = new FakeStore();
    const { service } = makeService(store);
    await service.ingest({
      messageId: 'm1',
      threadId: 't1',
      projectId: 'p1',
      content: '林澈性格冷静。他渴望成为仙人。',
      world,
    });
    await service.processRefine('m1');
    // 规则模式：无 LLM → 原子保持原文，L2 按 (character,c1) 聚合为 persona
    expect(store.cores).toHaveLength(1);
    expect(store.cores[0]).toMatchObject({ kind: 'persona', topic: '林澈' });
    expect(store.cores[0]!.content).toContain('冷静');
    expect(store.pipelineStates.get('m1')?.status).toBe('done');
  });

  it('patches a persona archive by id without changing topic', async () => {
    const store = new FakeStore();
    const { service } = makeService(store);
    await store.upsertCore({
      projectId: 'p1',
      kind: 'persona',
      topic: '酒德麻衣',
      content: '出场：34 章，提及 294 次',
      sourceAtomIds: [],
    });
    const updated = await service.patchCore('p1', 'core-1', '酒德麻衣记得自己是混血种。');
    expect(updated).toMatchObject({
      id: 'core-1',
      topic: '酒德麻衣',
      content: '酒德麻衣记得自己是混血种。',
      version: 2,
    });
  });

  it('creates a persona archive when the character has none', async () => {
    const store = new FakeStore();
    const { service } = makeService(store);
    const created = await service.saveCore('p1', {
      kind: 'persona',
      topic: '路明非',
      content: '路明非是废柴主角。',
    });
    expect(created.topic).toBe('路明非');
    expect(store.cores).toHaveLength(1);
  });

  it('is idempotent (second run is a no-op)', async () => {
    const store = new FakeStore();
    const { service } = makeService(store);
    await service.ingest({
      messageId: 'm1',
      threadId: 't1',
      projectId: 'p1',
      content: '林澈性格冷静。',
      world,
    });
    await service.processRefine('m1');
    await service.processRefine('m1');
    expect(store.cores).toHaveLength(1);
  });
});
