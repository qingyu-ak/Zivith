import type {
  ImageGenerationAdapter,
  ImageGenerationRequest,
  ImageGenerationResult,
} from '../ports/media.js';

export interface SiliconFlowImageAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  fetchImpl?: typeof fetch;
}

export class SiliconFlowImageAdapter implements ImageGenerationAdapter {
  readonly provider = 'siliconflow';
  readonly supportedModels;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SiliconFlowImageAdapterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.siliconflow.cn/v1').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    const model = options.defaultModel ?? 'black-forest-labs/FLUX.1-schnell';
    this.supportedModels = [{ id: model, name: 'SiliconFlow Image', version: '1' }];
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        ...(request.negative_prompt ? { negative_prompt: request.negative_prompt } : {}),
        image_size: `${request.width ?? 1024}x${request.height ?? 1024}`,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SiliconFlow image API ${response.status}: ${body.slice(0, 500)}`);
    }
    const payload = (await response.json()) as {
      images?: Array<{ url?: string }>;
      data?: Array<{ url?: string }>;
    };
    const imageUrl = payload.images?.[0]?.url ?? payload.data?.[0]?.url;
    if (!imageUrl) throw new Error('SiliconFlow image API returned no image URL');
    return {
      job_id: `sf-image-${request.request_id}`,
      status: 'completed',
      image_url: imageUrl,
      metadata: { provider: 'siliconflow', request_id: request.request_id },
    };
  }
}
