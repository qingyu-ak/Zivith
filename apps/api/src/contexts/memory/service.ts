import {
  jaccardSimilarity,
  tokenizeForSimilarity,
  type MemoryConflictDecision,
  type MemoryIngestOps,
  type RetrievedMemory,
} from '@zivith/domain';
import { ApiError } from '../../errors.js';
import type { EmbeddingAdapter, QueuePort } from '../../ports/index.js';
import type { LLMAdapter } from '../../ports/llm.js';
import type { LocalVectorStore } from '../../adapters/memory/local-vector-store.js';
import type { WorldContext } from '../world-builder/world-context.js';
import { computeDedupHash } from './fingerprint.js';
import {
  extractCandidateAtoms,
  extractRoleplayImportantAtoms,
  resolveEntityByName,
  linkEntities,
} from './extract.js';
import { decideAtomAction } from './cleaning.js';
import { dedupeRetrieved, keywordRank, rrfFuse } from './retrieval.js';
import {
  buildBudgetedHistory,
  clipRollingSummary,
  compressHistory,
  contextTokenBudget,
  estimateTokens,
  type ContextMessage,
} from './context-window.js';
import {
  coreKindForEntityType,
  MEMORY_REFINE_SYSTEM_PROMPT,
  memoryRefineSchema,
} from './pipeline.js';
import type {
  MemoryAtomRecord,
  MemoryConflictRecord,
  MemoryCoreRecord,
  MemoryStore,
} from './store.js';

export interface MemoryServiceDeps {
  store: MemoryStore;
  vectorStore?: LocalVectorStore | null;
  embedding?: EmbeddingAdapter | null;
  llm?: LLMAdapter | null;
  llmModel?: string;
  queue?: QueuePort | null;
}

/**
 * 分层记忆服务（M1）：
 * - ingest：同步规则快速路径（抽取→链接→清洗→归档→入队深加工）
 * - processRefine：异步深加工（Task 9 实现：LLM 精炼 → L2 聚合 → 向量化）
 * - retrieve：三路混合召回（Task 10 实现）
 * - getContextWindow / updateThreadSummary：上下文窗口管理（Task 11 实现）
 */
export class MemoryService {
  private queue: QueuePort | null;

  constructor(private readonly deps: MemoryServiceDeps) {
    this.queue = deps.queue ?? null;
  }

  /** 运行时注入队列（server.ts 创建 queue runtime 后调用，镜像 GenerationService.attachQueue）。 */
  attachQueue(queue: QueuePort): void {
    this.queue = queue;
  }

