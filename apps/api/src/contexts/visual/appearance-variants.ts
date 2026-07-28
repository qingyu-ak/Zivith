import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@zivith/database';
import {
  CHARACTER_SHEET_VARIANTS,
  DEFAULT_APPEARANCE_VARIANT_KEY,
  DEFAULT_APPEARANCE_VARIANT_TITLE,
  isPrimaryCharacterSheetKey,
} from '@zivith/domain';
import { ApiError } from '../../errors.js';
import type { ImageGenerationAdapter } from '../../ports/media.js';
import {
  referenceInjectionMetadata,
  resolveAppearanceVariantReferenceImages,
  withReferencePromptClauses,
} from './reference-images.js';
import { generateImageWithI2iFallback } from './generate-with-fallback.js';

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function svgPlaceholderDataUrl(label: string, size = 1024): string {
  const text = label.slice(0, 18).replace(/[<>&'"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect fill="#141414" width="100%" height="100%"/><text x="50%" y="50%" fill="#a3e635" font-family="sans-serif" font-size="42" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function ensureDefaultAppearanceVariant(
  db: PrismaClient,
  asset: { id: string; type: string; referenceImages: string[] },
): Promise<void> {
  if (asset.type !== 'character') return;
  const existing = await db.assetAppearanceVariant.findFirst({
    where: { assetId: asset.id, key: DEFAULT_APPEARANCE_VARIANT_KEY, deletedAt: null },
    select: { id: true },
  });
  if (!existing) {
    const anchor = asset.referenceImages[0] ?? null;
    await db.assetAppearanceVariant.create({
      data: {
        assetId: asset.id,
        key: DEFAULT_APPEARANCE_VARIANT_KEY,
        title: DEFAULT_APPEARANCE_VARIANT_TITLE,
        anchorMediaId: anchor,
        candidateMediaIds: [],
        state: anchor ? 'approved' : 'draft',
        order: 0,
      },
    });
  }
  await ensureCharacterSheetVariants(db, asset.id);
}

/** Ensure the multi-view turnaround sheet slot exists (empty until user generates). */
export async function ensureCharacterSheetVariants(
  db: PrismaClient,
  assetId: string,
): Promise<void> {
  for (const sheet of CHARACTER_SHEET_VARIANTS) {
    const existing = await db.assetAppearanceVariant.findFirst({
      where: { assetId, key: sheet.key, deletedAt: null },
      select: { id: true },
    });
    if (existing) continue;
    await db.assetAppearanceVariant.create({
      data: {
        assetId,
        key: sheet.key,
        title: sheet.title,
        changeReason: '角色设定表（单图多视角）',
        description: sheet.prompt_clause,
        candidateMediaIds: [],
        state: 'draft',
        order: sheet.order,
      },
    });
  }
}

export async function syncVariantAnchorFromRequirement(
  db: PrismaClient,
  input: { assetId: string; variantKey: string; mediaId: string },
): Promise<void> {
  const variant = await db.assetAppearanceVariant.findFirst({
    where: {
      assetId: input.assetId,
      key: input.variantKey,
      deletedAt: null,
    },
  });
  if (!variant) return;

  await db.assetAppearanceVariant.update({
    where: { id: variant.id },
    data: {
      anchorMediaId: input.mediaId,
      state: 'approved',
      candidateMediaIds: [
        input.mediaId,
        ...variant.candidateMediaIds.filter((id) => id !== input.mediaId),
      ],
    },
  });
}

/** Ensure turnaround prompts insist on a dedicated face close-up panel. */
export function ensureCharacterSheetLayoutClause(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return trimmed;
  const hasFacePanel =
    /face close-up|head[- ]and[- ]shoulders|facial close[- ]?up|面部特写|头肩/i.test(trimmed);
  const hasFourPanel = /2\s*[x×]\s*2|four[- ]panel|四宫格|4[- ]panel/i.test(trimmed);
  const extras: string[] = [];
  if (!hasFourPanel) {
    extras.push(
      'strict 2x2 four-panel layout: full-body front, full-body side, full-body back, and one large face close-up portrait panel',
    );
  }
  if (!hasFacePanel) {
    extras.push(
      'panel 4 must be a large head-and-shoulders face close-up with detailed facial features filling the panel, not a tiny corner crop',
    );
  }
  return extras.length ? `${trimmed}, ${extras.join(', ')}` : trimmed;
}

export interface GenerateAppearanceVariantImageInput {
  db: PrismaClient;
  assetId: string;
  variantKey: string;
  image: ImageGenerationAdapter;
  /** Text-to-image（无参考图，如首张正面设定） */
  imageModel: string;
  /** Text+image-to-image（侧/背/脸等有锚点时） */
  imageI2iModel?: string;
  prompt: string;
  requestId?: string;
  /** Candidate count 1–4 (default 1). */
  count?: number;
  allowFallback?: boolean;
}

function clampCandidateCount(count: number | undefined): number {
  if (count === undefined) return 1;
  return Math.min(4, Math.max(1, Math.trunc(count)));
}

export async function generateAppearanceVariantImage(input: GenerateAppearanceVariantImageInput) {
  const asset = await input.db.asset.findFirst({
    where: { id: input.assetId, deletedAt: null, type: 'character' },
  });
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '角色资产不存在');

  const variant = await input.db.assetAppearanceVariant.findFirst({
    where: { assetId: asset.id, key: input.variantKey, deletedAt: null },
  });
  if (!variant) throw new ApiError(404, 'APPEARANCE_VARIANT_NOT_FOUND', '形象不存在');

  const basePrompt = isPrimaryCharacterSheetKey(variant.key)
    ? ensureCharacterSheetLayoutClause(input.prompt)
    : input.prompt.trim();
  if (!basePrompt) throw new ApiError(400, 'PROMPT_REQUIRED', '请提供生图提示词');

  // Primary turnaround sheet is always T2I (one multi-view image). Do not condition on
  // prior placeholders / uploads — those often force a failing I2I model path.
  const refs = isPrimaryCharacterSheetKey(variant.key)
    ? []
    : await resolveAppearanceVariantReferenceImages(input.db, asset, variant.key);
  const prompt = withReferencePromptClauses(basePrompt, refs.length > 0);
  const allowFallback = input.allowFallback !== false;
  const count = clampCandidateCount(input.count);
  const baseRequestId = input.requestId ?? randomUUID();
  const medias: Array<{ id: string; url: string }> = [];
  const newMediaIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    let imageUrl = svgPlaceholderDataUrl(`${asset.name}:${variant.key}`);
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
      console.warn('[appearance-variant] image generation failed, using placeholder', message);
    }

    const mediaId = randomUUID();
    const media = await input.db.media.create({
      data: {
        id: mediaId,
        projectId: asset.projectId,
        name:
          count > 1
            ? `${asset.name} · ${variant.title} ${index + 1}/${count}`
            : `${asset.name} · ${variant.title}`,
        mediaType: 'image',
        mimeType: 'image/png',
        storageKey: `appearance-variants/${mediaId}.png`,
        url: imageUrl,
        source: 'generated',
        generationMetadata: json({
          is_mock: isMock,
          provider,
          model: usedModel,
          generation_prompt: prompt,
          appearance_variant_id: variant.id,
          appearance_variant_key: variant.key,
          candidate_index: index + 1,
          candidate_count: count,
          ...referenceInjectionMetadata(refs, adapterMeta),
          ...(generationError ? { generation_error: generationError } : {}),
        }),
        tags: ['generated', 'appearance_variant', asset.type],
      },
    });
    medias.push({ id: media.id, url: media.url });
    newMediaIds.push(media.id);
  }

  const updated = await input.db.assetAppearanceVariant.update({
    where: { id: variant.id },
    data: {
      state: 'review',
      candidateMediaIds: [
        ...newMediaIds,
        ...variant.candidateMediaIds.filter((id) => !newMediaIds.includes(id)),
      ],
    },
  });

  return { variant: updated, media: medias[0]!, medias, asset };
}

