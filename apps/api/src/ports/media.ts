import type { ModelInfo } from '../ports/generation.js';

export interface ImageGenerationRequest {
  request_id: string;
  model: string;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
}

export interface ImageGenerationResult {
  job_id: string;
  status: 'completed' | 'failed';
  image_url?: string;
  metadata: Record<string, string | number | boolean>;
}

export interface ImageGenerationAdapter {
  readonly provider: string;
  readonly supportedModels: readonly ModelInfo[];
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

export interface AudioSpeechRequest {
  request_id: string;
  model: string;
  input: string;
  voice?: string;
  speed?: number;
}

export interface AudioSpeechResult {
  job_id: string;
  status: 'completed' | 'failed';
  /** Binary audio when provider returns bytes; otherwise a remote URL. */
  audio_bytes?: Buffer;
  audio_url?: string;
  mime_type: string;
  metadata: Record<string, string | number | boolean>;
}

export interface AudioSpeechAdapter {
  readonly provider: string;
  readonly supportedModels: readonly ModelInfo[];
  synthesize(request: AudioSpeechRequest): Promise<AudioSpeechResult>;
}