  async ingest(params: {
    messageId: string;
    threadId: string;
    projectId: string;
    content: string;
    world: WorldContext | null;
    /** roleplay = 精简重要聊天；默认 world，World Builder 抽取不变。 */
    ingestMode?: 'roleplay' | 'world';
    defaultEntity?: { entityType: string; entityId: string };
  }): Promise<MemoryIngestOps> {
    const ops: MemoryIngestOps = { added: 0, updated: 0, noop: 0, conflicts: [] };
    const candidates =
      params.ingestMode === 'roleplay'
        ? extractRoleplayImportantAtoms(params.content, params.world)
        : extractCandidateAtoms(params.content, params.world);
    for (const candidate of candidates) {
      const entityType = candidate.linked?.entityType ?? params.defaultEntity?.entityType ?? null;
      const entityId = candidate.linked?.entityId ?? params.defaultEntity?.entityId ?? null;
      const dedupHash = computeDedupHash({
        entityType,
        entityId,
        factType: candidate.factType,
        content: candidate.content,
      });
      const existing = await this.deps.store.findActiveAtoms(params.projectId, {
        entityType,
        entityId,
        factType: candidate.factType,
      });
      const scored = existing.map((atom) => ({
        atom: { id: atom.id, content: atom.content, dedupHash: atom.dedupHash },
        similarity: jaccardSimilarity(
          tokenizeForSimilarity(candidate.content),
          tokenizeForSimilarity(atom.content),
        ),
      }));
      const decision = decideAtomAction({
        incoming: { dedupHash, content: candidate.content, factType: candidate.factType },
        candidates: scored,
      });
      if (decision.op === 'NOOP') {
        ops.noop++;
        continue;
      }
      if (decision.op === 'CONFLICT') {
        const conflictAtom = existing.find((atom) => atom.id === decision.conflictAtomId);
        // D4：矛盾不自动写入，落冲突清单等确认；id 随 SSE 回传给内联确认卡。
        const conflict = await this.deps.store.createConflict({
          projectId: params.projectId,
          threadId: params.threadId,
          sourceMessageId: params.messageId,
          entityType,
          entityId,
          factType: candidate.factType,
          incomingContent: candidate.content,
          existingContent: conflictAtom?.content ?? '',
          existingAtomId: conflictAtom?.id ?? null,
          antonym: [decision.antonym[0], decision.antonym[1]],
          dedupHash,
        });
        ops.conflicts.push({
          id: conflict.id,
          content: candidate.content,
          existing_content: conflictAtom?.content ?? '',
          antonym: [decision.antonym[0], decision.antonym[1]],
          entity_type: entityType,
          entity_id: entityId,
          fact_type: candidate.factType,
          status: 'pending',
        });
        continue;
      }
      if (decision.op === 'UPDATE') {
        await this.deps.store.updateAtom(decision.supersedeAtomId, {
          status: 'superseded',
          supersededById: null, // 创建新原子后回填
          validTo: new Date(),
          memoryOp: 'UPDATE',
        });
        const created = await this.deps.store.createAtom({
          projectId: params.projectId,
          threadId: params.threadId,
          sourceMessageId: params.messageId,
          entityType,
          entityId,
          factType: candidate.factType,
          content: candidate.content,
          confidence: 0.75,
          dedupHash,
          memoryOp: 'ADD',
        });
        await this.deps.store.updateAtom(decision.supersedeAtomId, {
          supersededById: created.id,
        });
        ops.updated++;
        continue;
      }
      await this.deps.store.createAtom({
        projectId: params.projectId,
        threadId: params.threadId,
        sourceMessageId: params.messageId,
        entityType,
        entityId,
        factType: candidate.factType,
        content: candidate.content,
        confidence: 0.7,
        dedupHash,
        memoryOp: 'ADD',
      });
      ops.added++;
    }
    await this.deps.store.upsertPipelineState(params.messageId, {
      status: 'pending',
      extractionMode: 'rule',
    });
    if (this.queue && ops.added + ops.updated > 0) {
      await this.queue.enqueue({
        id: `memory_refine:${params.messageId}`,
        type: 'memory_refine',
        payload: { message_id: params.messageId },
        idempotency_key: `memory_refine:${params.messageId}`,
      });
    }
    return ops;
  }

  // ---- 以下方法在后续 Task 中实现（先占位避免类型断链）----

