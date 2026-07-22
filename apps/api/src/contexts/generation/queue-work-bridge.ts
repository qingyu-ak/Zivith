import { InMemoryQueueAdapter } from '../../adapters/memory-queue.js';
import type { QueueJob, QueueJobType, QueuePort } from '../../ports/index.js';

type Waiter = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

/**
 * Runs in-process work through the shared queue so LLM/image steps share the
 * same BullMQ / memory-queue path as video_generate, while still awaiting
 * completion for synchronous workflow orchestration.
 */
export class QueueWorkBridge {
  private readonly waiters = new Map<string, Waiter>();

  constructor(private readonly queue: QueuePort) {}

  static createLocal(): QueueWorkBridge {
    const memory = new InMemoryQueueAdapter();
    const bridge = new QueueWorkBridge(memory);
    for (const type of ['workflow_step', 'prompt_construct', 'image_generate'] as const) {
      memory.registerProcessor(type, bridge.createProcessor());
    }
    return bridge;
  }

  createProcessor(): (job: QueueJob) => Promise<void> {
    return async (job: QueueJob) => {
      const waiter = this.waiters.get(job.idempotency_key);
      if (!waiter) return;
      this.waiters.delete(job.idempotency_key);
      try {
        waiter.resolve(await waiter.run());
      } catch (error) {
        waiter.reject(error);
      }
    };
  }

  async run<T>(
    type: Extract<QueueJobType, 'workflow_step' | 'prompt_construct' | 'image_generate'>,
    idempotencyKey: string,
    work: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.waiters.set(idempotencyKey, {
        run: work,
        resolve: (value) => resolve(value as T),
        reject,
      });
      void this.queue
        .enqueue({
          id: idempotencyKey,
          type,
          idempotency_key: idempotencyKey,
          payload: { kind: type },
        })
        .then(async () => {
          if (this.queue instanceof InMemoryQueueAdapter) {
            await this.queue.processNow(idempotencyKey);
          }
        })
        .catch((error: unknown) => {
          this.waiters.delete(idempotencyKey);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }
}
