import { describe, expect, it, vi } from 'vitest';
import { MockImageAdapter } from '../src/adapters/mock-media.js';
import {
  siliconFlowModelSupportsReferenceImages,
  SiliconFlowImageAdapter,
} from '../src/adapters/siliconflow-image.js';
import {
  REFERENCE_IMAGE_PROMPT_CLAUSES,
  withReferencePromptClauses,
} from '../src/contexts/visual/reference-images.js';

describe('reference image prompt contract', () => {
  it('appends identification-only clauses when references are present', () => {
    const prompt = withReferencePromptClauses('a wounded hero', true);
    expect(prompt).toContain('a wounded hero');
    expect(prompt).toContain(REFERENCE_IMAGE_PROMPT_CLAUSES);
    expect(withReferencePromptClauses(prompt, true)).toBe(prompt);
  });
});

describe('MockImageAdapter reference injection', () => {
  it('records reference labels when references are supplied', async () => {
    const adapter = new MockImageAdapter();
    const result = await adapter.generate({
      request_id: 'r1',
      model: 'mock-image-v1',
      prompt: 'hero portrait',
      reference_images: [
        {
          media_id: 'media-default',
          label: 'Hero:default',
          role: 'character',
          url: 'https://example.test/default.png',
        },
      ],
    });
    expect(adapter.supportsReferenceImages).toBe(true);
    expect(result.metadata.reference_injection).toBe('applied');
    expect(result.metadata.reference_labels).toBe('Hero:default');
    expect(result.metadata.reference_media_ids).toBe('media-default');
  });
});

describe('SiliconFlowImageAdapter reference injection', () => {
  it('detects models that accept reference images', () => {
    expect(siliconFlowModelSupportsReferenceImages('black-forest-labs/FLUX.1-schnell')).toBe(false);
    expect(siliconFlowModelSupportsReferenceImages('vendor/kolors-img2img')).toBe(true);
  });

  it('skips injection for unsupported models and still generates', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ images: [{ url: 'https://cdn.example/out.png' }] }),
    });
    const adapter = new SiliconFlowImageAdapter({ apiKey: 'sf', fetchImpl });
    const result = await adapter.generate({
      request_id: 'img-skip',
      model: 'black-forest-labs/FLUX.1-schnell',
      prompt: 'same character',
      reference_images: [
        {
          media_id: 'media-a',
          label: 'Hero:default',
          role: 'character',
          url: 'https://cdn.example/ref.png',
        },
      ],
    });

    expect(result.metadata.reference_injection).toBe('skipped_unsupported');
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.image).toBeUndefined();
    expect(body.prompt).toBe('same character');
  });

  it('applies the first reference image for supported models', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ images: [{ url: 'https://cdn.example/out.png' }] }),
    });
    const adapter = new SiliconFlowImageAdapter({ apiKey: 'sf', fetchImpl });
    const result = await adapter.generate({
      request_id: 'img-apply',
      model: 'vendor/kolors-img2img',
      prompt: 'same character',
      reference_images: [
        {
          media_id: 'media-a',
          label: 'Hero:default',
          role: 'character',
          url: 'https://cdn.example/ref.png',
        },
        {
          media_id: 'media-b',
          label: 'Loc:night',
          role: 'location',
          url: 'https://cdn.example/loc.png',
        },
      ],
    });

    expect(result.metadata.reference_injection).toBe('applied');
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.image).toBe('https://cdn.example/ref.png');
    expect(result.metadata.reference_media_ids).toBe('media-a,media-b');
  });
});