  async retrieve(params: {
    projectId: string;
    text: string;
    world: WorldContext | null;
    topK?: number;
  }): Promise<RetrievedMemory[]> {
    const topK = params.topK ?? 8;
    const active = await this.deps.store.findActiveAtoms(params.projectId);
    if (active.length === 0) return [];

    // ① 实体链接（决定 core 加权范围）
    const linked = linkEntities(params.text, params.world);
    const linkedEntityIds = new Set<string>();
    if (linked) linkedEntityIds.add(`${linked.entityType}:${linked.entityId}`);

    // ② 向量召回
    let vectorIds: string[] = [];
    if (this.deps.vectorStore && this.deps.embedding) {
      const { vectors } = await this.deps.embedding.embed({
        request_id: `memory-retrieve:${Date.now()}`,
        model: 'memory-retrieval',
        inputs: [params.text],
      });
      vectorIds = this.deps.vectorStore
        .search(params.projectId, vectors[0]!, 10)
        .map((hit) => hit.id);
    }

    // ③ 关键词召回（bigram Jaccard）
    const keywordIds = keywordRank(
      tokenizeForSimilarity(params.text),
      active.map((atom) => ({ id: atom.id, content: atom.content })),
      10,
    );

    // RRF 融合（向量路权重略高）
    const fused = rrfFuse(
      [
        { list: keywordIds, weight: 1 },
        { list: vectorIds, weight: 1.2 },
      ],
      topK,
    );
    const byId = new Map(active.map((atom) => [atom.id, atom]));
    const results: RetrievedMemory[] = [];
    for (const id of fused) {
      const atom = byId.get(id);
      if (!atom) continue;
      if (atom.entityType && atom.entityId)
        linkedEntityIds.add(`${atom.entityType}:${atom.entityId}`);
      results.push({
        source: 'atom',
        id: atom.id,
        content: atom.content,
        entity_type: atom.entityType,
        entity_id: atom.entityId,
        fact_type: atom.factType,
      });
    }

    // L2 核心加权：命中实体的 core 内容追加（溯源 sourceAtomIds）
    const cores = await this.deps.store.listCores(params.projectId);
    const linkedAtomIds = new Set(
      active
        .filter(
          (atom) =>
            atom.entityType &&
            atom.entityId &&
            linkedEntityIds.has(`${atom.entityType}:${atom.entityId}`),
        )
        .map((atom) => atom.id),
    );
    for (const core of cores) {
      const linkedCore =
        core.sourceAtomIds.some((id) => linkedAtomIds.has(id)) ||
        (linked && core.topic === linked.name);
      if (!linkedCore) continue;
      results.push({
        source: 'core',
        id: core.id,
        content: core.content,
        entity_type: null,
        entity_id: null,
        fact_type: null,
      });
    }
    return dedupeRetrieved(results).slice(0, topK + 4);
  }

  async processRefine(messageId: string): Promise<void> {
    const state = await this.deps.store.getPipelineState(messageId);
    if (state?.status === 'done') return;
    try {
      const message = await this.deps.store.getMessageWithProject(messageId);
      if (!message || !message.projectId) {
        await this.deps.store.upsertPipelineState(messageId, { status: 'done' });
        return;
      }
      const projectId = message.projectId;
      const world = await this.deps.store.buildWorldContext(projectId);
      const useLlm = Boolean(this.deps.llm && this.deps.llm.provider !== 'mock');
      let atoms = await this.deps.store.findAtomsByMessage(messageId);

      // ① LLM 精炼（有密钥轨）：修正内容/类型/实体链接
      if (useLlm && this.deps.llm && atoms.length > 0) {
        const result = await this.deps.llm.completeStructured(
          {
            request_id: `memory-refine:${messageId}`,
            model: this.deps.llmModel ?? 'deepseek-chat',
            system_prompt: MEMORY_REFINE_SYSTEM_PROMPT,
            user_prompt: JSON.stringify({
              statements: atoms.map((atom, index) => ({ index, content: atom.content })),
              entities: world
                ? [
                    ...world.characters.map((c) => c.name),
                    ...world.locations.map((l) => l.name),
                    ...world.worldEvents.map((e) => e.title),
                  ]
                : [],
            }),
            temperature: 0.2,
            max_tokens: 1_500,
          },
          memoryRefineSchema,
        );
        for (const refined of result.data.atoms) {
          const atom = atoms[refined.index];
          if (!atom) continue;
          const linked = refined.entity_name
            ? resolveEntityByName(refined.entity_name, world)
            : null;
          await this.deps.store.updateAtom(atom.id, {
            content: refined.content,
            factType: refined.fact_type,
            ...(linked ? { entityType: linked.entityType, entityId: linked.entityId } : {}),
          });
        }
        atoms = await this.deps.store.findAtomsByMessage(messageId);
      }

      // ② L2 聚合：按 (entityType, entityId) 分组 upsert MemoryCore
      // 未链接实体的原子留在 L1（等 LLM 精炼轨回填实体链接后再入 L2）。
      const groups = new Map<string, typeof atoms>();
      for (const atom of atoms.filter((a) => a.status === 'active' && a.entityType && a.entityId)) {
        const key = `${atom.entityType ?? ''}:${atom.entityId ?? ''}`;
        const group = groups.get(key) ?? [];
        group.push(atom);
        groups.set(key, group);
      }
      for (const [key, group] of groups) {
        const [entityType, entityId] = key.split(':');
        const topic = this.entityName(world, entityType || null, entityId || null) ?? '未归档事实';
        const contents: string[] = [];
        for (const atom of [...group].reverse()) {
          if (!contents.includes(atom.content)) contents.push(atom.content);
        }
        await this.deps.store.upsertCore({
          projectId,
          kind: coreKindForEntityType(entityType || null),
          topic,
          content: contents.join('\n').slice(0, 2_000),
          sourceAtomIds: group.map((atom) => atom.id),
        });
      }

      // ③ 向量化（embedding 可用时；mock 向量亦有效，词法语义）
      if (this.deps.vectorStore && this.deps.embedding && atoms.length > 0) {
        const { vectors } = await this.deps.embedding.embed({
          request_id: `memory-vectorize:${messageId}`,
          model: 'memory-atoms',
          inputs: atoms.map((atom) => atom.content),
        });
        this.deps.vectorStore.upsert(
          projectId,
          atoms.map((atom, index) => ({ id: atom.id, vector: vectors[index]! })),
        );
      }

      await this.deps.store.upsertPipelineState(messageId, {
        status: 'done',
        level1At: new Date(),
        extractionMode: useLlm ? 'llm' : 'rule',
      });
    } catch (error) {
      await this.deps.store.markPipelineFailure(messageId, String(error));
      throw error;
    }
  }