/** Remove one candidate from history; soft-delete Media. Clears anchor if that media was anchored. */
export async function removeAppearanceVariantCandidate(
  db: PrismaClient,
  input: { assetId: string; variantKey: string; mediaId: string },
) {
  const variant = await db.assetAppearanceVariant.findFirst({
    where: { assetId: input.assetId, key: input.variantKey, deletedAt: null },
  });
  if (!variant) throw new ApiError(404, 'APPEARANCE_VARIANT_NOT_FOUND', '形象不存在');
  if (!variant.candidateMediaIds.includes(input.mediaId)) {
    throw new ApiError(404, 'CANDIDATE_NOT_FOUND', '候选图不在该形象历史中');
  }
  const nextCandidates = variant.candidateMediaIds.filter((id) => id !== input.mediaId);
  const clearingAnchor = variant.anchorMediaId === input.mediaId;
  const [updated] = await db.$transaction([
    db.assetAppearanceVariant.update({
      where: { id: variant.id },
      data: {
        candidateMediaIds: nextCandidates,
        ...(clearingAnchor
          ? {
              anchorMediaId: null,
              state: nextCandidates.length > 0 ? 'review' : 'draft',
            }
          : {}),
      },
    }),
    db.media.updateMany({
      where: { id: input.mediaId, deletedAt: null },
      data: { deletedAt: new Date() },
    }),
  ]);
  return updated;
}

export async function removeRequirementCandidate(
  db: PrismaClient,
  input: { requirementId: string; mediaId: string },
) {
  const requirement = await db.visualAssetRequirement.findFirst({
    where: { id: input.requirementId, deletedAt: null },
  });
  if (!requirement) throw new ApiError(404, 'VISUAL_REQUIREMENT_NOT_FOUND', '视觉需求不存在');
  if (!requirement.candidateMediaIds.includes(input.mediaId)) {
    throw new ApiError(404, 'CANDIDATE_NOT_FOUND', '候选图不在该需求历史中');
  }
  const nextCandidates = requirement.candidateMediaIds.filter((id) => id !== input.mediaId);
  const clearingApproved = requirement.approvedMediaId === input.mediaId;
  const [updated] = await db.$transaction([
    db.visualAssetRequirement.update({
      where: { id: requirement.id },
      data: {
        candidateMediaIds: nextCandidates,
        ...(clearingApproved
          ? {
              approvedMediaId: null,
              status: nextCandidates.length > 0 ? 'review' : 'pending',
            }
          : {}),
      },
    }),
    db.media.updateMany({
      where: { id: input.mediaId, deletedAt: null },
      data: { deletedAt: new Date() },
    }),
  ]);
  return updated;
}

export async function nextAppearanceVariantOrder(
  db: PrismaClient,
  assetId: string,
): Promise<number> {
  const latest = await db.assetAppearanceVariant.findFirst({
    where: { assetId, deletedAt: null },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  return (latest?.order ?? -1) + 1;
}
