import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@zivith/database';
import {
  DEFAULT_APPEARANCE_VARIANT_KEY,
  DEFAULT_APPEARANCE_VARIANT_TITLE,
} from '@zivith/domain';
import { ApiError } from '../../errors.js';
import type { ImageGenerationAdapter } from '../../ports/media.js';
import {
  referenceInjectionMetadata,
  resolveAppearanceVariantReferenceImages,
  toImageReferencePayload,
  withReferencePromptClauses,
} from './reference-images.js';

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
  if (existing) return;

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

export interface GenerateAppearanceVariantImageInput {
  db: PrismaClient;
  assetId: string;
  variantKey: string;
  image: ImageGenerationAdapter;
  imageModel: string;
  prompt: string;
  requestId?: string;
  allowFallback?: boolean;
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

  const basePrompt = input.prompt.trim();
  if (!basePrompt) throw new ApiError(400, 'PROMPT_REQUIRED', '请提供生图提示词');

  const refs = await resolveAppearanceVariantReferenceImages(input.db, asset, variant.key);
  const prompt = withReferencePromptClauses(basePrompt, refs.length > 0);
  const allowFallback = input.allowFallback !== false;
  let imageUrl = svgPlaceholderDataUrl(`${asset.name}:${variant.key}`);
  let provider = input.image.provider;
  let isMock = provider === 'mock';
  let generationError: string | undefined;
  let adapterMeta: Record<string, string | number | boolean> = {};

  try {
    const generated = await input.image.generate({
      request_id: input.requestId ?? randomUUID(),
      model: input.imageModel,
      prompt,
      ...(refs.length ? { reference_images: toImageReferencePayload(refs) } : {}),
    });
    if (generated.image_url) imageUrl = generated.image_url;
    isMock = Boolean(generated.metadata.is_mock);
    adapterMeta = generated.metadata;
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
      name: `${asset.name} · ${variant.title}`,
      mediaType: 'image',
      mimeType: 'image/png',
      storageKey: `appearance-variants/${mediaId}.png`,
      url: imageUrl,
      source: 'generated',
      generationMetadata: json({
        is_mock: isMock,
        provider,
        model: input.imageModel,
        generation_prompt: prompt,
        appearance_variant_id: variant.id,
        appearance_variant_key: variant.key,
        ...referenceInjectionMetadata(refs, adapterMeta),
        ...(generationError ? { generation_error: generationError } : {}),
      }),
      tags: ['generated', 'appearance_variant', asset.type],
    },
  });

  const updated = await input.db.assetAppearanceVariant.update({
    where: { id: variant.id },
    data: {
      state: 'review',
      candidateMediaIds: [mediaId, ...variant.candidateMediaIds.filter((id) => id !== mediaId)],
    },
  });

  return { variant: updated, media, asset };
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
