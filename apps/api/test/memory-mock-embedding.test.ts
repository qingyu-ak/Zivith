import { describe, expect, it } from 'vitest';
import { MockEmbeddingAdapter } from '../src/adapters/memory/mock-embedding.js';

describe('MockEmbeddingAdapter', () => {
  it('is deterministic and normalized', async () => {
    const adapter = new MockEmbeddingAdapter();
    const { vectors, dimensions } = await adapter.embed({
      request_id: 'r1',
      model: 'm',
      inputs: ['林澈性格冷静', '林澈性格冷静'],
    });
    expect(dimensions).toBe(128);
    expect(vectors[0]).toEqual(vectors[1]);
    const norm = Math.sqrt(vectors[0]!.reduce((sum, x) => sum + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('similar texts score higher than unrelated', async () => {
    const adapter = new MockEmbeddingAdapter();
    const { vectors } = await adapter.embed({
      request_id: 'r2',
      model: 'm',
      inputs: ['林澈是一名冷静的凡人弟子', '林澈是冷静的凡人弟子', '卡塞尔学院位于美国芝加哥'],
    });
    const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i]!, 0);
    expect(dot(vectors[0]!, vectors[1]!)).toBeGreaterThan(dot(vectors[0]!, vectors[2]!));
  });
});
