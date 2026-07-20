import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import { GenerationService } from '../src/contexts/generation/service.js';
import type { VideoGenerationAdapter } from '../src/ports/generation.js';

function shot(requirementStatus: 'approved' | 'review' = 'approved') {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sceneId: '22222222-2222-4222-8222-222222222222',
    projectId: '33333333-3333-4333-8333-333333333333',
    order: 1,
    label: '发现种子',
    state: 'prompting',
    narrativeMode: 'present',
    locationArea: null,
    camera: { shot_type: 'medium_shot', movement: 'dolly_in' },
    composition: {},
    lighting: { type: 'golden_hour' },
    color: {},
    mood: '希望',
    style: { aspect_ratio: '16:9' },
    characters: [],
    dialogue: null,
    action: { description: '机器人捧起种子', duration_hint: 5 },
    audio: {},
    prompt: { positive: 'cinematic robot finds a seed', negative: 'blur', source: 'auto' },
    approvedSnapshot: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    scene: {
      requirements: [
        {
          id: 'requirement-1',
          assetType: 'location',
          assetId: 'location-1',
          required: true,
          status: requirementStatus,
          approvedMediaId: requirementStatus === 'approved' ? 'media-1' : null,
          deletedAt: null,
        },
      ],
      story: {
        overrides: null,
        project: { defaults: { style: { aspect_ratio: '16:9' } } },
      },
      overrides: null,
    },
  };
}

function database(currentShot = shot()) {
  const outputUpdate = vi.fn().mockResolvedValue({
    id: 'output-1',
    status: 'completed',
    videoUrl: 'https://example.test/mock.mp4',
  });
  const db = {
    shot: {
      findFirst: vi.fn().mockResolvedValue(currentShot),
      findUnique: vi.fn().mockResolvedValue({ prompt: currentShot.prompt }),
      update: vi.fn().mockResolvedValue({}),
    },
    promptVersion: {
      findFirst: vi.fn().mockResolvedValue({
        positive: currentShot.prompt.positive,
        negative: currentShot.prompt.negative,
        approvedAt: new Date(),
      }),
    },
    output: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: outputUpdate,
    },
    task: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  } as unknown as PrismaClient;
  return { db, outputUpdate };
}

const adapter: VideoGenerationAdapter = {
  provider: 'mock',
  supportedModels: [{ id: 'mock-v1', name: 'Mock' }],
  generate: vi.fn().mockResolvedValue({
    job_id: 'mock-job-1',
    status: 'completed',
    video_url: 'https://example.test/mock.mp4',
    metadata: { is_mock: true },
  }),
  getStatus: vi.fn(),
  cancel: vi.fn(),
  getCapabilities: vi.fn().mockReturnValue({
    aspect_ratios: ['16:9'],
    max_duration_seconds: 60,
    supports_reference_images: true,
    asynchronous: true,
  }),
};

describe('GenerationService', () => {
  it('persists a completed Mock output and moves the Shot to review', async () => {
    const { db } = database();
    const output = await new GenerationService(db, adapter).generate(
      '11111111-1111-4111-8111-111111111111',
      { requestId: 'request-1' },
    );

    expect(output.status).toBe('completed');
    expect(adapter.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mock-v1',
        positive_prompt: 'cinematic robot finds a seed',
        reference_image_urls: ['media-1'],
      }),
    );
    expect(db.shot.update).toHaveBeenLastCalledWith({
      where: { id: '11111111-1111-4111-8111-111111111111' },
      data: { state: 'review' },
    });
  });

  it('blocks generation before visual assets are approved', async () => {
    const { db } = database(shot('review'));
    await expect(
      new GenerationService(db, adapter).generate('11111111-1111-4111-8111-111111111111'),
    ).rejects.toMatchObject({ code: 'VISUAL_ASSETS_NOT_APPROVED' });
  });
});
