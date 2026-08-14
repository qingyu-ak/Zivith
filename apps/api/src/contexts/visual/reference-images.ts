import type { PrismaClient } from '@zivith/database';
import {
  asId,
  DEFAULT_APPEARANCE_VARIANT_KEY,
  resolveAppearanceVariantAnchor,
  type MediaId,
} from '@zivith/domain';
import type { ImageReferenceImage } from '../../ports/media.js';

/** Prompt contract clauses absorbed from waoowaoo reference-image engineering. */
export const REFERENCE_IMAGE_PROMPT_CLAUSES = [
  'Reference image labels are for identification only; never render labels, captions, or watermarks in the output.',
  'Match the art style, identity, and key visual traits of the provided reference images.',
].join(' ');

export function withReferencePromptClauses(prompt: string, hasReferences: boolean): string {
  const trimmed = prompt.trim();
  if (!hasReferences) return trimmed;
  if (trimmed.includes('Reference image labels are for identification only')) return trimmed;
  return `${trimmed}. ${REFERENCE_IMAGE_PROMPT_CLAUSES}`;
}

export function toImageReferencePayload(
  refs: readonly ImageReferenceImage[],
): ImageReferenceImage[] {
  return refs.map((item) => ({
    media_id: item.media_id,
    label: item.label,
    role: item.role,
    ...(item.url ? { url: item.url } : {}),
  }));
}

async function mediaUrl(
  db: PrismaClient,
  mediaId: string,
): Promise<{ id: string; url: string } | null> {
  const media = await db.media.findFirst({
    where: { id: mediaId, deletedAt: null },
    select: { id: true, url: true },
  });
  if (!media?.url) return null;
  return media;
}

/**
 * Visual Prep selection: matching AppearanceVariant.anchor → Asset.referenceImages[0].
 * (Scene approved binding is the *output* of prep, not an input reference for first-time gen.)
 */
export async function resolveVisualPrepReferenceImages(
  db: PrismaClient,
  asset: { id: string; type: string; name: string; referenceImages: string[] },
  variantKey: string,
): Promise<ImageReferenceImage[]> {
  if (asset.type === 'character') {
    const variants = await db.assetAppearanceVariant.findMany({
      where: { assetId: asset.id, deletedAt: null },
      select: { key: true, anchorMediaId: true, state: true, deletedAt: true, order: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    // Prefer turnaround sheet, then legacy per-view slots for keyframe consistency.
    const sheetKeys = [
      'sheet_turnaround',
      'sheet_front',
      'sheet_face',
      'sheet_side',
      'sheet_back',
    ] as const;
    const sheetRefs: ImageReferenceImage[] = [];
    for (const key of sheetKeys) {
      const sheet = variants.find((item) => item.key === key && item.anchorMediaId);
      if (!sheet?.anchorMediaId) continue;
      const media = await mediaUrl(db, sheet.anchorMediaId);
      if (!media) continue;
      // Only https URLs are useful for SiliconFlow conditioning / video I2V.
      if (!/^https?:\/\//i.test(media.url)) continue;
      sheetRefs.push({
        media_id: media.id,
        label: `${asset.name}:${key}`,
        role: 'character',
        url: media.url,
      });
    }
    if (sheetRefs.length > 0) return sheetRefs.slice(0, 4);

    const anchorId = resolveAppearanceVariantAnchor(
      variants.map((item) => ({
        key: item.key,
        anchor_media_id: item.anchorMediaId
          ? asId<MediaId>(item.anchorMediaId)
          : null,
        state: item.state,
        deleted_at: item.deletedAt,
      })),
      variantKey,
    );
    if (anchorId) {
      const media = await mediaUrl(db, String(anchorId));
      if (media && /^https?:\/\//i.test(media.url)) {
        return [
          {
            media_id: media.id,
            label: `${asset.name}:${variantKey}`,
            role: 'character',
            url: media.url,
          },
        ];
      }
    }
  }

  const fallbackId = asset.referenceImages[0];
  if (!fallbackId) return [];
  const media = await mediaUrl(db, fallbackId);
  if (!media || !/^https?:\/\//i.test(media.url)) return [];
  return [
    {
      media_id: media.id,
      label: asset.name,
      role: asset.type === 'location' ? 'location' : 'character',
      url: media.url,
    },
  ];
}

/**
 * Asset-library variant generate: prefer default (or another) approved anchor so new looks stay consistent.
 */
export async function resolveAppearanceVariantReferenceImages(
  db: PrismaClient,
  asset: { id: string; name: string; referenceImages: string[] },
  variantKey: string,
): Promise<ImageReferenceImage[]> {
  const variants = await db.assetAppearanceVariant.findMany({
    where: { assetId: asset.id, deletedAt: null, anchorMediaId: { not: null } },
    select: { key: true, anchorMediaId: true, title: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });

  const preferred =
    variants.find((item) => item.key === 'sheet_turnaround' && item.key !== variantKey) ??
    variants.find((item) => item.key === DEFAULT_APPEARANCE_VARIANT_KEY && item.key !== variantKey) ??
    variants.find((item) => item.key !== variantKey) ??
    variants[0];

  if (preferred?.anchorMediaId) {
    const media = await mediaUrl(db, preferred.anchorMediaId);
    // SiliconFlow I2V/I2I need public http(s); skip data:/svg placeholders.
    if (media && /^https?:\/\//i.test(media.url)) {
      return [
        {
          media_id: media.id,
          label: `${asset.name}:${preferred.key}`,
          role: 'character',
          url: media.url,
        },
      ];
    }
  }

  const fallbackId = asset.referenceImages[0];
  if (!fallbackId) return [];
  const media = await mediaUrl(db, fallbackId);
  if (!media || !/^https?:\/\//i.test(media.url)) return [];
  return [
    {
      media_id: media.id,
      label: asset.name,
      role: 'character',
      url: media.url,
    },
  ];
}

export async function resolveMediaUrls(
  db: PrismaClient,
  mediaIds: readonly string[],
): Promise<string[]> {
  if (mediaIds.length === 0) return [];
  const rows = await db.media.findMany({
    where: { id: { in: [...mediaIds] }, deletedAt: null },
    select: { id: true, url: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row.url]));
  return mediaIds.map((id) => byId.get(id)).filter((url): url is string => Boolean(url));
}

export function referenceInjectionMetadata(
  refs: readonly ImageReferenceImage[],
  adapterMeta: Record<string, string | number | boolean>,
): Record<string, unknown> {
  const injection =
    typeof adapterMeta.reference_injection === 'string'
      ? adapterMeta.reference_injection
      : refs.length > 0
        ? 'applied'
        : 'none';
  return {
    ...adapterMeta,
    reference_injection: injection,
    ...(refs.length
      ? {
          reference_media_ids: refs.map((item) => item.media_id),
          reference_labels: refs.map((item) => item.label),
        }
      : {}),
  };
}
