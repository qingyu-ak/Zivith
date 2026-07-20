import type { Queue } from 'bullmq';
import type { QueueJob, QueuePort } from '../ports/index.js';

export class BullMqQueueAdapter implements QueuePort {
  constructor(private readonly queue: Queue) {}

  async enqueue<T>(job: QueueJob<T>): Promise<{ job_id: string }> {
    const queued = await this.queue.add(job.type, job.payload, {
      jobId: job.idempotency_key,
      attempts: job.type === 'review_analysis' ? 1 : 3,
      removeOnComplete: 1000,
      backoff: { type: 'exponential', delay: 1000 },
    });
    return { job_id: String(queued.id) };
  }

  async cancel(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) await job.remove();
  }
}