  /** 实体名解析（L2 topic 用；从 world 上下文查名字）。 */
  private entityName(
    world: WorldContext | null,
    entityType: string | null,
    entityId: string | null,
  ): string | null {
    if (!world || !entityType || !entityId) return null;
    if (entityType === 'character') {
      return world.characters.find((c) => c.id === entityId)?.name ?? null;
    }
    if (entityType === 'location') {
      return world.locations.find((l) => l.id === entityId)?.name ?? null;
    }
    if (entityType === 'world_event') {
      return world.worldEvents.find((e) => e.id === entityId)?.title ?? null;
    }
    if (entityType === 'story') {
      return world.stories.find((s) => s.id === entityId)?.title ?? null;
    }
    if (entityType === 'project') return world.projectName;
    return null;
  }

  /** 向量库全量重建（PG 为事实源）。 */
  async rebuildVectors(projectId: string): Promise<{ rebuilt: number }> {
    if (!this.deps.vectorStore || !this.deps.embedding) return { rebuilt: 0 };
    const atoms = await this.deps.store.findActiveAtoms(projectId);
    this.deps.vectorStore.removeByProject(projectId);
    if (atoms.length === 0) return { rebuilt: 0 };
    const { vectors } = await this.deps.embedding.embed({
      request_id: `memory-rebuild:${projectId}:${Date.now()}`,
      model: 'memory-atoms',
      inputs: atoms.map((atom) => atom.content),
    });
    this.deps.vectorStore.upsert(
      projectId,
      atoms.map((atom, index) => ({ id: atom.id, vector: vectors[index]! })),
    );
    return { rebuilt: atoms.length };
  }

  async listAtoms(
    projectId: string,
    options: { entityType?: string; entityId?: string; page: number; pageSize: number },
  ) {
    return this.deps.store.listAtoms(projectId, options);
  }

