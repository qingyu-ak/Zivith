import { z } from 'zod';

/**
 * 分层记忆契约（docs/planning/Memory-Novel-Roleplay-Design.md §3）。
 * 纯文本工具不依赖 node:crypto，可跨端复用；指纹哈希在 API 侧实现。
 */

export const memoryFactTypeSchema = z.enum([
  'trait',
  'desire',
  'event',
  'relation',
  'rule',
  'preference',
  'constraint',
  'episodic',
]);
export type MemoryFactType = z.infer<typeof memoryFactTypeSchema>;

export const memoryOpSchema = z.enum(['ADD', 'UPDATE', 'NOOP', 'CONFLICT']);
export type MemoryOp = z.infer<typeof memoryOpSchema>;

export const memoryAtomStatusSchema = z.enum(['active', 'merged', 'superseded', 'invalidated']);
export type MemoryAtomStatus = z.infer<typeof memoryAtomStatusSchema>;

export const memoryEntityTypeSchema = z.enum([
  'character',
  'location',
  'world_event',
  'scene',
  'story',
  'project',
  'relationship',
]);
export type MemoryEntityType = z.infer<typeof memoryEntityTypeSchema>;

export const memoryCoreKindSchema = z.enum(['persona', 'scenario', 'world_rule', 'event_chain']);
export type MemoryCoreKind = z.infer<typeof memoryCoreKindSchema>;

export const memoryAtomSchema = z
  .object({
    id: z.string().min(1),
    project_id: z.string().min(1),
    thread_id: z.string().nullable(),
    source_message_id: z.string().nullable(),
    entity_type: memoryEntityTypeSchema.nullable(),
    entity_id: z.string().nullable(),
    fact_type: memoryFactTypeSchema,
    content: z.string().min(1).max(2_000),
    confidence: z.number().min(0).max(1),
    dedup_hash: z.string().min(8),
    memory_op: memoryOpSchema,
    status: memoryAtomStatusSchema,
    superseded_by_id: z.string().nullable(),
    valid_from: z.string(),
    valid_to: z.string().nullable(),
    created_at: z.string(),
  })
  .strict();
export type MemoryAtomDTO = z.infer<typeof memoryAtomSchema>;

export const memoryCoreSchema = z
  .object({
    id: z.string().min(1),
    project_id: z.string().min(1),
    kind: memoryCoreKindSchema,
    topic: z.string().min(1).max(200),
    content: z.string().min(1),
    version: z.number().int().min(1),
    source_atom_ids: z.array(z.string()).max(2_000),
    updated_at: z.string(),
  })
  .strict();
export type MemoryCoreDTO = z.infer<typeof memoryCoreSchema>;

export const memoryConflictSchema = z
  .object({
    // 落库后才有 id（SSE 内联确认卡靠它回传 resolve）。
    id: z.string().min(1).optional(),
    content: z.string(),
    existing_content: z.string(),
    antonym: z.tuple([z.string(), z.string()]),
    entity_type: z.string().nullable().optional(),
    entity_id: z.string().nullable().optional(),
    fact_type: z.string().nullable().optional(),
    status: z.enum(['pending', 'resolved', 'discarded']).optional(),
  })
  .strict();
export type MemoryConflict = z.infer<typeof memoryConflictSchema>;

/** 冲突裁决：确认 = 保留新卡（取代旧卡），丢弃 = 保留已有卡。 */
export const memoryConflictDecisionSchema = z.enum(['keep_new', 'keep_existing']);
export type MemoryConflictDecision = z.infer<typeof memoryConflictDecisionSchema>;

export const memoryIngestOpsSchema = z
  .object({
    added: z.number().int(),
    updated: z.number().int(),
    noop: z.number().int(),
    conflicts: z.array(memoryConflictSchema).max(20),
  })
  .strict();
export type MemoryIngestOps = z.infer<typeof memoryIngestOpsSchema>;

export const retrievedMemorySchema = z
  .object({
    source: z.enum(['atom', 'core']),
    id: z.string(),
    content: z.string(),
    entity_type: z.string().nullable(),
    entity_id: z.string().nullable(),
    fact_type: z.string().nullable(),
  })
  .strict();
export type RetrievedMemory = z.infer<typeof retrievedMemorySchema>;

// ---------------------------------------------------------------------------
// 纯文本工具（指纹归一 / 相似度分词 / Jaccard）
// ---------------------------------------------------------------------------

/** 去空白标点 + NFKC + ASCII 小写。 */
export function normalizeForFingerprint(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[[\](){}<>。，、；：？！“”‘’（）《》【】〔〕…—·,.:;?!"'`@#$%^&*_+=/\\|~]/g, '')
    .toLowerCase();
}

/** 中文字符 bigram + ASCII/数字词（相似度与关键词召回共用）。 */
export function tokenizeForSimilarity(text: string): string[] {
  const normalized = normalizeForFingerprint(text);
  const tokens: string[] = [];
  for (const run of normalized.match(/[\u4e00-\u9fa5]+/g) ?? []) {
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
  }
  tokens.push(...(normalized.match(/[a-z0-9]+/g) ?? []));
  return tokens;
}

/** Jaccard 相似度（0–1），任一侧为空返回 0。 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}
