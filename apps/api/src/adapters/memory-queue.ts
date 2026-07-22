import type { QueueJob, QueuePort } from '../ports/index.js';

type Processor = (job: QueueJob) => Promise<void>;

/** Test/dev fallback when Redis is unavailable — runs handlers in-process. */
export class InMemoryQueueAdapter implements QueuePort {
  private readonly processors = new Map<string, Processor>();
  private readonly jobs = new Map<string, QueueJob>();
  private readonly cancelled = new Set<string>();

  registerProcessor(type: string, processor: Processor): void {
    this.processors.set(type, processor);
  }

  async enqueue<T>(job: QueueJob<T>): Promise<{ job_id: string }> {
    this.cancelled.delete(job.idempotency_key);
    this.jobs.set(job.idempotency_key, job as QueueJob);
    const processor = this.processors.get(job.type);
    if (processor) {
      // Defer one macrotask so cancel() in the same turn can win before work starts.
      setTimeout(() => {
        if (this.cancelled.has(job.idempotency_key)) return;
        void processor(job as QueueJob).catch(() => undefined);
      }, 0);
    }
    return { job_id: job.idempotency_key };
  }

  async cancel(jobId: string): Promise<void> {
    this.cancelled.add(jobId);
    this.jobs.delete(jobId);
  }

  isCancelled(jobId: string): boolean {
    return this.cancelled.has(jobId);
  }

  /** Synchronously run a queued job (used by tests / generate-and-wait). */
  async processNow(jobId: string): Promise<void> {
    if (this.cancelled.has(jobId)) return;
    const job = this.jobs.get(jobId);
    if (!job) return;
    const processor = this.processors.get(job.type);
    if (processor) await processor(job);
  }
}
