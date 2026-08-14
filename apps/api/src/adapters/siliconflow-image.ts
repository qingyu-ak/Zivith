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
  return /img2img|image-edit|i2i|ip-adapter|pulid|faceid|instantid|kolors|qwen-image-edit/i.test(
    model,
  );
}

/**
 * Canonicalize known SiliconFlow image model ids (API is case-sensitive).
 * Invalid casing previously returned 20012 "Model does not exist".
 */
export function resolveSiliconFlowImageModel(requested: string): string {
  const raw = requested.trim();
  const lower = raw.toLowerCase();
  if (lower.includes('z-image-turbo') || lower === 'tongyi-mai/z-image-turbo') {
    return 'Tongyi-MAI/Z-Image-Turbo';
  }
  if (lower.includes('flux.1-schnell') || lower.includes('flux-1-schnell')) {
    return 'black-forest-labs/FLUX.1-schnell';
  }
  if (lower.includes('flux.1-dev') || lower.includes('flux-1-dev')) {
    return 'black-forest-labs/FLUX.1-dev';
  }
  if (lower.includes('qwen-image-edit')) {
    return 'Qwen/Qwen-Image-Edit';
  }
  if (lower === 'qwen/qwen-image' || lower.endsWith('/qwen-image')) {
    return 'Qwen/Qwen-Image';
  }
  return raw;
}

/** Qwen-Image T2I prefers 1328; Edit / others keep safer defaults. */
export function resolveSiliconFlowImageSize(
  model: string,
  width?: number,
  height?: number,
): string {
  if (width && height) return `${width}x${height}`;
  if (/qwen-image-edit/i.test(model)) return '1024x1024';
  if (/qwen\/qwen-image(?!-edit)/i.test(model) || /\/qwen-image$/i.test(model)) {
    return '1328x1328';
  }
  return '1024x1024';
}

function truncatePrompt(prompt: string, max = 2_500): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trim()}…`;
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
    const model = options.defaultModel ?? 'Tongyi-MAI/Z-Image-Turbo';
    this.supportedModels = [{ id: model, name: 'SiliconFlow Image', version: '1' }];
  }

  getCapabilities() {
    return {
      supports_reference_images: siliconFlowModelSupportsReferenceImages(this.supportedModels[0]?.id ?? '')
        ? (true as const)
        : (false as const),
    };
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const model = resolveSiliconFlowImageModel(request.model);
    const refs = request.reference_images ?? [];
    const usableRefs = refs.filter((item) => {
      if (typeof item.url !== 'string' || !item.url.length) return false;
      // Prefer public URLs; reject svg/data placeholders that break edit models.
      if (/^https?:\/\//i.test(item.url)) return true;
      return /^data:image\/(png|jpeg|jpg|webp);/i.test(item.url);
    });
    const modelSupports = siliconFlowModelSupportsReferenceImages(model);
    const canInject = usableRefs.length > 0 && modelSupports;
    const referenceInjection = (() => {
      if (refs.length === 0) return 'none';
      if (!canInject) return 'skipped_unsupported';
      return 'applied';
    })();

    const body: Record<string, unknown> = {
      model,
      prompt: truncatePrompt(request.prompt),
      ...(request.negative_prompt
        ? { negative_prompt: truncatePrompt(request.negative_prompt, 1_000) }
        : {}),
      image_size: resolveSiliconFlowImageSize(model, request.width, request.height),
    };
    if (canInject) {
      // SiliconFlow image-to-image / edit models accept a primary `image` input.
      body.image = usableRefs[0]?.url;
    } else if (/image-edit|img2img|i2i/i.test(model)) {
      throw new Error(
        `模型 ${model} 需要参考图（image），但当前没有可用的 http(s) 参考图 URL`,
      );
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
