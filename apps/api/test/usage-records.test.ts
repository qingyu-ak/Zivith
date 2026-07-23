import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import { withUsageContext } from '../src/contexts/usage/context.js';
import { instrumentProviderBundle } from '../src/contexts/usage/instrument.js';
import { inferLlmTaskType, recordUsage } from '../src/contexts/usage/recorder.js';
import type { ProviderBundle } from '../src/providers/registry.js';
import type { LLMAdapter } from '../src/ports/llm.js';
import type { ImageGenerationAdapter } from '../src/ports/media.js';
import type { VideoGenerationAdapter } from '../src/ports/generation.js';
import type { AudioSpeechAdapter } from '../src/ports/media.js';

describe('usage recorder (W7)', () => {
  it('infers llm task types from request ids', () => {
    expect(inferLlmTaskType('run:story')).toBe('llm_story');
    expect(inferLlmTaskType('run:scene')).toBe('llm_scene');
    expect(inferLlmTaskType('run:trait:asset')).toBe('llm_visual_trait');
    expect(inferLlmTaskType('other')).toBe('llm');
  });

  it('skips writes when no project context is available', async () => {
    const create = vi.fn();
    const db = { usageRecord: { create } } as unknown as PrismaClient;
    await recordUsage(db, {
      taskType: 'image_generate',
      provider: 'mock',
      model: 'mock-image',
      quantity: 1,
      unit: 'images',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('records successful and failed LLM calls via instrumented adapter', async () => {
    const create = vi.fn().mockResolvedValue({});
    const db = { usageRecord: { create } } as unknown as PrismaClient;

    const llm: LLMAdapter = {
      provider: 'mock',
      supportedModels: [],
      complete: vi.fn(),
      completeStructured: vi
        .fn()
        .mockResolvedValueOnce({
          text: '{}',
          model: 'mock-text',
          input_tokens: 10,
          output_tokens: 20,
          metadata: {},
          data: {},
        })
        .mockRejectedValueOnce(new Error('boom')),
    };

    const image: ImageGenerationAdapter = {
      provider: 'mock',
      supportedModels: [],
      supportsReferenceImages: false,
      generate: vi.fn(),
    };
    const video = {
      provider: 'mock',
      supportedModels: [],
      generate: vi.fn(),
      getStatus: vi.fn(),
      cancel: vi.fn(),
      getCapabilities: vi.fn(),
    } as unknown as VideoGenerationAdapter;
    const audio = {
      provider: 'mock',
      supportedModels: [],
      synthesize: vi.fn(),
    } as unknown as AudioSpeechAdapter;

    const bundle = instrumentProviderBundle(db, {
      selection: { llm: 'mock', image: 'mock', video: 'mock', audio: 'mock' },
      models: { llm: 'm', image: 'm', video: 'm', audio: 'm' },
      llm,
      llmModel: 'mock-text',
      image,
      imageModel: 'mock-image',
      video,
      videoModel: 'mock-v',
      audio,
      audioModel: 'mock-a',
    } as unknown as ProviderBundle);

    await withUsageContext({ projectId: 'proj-1' }, async () => {
      await bundle.llm.completeStructured(
        {
          request_id: 'run:story',
          model: 'mock-text',
          system_prompt: 'STORY_AGENT',
          user_prompt: '{}',
        },
        { parse: (v: unknown) => v } as never,
      );
      await expect(
        bundle.llm.completeStructured(
          {
            request_id: 'run:story',
            model: 'mock-text',
            system_prompt: 'STORY_AGENT',
            user_prompt: '{}',
          },
          { parse: (v: unknown) => v } as never,
        ),
      ).rejects.toThrow('boom');
    });

    expect(create).toHaveBeenCalledTimes(2);
    const successCall = create.mock.calls[0]?.[0];
    const failedCall = create.mock.calls[1]?.[0];
    expect(successCall?.data).toMatchObject({
      projectId: 'proj-1',
      taskType: 'llm_story',
      provider: 'mock',
      unit: 'tokens',
    });
    expect(Number(successCall?.data.quantity)).toBe(30);
    expect(failedCall?.data.metadata).toMatchObject({ status: 'failed' });
  });
});
