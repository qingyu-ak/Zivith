import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import { InMemoryQueueAdapter } from '../src/adapters/memory-queue.js';
import { createGenerationQueueRuntime } from '../src/contexts/generation/queue-runtime.js';
import { GenerationService } from '../src/contexts/generation/service.js';

describe('generation queue runtime', () => {
  it('falls back to in-memory queue when REDIS_URL is unset', () => {
    const previous = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    const service = new GenerationService({} as PrismaClient);
    const runtime = createGenerationQueueRuntime(service);
    expect(runtime.mode).toBe('memory');
    expect(runtime.queue).toBeInstanceOf(InMemoryQueueAdapter);
    if (previous === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous;
  });
});

describe('InMemoryQueueAdapter', () => {
  it('invokes registered processors after enqueue', async () => {
    const queue = new InMemoryQueueAdapter();
    const processor = vi.fn().mockResolvedValue(undefined);
    queue.registerProcessor('video_generate', processor);
    await queue.enqueue({
      id: 'task-1',
      type: 'video_generate',
      idempotency_key: 'job-1',
      payload: { output_id: 'output-1' },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(processor).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'video_generate', payload: { output_id: 'output-1' } }),
    );
  });

  it('skips processor when cancelled before tick', async () => {
    const queue = new InMemoryQueueAdapter();
    const processor = vi.fn().mockResolvedValue(undefined);
    queue.registerProcessor('video_generate', processor);
    await queue.enqueue({
      id: 'task-2',
      type: 'video_generate',
      idempotency_key: 'job-2',
      payload: { output_id: 'output-2' },
    });
    await queue.cancel('job-2');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(processor).not.toHaveBeenCalled();
  });
});
