import { DeepSeekLLMAdapter } from '../adapters/deepseek-llm.js';
import { MockLLMAdapter } from '../adapters/mock-llm.js';
import { mockAgentResponder } from '../adapters/mock-agent-responder.js';
import { MockGenerationAdapter } from '../adapters/mock-generation.js';
import { MockAudioAdapter, MockImageAdapter } from '../adapters/mock-media.js';
import { SiliconFlowAudioAdapter } from '../adapters/siliconflow-audio.js';
import { SiliconFlowImageAdapter } from '../adapters/siliconflow-image.js';
import { SiliconFlowVideoAdapter } from '../adapters/siliconflow-video.js';
import type { VideoGenerationAdapter } from '../ports/generation.js';
import type { LLMAdapter } from '../ports/llm.js';
import type { AudioSpeechAdapter, ImageGenerationAdapter } from '../ports/media.js';
import {
  loadProviderCredentials,
  loadProviderModels,
  loadProviderSelection,
  type ProviderModels,
  type ProviderSelection,
} from './config.js';

export interface ProviderBundle {
  selection: ProviderSelection;
  models: ProviderModels;
  llm: LLMAdapter;
  llmModel: string;
  image: ImageGenerationAdapter;
  /** Text-to-image model id */
  imageModel: string;
  /** Text+image-to-image model id */
  imageI2iModel: string;
  video: VideoGenerationAdapter;
  /** Text-to-video model id */
  videoModel: string;
  /** Image-to-video model id */
  videoI2vModel: string;
  audio: AudioSpeechAdapter;
  audioModel: string;
}

export function createProviderBundle(
  selectionOverride?: Partial<ProviderSelection>,
  modelsOverride?: Partial<ProviderModels>,
): ProviderBundle {
  const credentials = loadProviderCredentials();
  const models = { ...loadProviderModels(), ...modelsOverride };
  const selection = loadProviderSelection(selectionOverride);

  const llm =
    selection.llm === 'deepseek' && credentials.deepseekApiKey
      ? new DeepSeekLLMAdapter({
          apiKey: credentials.deepseekApiKey,
          baseUrl: credentials.deepseekBaseUrl,
          defaultModel: models.llm,
        })
      : selection.llm === 'siliconflow' && credentials.siliconflowApiKey
        ? new DeepSeekLLMAdapter({
            // SiliconFlow chat is OpenAI-compatible; reuse the same adapter surface.
            apiKey: credentials.siliconflowApiKey,
            baseUrl: credentials.siliconflowBaseUrl,
            defaultModel: models.llm,
          })
        : new MockLLMAdapter({ responder: mockAgentResponder });

  const realImage = selection.image === 'siliconflow' && credentials.siliconflowApiKey;
  const realVideo = selection.video === 'siliconflow' && credentials.siliconflowApiKey;

  const image = realImage
    ? new SiliconFlowImageAdapter({
        apiKey: credentials.siliconflowApiKey,
        baseUrl: credentials.siliconflowBaseUrl,
        defaultModel: models.image,
      })
    : new MockImageAdapter();

  const video = realVideo
    ? new SiliconFlowVideoAdapter({
        apiKey: credentials.siliconflowApiKey,
        baseUrl: credentials.siliconflowBaseUrl,
        defaultModel: models.video,
        i2vModel: models.video_i2v,
      })
    : new MockGenerationAdapter({ minDelayMs: 200, maxDelayMs: 400 });

  const audio =
    selection.audio === 'siliconflow' && credentials.siliconflowApiKey
      ? new SiliconFlowAudioAdapter({
          apiKey: credentials.siliconflowApiKey,
          baseUrl: credentials.siliconflowBaseUrl,
          defaultModel: models.audio,
        })
      : new MockAudioAdapter();

  return {
    selection,
    models,
    llm,
    llmModel:
      (selection.llm === 'deepseek' && credentials.deepseekApiKey) ||
      (selection.llm === 'siliconflow' && credentials.siliconflowApiKey)
        ? models.llm
        : 'mock-text-v1',
    image,
    imageModel: realImage ? models.image : 'mock-image-v1',
    imageI2iModel: realImage ? models.image_i2i : 'mock-image-i2i-v1',
    video,
    videoModel: realVideo ? models.video : 'mock-v1',
    videoI2vModel: realVideo ? models.video_i2v : 'mock-i2v-v1',
    audio,
    audioModel:
      selection.audio === 'siliconflow' && credentials.siliconflowApiKey
        ? models.audio
        : 'mock-audio-v1',
  };
}
