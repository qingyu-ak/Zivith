import type {
  GenerationJobStatus,
  VideoGenerationAdapter,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoModelCapabilities,
} from '../ports/generation.js';

export interface MockGenerationAdapterOptions {
  placeholderVideoUrl?: string;
  minDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

const DEFAULT_PLACEHOLDER_URL = 'https://assets.zivith.local/mock-video.mp4';

export class MockGenerationAdapter implements VideoGenerationAdapter {
  readonly provider = 'mock';
  readonly supportedModels = [{ id: 'mock-v1', name: 'Mock Video Generator', version: '1' }];

  private readonly jobs = new Map<string, GenerationJobStatus>();
  private readonly placeholderVideoUrl: string;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: MockGenerationAdapterOptions = {}) {
    this.placeholderVideoUrl =
      options.placeholderVideoUrl ??
      process.env.PLACEHOLDER_VIDEO_URL ??
      DEFAULT_PLACEHOLDER_URL;
    this.minDelayMs = options.minDelayMs ?? 2_000;
    this.maxDelayMs = options.maxDelayMs ?? 5_000;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;

    if (this.minDelayMs < 0 || this.maxDelayMs < this.minDelayMs) {
      throw new Error('Mock generation delay range is invalid');
    }
  }

  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
    if (!this.supportedModels.some((model) => model.id === request.model)) {
      throw new Error(`Unsupported mock video model: ${request.model}`);
    }

    const jobId = `mock-${request.request_id}`;
    const delayMs =
      this.minDelayMs + Math.floor(this.random() * (this.maxDelayMs - this.minDelayMs + 1));
    const overlayText = this.buildOverlayText(request);
    const running: GenerationJobStatus = {
      job_id: jobId,
      status: 'running',
      metadata: { is_mock: true, delay_ms: delayMs, overlay_text: overlayText },
    };
    this.jobs.set(jobId, running);

    await this.sleep(delayMs);
    if (this.jobs.get(jobId)?.status === 'cancelled') return this.getStatus(jobId);

    const completed: VideoGenerationResult = {
      job_id: jobId,
      status: 'completed',
      video_url: this.placeholderVideoUrl,
      metadata: {
        is_mock: true,
        delay_ms: delayMs,
        overlay_text: overlayText,
        request_id: request.request_id,
        shot_id: request.shot.id,
      },
    };
    this.jobs.set(jobId, completed);
    return completed;
  }

  async getStatus(jobId: string): Promise<GenerationJobStatus> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Mock generation job not found: ${jobId}`);
    return job;
  }

  async cancel(jobId: string): Promise<void> {
    const job = await this.getStatus(jobId);
    if (job.status === 'completed' || job.status === 'failed') return;
    this.jobs.set(jobId, { ...job, status: 'cancelled' });
  }

  getCapabilities(): VideoModelCapabilities {
    return {
      aspect_ratios: ['16:9', '9:16', '1:1', '4:3', '21:9'],
      max_duration_seconds: 60,
      supports_reference_images: true,
      asynchronous: true,
    };
  }

  private buildOverlayText(request: VideoGenerationRequest): string {
    const parts = [
      request.shot.label ?? `Shot ${request.shot.order}`,
      request.shot.camera?.shot_type,
      request.shot.camera?.movement,
      request.shot.action?.description,
      request.shot.dialogue?.text,
    ];
    return parts.filter((part): part is string => Boolean(part)).join(' · ');
  }
}
