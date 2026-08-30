import { describe, expect, it } from 'vitest';
import { keywordRank, rrfFuse, formatMemoryDigest } from '../src/contexts/memory/retrieval.js';
import { tokenizeForSimilarity } from '@zivith/domain';

describe('rrfFuse', () => {
  it('fuses and ranks by reciprocal rank', () => {
    const fused = rrfFuse([{ list: ['a', 'b'] }, { list: ['b', 'c'] }], 3);
    expect(fused[0]).toBe('b'); // 两路都命中
    expect(new Set(fused)).toEqual(new Set(['a', 'b', 'c']));
  });
});

describe('keywordRank', () => {
  it('ranks bigram-overlapping contents', () => {
    const ranked = keywordRank(
      tokenizeForSimilarity('林澈性格冷静'),
      [
        { id: 'a', content: '林澈性格冷静。' },
        { id: 'b', content: '卡塞尔学院位于芝加哥。' },
      ],
      2,
    );
    expect(ranked).toEqual(['a']);
  });
});

describe('formatMemoryDigest', () => {
  it('renders bullet lines without header', () => {
    expect(formatMemoryDigest([])).toBe('');
    expect(
      formatMemoryDigest([
        {
          source: 'atom',
          id: '1',
          content: '林澈性格冷静',
          entity_type: 'character',
          entity_id: 'c1',
          fact_type: 'trait',
        },
      ]),
    ).toBe('- 林澈性格冷静');
  });
});
