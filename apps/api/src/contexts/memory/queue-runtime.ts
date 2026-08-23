import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { BullMqQueueAdapter } from '../../adapters/bullmq.js';
import { InMemoryQueueAdapter } from '../../adapters/memory-queue.js';
import type { QueuePort } from '../../ports/index.js';
import type { MemoryService } from './service.js';

export interface MemoryQueueRuntime {
  queue: QueuePort;
  mode: 'bullmq' | 'memory';
  close: () => Promise<void>;
}

function redisConnection(): ConnectionOptions | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
      maxRetriesPerRequest: null,
    };
  } catch {
    return null;
  }
}

export function createMemoryQueueRuntime(memory: MemoryService): MemoryQueueRuntime {
  const connection = redisConnection();
  if (!connection) {
    const memoryQueue = new InMemoryQueueAdapter();
    memoryQueue.registerProcessor('memory_refine', (job) =>
      memory.processRefine((job.payload as { message_id?: string }).message_id ?? ''),
    );
    memory.attachQueue(memoryQueue);
    return { queue: memoryQueue, mode: 'memory', close: () => Promise.resolve() };
  }

  const queueName = process.env.MEMORY_QUEUE_NAME ?? 'zivith-memory';
  const bullQueue = new Queue(queueName, { connection });
  const adapter = new BullMqQueueAdapter(bullQueue);
  const worker = new Worker(
    queueName,
    async (bullJob) => {
      if (bullJob.name !== 'memory_refine') return;
      const data = (bullJob.data ?? {}) as { message_id?: string };
      if (typeof data.message_id === 'string') {
        await memory.processRefine(data.message_id);
      }
    },
    { connection, concurrency: 2 },
  );
  worker.on('failed', (job, error) => {
    console.error('[memory-worker] failed', job?.id, error.message);
  });
  memory.attachQueue(adapter);
  return {
    queue: adapter,
    mode: 'bullmq',
    close: async () => {
      await worker.close();
      await bullQueue.close();
    },
  };
}
