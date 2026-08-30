import { describe, expect, it } from 'vitest';
import { computeDedupHash } from '../src/contexts/memory/fingerprint.js';
import { jaccardSimilarity, tokenizeForSimilarity } from '@zivith/domain';

describe('computeDedupHash', () => {
  it('normalizes punctuation and whitespace before hashing', () => {
    const a = computeDedupHash({
      entityType: 'character',
      entityId: 'c1',
      factType: 'trait',
      content: '林澈，性格冷静！',
    });
    const b = computeDedupHash({
      entityType: 'character',
      entityId: 'c1',
      factType: 'trait',
      content: '林澈 性格冷静',
    });
    expect(a).toBe(b);
  });

  it('differs by entity and fact type', () => {
    const base = {
      entityType: 'character',
      entityId: 'c1',
      factType: 'trait',
      content: '性格冷静',
    } as const;
    expect(computeDedupHash(base)).not.toBe(computeDedupHash({ ...base, entityId: 'c2' }));
    expect(computeDedupHash(base)).not.toBe(
      computeDedupHash({ ...base, factType: 'desire' as const }),
    );
  });
});

describe('tokenizeForSimilarity + jaccard', () => {
  it('near-duplicates score high, unrelated score low', () => {
    const a = tokenizeForSimilarity('林澈是一名冷静的凡人弟子');
    const b = tokenizeForSimilarity('林澈是冷静的凡人弟子');
    const c = tokenizeForSimilarity('卡塞尔学院位于美国芝加哥');
    // 删除「一名」两字后 bigram 重叠为 8/12 = 0.667，中文 bigram 对单字删除敏感，
    // 阈值取 0.6 已足以与无关文本（~0）区分。
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.6);
    expect(jaccardSimilarity(a, c)).toBeLessThan(0.2);
  });
});
