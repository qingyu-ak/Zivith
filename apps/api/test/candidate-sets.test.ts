import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import { generateRequirementImage } from '../src/contexts/visual/generate-requirement-image.js';
import type { ImageGenerationAdapter } from '../src/ports/media.js';

describe('generateRequirementImage candidate sets (W5)', () => {
  it('creates N media rows with generation_metadata and prepends candidate ids', async () => {
    const generate = vi.fn().mockImplementation(async (request: { request_id: string }) => ({
      job_id: request.request_id,
      status: 'completed' as const,
      image_url: `data:image/png;base64,${request.request_id}`,
      metadata: { is_mock: true },
    }));
    const image = {
      provider: 'mock',
      supportedModels: [],
      supportsReferenceImages: true,
      generate,
    } satisfies ImageGenerationAdapter;

    const createdMediaIds: string[] = [];
    const mediaCreate = vi.fn().mockImplementation(async ({ data }: { data: { id: string } }) => {
      createdMediaIds.push(data.id);
      return { id: data.id, url: `url:${data.id}` };
    });
    const requirementUpdate = vi.fn().mockImplementation(async ({ data }) => ({
      id: 'req-1',
      candidateMediaIds: data.candidateMediaIds,
      status: data.status,
      approvedMediaId: data.approvedMediaId,
    }));

    const db = {
      visualAssetRequirement: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'req-1',
          sceneId: 'scene-1',
          assetId: 'asset-1',
          assetType: 'character',
          variantKey: 'default',
          candidateMediaIds: ['old-media'],
          deletedAt: null,
        }),
        update: requirementUpdate,
      },
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'asset-1',
          name: '苏晚',
          description: 'protagonist',
          data: {},
          referenceImages: [],
          deletedAt: null,
        }),
        update: vi.fn().mockResolvedValue({ id: 'asset-1', data: {} }),
      },
      scene: {
        findFirst: vi.fn().mockResolvedValue({ projectId: 'project-1' }),
      },
      media: {
        create: mediaCreate,
        findMany: vi.fn().mockResolvedValue([]),
      },
      assetAppearanceVariant: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    const result = await generateRequirementImage({
      db,
      requirementId: 'req-1',
      image,
      imageModel: 'mock-image',
      prompt: 'cinematic portrait',
      count: 3,
      allowFallback: true,
    });

    expect(result).not.toBeNull();
    expect(generate).toHaveBeenCalledTimes(3);
    expect(mediaCreate).toHaveBeenCalledTimes(3);
    expect(result!.medias).toHaveLength(3);
    expect(result!.requirement.candidateMediaIds).toEqual([
      ...createdMediaIds,
      'old-media',
    ]);
    expect(result!.requirement.approvedMediaId).toBeNull();

    const firstCall = mediaCreate.mock.calls[0];
    expect(firstCall).toBeDefined();
    const firstMeta = firstCall![0].data.generationMetadata;
    expect(firstMeta).toMatchObject({
      candidate_index: 1,
      candidate_count: 3,
      model: 'mock-image',
      generation_prompt: expect.stringContaining('cinematic portrait'),
    });
  });

  it('preserves historical media ids across regenerate rounds', async () => {
    const image = {
      provider: 'mock',
      supportedModels: [],
      supportsReferenceImages: false,
      generate: vi.fn().mockResolvedValue({
        job_id: 'j1',
        status: 'completed',
        image_url: 'data:image/png;base64,abc',
        metadata: { is_mock: true },
      }),
    } satisfies ImageGenerationAdapter;

    const mediaCreate = vi.fn().mockImplementation(async ({ data }: { data: { id: string } }) => ({
      id: data.id,
      url: `url:${data.id}`,
    }));
    const requirementUpdate = vi.fn().mockImplementation(async ({ data }) => ({
      id: 'req-1',
      candidateMediaIds: data.candidateMediaIds,
      status: data.status,
      approvedMediaId: data.approvedMediaId,
    }));

    const db = {
      visualAssetRequirement: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'req-1',
          sceneId: 'scene-1',
          assetId: 'asset-1',
          assetType: 'location',
          variantKey: 'night',
          candidateMediaIds: ['hist-a', 'hist-b'],
          deletedAt: null,
        }),
        update: requirementUpdate,
      },
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'asset-1',
          name: '码头',
          description: null,
          data: {},
          referenceImages: [],
          deletedAt: null,
        }),
        update: vi.fn().mockResolvedValue({ id: 'asset-1' }),
      },
      scene: {
        findFirst: vi.fn().mockResolvedValue({ projectId: 'project-1' }),
      },
      media: { create: mediaCreate, findMany: vi.fn().mockResolvedValue([]) },
      assetAppearanceVariant: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    const result = await generateRequirementImage({
      db,
      requirementId: 'req-1',
      image,
      imageModel: 'mock-image',
      prompt: 'rainy pier',
      count: 2,
    });

    expect(result!.requirement.candidateMediaIds.slice(-2)).toEqual(['hist-a', 'hist-b']);
    expect(result!.requirement.candidateMediaIds).toHaveLength(4);
  });
});
