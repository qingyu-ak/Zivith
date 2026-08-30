import { tokenizeForSimilarity } from '@zivith/domain';
import type { EmbeddingAdapter, EmbeddingRequest, EmbeddingResult } from '../../ports/index.js';

const DIMENSIONS = 128;

/** FNV-1a 32 位哈希（确定性桶分配）。 */
function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Mock embedding：bigram 词频哈希向量（M1 双轨制降级轨）。
 * 无密钥环境下的确定性词法语义向量；真实语义向量由 M2 的 SiliconFlow 适配器提供。
 */
export class MockEmbeddingAdapter implements EmbeddingAdapter {
  readonly provider = 'mock';
  readonly dimensions = DIMENSIONS;

  embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    const vectors = request.inputs.map((text) => this.vectorFor(text));
    return Promise.resolve({ vectors, model: request.model, dimensions: DIMENSIONS });
  }

  private vectorFor(text: string): number[] {
    const vector = new Array<number>(DIMENSIONS).fill(0);
    for (const token of tokenizeForSimilarity(text)) {
      vector[hashToken(token) % DIMENSIONS]! += 1;
    }
    const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0)) || 1;
    return vector.map((x) => x / norm);
  }
}
