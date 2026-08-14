import { describe, expect, it } from 'vitest';
import { asId, type Shot } from '@zivith/domain';
import { GenerationAdapterRegistry } from '../src/adapters/generation-registry.js';
import { MockGenerationAdapter } from '../src/adapters/mock-generation.js';

function makeShot(): Shot {
  return {
    id: asId('shot-1'),
    scene_id: asId('scene-1'),
    project_id: asId('project-1'),
    order: 1,
    label: '开场镜头',
    state: 'generating',
    camera: { shot_type: 'wide_shot', movement: 'dolly_in' },
    characters: [],
    action: { description: '主角走入雨夜街道' },
    prompt: { source: 'auto', generation_prompt: 'A rainy neon street' },
    outputs: [],
    created_at: new Date('2026-07-20T00:00:00.000Z'),
    updated_at: new Date('2026-07-20T00:00:00.000Z'),
  };
}

describe('MockGenerationAdapter', () => {
  it('returns a completed placeholder video with mock metadata', async () => {
    const adapter = new MockGenerationAdapter({
      placeholderVideoUrl: 'https://example.test/placeholder.mp4',
      minDelayMs: 0,
      maxDelayMs: 0,
    });

    const result = await adapter.generate({
      request_id: 'request-1',
      model: 'mock-v1',
      positive_prompt: 'A rainy neon street',
      shot: makeShot(),
    });

    expect(result).toMatchObject({
      job_id: 'mock-request-1',
      status: 'completed',
      video_url: 'https://example.test/placeholder.mp4',
      metadata: {
        is_mock: true,
        shot_id: 'shot-1',
      },
    });
    expect(result.metadata.overlay_text).toContain('主角走入雨夜街道');
    await expect(adapter.getStatus(result.job_id)).resolves.toEqual(result);
  });

  it('rejects unsupported models', async () => {
    const adapter = new MockGenerationAdapter({ minDelayMs: 0, maxDelayMs: 0 });

    await expect(
      adapter.generate({
        request_id: 'request-2',
        model: 'real-model',
        positive_prompt: 'test',
        shot: makeShot(),
      }),
    ).rejects.toThrow('Unsupported mock video model');
  });

  it('can be resolved through the provider registry', () => {
    const adapter = new MockGenerationAdapter({ minDelayMs: 0, maxDelayMs: 0 });
    const registry = new GenerationAdapterRegistry().registerVideo(adapter);

    expect(registry.video('mock')).toBe(adapter);
    expect(registry.listVideoProviders()).toEqual(['mock']);
    expect(() => registry.video('missing')).toThrow('not registered');
  });
});
