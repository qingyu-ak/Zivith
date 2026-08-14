import type { ModelInfo } from '../ports/generation.js';

export type ImageReferenceRole = 'character' | 'location' | 'style';

export interface ImageReferenceImage {
  media_id: string;
  label: string;
  role: ImageReferenceRole;
  /** Adapter-ready URL or data URI when already resolved by the caller. */
  url?: string;
}

export interface ImageGenerationRequest {
  request_id: string;
  model: string;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  /**
   * Desired candidate count (1–4, default 1). Adapters may ignore this and return a
   * single image; callers loop to produce a candidate set (V0.4 W5).
   */
  count?: number;
  /** Optional labeled reference images for identity / style conditioning (V0.4 W1). */
  reference_images?: ImageReferenceImage[];
}

export interface ImageGenerationResult {
  job_id: string;
  status: 'completed' | 'failed';
  image_url?: string;
  metadata: Record<string, string | number | boolean>;
}

export interface ImageModelCapabilities {
  supports_reference_images: boolean;
}

export interface ImageGenerationAdapter {
  readonly provider: string;
  readonly supportedModels: readonly ModelInfo[];
  /** Capability bit — not a provider field in domain. */
  readonly supportsReferenceImages: boolean;
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
  getCapabilities?(): ImageModelCapabilities;
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
