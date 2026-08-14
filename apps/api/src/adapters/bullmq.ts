import type { Queue } from 'bullmq';
import type { QueueJob, QueuePort } from '../ports/index.js';

/**
 * BullMQ custom jobIds may only contain ':' when they have exactly three
 * colon-separated segments (legacy repeatable jobs). Replace ':' otherwise.
 */
export function toBullJobId(idempotencyKey: string): string {
  if (!idempotencyKey.includes(':')) return idempotencyKey;
  if (idempotencyKey.split(':').length === 3) return idempotencyKey;
  return idempotencyKey.replaceAll(':', '__');
}

export class BullMqQueueAdapter implements QueuePort {
  constructor(private readonly queue: Queue) {}

  async enqueue<T>(job: QueueJob<T>): Promise<{ job_id: string }> {
    const jobId = toBullJobId(job.idempotency_key);
    const payload =
      job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
        ? { ...(job.payload as Record<string, unknown>), idempotency_key: job.idempotency_key }
        : { value: job.payload, idempotency_key: job.idempotency_key };
    // video_generate: never auto-retry — a stalled/failed worker retry can re-call
    // provider submit (~¥2/Wan). Soft-timeout polling uses explicit new poll jobs instead.
    const attempts =
      job.type === 'review_analysis' || job.type === 'video_generate' ? 1 : 3;
    const queued = await this.queue.add(job.type, payload, {
      jobId,
      attempts,
      removeOnComplete: 1000,
      backoff: { type: 'exponential', delay: 1000 },
    });
    return { job_id: String(queued.id) };
  }

  async cancel(jobId: string): Promise<void> {
    const sanitized = toBullJobId(jobId);
    const job = (await this.queue.getJob(sanitized)) ?? (await this.queue.getJob(jobId));
    if (job) await job.remove();
  }
}
