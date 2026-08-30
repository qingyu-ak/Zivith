import type { WorldContext } from '../world-builder/world-context.js';

/** L1/L2/管线/上下文状态的持久化窄接口（单元测试用内存 fake 替代）。 */
export interface MemoryAtomRecord {
  id: string;
  projectId: string;
  threadId: string | null;
  sourceMessageId: string | null;
  entityType: string | null;
  entityId: string | null;
  factType: string;
  content: string;
  confidence: number;
  dedupHash: string;
  memoryOp: string;
  status: string;
  supersededById: string | null;
  validFrom: Date;
  validTo: Date | null;
  createdAt: Date;
}

export interface MemoryCoreRecord {
  id: string;
  projectId: string;
  kind: string;
  topic: string;
  content: string;
  version: number;
  sourceAtomIds: string[];
  updatedAt: Date;
}

export interface MemoryPipelineStateRecord {
  messageId: string;
  level1At: Date | null;
  extractionMode: string;
  status: string;
  attempts: number;
  lastError: string | null;
}

export interface ThreadContextStateRecord {
  threadId: string;
  rollingSummary: string;
  summarizedUntilMessageId: string | null;
  summaryVersion: number;
  tokenEstimate: number;
}

export interface CreateAtomInput {
  projectId: string;
  threadId: string | null;
  sourceMessageId: string | null;
  entityType: string | null;
  entityId: string | null;
  factType: string;
  content: string;
  confidence: number;
  dedupHash: string;
  memoryOp: string;
}

export interface UpsertCoreInput {
  projectId: string;
  kind: string;
  topic: string;
  content: string;
  sourceAtomIds: string[];
}

export interface MemoryStore {
  findActiveAtoms(
    projectId: string,
    filter?: { entityType?: string | null; entityId?: string | null; factType?: string },
    take?: number,
  ): Promise<MemoryAtomRecord[]>;
  findAtomsByMessage(messageId: string): Promise<MemoryAtomRecord[]>;
  createAtom(input: CreateAtomInput): Promise<MemoryAtomRecord>;
  updateAtom(
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
  ): Promise<void>;
  invalidateAtom(id: string): Promise<boolean>;
  listAtoms(
    projectId: string,
    options: { entityType?: string; entityId?: string; page: number; pageSize: number },
  ): Promise<{ items: MemoryAtomRecord[]; total: number }>;
  upsertPipelineState(
    messageId: string,
    patch: Partial<Pick<MemoryPipelineStateRecord, 'status' | 'extractionMode' | 'level1At'>>,
  ): Promise<void>;
  markPipelineFailure(messageId: string, error: string): Promise<void>;
  getPipelineState(messageId: string): Promise<MemoryPipelineStateRecord | null>;
  getMessageWithProject(
    messageId: string,
  ): Promise<{ id: string; content: string; projectId: string | null } | null>;
  upsertCore(input: UpsertCoreInput): Promise<void>;
  listCores(projectId: string): Promise<MemoryCoreRecord[]>;
  buildWorldContext(projectId: string): Promise<WorldContext | null>;
  findContextState(threadId: string): Promise<ThreadContextStateRecord | null>;
  upsertContextState(
    threadId: string,
    patch: Partial<
      Pick<
        ThreadContextStateRecord,
        'rollingSummary' | 'summarizedUntilMessageId' | 'summaryVersion' | 'tokenEstimate'
      >
    >,
  ): Promise<void>;
}
