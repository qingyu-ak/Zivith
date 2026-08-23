import {
  jaccardSimilarity,
  tokenizeForSimilarity,
  type MemoryIngestOps,
  type RetrievedMemory,
} from '@zivith/domain';
import type { EmbeddingAdapter, QueuePort } from '../../ports/index.js';
import type { LLMAdapter } from '../../ports/llm.js';
import type { LocalVectorStore } from '../../adapters/memory/local-vector-store.js';
import type { WorldContext } from '../world-builder/world-context.js';
import { computeDedupHash } from './fingerprint.js';
import { extractCandidateAtoms } from './extract.js';
import { decideAtomAction } from './cleaning.js';
import type { MemoryStore } from './store.js';

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
  }): Promise<MemoryIngestOps> {
    const ops: MemoryIngestOps = { added: 0, updated: 0, noop: 0, conflicts: [] };
    const candidates = extractCandidateAtoms(params.content, params.world);
    for (const candidate of candidates) {
      const entityType = candidate.linked?.entityType ?? null;
      const entityId = candidate.linked?.entityId ?? null;
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
        ops.conflicts.push({
          content: candidate.content,
          existing_content: conflictAtom?.content ?? '',
          antonym: [decision.antonym[0], decision.antonym[1]],
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

  async processRefine(_messageId: string): Promise<void> {
    void _messageId;
  }

  async retrieve(_params: {
    projectId: string;
    text: string;
    world: WorldContext | null;
    topK?: number;
  }): Promise<RetrievedMemory[]> {
    return [];
  }

  async rebuildVectors(_projectId: string): Promise<{ rebuilt: number }> {
    return { rebuilt: 0 };
  }

  async listAtoms(
    projectId: string,
    options: { entityType?: string; entityId?: string; page: number; pageSize: number },
  ) {
    return this.deps.store.listAtoms(projectId, options);
  }

  async listCores(projectId: string) {
    return this.deps.store.listCores(projectId);
  }

  async invalidateAtom(atomId: string): Promise<boolean> {
    return this.deps.store.invalidateAtom(atomId);
  }
}
