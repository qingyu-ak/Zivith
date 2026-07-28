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
  /** Text-to-video default */
  defaultModel?: string;
  /** Image-to-video when a public reference frame is present */
  i2vModel?: string;
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
  private readonly t2vModel: string;
  private readonly i2vModel: string;

  constructor(options: SiliconFlowVideoAdapterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.siliconflow.cn/v1').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 3_000;
    this.timeoutMs = options.timeoutMs ?? 10 * 60_000;
    this.t2vModel = options.defaultModel ?? 'Wan-AI/Wan2.2-T2V-A14B';
    this.i2vModel = options.i2vModel ?? 'Wan-AI/Wan2.2-I2V-A14B';
    this.supportedModels = [
      { id: this.t2vModel, name: 'SiliconFlow T2V', version: '1' },
      { id: this.i2vModel, name: 'SiliconFlow I2V', version: '1' },
    ];
  }

  getCapabilities(): VideoModelCapabilities {
    return {
      aspect_ratios: ['16:9', '9:16', '1:1'],
      max_duration_seconds: 10,
      supports_reference_images: true,
      asynchronous: true,
    };
  }

  /**
   * Prefer configured T2V / I2V pair; canonicalize Wan ids (API is case-sensitive).
   */
  resolveModel(requested: string, hasImage: boolean): string {
    const configured = hasImage ? this.i2vModel : this.t2vModel;
    const raw = (requested.trim() || configured).trim();
    const lower = raw.toLowerCase();

    // Canonical Wan ids — lowercase env/UI typos were returning 20012 "Model does not exist".
    if (/wan2\.1/i.test(raw) || lower.includes('wan2.1') || lower.includes('wan2.2')) {
      return hasImage ? this.canonicalizeWan(this.i2vModel, true) : this.canonicalizeWan(this.t2vModel, false);
    }
    if (hasImage && /T2V/i.test(raw) && !/I2V/i.test(raw)) {
      return raw.replace(/T2V/i, 'I2V');
    }
    if (!hasImage && /I2V/i.test(raw) && /T2V/i.test(raw) === false) {
      return raw.replace(/I2V/i, 'T2V');
    }
    return hasImage ? configured : raw || configured;
  }

  private canonicalizeWan(model: string, i2v: boolean): string {
    const lower = model.toLowerCase();
    if (lower.includes('wan2.2') || lower.includes('wan2.1') || lower.includes('wan-ai')) {
      return i2v ? 'Wan-AI/Wan2.2-I2V-A14B' : 'Wan-AI/Wan2.2-T2V-A14B';
    }
    return model;
  }

  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
    // SiliconFlow I2V requires a public http(s) image URL — data: / relative / svg placeholders fail.
    const rawImage = request.reference_image_urls?.[0];
    const image =
      typeof rawImage === 'string' && /^https?:\/\//i.test(rawImage.trim())
        ? rawImage.trim()
        : undefined;
    const model = this.resolveModel(request.model, Boolean(image));
    const response = await this.fetchImpl(`${this.baseUrl}/video/submit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: request.positive_prompt,
        // Wan 2.2 APIs require image_size for both T2V and I2V.
        image_size: '1280x720',
        ...(request.negative_prompt ? { negative_prompt: request.negative_prompt } : {}),
        ...(image ? { image } : {}),
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
      if (
        status.status === 'completed' ||
        status.status === 'failed' ||
        status.status === 'cancelled'
      ) {
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
      failReason?: string;
      message?: string;
      error?: string | { message?: string };
    };
    const mapped = this.mapStatus(payload.status ?? 'InQueue');
    const videoUrl = payload.results?.[0]?.url ?? payload.videos?.[0]?.url;
    const reason =
      payload.reason ||
      payload.failReason ||
      payload.message ||
      (typeof payload.error === 'string'
        ? payload.error
        : typeof payload.error?.message === 'string'
          ? payload.error.message
          : undefined);
    return {
      job_id: jobId,
      status: mapped,
      ...(videoUrl ? { video_url: videoUrl } : {}),
      metadata: {
        provider: 'siliconflow',
        raw_status: payload.status ?? '',
        ...(reason ? { reason } : {}),
        ...(mapped === 'failed' && !reason ? { reason: `provider status ${payload.status ?? 'Failed'}` } : {}),
      },
    };
  }

  cancel(_jobId: string): Promise<void> {
    void _jobId;
    // SiliconFlow public API does not expose cancel for video jobs yet.
    return Promise.resolve();
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
