import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { BullMqQueueAdapter } from '../../adapters/bullmq.js';
import { InMemoryQueueAdapter } from '../../adapters/memory-queue.js';
import type { QueueJob, QueuePort } from '../../ports/index.js';
import type { GenerationService } from './service.js';

export interface GenerationQueueRuntime {
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

export function createGenerationQueueRuntime(
  generation: GenerationService,
): GenerationQueueRuntime {
  const connection = redisConnection();
  const processVideo = async (job: QueueJob) => {
    const payload = job.payload as { output_id?: string };
    if (typeof payload.output_id !== 'string') {
      throw new Error('video_generate job missing output_id');
    }
    await generation.processQueuedOutput(payload.output_id);
  };

  if (!connection) {
    const memory = new InMemoryQueueAdapter();
    memory.registerProcessor('video_generate', processVideo);
    generation.attachQueue(memory);
    return {
      queue: memory,
      mode: 'memory',
      close: async () => undefined,
    };
  }

  const queueName = process.env.GENERATION_QUEUE_NAME ?? 'zivith-generation';
  const bullQueue = new Queue(queueName, { connection });
  const adapter = new BullMqQueueAdapter(bullQueue);
  generation.attachQueue(adapter);

  const worker = new Worker(
    queueName,
    async (bullJob) => {
      const payload = bullJob.data as QueueJob['payload'];
      await processVideo({
        id: String(bullJob.id ?? bullJob.name),
        type: 'video_generate',
        payload,
        idempotency_key: String(bullJob.id ?? bullJob.opts.jobId ?? bullJob.id),
      });
    },
    { connection, concurrency: Number(process.env.GENERATION_WORKER_CONCURRENCY ?? 2) },
  );

  worker.on('failed', (job, error) => {
    console.error('[generation-worker] failed', job?.id, error.message);
  });

  return {
    queue: adapter,
    mode: 'bullmq',
    close: async () => {
      await worker.close();
      await bullQueue.close();
    },
  };
}
