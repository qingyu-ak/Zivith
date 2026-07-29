import { randomUUID } from 'node:crypto';
import type { Prisma } from '@zivith/database';
import { type PrismaClient } from '@zivith/database';
import { ApiError } from '../../errors.js';
import type { ImageGenerationAdapter } from '../../ports/media.js';
import type { StoragePort } from '../../ports/index.js';
import {
  mergeVisualPromptIntoAssetData,
  readVisualPromptFromAssetData,
} from '../agent/visual-trait.js';
import {
  referenceInjectionMetadata,
  resolveVisualPrepReferenceImages,
  withReferencePromptClauses,
} from './reference-images.js';
import { generateImageWithI2iFallback } from './generate-with-fallback.js';
import { persistRemoteImage } from './persist-remote-image.js';

function svgPlaceholderDataUrl(label: string, size = 1024): string {
  const text = label.slice(0, 18).replace(/[<>&'"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect fill="#141414" width="100%" height="100%"/><text x="50%" y="50%" fill="#a3e635" font-family="sans-serif" font-size="42" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function clampCandidateCount(count: number | undefined): number {
  if (count === undefined) return 1;
  return Math.min(4, Math.max(1, Math.trunc(count)));
}

export interface GenerateRequirementImageInput {
  db: PrismaClient;
  requirementId: string;
  image: ImageGenerationAdapter;
  /** Text-to-image（无参考图） */
  imageModel: string;
  /** Text+image-to-image（有参考图时优先） */
  imageI2iModel?: string;
  prompt: string;
  requestId?: string;
  /** Candidate count 1–4 (default 1). */
  count?: number;
  /** When false, provider failures throw instead of writing an SVG placeholder. */
  allowFallback?: boolean;
  storage?: StoragePort;
}

export async function generateRequirementImage(input: GenerateRequirementImageInput) {
  const requirement = await input.db.visualAssetRequirement.findFirst({
    where: { id: input.requirementId, deletedAt: null },
  });
  if (!requirement) return null;

  const asset = await input.db.asset.findFirst({
    where: { id: requirement.assetId, deletedAt: null },
  });
  if (!asset) return null;

  const scene = await input.db.scene.findFirst({
    where: { id: requirement.sceneId, deletedAt: null },
    select: { projectId: true },
  });
  if (!scene) return null;

  const refs = await resolveVisualPrepReferenceImages(
    input.db,
    asset,
    requirement.variantKey,
  );
  const prompt = withReferencePromptClauses(input.prompt.trim(), refs.length > 0);
  const allowFallback = input.allowFallback !== false;
  const count = clampCandidateCount(input.count);
  const baseRequestId = input.requestId ?? randomUUID();
  const medias: Array<{
    id: string;
    url: string;
  }> = [];
  const newMediaIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    let imageUrl = svgPlaceholderDataUrl(asset.name);
    let provider = input.image.provider;
    let isMock = provider === 'mock';
    let generationError: string | undefined;
    let adapterMeta: Record<string, string | number | boolean> = {};
    let usedModel = input.imageModel;
    try {
      const generated = await generateImageWithI2iFallback({
        image: input.image,
        requestId: count === 1 ? baseRequestId : `${baseRequestId}:${index + 1}`,
        prompt,
        count,
        imageModel: input.imageModel,
        refs,
        ...(input.imageI2iModel ? { imageI2iModel: input.imageI2iModel } : {}),
      });
      if (generated.image_url) imageUrl = generated.image_url;
      isMock = Boolean(generated.metadata.is_mock);
      adapterMeta = generated.metadata;
      usedModel = generated.used_model;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!allowFallback) {
        throw new ApiError(502, 'IMAGE_GENERATION_FAILED', `生图失败：${message.slice(0, 300)}`);
      }
      provider = 'mock-fallback';
      isMock = true;
      generationError = message.slice(0, 500);
      adapterMeta = {
        reference_injection: refs.length > 0 ? 'skipped_error' : 'none',
      };
      console.warn('[visual-requirement] image generation failed, using placeholder', message);
    }

    const mediaId = randomUUID();
    const storageKey = `visual-assets/${mediaId}.png`;
    const persisted = await persistRemoteImage({
      url: imageUrl,
      storageKey,
      ...(input.storage ? { storage: input.storage } : {}),
    });
    const media = await input.db.media.create({
      data: {
        id: mediaId,
        projectId: scene.projectId,
        name: count > 1 ? `${asset.name} Key Image ${index + 1}/${count}` : `${asset.name} Key Image`,
        mediaType: 'image',
        mimeType: persisted.mimeType,
        storageKey: persisted.storageKey,
        url: persisted.url,
        source: 'generated',
        generationMetadata: json({
          is_mock: isMock,
          provider,
          model: usedModel,
          generation_prompt: prompt,
          requirement_id: requirement.id,
          candidate_index: index + 1,
          candidate_count: count,
          persisted_to_storage: persisted.persisted,
          ...(persisted.sourceUrl && persisted.persisted
            ? { provider_source_url: persisted.sourceUrl.slice(0, 300) }
            : {}),
          ...referenceInjectionMetadata(refs, adapterMeta),
          ...(generationError ? { generation_error: generationError } : {}),
        }),
        tags: ['generated', requirement.assetType],
      },
    });
    medias.push({ id: media.id, url: media.url });
    newMediaIds.push(media.id);
  }

  const updatedAsset = await input.db.asset.update({
    where: { id: asset.id },
    data: {
      data: json(mergeVisualPromptIntoAssetData(asset.data, requirement.variantKey, prompt)),
    },
  });

  const updatedRequirement = await input.db.visualAssetRequirement.update({
    where: { id: requirement.id },
    data: {
      status: 'review',
      candidateMediaIds: [
        ...newMediaIds,
        ...requirement.candidateMediaIds.filter((id) => !newMediaIds.includes(id)),
      ],
      approvedMediaId: null,
      generationJobId: newMediaIds[0] ?? null,
      version: { increment: 1 },
    },
  });

  return {
    requirement: updatedRequirement,
    media: medias[0]!,
    medias,
    asset: updatedAsset,
    generation_prompt: prompt,
  };
}

export function resolveRequirementPrompt(
  assetData: unknown,
  variantKey: string,
  fallbackParts: string[],
): string {
  return (
    readVisualPromptFromAssetData(assetData, variantKey) ?? fallbackParts.filter(Boolean).join(', ')
  );
}
