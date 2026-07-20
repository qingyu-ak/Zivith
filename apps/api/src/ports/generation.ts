import type { JsonValue, Shot } from '@zivith/domain';

export interface ModelInfo {
  id: string;
  name: string;
  version?: string;
}

export interface VideoModelCapabilities {
  aspect_ratios: string[];
  max_duration_seconds: number;
  supports_reference_images: boolean;
  asynchronous: boolean;
}

export interface VideoGenerationRequest {
  request_id: string;
  model: string;
  positive_prompt: string;
  negative_prompt?: string;
  shot: Shot;
  reference_image_urls?: string[];
  parameters?: Record<string, JsonValue>;
}

export interface VideoGenerationResult {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  video_url?: string;
  thumbnail_url?: string;
  metadata: Record<string, JsonValue>;
}

export type GenerationJobStatus = VideoGenerationResult;

export interface VideoGenerationAdapter {
  readonly provider: string;
  readonly supportedModels: readonly ModelInfo[];
  generate(request: VideoGenerationRequest): Promise<VideoGenerationResult>;
  getStatus(jobId: string): Promise<GenerationJobStatus>;
  cancel(jobId: string): Promise<void>;
  getCapabilities(): VideoModelCapabilities;
}
