import type { ZodType } from 'zod';
import type { PrismaClient } from '@zivith/database';
import type {
  GenerationJobStatus,
  VideoGenerationAdapter,
  VideoGenerationRequest,
  VideoGenerationResult,
} from '../../ports/generation.js';
import type {
  CompletionRequest,
  CompletionResult,
  LLMAdapter,
  StructuredCompletionResult,
} from '../../ports/llm.js';
import type {
  AudioSpeechAdapter,
  AudioSpeechRequest,
  AudioSpeechResult,
  ImageGenerationAdapter,
  ImageGenerationRequest,
  ImageGenerationResult,
} from '../../ports/media.js';
import type { ProviderBundle } from '../../providers/registry.js';
import { getUsageContext } from './context.js';
import { inferLlmTaskType, recordUsage } from './recorder.js';

function recordingLlm(db: PrismaClient, inner: LLMAdapter): LLMAdapter {
  return {
    provider: inner.provider,
    supportedModels: inner.supportedModels,
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      try {
        const result = await inner.complete(request);
        await recordUsage(db, {
          taskType: getUsageContext()?.taskType ?? inferLlmTaskType(request.request_id),
          provider: inner.provider,
          model: result.model || request.model,
          quantity: result.input_tokens + result.output_tokens,
          unit: 'tokens',
          metadata: {
            status: 'completed',
            request_id: request.request_id,
            input_tokens: result.input_tokens,
            output_tokens: result.output_tokens,
          },
        });
        return result;
      } catch (error) {
        await recordUsage(db, {
          taskType: getUsageContext()?.taskType ?? inferLlmTaskType(request.request_id),
          provider: inner.provider,
          model: request.model,
          quantity: 0,
          unit: 'tokens',
          metadata: {
            status: 'failed',
            request_id: request.request_id,
            error: error instanceof Error ? error.message.slice(0, 500) : String(error),
          },
        });
        throw error;
      }
    },
    async completeStructured<T>(
      request: CompletionRequest,
      schema: ZodType<T>,
    ): Promise<StructuredCompletionResult<T>> {
      try {
        const result = await inner.completeStructured(request, schema);
        await recordUsage(db, {
          taskType: getUsageContext()?.taskType ?? inferLlmTaskType(request.request_id),
          provider: inner.provider,
          model: result.model || request.model,
          quantity: result.input_tokens + result.output_tokens,
          unit: 'tokens',
          metadata: {
            status: 'completed',
            request_id: request.request_id,
            input_tokens: result.input_tokens,
            output_tokens: result.output_tokens,
            structured: true,
          },
        });
        return result;
      } catch (error) {
        await recordUsage(db, {
          taskType: getUsageContext()?.taskType ?? inferLlmTaskType(request.request_id),
          provider: inner.provider,
          model: request.model,
          quantity: 0,
          unit: 'tokens',
          metadata: {
            status: 'failed',
            request_id: request.request_id,
            structured: true,
            error: error instanceof Error ? error.message.slice(0, 500) : String(error),
          },
        });
        throw error;
      }
    },
  };
}

function recordingImage(db: PrismaClient, inner: ImageGenerationAdapter): ImageGenerationAdapter {
  const adapter: ImageGenerationAdapter = {
    provider: inner.provider,
    supportedModels: inner.supportedModels,
    supportsReferenceImages: inner.supportsReferenceImages,
    async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
      try {
        const result = await inner.generate(request);
        await recordUsage(db, {
          taskType: getUsageContext()?.taskType ?? 'image_generate',
          provider: inner.provider,
          model: request.model,
          quantity: 1,
          unit: 'images',
          metadata: {
            status: result.status,
            request_id: request.request_id,
            job_id: result.job_id,
            count: request.count ?? 1,
            ...result.metadata,
          },
        });
        return result;
      } catch (error) {
        await recordUsage(db, {
          taskType: getUsageContext()?.taskType ?? 'image_generate',
          provider: inner.provider,
          model: request.model,
          quantity: 0,
          unit: 'images',
          metadata: {
            status: 'failed',
            request_id: request.request_id,
            error: error instanceof Error ? error.message.slice(0, 500) : String(error),
          },
        });
        throw error;
      }
    },
  };
  if (inner.getCapabilities) {
    adapter.getCapabilities = inner.getCapabilities.bind(inner);
  }
  return adapter;
}

function recordingVideo(db: PrismaClient, inner: VideoGenerationAdapter): VideoGenerationAdapter {
  return {
    provider: inner.provider,
    supportedModels: inner.supportedModels,
    getCapabilities: inner.getCapabilities.bind(inner),
    getStatus: (jobId: string): Promise<GenerationJobStatus> => inner.getStatus(jobId),
    cancel: (jobId: string): Promise<void> => inner.cancel(jobId),
    async generate(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
      try {
        const result = await inner.generate(request);
        await recordUsage(db, {
          taskType: getUsageContext()?.taskType ?? 'video_generate',
          provider: inner.provider,
          model: request.model,
          quantity: result.status === 'failed' ? 0 : 1,
          unit: 'videos',
          metadata: {
            status: result.status,
            request_id: request.request_id,
            job_id: result.job_id,
          },
        });
        return result;
      } catch (error) {
        await recordUsage(db, {
          taskType: getUsageContext()?.taskType ?? 'video_generate',
          provider: inner.provider,
          model: request.model,
          quantity: 0,
          unit: 'videos',
          metadata: {
            status: 'failed',
            request_id: request.request_id,
            error: error instanceof Error ? error.message.slice(0, 500) : String(error),
          },
        });
        throw error;
      }
    },
  };
}

function recordingAudio(db: PrismaClient, inner: AudioSpeechAdapter): AudioSpeechAdapter {
  return {
    provider: inner.provider,
    supportedModels: inner.supportedModels,
    async synthesize(request: AudioSpeechRequest): Promise<AudioSpeechResult> {
      try {
        const result = await inner.synthesize(request);
        await recordUsage(db, {
          taskType: getUsageContext()?.taskType ?? 'audio_tts',
          provider: inner.provider,
          model: request.model,
          quantity: result.status === 'failed' ? 0 : 1,
          unit: 'audio_clips',
          metadata: {
            status: result.status,
            request_id: request.request_id,
            job_id: result.job_id,
            mime_type: result.mime_type,
          },
        });
        return result;
      } catch (error) {
        await recordUsage(db, {
          taskType: getUsageContext()?.taskType ?? 'audio_tts',
          provider: inner.provider,
          model: request.model,
          quantity: 0,
          unit: 'audio_clips',
          metadata: {
            status: 'failed',
            request_id: request.request_id,
            error: error instanceof Error ? error.message.slice(0, 500) : String(error),
          },
        });
        throw error;
      }
    },
  };
}

/** Wrap a provider bundle so every LLM/image/video/audio call writes a usage_records row. */
export function instrumentProviderBundle(
  db: PrismaClient,
  bundle: ProviderBundle,
): ProviderBundle {
  return {
    ...bundle,
    llm: recordingLlm(db, bundle.llm),
    image: recordingImage(db, bundle.image),
    video: recordingVideo(db, bundle.video),
    audio: recordingAudio(db, bundle.audio),
  };
}
