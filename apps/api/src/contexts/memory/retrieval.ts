import { jaccardSimilarity, tokenizeForSimilarity, type RetrievedMemory } from '@zivith/domain';

/** RRF 倒数排名融合：score = Σ weight / (60 + rank)。 */
export function rrfFuse(
  rankings: Array<{ list: string[]; weight?: number }>,
  topK: number,
): string[] {
  const scores = new Map<string, number>();
  for (const { list, weight = 1 } of rankings) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + weight / (60 + rank + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, topK))
    .map(([id]) => id);
}

export function keywordRank(
  queryTokens: string[],
  contents: Array<{ id: string; content: string }>,
  topK: number,
): string[] {
  return contents
    .map((item) => ({
      id: item.id,
      score: jaccardSimilarity(queryTokens, tokenizeForSimilarity(item.content)),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => item.id);
}

/** 去重（按归一化内容），保持顺序。 */
export function dedupeRetrieved(items: RetrievedMemory[]): RetrievedMemory[] {
  const seen = new Set<string>();
  const result: RetrievedMemory[] = [];
  for (const item of items) {
    const key = `${item.source}|${item.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/** 注入 Agent system prompt 的记忆段（无头标题，由 prompt.ts 组装）。 */
export function formatMemoryDigest(items: RetrievedMemory[]): string {
  if (items.length === 0) return '';
  return items
    .slice(0, 12)
    .map((item) => `- ${item.content}`)
    .join('\n');
}
