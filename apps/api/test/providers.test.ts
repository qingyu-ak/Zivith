import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekLLMAdapter } from '../src/adapters/deepseek-llm.js';
import { SiliconFlowAudioAdapter } from '../src/adapters/siliconflow-audio.js';
import { SiliconFlowImageAdapter } from '../src/adapters/siliconflow-image.js';
import { SiliconFlowVideoAdapter } from '../src/adapters/siliconflow-video.js';
import { createProviderBundle } from '../src/providers/registry.js';
import { resetRuntimeProviderState } from '../src/routes/providers.js';
import { z } from 'zod';

afterEach(() => {
  resetRuntimeProviderState();
  vi.unstubAllGlobals();
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.SILICONFLOW_API_KEY;
  delete process.env.LLM_PROVIDER;
  delete process.env.IMAGE_PROVIDER;
  delete process.env.VIDEO_PROVIDER;
  delete process.env.AUDIO_PROVIDER;
});

describe('DeepSeekLLMAdapter', () => {
  it('parses chat completions and structured JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          model: 'deepseek-chat',
          choices: [{ message: { content: '{"title":"种子"}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
    });
    const adapter = new DeepSeekLLMAdapter({
      apiKey: 'test-key',
      fetchImpl: fetchImpl,
    });

    const structured = await adapter.completeStructured(
      {
        request_id: 'r1',
        model: 'deepseek-chat',
        system_prompt: 'Return JSON',
        user_prompt: 'story',
      },
      z.object({ title: z.string() }),
    );

    expect(structured.data.title).toBe('种子');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe('SiliconFlow adapters', () => {
  it('maps image generation URLs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ images: [{ url: 'https://cdn.example/a.png' }] }),
    });
    const adapter = new SiliconFlowImageAdapter({
      apiKey: 'sf',
      fetchImpl: fetchImpl,
    });
    const result = await adapter.generate({
      request_id: 'img-1',
      model: 'black-forest-labs/FLUX.1-schnell',
      prompt: 'neon rain',
    });
    expect(result.image_url).toBe('https://cdn.example/a.png');
  });

  it('polls video status until complete', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ requestId: 'job-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'InProgress' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'Succeed',
            results: [{ url: 'https://cdn.example/v.mp4' }],
          }),
      });
    const adapter = new SiliconFlowVideoAdapter({
      apiKey: 'sf',
      fetchImpl: fetchImpl,
      pollIntervalMs: 1,
      timeoutMs: 1_000,
    });
    const result = await adapter.generate({
      request_id: 'vid-1',
      model: 'Wan-AI/Wan2.1-T2V-14B',
      positive_prompt: 'rain',
      shot: {
        id: '00000000-0000-4000-8000-000000000001',
      } as never,
    });
    expect(result.status).toBe('completed');
    expect(result.video_url).toBe('https://cdn.example/v.mp4');
  });

  it('returns audio bytes from speech endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'audio/mpeg' },
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
    });
    const adapter = new SiliconFlowAudioAdapter({
      apiKey: 'sf',
      fetchImpl: fetchImpl,
    });
    const result = await adapter.synthesize({
      request_id: 'aud-1',
      model: 'FunAudioLLM/CosyVoice2-0.5B',
      input: '你好',
    });
    expect(result.audio_bytes?.length).toBe(3);
    expect(result.mime_type).toBe('audio/mpeg');
  });
});

describe('createProviderBundle', () => {
  it('falls back to mock when credentials are missing', () => {
    const bundle = createProviderBundle({
      llm: 'deepseek',
      image: 'siliconflow',
      video: 'siliconflow',
      audio: 'siliconflow',
    });
    expect(bundle.llm.provider).toBe('mock');
    expect(bundle.image.provider).toBe('mock');
    expect(bundle.video.provider).toBe('mock');
    expect(bundle.audio.provider).toBe('mock');
  });

  it('uses real adapters when keys exist', () => {
    process.env.DEEPSEEK_API_KEY = 'ds-key';
    process.env.SILICONFLOW_API_KEY = 'sf-key';
    const bundle = createProviderBundle({
      llm: 'deepseek',
      image: 'siliconflow',
      video: 'siliconflow',
      audio: 'siliconflow',
    });
    expect(bundle.llm.provider).toBe('deepseek');
    expect(bundle.image.provider).toBe('siliconflow');
    expect(bundle.video.provider).toBe('siliconflow');
    expect(bundle.audio.provider).toBe('siliconflow');
  });
});
