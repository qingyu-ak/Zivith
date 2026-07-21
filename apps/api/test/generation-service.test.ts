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
  const completedOutput = {
    id: 'output-1',
    shotId: currentShot.id,
    status: 'completed' as const,
    videoUrl: 'https://example.test/mock.mp4',
    idempotencyKey: 'mock-video:request-1',
    model: 'mock-v1',
    promptSnapshot: currentShot.prompt,
    visualMediaIds: ['media-1'],
  };
  let outputState: Record<string, unknown> = {
    id: 'output-1',
    shotId: currentShot.id,
    status: 'queued',
    idempotencyKey: 'mock-video:request-1',
    model: 'mock-v1',
    promptSnapshot: currentShot.prompt,
    visualMediaIds: ['media-1'],
  };
  const taskState = {
    id: 'task-1',
    idempotencyKey: 'mock-video:request-1',
    payload: {
      shot_id: currentShot.id,
      output_id: 'output-1',
      request_id: 'request-1',
      positive: currentShot.prompt.positive,
      negative: currentShot.prompt.negative,
      visual_media_ids: ['media-1'],
    },
    startedAt: null as Date | null,
  };

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
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id?: string; idempotencyKey?: string } }) => {
        if (where.idempotencyKey) return null;
        return outputState;
      }),
      findUniqueOrThrow: vi.fn().mockImplementation(async () => outputState),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        outputState = { ...outputState, ...data, status: 'queued' };
        return outputState;
      }),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        outputState = { ...outputState, ...data };
        if (data.status === 'completed') Object.assign(outputState, completedOutput);
        return outputState;
      }),
    },
    task: {
      create: vi.fn().mockResolvedValue(taskState),
      findFirst: vi.fn().mockResolvedValue(taskState),
      update: vi.fn().mockResolvedValue(taskState),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  } as unknown as PrismaClient;
  return { db, getOutput: () => outputState };
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
    expect(db.shot.update).toHaveBeenCalledWith({
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

  it('returns queued output immediately in async mode', async () => {
    vi.clearAllMocks();
    const { db } = database();
    const service = new GenerationService(db, adapter);
    const memory = {
      enqueue: vi.fn().mockResolvedValue({ job_id: 'mock-video:request-1' }),
      cancel: vi.fn(),
    };
    service.attachQueue(memory);
    const output = await service.generate('11111111-1111-4111-8111-111111111111', {
      requestId: 'request-1',
      async: true,
    });
    expect(output.status).toBe('queued');
    expect(memory.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'video_generate' }),
    );
    expect(adapter.generate).not.toHaveBeenCalled();
  });
});
