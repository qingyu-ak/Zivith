import type {
  GenerationJobStatus,
  VideoGenerationAdapter,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoModelCapabilities,
} from '../ports/generation.js';

export interface SiliconFlowVideoAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export class SiliconFlowVideoAdapter implements VideoGenerationAdapter {
  readonly provider = 'siliconflow';
  readonly supportedModels;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(options: SiliconFlowVideoAdapterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.siliconflow.cn/v1').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 3_000;
    this.timeoutMs = options.timeoutMs ?? 10 * 60_000;
    const model = options.defaultModel ?? 'Wan-AI/Wan2.1-T2V-14B';
    this.supportedModels = [{ id: model, name: 'SiliconFlow Video', version: '1' }];
  }

  getCapabilities(): VideoModelCapabilities {
    return {
      aspect_ratios: ['16:9', '9:16', '1:1'],
      max_duration_seconds: 10,
      supports_reference_images: true,
      asynchronous: true,
    };
  }

  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const image = request.reference_image_urls?.[0];
    const response = await this.fetchImpl(`${this.baseUrl}/video/submit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        prompt: request.positive_prompt,
        ...(request.negative_prompt ? { negative_prompt: request.negative_prompt } : {}),
        ...(image ? { image_size: '1280x720', image } : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SiliconFlow video submit ${response.status}: ${body.slice(0, 500)}`);
    }
    const payload = (await response.json()) as { requestId?: string; request_id?: string };
    const jobId = payload.requestId ?? payload.request_id;
    if (!jobId) throw new Error('SiliconFlow video submit returned no requestId');

    const started = Date.now();
    while (Date.now() - started < this.timeoutMs) {
      const status = await this.getStatus(jobId);
      if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    return {
      job_id: jobId,
      status: 'failed',
      metadata: { provider: 'siliconflow', error: 'timeout' },
    };
  }

  async getStatus(jobId: string): Promise<GenerationJobStatus> {
    const response = await this.fetchImpl(`${this.baseUrl}/video/status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requestId: jobId }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SiliconFlow video status ${response.status}: ${body.slice(0, 500)}`);
    }
    const payload = (await response.json()) as {
      status?: string;
      results?: Array<{ url?: string }>;
      videos?: Array<{ url?: string }>;
      reason?: string;
    };
    const mapped = this.mapStatus(payload.status ?? 'InQueue');
    const videoUrl = payload.results?.[0]?.url ?? payload.videos?.[0]?.url;
    return {
      job_id: jobId,
      status: mapped,
      ...(videoUrl ? { video_url: videoUrl } : {}),
      metadata: {
        provider: 'siliconflow',
        raw_status: payload.status ?? '',
        ...(payload.reason ? { reason: payload.reason } : {}),
      },
    };
  }

  async cancel(_jobId: string): Promise<void> {
    // SiliconFlow public API does not expose cancel for video jobs yet.
  }

  private mapStatus(status: string): GenerationJobStatus['status'] {
    switch (status) {
      case 'Succeed':
      case 'success':
      case 'completed':
        return 'completed';
      case 'Failed':
      case 'failed':
        return 'failed';
      case 'InProgress':
      case 'running':
        return 'running';
      case 'Cancelled':
      case 'cancelled':
        return 'cancelled';
      default:
        return 'queued';
    }
  }
}
