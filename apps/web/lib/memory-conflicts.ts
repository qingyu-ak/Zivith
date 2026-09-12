/**
 * 记忆冲突卡（D4/D5）：SSE `memory_ops` 与 REST 冲突列表共用的最小形状，
 * 以及对话流内联卡的纯状态工具（不依赖 React，便于单测）。
 */

export interface MemoryConflictCard {
  id: string;
  /** 新产生的内容（SSE 字段 content / REST 字段 incoming_content）。 */
  content: string;
  existing_content: string;
  antonym: [string, string];
}

export type MemoryConflictDecision = 'keep_new' | 'keep_existing';

/** 从宽松形状（SSE ops 或单条 REST DTO）中抽出带 id 的待确认冲突。 */
export function extractPendingConflicts(source: unknown): MemoryConflictCard[] {
  const conflicts = (source as { conflicts?: unknown } | null)?.conflicts;
  if (!Array.isArray(conflicts)) return [];
  const cards: MemoryConflictCard[] = [];
  for (const raw of conflicts) {
    const card = conflictToCard(raw);
    if (card && !cards.some((existing) => existing.id === card.id)) cards.push(card);
  }
  return cards;
}

function conflictToCard(raw: unknown): MemoryConflictCard | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const id = record.id;
  if (typeof id !== 'string' || !id) return null;
  // 已裁决的冲突（REST 回流）不再出卡。
  if (typeof record.status === 'string' && record.status !== 'pending') return null;
  const content =
    typeof record.content === 'string' && record.content.trim()
      ? record.content
      : typeof record.incoming_content === 'string' && record.incoming_content.trim()
        ? record.incoming_content
        : null;
  const existingContent =
    typeof record.existing_content === 'string' ? record.existing_content : null;
  if (!content || existingContent === null) return null;
  const antonym =
    Array.isArray(record.antonym) &&
    record.antonym.length === 2 &&
    record.antonym.every((word) => typeof word === 'string')
      ? ([record.antonym[0], record.antonym[1]] as [string, string])
      : (['', ''] as [string, string]);
  return { id, content, existing_content: existingContent, antonym };
}

/** 按 id 去重合并（SSE 实时到达与线程加载补挂可能重复）。 */
export function mergeConflictCards(
  current: MemoryConflictCard[],
  incoming: MemoryConflictCard[],
): MemoryConflictCard[] {
  const seen = new Set(current.map((card) => card.id));
  return [...current, ...incoming.filter((card) => !seen.has(card.id))];
}

/** 裁决成功后移除对应卡片。 */
export function removeConflictCard(cards: MemoryConflictCard[], id: string): MemoryConflictCard[] {
  return cards.filter((card) => card.id !== id);
}