  async atomsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.deps.store.findAtomsByIds(ids);
  }

  async listCores(projectId: string) {
    return this.deps.store.listCores(projectId);
  }

  async saveCore(
    projectId: string,
    input: { kind: string; topic: string; content: string },
  ): Promise<MemoryCoreRecord> {
    const content = input.content.trim();
    if (!content) throw new ApiError(400, 'EMPTY_CORE', '档案内容不能为空');
    const existing = (await this.deps.store.listCores(projectId)).find(
      (core) => core.kind === input.kind && core.topic === input.topic,
    );
    await this.deps.store.upsertCore({
      projectId,
      kind: input.kind,
      topic: input.topic.trim(),
      content,
      sourceAtomIds: existing?.sourceAtomIds ?? [],
    });
    const saved = (await this.deps.store.listCores(projectId)).find(
      (core) => core.kind === input.kind && core.topic === input.topic,
    );
    if (!saved) throw new ApiError(500, 'CORE_SAVE_FAILED', '档案未能保存');
    return saved;
  }

  async patchCore(projectId: string, coreId: string, content: string): Promise<MemoryCoreRecord> {
    const trimmed = content.trim();
    if (!trimmed) throw new ApiError(400, 'EMPTY_CORE', '档案内容不能为空');
    const existing = await this.deps.store.findCore(coreId);
    if (!existing || existing.projectId !== projectId) {
      throw new ApiError(404, 'CORE_NOT_FOUND', '核心记忆不存在');
    }
    const updated = await this.deps.store.updateCore(coreId, { content: trimmed });
    if (!updated) throw new ApiError(404, 'CORE_NOT_FOUND', '核心记忆不存在');
    return updated;
  }

  /** 记忆面板 L2 展开溯源：核心块 + 其源原子内容。 */
  async coreDetail(projectId: string, coreId: string) {
    const core = (await this.deps.store.listCores(projectId)).find((item) => item.id === coreId);
    if (!core) return null;
    const sourceAtoms = await this.deps.store.findAtomsByIds(core.sourceAtomIds);
    return { core, sourceAtoms };
  }

  async listConflicts(projectId: string, options?: { status?: string; threadId?: string }) {
    return this.deps.store.listConflicts(projectId, options);
  }

  /**
   * D4 冲突裁决：确认 = 保留新卡（新原子取代旧卡），丢弃 = 保留已有卡。
   * 只动记忆层原子，不改世界实体。
   */
  async resolveConflict(
    conflictId: string,
    decision: MemoryConflictDecision,
  ): Promise<MemoryConflictRecord> {
    const conflict = await this.deps.store.findConflict(conflictId);
    if (!conflict) throw new ApiError(404, 'CONFLICT_NOT_FOUND', '记忆冲突不存在');
    if (conflict.status !== 'pending') {
      throw new ApiError(409, 'CONFLICT_ALREADY_RESOLVED', '该冲突已处理，不能重复裁决');
    }
    let resolvedAtomId: string | null = null;
    if (decision === 'keep_new') {
      const previous = conflict.existingAtomId
        ? ((await this.deps.store.findAtomsByIds([conflict.existingAtomId]))[0] ?? null)
        : null;
      const previousActive = previous && previous.status === 'active' ? previous : null;
      const created = await this.deps.store.createAtom({
        projectId: conflict.projectId,
        threadId: conflict.threadId,
        sourceMessageId: conflict.sourceMessageId,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        factType: conflict.factType,
        content: conflict.incomingContent,
        confidence: 0.75,
        dedupHash: conflict.dedupHash,
        memoryOp: previousActive ? 'UPDATE' : 'ADD',
      });
      if (previousActive) {
        await this.deps.store.updateAtom(previousActive.id, {
          status: 'superseded',
          supersededById: created.id,
          validTo: new Date(),
        });
      }
      resolvedAtomId = created.id;
    }
    await this.deps.store.updateConflict(conflictId, {
      status: decision === 'keep_new' ? 'resolved' : 'discarded',
      decision,
      resolvedAtomId,
      resolvedAt: new Date(),
    });
    const updated = await this.deps.store.findConflict(conflictId);
    if (!updated) throw new ApiError(404, 'CONFLICT_NOT_FOUND', '记忆冲突不存在');
    return updated;
  }

  async invalidateAtom(atomId: string): Promise<boolean> {
    return this.deps.store.invalidateAtom(atomId);
  }

  async invalidateAtomsFromMessages(messageIds: string[]): Promise<number> {
    let count = 0;
    for (const messageId of messageIds) {
      const atoms = await this.deps.store.findAtomsByMessage(messageId);
      for (const atom of atoms) {
        if (atom.status !== 'active') continue;
        if (await this.deps.store.invalidateAtom(atom.id)) count += 1;
      }
    }
    return count;
  }

  async patchAtom(atomId: string, content: string): Promise<MemoryAtomRecord> {
    const trimmed = content.trim();
    if (!trimmed) throw new ApiError(400, 'EMPTY_ATOM', '记忆内容不能为空');
    const [existing] = await this.deps.store.findAtomsByIds([atomId]);
    if (!existing || existing.status !== 'active') {
      throw new ApiError(404, 'ATOM_NOT_FOUND', '记忆原子不存在或已失效');
    }
    await this.deps.store.updateAtom(atomId, {
      content: trimmed,
      memoryOp: 'UPDATE',
      dedupHash: computeDedupHash({
        entityType: existing.entityType,
        entityId: existing.entityId,
        factType: existing.factType,
        content: trimmed,
      }),
    });
    const [updated] = await this.deps.store.findAtomsByIds([atomId]);
    if (!updated) throw new ApiError(404, 'ATOM_NOT_FOUND', '记忆原子不存在或已失效');
    return updated;
  }

  async createManualAtom(
    projectId: string,
    input: { entityType: string; entityId: string; factType: string; content: string },
  ): Promise<MemoryAtomRecord> {
    const content = input.content.trim();
    if (!content) throw new ApiError(400, 'EMPTY_ATOM', '记忆内容不能为空');
    const entityType = input.entityType.trim();
    const entityId = input.entityId.trim();
    const factType = input.factType.trim() || 'episodic';
    if (!entityType || !entityId) {
      throw new ApiError(400, 'ATOM_ENTITY_REQUIRED', '必须指定所属实体');
    }
    return this.deps.store.createAtom({
      projectId,
      threadId: null,
      sourceMessageId: null,
      entityType,
      entityId,
      factType,
      content,
      confidence: 1,
      dedupHash: computeDedupHash({ entityType, entityId, factType, content }),
      memoryOp: 'ADD',
    });
  }

  /** 记忆路由 /search 用：构造项目世界上下文（实体链接召回需要）。 */
  async projectWorld(projectId: string): Promise<WorldContext | null> {
    return this.deps.store.buildWorldContext(projectId);
  }

  async threadContext(threadId: string) {
    return this.deps.store.findContextState(threadId);
  }

  /** 预算窗口：滚动摘要(system) + 最近原文；返回 evicted 供落摘要。 */
  async getContextWindow(
    threadId: string,
    history: Array<{ id: string; role: string; content: string }>,
    options: { tokenBudget?: number; keepRecentMessages?: number } = {},
  ): Promise<{ window: ContextMessage[]; evicted: ContextMessage[]; tokenEstimate: number }> {
    const state = await this.deps.store.findContextState(threadId);
    const summary = clipRollingSummary(state?.rollingSummary ?? '');
    const messages: ContextMessage[] = history.map((message) => ({
      id: message.id,
      role: message.role === 'user' || message.role === 'assistant' ? message.role : 'system',
      content: message.content,
    }));
    const built = buildBudgetedHistory({
      history: messages,
      previousSummary: summary,
      tokenBudget: options.tokenBudget ?? contextTokenBudget(),
      keepRecentMessages: options.keepRecentMessages ?? 8,
      summarizedUntilMessageId: state?.summarizedUntilMessageId ?? null,
    });
    const window = summary
      ? [
          { id: 'summary', role: 'system' as const, content: `## 此前对话摘要\n${summary}` },
          ...built.window,
        ]
      : built.window;
    return { window, evicted: built.evicted, tokenEstimate: built.tokenEstimate };
  }

  /** 回合结束后压缩淘汰消息并持久化滚动摘要。 */
  async updateThreadSummary(
    threadId: string,
    evicted: Array<{ id: string; role: string; content: string }>,
  ): Promise<void> {
    if (evicted.length === 0) return;
    const state = await this.deps.store.findContextState(threadId);
    const summary = await compressHistory({
      llm: this.deps.llm,
      llmModel: this.deps.llmModel,
      evicted: evicted.map((message) => ({
        id: message.id,
        role: message.role === 'user' || message.role === 'assistant' ? message.role : 'system',
        content: message.content,
      })),
      previousSummary: state?.rollingSummary ?? '',
    });
    await this.deps.store.upsertContextState(threadId, {
      rollingSummary: summary,
      summarizedUntilMessageId: evicted[evicted.length - 1]?.id ?? null,
      summaryVersion: (state?.summaryVersion ?? 0) + 1,
      tokenEstimate: estimateTokens(summary),
    });
  }
}
