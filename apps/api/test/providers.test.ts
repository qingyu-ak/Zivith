import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekLLMAdapter, extractJsonFromLlmText } from '../src/adapters/deepseek-llm.js';
import { SiliconFlowAudioAdapter } from '../src/adapters/siliconflow-audio.js';
import {
  SiliconFlowImageAdapter,
  resolveSiliconFlowImageModel,
} from '../src/adapters/siliconflow-image.js';
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

function jsonOk(payload: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve(payload),
  };
}

describe('extractJsonFromLlmText', () => {
  it('parses fenced JSON and preamble wrappers', () => {
    expect(extractJsonFromLlmText('```json\n{"title":"种子"}\n```')).toEqual({ title: '种子' });
    expect(extractJsonFromLlmText('Sure.\n{"title":"种子"}\n')).toEqual({ title: '种子' });
  });

  it('rejects empty model text', () => {
    expect(() => extractJsonFromLlmText('')).toThrow(/did not return valid JSON/);
    expect(() => extractJsonFromLlmText('   ')).toThrow(/did not return valid JSON/);
  });
});

describe('DeepSeekLLMAdapter', () => {
  it('parses chat completions and structured JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonOk({
        model: 'deepseek-chat',
        choices: [{ message: { content: '{"title":"种子"}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    );
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
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body ?? '{}')) as {
      thinking?: { type?: string };
      response_format?: { type?: string };
      max_tokens?: number;
    };
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.max_tokens).toBe(4_096);
  });

  it('retries structured JSON when thinking mode leaves content empty', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonOk({
          model: 'deepseek-v4-flash',
          choices: [
            {
              finish_reason: 'length',
              message: { content: '', reasoning_content: 'planning a long reply' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonOk({
          model: 'deepseek-v4-flash',
          choices: [{ message: { content: '{"title":"续写"}' } }],
        }),
      );
    const adapter = new DeepSeekLLMAdapter({
      apiKey: 'test-key',
      fetchImpl,
    });

    const structured = await adapter.completeStructured(
      {
        request_id: 'r2',
        model: 'deepseek-v4-flash',
        system_prompt: 'Return JSON',
        user_prompt: '续写建议',
        max_tokens: 3_000,
      },
      z.object({ title: z.string() }),
    );

    expect(structured.data.title).toBe('续写');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body ?? '{}')) as {
      max_tokens?: number;
      thinking?: { type?: string };
    };
    expect(retryBody.max_tokens).toBe(4_096);
    expect(retryBody.thinking).toEqual({ type: 'disabled' });
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

  it('canonicalizes lowercase Z-Image-Turbo model ids', async () => {
    expect(resolveSiliconFlowImageModel('tongyi-mai/z-image-turbo')).toBe(
      'Tongyi-MAI/Z-Image-Turbo',
    );
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ images: [{ url: 'https://cdn.example/z.png' }] }),
    });
    const adapter = new SiliconFlowImageAdapter({ apiKey: 'sf', fetchImpl });
    await adapter.generate({
      request_id: 'img-z',
      model: 'tongyi-mai/z-image-turbo',
      prompt: 'portrait',
    });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body ?? '{}')) as {
      model?: string;
    };
    expect(body.model).toBe('Tongyi-MAI/Z-Image-Turbo');
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
      model: 'Wan-AI/Wan2.2-T2V-A14B',
      positive_prompt: 'rain',
      shot: {
        id: '00000000-0000-4000-8000-000000000001',
      } as never,
    });
    expect(result.status).toBe('completed');
    expect(result.video_url).toBe('https://cdn.example/v.mp4');
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
    });
    const submitBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body ?? '{}')) as {
      image_size?: string;
      model?: string;
    };
    expect(submitBody.image_size).toBe('1280x720');
    expect(submitBody.model).toBe('Wan-AI/Wan2.2-T2V-A14B');
  });

  it('upgrades deprecated Wan2.1 and switches to I2V when a frame is provided', async () => {
    const fetchImpl = vi
      .fn()
      // Probe reference URL (pass-through, no base64).
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'image/png' },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ requestId: 'job-2' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'Succeed',
            results: { videos: [{ url: 'https://cdn.example/v2.mp4' }] },
          }),
      });
    const adapter = new SiliconFlowVideoAdapter({
      apiKey: 'sf',
      fetchImpl: fetchImpl,
      pollIntervalMs: 1,
      timeoutMs: 1_000,
    });
    const result = await adapter.generate({
      request_id: 'vid-2',
      model: 'Wan-AI/Wan2.1-T2V-14B',
      positive_prompt: 'walk',
      reference_image_urls: ['https://cdn.example/frame.png'],
      shot: {
        id: '00000000-0000-4000-8000-000000000002',
      } as never,
    });
    const submitBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body ?? '{}')) as {
      model?: string;
      image?: string;
      image_size?: string;
    };
    expect(submitBody.model).toBe('Wan-AI/Wan2.2-I2V-A14B');
    expect(submitBody.image).toBe('https://cdn.example/frame.png');
    expect(submitBody.image_size).toBe('1280x720');
    expect(result.video_url).toBe('https://cdn.example/v2.mp4');
  });

  it('skips SiliconFlow temporary CDN frames and uses T2V', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ requestId: 'job-3' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'Succeed',
            results: { videos: [{ url: 'https://cdn.example/v3.mp4' }] },
          }),
      });
    const adapter = new SiliconFlowVideoAdapter({
      apiKey: 'sf',
      fetchImpl: fetchImpl,
      pollIntervalMs: 1,
      timeoutMs: 1_000,
    });
    const result = await adapter.generate({
      request_id: 'vid-3',
      model: 'Wan-AI/Wan2.2-I2V-A14B',
      positive_prompt: 'walk',
      reference_image_urls: ['https://s3.siliconflow.cn/temporary/outputs/expired.png'],
      shot: {
        id: '00000000-0000-4000-8000-000000000003',
      } as never,
    });
    const submitBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body ?? '{}')) as {
      model?: string;
      image?: string;
    };
    expect(submitBody.model).toBe('Wan-AI/Wan2.2-T2V-A14B');
    expect(submitBody.image).toBeUndefined();
    expect(result.metadata?.reference_skipped).toBe('temporary_cdn_unsupported_for_i2v');
  });

  it('keeps polling through transient fetch failed status errors', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ requestId: 'job-4' }),
      })
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'Succeed',
            results: { videos: [{ url: 'https://cdn.example/v4.mp4' }] },
          }),
      });
    const adapter = new SiliconFlowVideoAdapter({
      apiKey: 'sf',
      fetchImpl: fetchImpl,
      pollIntervalMs: 1,
      timeoutMs: 5_000,
    });
    const result = await adapter.generate({
      request_id: 'vid-4',
      model: 'Wan-AI/Wan2.2-T2V-A14B',
      positive_prompt: 'walk',
      shot: {
        id: '00000000-0000-4000-8000-000000000004',
      } as never,
    });
    expect(result.status).toBe('completed');
    expect(result.video_url).toBe('https://cdn.example/v4.mp4');
  });

  it('canonicalizes lowercase env model ids and falls back to T2V without a frame', async () => {
    const adapter = new SiliconFlowVideoAdapter({ apiKey: 'sf' });
    expect(adapter.resolveModel('wan-ai/wan2.2-i2v-a14b', false)).toBe('Wan-AI/Wan2.2-T2V-A14B');
    expect(adapter.resolveModel('wan-ai/wan2.2-i2v-a14b', true)).toBe('Wan-AI/Wan2.2-I2V-A14B');
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
