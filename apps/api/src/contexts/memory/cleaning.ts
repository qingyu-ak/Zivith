import { jaccardSimilarity, tokenizeForSimilarity } from '@zivith/domain';

/**
 * 清洗决策表（M1 同步快速路径）。
 * 优先级：指纹去重(NOOP) > 反义冲突(CONFLICT) > 相似合并(UPDATE) > 新增(ADD)。
 * 冲突优先于合并：高相似但语义相反的陈述不能被静默覆盖。
 */

export const SIMILARITY_MERGE_THRESHOLD = 0.85;

/** 同一实体同一维度上互斥的性格/状态词（M1 规则表，覆盖 trait 词表）。 */
const ANTONYM_CLASHES: Array<[string, string]> = [
  ['冷静', '热血'],
  ['冷静', '冲动'],
  ['冷静', '暴躁'],
  ['冷静', '阴郁'],
  ['开朗', '阴郁'],
  ['开朗', '内向'],
  ['开朗', '沉默'],
  ['善良', '邪恶'],
  ['善良', '冷酷'],
  ['外向', '内向'],
  ['乐观', '悲观'],
  ['热情', '冷漠'],
  ['活泼', '安静'],
  ['活泼', '沉闷'],
  ['幽默', '严肃'],
  ['温柔', '粗暴'],
  ['勇敢', '怯懦'],
  ['勇敢', '胆小'],
];

const CLASH_MAP = new Map<string, Set<string>>();
for (const [a, b] of ANTONYM_CLASHES) {
  if (!CLASH_MAP.has(a)) CLASH_MAP.set(a, new Set());
  if (!CLASH_MAP.has(b)) CLASH_MAP.set(b, new Set());
  CLASH_MAP.get(a)!.add(b);
  CLASH_MAP.get(b)!.add(a);
}

/** 找到 incoming 与 existing 中互斥的反义词对；无冲突返回 null。 */
export function findAntonymClash(incoming: string, existing: string): [string, string] | null {
  for (const [word, clashes] of CLASH_MAP) {
    if (!incoming.includes(word)) continue;
    for (const clash of clashes) {
      if (existing.includes(clash)) return [word, clash];
    }
  }
  return null;
}

export interface CleaningCandidate {
  atom: { id: string; content: string; dedupHash: string };
  similarity: number;
}

export type CleaningDecision =
  | { op: 'ADD' }
  | { op: 'NOOP'; reason: 'duplicate' }
  | { op: 'UPDATE'; supersedeAtomId: string }
  | { op: 'CONFLICT'; conflictAtomId: string; antonym: [string, string] };

/** 基于中文 bigram + Jaccard 的相似度（供 store 层预计算 candidate.similarity）。 */
export function contentSimilarity(a: string, b: string): number {
  return jaccardSimilarity(tokenizeForSimilarity(a), tokenizeForSimilarity(b));
}

export function decideAtomAction(input: {
  incoming: { dedupHash: string; content: string; factType: string };
  candidates: CleaningCandidate[];
}): CleaningDecision {
  for (const candidate of input.candidates) {
    if (candidate.atom.dedupHash === input.incoming.dedupHash) {
      return { op: 'NOOP', reason: 'duplicate' };
    }
  }
  for (const candidate of input.candidates) {
    const antonym = findAntonymClash(input.incoming.content, candidate.atom.content);
    if (antonym) {
      return { op: 'CONFLICT', conflictAtomId: candidate.atom.id, antonym };
    }
  }
  let best: CleaningCandidate | null = null;
  for (const candidate of input.candidates) {
    if (candidate.similarity < SIMILARITY_MERGE_THRESHOLD) continue;
    if (!best || candidate.similarity > best.similarity) best = candidate;
  }
  if (best) return { op: 'UPDATE', supersedeAtomId: best.atom.id };
  return { op: 'ADD' };
}
