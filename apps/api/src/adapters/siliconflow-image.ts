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

/** Models known to accept an image conditioning input on SiliconFlow. */
export function siliconFlowModelSupportsReferenceImages(model: string): boolean {
  return /img2img|image-edit|i2i|ip-adapter|pulid|faceid|instantid|kolors/i.test(model);
}

export class SiliconFlowImageAdapter implements ImageGenerationAdapter {
  readonly provider = 'siliconflow';
  readonly supportedModels;
  readonly supportsReferenceImages = true;

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

  getCapabilities() {
    return { supports_reference_images: true as const };
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const refs = request.reference_images ?? [];
    const usableRefs = refs.filter((item) => typeof item.url === 'string' && item.url.length > 0);
    const modelSupports = siliconFlowModelSupportsReferenceImages(request.model);
    const canInject = usableRefs.length > 0 && modelSupports;
    const referenceInjection = (() => {
      if (refs.length === 0) return 'none';
      if (!canInject) return 'skipped_unsupported';
      return 'applied';
    })();

    const body: Record<string, unknown> = {
      model: request.model,
      prompt: request.prompt,
      ...(request.negative_prompt ? { negative_prompt: request.negative_prompt } : {}),
      image_size: `${request.width ?? 1024}x${request.height ?? 1024}`,
    };
    if (canInject) {
      // SiliconFlow image-to-image / edit models accept a primary `image` input.
      body.image = usableRefs[0]?.url;
    }

    const response = await this.fetchImpl(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SiliconFlow image API ${response.status}: ${text.slice(0, 500)}`);
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
      metadata: {
        provider: 'siliconflow',
        request_id: request.request_id,
        reference_injection: referenceInjection,
        ...(refs.length
          ? {
              reference_media_ids: refs.map((item) => item.media_id).join(','),
              reference_labels: refs.map((item) => item.label).join('|'),
            }
          : {}),
      },
    };
  }
}
