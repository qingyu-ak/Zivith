import type {
  GenerationJobStatus,
  VideoGenerationAdapter,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoModelCapabilities,
} from '../ports/generation.js';
import { toWanVideoPrompt } from './wan-video-prompt.js';

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

function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local')
    );
  } catch {
    return true;
  }
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function causeMessage(error: unknown): string {
  if (!(error instanceof Error) || error.cause == null) return '';
  if (error.cause instanceof Error) return error.cause.message;
  return typeof error.cause === 'string' ? error.cause : '';
}

function isTransientFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const cause = causeMessage(error);
  const text = `${message} ${cause}`.toLowerCase();
  return (
    text.includes('fetch failed') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('econnrefused') ||
    text.includes('socket') ||
    text.includes('network') ||
    text.includes('aborted') ||
    text.includes('und_err')
  );
}

function formatFetchError(prefix: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const cause = causeMessage(error);
  return new Error(cause ? `${prefix}: ${message} (${cause})` : `${prefix}: ${message}`);
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
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    // Wan2.2-A14B regularly exceeds 10 minutes under load.
    this.timeoutMs = options.timeoutMs ?? 20 * 60_000;
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
      return hasImage
        ? this.canonicalizeWan(this.i2vModel, true)
        : this.canonicalizeWan(this.t2vModel, false);
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

  /**
   * Prefer pass-through https URLs for I2V.
   * SiliconFlow `temporary/outputs` keyframes return HEAD 200 but Wan-I2V fails
   * immediately with empty reason — skip those and use T2V instead.
   */
  async prepareReferenceImage(rawUrl: string | undefined): Promise<string | undefined> {
    if (!rawUrl) return undefined;
    const url = rawUrl.trim();
    if (!isHttpUrl(url) || isLoopbackUrl(url)) return undefined;
    // Live probe: temporary CDN frames are not accepted by Wan2.2-I2V (Failed in <10s).
    if (/siliconflow\.cn\/temporary\//i.test(url)) return undefined;

    try {
      const head = await this.fetchImpl(url, { method: 'HEAD' });
      if (head.ok) {
        const mime = (head.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
        if (!mime || mime.startsWith('image/') || mime.includes('octet-stream')) {
          return url;
        }
      }
    } catch {
      // Some CDNs reject HEAD — try a tiny ranged GET below.
    }

    try {
      const probe = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
      });
      if (probe.ok || probe.status === 206) {
        try {
          await probe.body?.cancel();
        } catch {
          /* ignore */
        }
        return url;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private async fetchJson(
    path: string,
    body: Record<string, unknown>,
    label: string,
  ): Promise<Response> {
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        return response;
      } catch (error) {
        lastError = error;
        if (!isTransientFetchError(error) || attempt === maxAttempts) {
          throw formatFetchError(`SiliconFlow ${label}`, error);
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    throw formatFetchError(`SiliconFlow ${label}`, lastError);
  }

  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const rawRef = request.reference_image_urls?.[0];
    const preparedImage = await this.prepareReferenceImage(rawRef);
    const prompt = toWanVideoPrompt(request.positive_prompt);
    const negative = request.negative_prompt?.trim().slice(0, 500) || undefined;
    const skippedReason =
      !preparedImage && rawRef
        ? /siliconflow\.cn\/temporary\//i.test(rawRef)
          ? 'temporary_cdn_unsupported_for_i2v'
          : 'unreachable_or_expired'
        : undefined;

    // Cost control: never auto-submit a second Wan job (I2V→T2V etc.). Each submit ≈ ¥2.
    // Failed runs stay failed until the operator clicks generate again.
    const result = await this.submitAndPoll({
      requestModel: request.model,
      prompt,
      ...(negative ? { negative } : {}),
      ...(preparedImage ? { image: preparedImage } : {}),
    });

    return {
      ...result,
      metadata: {
        ...result.metadata,
        ...(skippedReason ? { reference_skipped: skippedReason } : {}),
        ...(result.status === 'failed' && preparedImage ? { i2v_failed_no_auto_t2v: true } : {}),
      },
    };
  }

  private async submitAndPoll(input: {
    requestModel: string;
    prompt: string;
    negative?: string;
    image?: string;
  }): Promise<VideoGenerationResult> {
    const model = this.resolveModel(input.requestModel, Boolean(input.image));
    const response = await this.fetchJson(
      '/video/submit',
      {
        model,
        prompt: input.prompt,
        // Wan 2.2 APIs require image_size for both T2V and I2V.
        image_size: '1280x720',
        ...(input.negative ? { negative_prompt: input.negative } : {}),
        ...(input.image ? { image: input.image } : {}),
      },
      'video submit',
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SiliconFlow video submit ${response.status}: ${body.slice(0, 500)}`);
    }
    const payload = (await response.json()) as { requestId?: string; request_id?: string };
    const jobId = payload.requestId ?? payload.request_id;
    if (!jobId) throw new Error('SiliconFlow video submit returned no requestId');

    const started = Date.now();
    let consecutivePollErrors = 0;
    let lastStatus: GenerationJobStatus['status'] = 'queued';
    let lastRaw = 'InQueue';
    while (Date.now() - started < this.timeoutMs) {
      try {
        const status = await this.getStatus(jobId);
        consecutivePollErrors = 0;
        lastStatus = status.status;
        lastRaw =
          typeof status.metadata?.raw_status === 'string'
            ? status.metadata.raw_status
            : status.status;
        if (
          status.status === 'completed' ||
          status.status === 'failed' ||
          status.status === 'cancelled'
        ) {
          return {
            ...status,
            metadata: {
              ...status.metadata,
              provider: 'siliconflow',
              model,
              submitted_prompt: input.prompt.slice(0, 240),
              image_mode: input.image ? 'i2v_url' : 't2v',
            },
          };
        }
      } catch (error) {
        // Transient network blips during long Wan polls must not kill the job.
        if (!isTransientFetchError(error)) throw error;
        consecutivePollErrors += 1;
        if (consecutivePollErrors >= 8) {
          throw formatFetchError('SiliconFlow video status (too many transient failures)', error);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    // Keep provider job alive — SiliconFlow often sits in InQueue far longer than local poll windows.
    return {
      job_id: jobId,
      status: lastStatus === 'running' ? 'running' : 'queued',
      metadata: {
        provider: 'siliconflow',
        model,
        error: 'poll_timeout',
        reason: `SiliconFlow still ${lastRaw} after ${Math.round(this.timeoutMs / 60_000)} minutes; continuing to poll (check cloud.siliconflow.cn balance/queue)`,
        raw_status: lastRaw,
        submitted_prompt: input.prompt.slice(0, 240),
        image_mode: input.image ? 'i2v_url' : 't2v',
        poll_timeout: true,
      },
    };
  }

  /** Continue polling an already-submitted SiliconFlow requestId. */
  async pollExisting(
    jobId: string,
    options?: { timeoutMs?: number },
  ): Promise<VideoGenerationResult> {
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
    const started = Date.now();
    let consecutivePollErrors = 0;
    let lastStatus: GenerationJobStatus['status'] = 'queued';
    let lastRaw = 'InQueue';
    while (Date.now() - started < timeoutMs) {
      try {
        const status = await this.getStatus(jobId);
        consecutivePollErrors = 0;
        lastStatus = status.status;
        lastRaw =
          typeof status.metadata?.raw_status === 'string'
            ? status.metadata.raw_status
            : status.status;
        if (
          status.status === 'completed' ||
          status.status === 'failed' ||
          status.status === 'cancelled'
        ) {
          return status;
        }
      } catch (error) {
        if (!isTransientFetchError(error)) throw error;
        consecutivePollErrors += 1;
        if (consecutivePollErrors >= 8) {
          throw formatFetchError('SiliconFlow video status (too many transient failures)', error);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    return {
      job_id: jobId,
      status: lastStatus === 'running' ? 'running' : 'queued',
      metadata: {
        provider: 'siliconflow',
        error: 'poll_timeout',
        reason: `SiliconFlow still ${lastRaw} after ${Math.round(timeoutMs / 60_000)} minutes; continuing to poll`,
        raw_status: lastRaw,
        poll_timeout: true,
      },
    };
  }

  async getStatus(jobId: string): Promise<GenerationJobStatus> {
    const response = await this.fetchJson('/video/status', { requestId: jobId }, 'video status');
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SiliconFlow video status ${response.status}: ${body.slice(0, 500)}`);
    }
    const payload = (await response.json()) as {
      status?: string;
      results?:
        | Array<{ url?: string }>
        | {
            videos?: Array<{ url?: string }>;
          };
      videos?: Array<{ url?: string }>;
      reason?: string;
      failReason?: string;
      message?: string;
      error?: string | { message?: string };
    };
    const mapped = this.mapStatus(payload.status ?? 'InQueue');
    const videoUrl = this.extractVideoUrl(payload);
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
        ...(mapped === 'failed' && !reason
          ? { reason: `provider status ${payload.status ?? 'Failed'}` }
          : {}),
        ...(mapped === 'completed' && !videoUrl
          ? { reason: 'provider Succeed but video url missing in status payload' }
          : {}),
      },
    };
  }

  cancel(_jobId: string): Promise<void> {
    void _jobId;
    // SiliconFlow public API does not expose cancel for video jobs yet.
    return Promise.resolve();
  }

  private extractVideoUrl(payload: {
    results?: Array<{ url?: string }> | { videos?: Array<{ url?: string }> };
    videos?: Array<{ url?: string }>;
  }): string | undefined {
    const results = payload.results;
    if (results && !Array.isArray(results)) {
      const fromObject = results.videos?.[0]?.url;
      if (fromObject) return fromObject;
    }
    if (Array.isArray(results)) {
      const fromArray = results[0]?.url;
      if (fromArray) return fromArray;
    }
    return payload.videos?.[0]?.url;
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
