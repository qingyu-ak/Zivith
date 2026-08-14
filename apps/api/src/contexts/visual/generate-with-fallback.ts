import type { ImageGenerationAdapter, ImageGenerationResult, ImageReferenceImage } from '../../ports/media.js';
import { toImageReferencePayload } from './reference-images.js';

export function shouldFallbackImageToText(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /SiliconFlow image API (5\d\d|400)|50507|Unknown error|需要参考图|Model does not exist|timeout/i.test(
    message,
  );
}

/** Prefer I2I when refs exist; on provider 4xx/5xx fall back to T2I without image. */
export async function generateImageWithI2iFallback(input: {
  image: ImageGenerationAdapter;
  requestId: string;
  prompt: string;
  count: number;
  imageModel: string;
  imageI2iModel?: string;
  refs: ImageReferenceImage[];
}): Promise<ImageGenerationResult & { used_model: string; i2i_fallback?: boolean }> {
  const hasRefs = input.refs.length > 0;
  const i2iModel = input.imageI2iModel?.trim();
  const preferI2i = hasRefs && Boolean(i2iModel) && i2iModel !== input.imageModel;

  if (preferI2i && i2iModel) {
    try {
      const generated = await input.image.generate({
        request_id: input.requestId,
        model: i2iModel,
        prompt: input.prompt,
        count: input.count,
        reference_images: toImageReferencePayload(input.refs),
      });
      return { ...generated, used_model: i2iModel };
    } catch (error) {
      if (!shouldFallbackImageToText(error)) throw error;
      console.warn(
        '[image] I2I failed, falling back to T2I',
        i2iModel,
        error instanceof Error ? error.message : error,
      );
      const generated = await input.image.generate({
        request_id: `${input.requestId}:t2i-fallback`,
        model: input.imageModel,
        prompt: input.prompt,
        count: input.count,
      });
      return {
        ...generated,
        used_model: input.imageModel,
        i2i_fallback: true,
        metadata: {
          ...generated.metadata,
          reference_injection: 'skipped_i2i_error',
          i2i_error: (error instanceof Error ? error.message : String(error)).slice(0, 300),
        },
      };
    }
  }

  const generated = await input.image.generate({
    request_id: input.requestId,
    model: input.imageModel,
    prompt: input.prompt,
    count: input.count,
    ...(hasRefs ? { reference_images: toImageReferencePayload(input.refs) } : {}),
  });
  return { ...generated, used_model: input.imageModel };
}
