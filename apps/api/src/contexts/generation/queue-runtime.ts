import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { BullMqQueueAdapter } from '../../adapters/bullmq.js';
import { InMemoryQueueAdapter } from '../../adapters/memory-queue.js';
import type { QueueJob, QueueJobType, QueuePort } from '../../ports/index.js';
import { QueueWorkBridge } from './queue-work-bridge.js';
import type { GenerationService } from './service.js';

export interface GenerationQueueRuntime {
  queue: QueuePort;
  mode: 'bullmq' | 'memory';
  workBridge: QueueWorkBridge;
  close: () => Promise<void>;
}

const WORKFLOW_QUEUE_TYPES: QueueJobType[] = [
  'workflow_step',
  'prompt_construct',
  'image_generate',
];

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
    const workBridge = new QueueWorkBridge(memory);
    memory.registerProcessor('video_generate', processVideo);
    for (const type of WORKFLOW_QUEUE_TYPES) {
      memory.registerProcessor(type, workBridge.createProcessor());
    }
    generation.attachQueue(memory);
    return {
      queue: memory,
      mode: 'memory',
      workBridge,
      close: () => Promise.resolve(),
    };
  }

  const queueName = process.env.GENERATION_QUEUE_NAME ?? 'zivith-generation';
  const bullQueue = new Queue(queueName, { connection });
  const adapter = new BullMqQueueAdapter(bullQueue);
  const workBridge = new QueueWorkBridge(adapter);
  const workflowProcessor = workBridge.createProcessor();
  generation.attachQueue(adapter);

  const worker = new Worker(
    queueName,
    async (bullJob) => {
      const type = bullJob.name as QueueJobType;
      const job: QueueJob = {
        id: String(bullJob.id ?? bullJob.name),
        type,
        payload: bullJob.data as QueueJob['payload'],
        idempotency_key: String(bullJob.id ?? bullJob.opts.jobId ?? bullJob.id),
      };
      if (type === 'video_generate') {
        await processVideo(job);
        return;
      }
      if (WORKFLOW_QUEUE_TYPES.includes(type)) {
        await workflowProcessor(job);
      }
    },
    { connection, concurrency: Number(process.env.GENERATION_WORKER_CONCURRENCY ?? 2) },
  );

  worker.on('failed', (job, error) => {
    console.error('[generation-worker] failed', job?.id, error.message);
  });

  return {
    queue: adapter,
    mode: 'bullmq',
    workBridge,
    close: async () => {
      await worker.close();
      await bullQueue.close();
    },
  };
}
