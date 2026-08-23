export * from './generation.js';
export * from './llm.js';
export * from './media.js';

export type QueueJobType =
  | 'prompt_construct'
  | 'image_generate'
  | 'video_generate'
  | 'workflow_step'
  | 'review_analysis'
  | 'thumbnail_generate'
  | 'media_process'
  | 'memory_refine';

export interface QueueJob<T = unknown> {
  id: string;
  type: QueueJobType;
  payload: T;
  idempotency_key: string;
}

export interface QueuePort {
  enqueue<T>(job: QueueJob<T>): Promise<{ job_id: string }>;
  cancel(jobId: string): Promise<void>;
}

export interface StoragePutRequest {
  key: string;
  body: Buffer;
  content_type: string;
  metadata?: Record<string, string>;
}

export interface StoragePort {
  put(request: StoragePutRequest): Promise<{ key: string; url: string }>;
  delete(key: string): Promise<void>;
  signedReadUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export interface EmbeddingRequest {
  request_id: string;
  model: string;
  inputs: string[];
}

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  dimensions: number;
}

export interface EmbeddingAdapter {
  readonly provider: string;
  readonly dimensions: number;
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
}
