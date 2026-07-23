import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import {
  appearanceVariantCreateSchema,
  appearanceVariantKeySchema,
  appearanceVariantPatchSchema,
  DEFAULT_APPEARANCE_VARIANT_KEY,
  resolveAppearanceWithVariant,
} from '@zivith/domain';
import { z } from 'zod';
import {
  ensureDefaultAppearanceVariant,
  generateAppearanceVariantImage,
  nextAppearanceVariantOrder,
} from '../contexts/visual/appearance-variants.js';
import { ApiError } from '../errors.js';
import { createProviderBundle } from '../providers/registry.js';
import type { StoragePort } from '../ports/index.js';
import { getRuntimeModelOverride, getRuntimeProviderOverride } from './providers.js';

const assetParams = z.object({ id: z.string().uuid() });
const variantParams = z.object({
  id: z.string().uuid(),
  key: appearanceVariantKeySchema,
});
const generateBody = z
  .object({
    prompt: z.string().trim().min(1).max(5_000).optional(),
  })
  .strict();
const approveBody = z.object({ media_id: z.string().uuid().optional() }).strict();

async function resolveMediaAccessUrl(
  url: string,
  storageKey: string,
  storage?: StoragePort,
): Promise<string> {
  if (/^(https?:|data:)/i.test(url)) return url;
  if (storage) return storage.signedReadUrl(storageKey);
  return url;
}

async function characterAssetForMember(
  db: PrismaClient,
  assetId: string,
  userId: string,
  write = false,
) {
  const asset = await db.asset.findFirst({ where: { id: assetId, deletedAt: null } });
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
  if (asset.type !== 'character') {
    throw new ApiError(400, 'UNSUPPORTED_ASSET_TYPE', '形象变体仅支持角色资产');
  }
  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: asset.projectId, userId } },
  });
  if (!member) throw new ApiError(403, 'FORBIDDEN', '你无权访问该项目');
  if (write && member.role === 'viewer') {
    throw new ApiError(403, 'FORBIDDEN', '你无权修改该项目');
  }
  await ensureDefaultAppearanceVariant(db, asset);
  return asset;
}

async function variantForAsset(db: PrismaClient, assetId: string, key: string) {
  const variant = await db.assetAppearanceVariant.findFirst({
    where: { assetId, key, deletedAt: null },
  });
  if (!variant) throw new ApiError(404, 'APPEARANCE_VARIANT_NOT_FOUND', '形象不存在');
  return variant;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function appearanceFromAsset(appearance: unknown): Record<string, unknown> {
  return isRecord(appearance) ? appearance : {};
}

export function registerAppearanceVariantRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  storage?: StoragePort,
) {
  app.get('/assets/:id/appearance-variants', async (request) => {
    const { id } = assetParams.parse(request.params);
    const asset = await characterAssetForMember(db, id, request.user.sub);
    const variants = await db.assetAppearanceVariant.findMany({
      where: { assetId: asset.id, deletedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    const mediaIds = [
      ...new Set(
        variants.flatMap((item) => [
          ...(item.anchorMediaId ? [item.anchorMediaId] : []),
          ...item.candidateMediaIds,
        ]),
      ),
    ];
    const mediaRows = mediaIds.length
      ? await db.media.findMany({ where: { id: { in: mediaIds }, deletedAt: null } })
      : [];
    const mediaById = new Map(
      await Promise.all(
        mediaRows.map(async (media) => {
          const accessUrl = await resolveMediaAccessUrl(media.url, media.storageKey, storage);
          return [
            media.id,
            {
              id: media.id,
              url: media.url,
              access_url: accessUrl,
              thumbnail_url: media.thumbnailUrl,
              generation_metadata: media.generationMetadata,
            },
          ] as const;
        }),
      ),
    );

    const baseAppearance = appearanceFromAsset(asset.appearance);
    return variants.map((variant) => ({
      ...variant,
      resolved_appearance: resolveAppearanceWithVariant(baseAppearance, variant),
      anchor_media: variant.anchorMediaId ? (mediaById.get(variant.anchorMediaId) ?? null) : null,
      candidate_media: variant.candidateMediaIds
        .map((mediaId) => mediaById.get(mediaId))
        .filter(Boolean),
    }));
  });

  app.post('/assets/:id/appearance-variants', async (request, reply) => {
    const { id } = assetParams.parse(request.params);
    const asset = await characterAssetForMember(db, id, request.user.sub, true);
    const body = appearanceVariantCreateSchema.parse(request.body ?? {});
    if (body.key === DEFAULT_APPEARANCE_VARIANT_KEY) {
      throw new ApiError(409, 'DEFAULT_VARIANT_EXISTS', '默认形象已自动创建，请编辑现有项');
    }
    const order = body.order ?? (await nextAppearanceVariantOrder(db, asset.id));
    try {
      const created = await db.assetAppearanceVariant.create({
        data: {
          assetId: asset.id,
          key: body.key,
          title: body.title,
          changeReason: body.change_reason ?? null,
          description: body.description ?? null,
          order,
          state: 'draft',
          candidateMediaIds: [],
        },
      });
      return reply.status(201).send(created);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ApiError(409, 'APPEARANCE_VARIANT_KEY_EXISTS', '该形象键已存在');
      }
      throw error;
    }
  });

  app.get('/assets/:id/appearance-variants/:key', async (request) => {
    const { id, key } = variantParams.parse(request.params);
    const asset = await characterAssetForMember(db, id, request.user.sub);
    const variant = await variantForAsset(db, asset.id, key);
    return {
      ...variant,
      resolved_appearance: resolveAppearanceWithVariant(
        appearanceFromAsset(asset.appearance),
        variant,
      ),
    };
  });

  app.patch('/assets/:id/appearance-variants/:key', async (request) => {
    const { id, key } = variantParams.parse(request.params);
    const asset = await characterAssetForMember(db, id, request.user.sub, true);
    const variant = await variantForAsset(db, asset.id, key);
    const body = appearanceVariantPatchSchema.parse(request.body ?? {});
    if (body.key && body.key !== variant.key) {
      if (variant.key === DEFAULT_APPEARANCE_VARIANT_KEY) {
        throw new ApiError(400, 'DEFAULT_VARIANT_IMMUTABLE_KEY', '默认形象的键不可更改');
      }
      if (body.key === DEFAULT_APPEARANCE_VARIANT_KEY) {
        throw new ApiError(400, 'DEFAULT_VARIANT_KEY_RESERVED', 'default 键已保留');
      }
    }
    try {
      return await db.assetAppearanceVariant.update({
        where: { id: variant.id },
        data: {
          ...(body.key !== undefined ? { key: body.key } : {}),
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.change_reason !== undefined ? { changeReason: body.change_reason } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.order !== undefined ? { order: body.order } : {}),
        },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ApiError(409, 'APPEARANCE_VARIANT_KEY_EXISTS', '该形象键已存在');
      }
      throw error;
    }
  });

  app.delete('/assets/:id/appearance-variants/:key', async (request, reply) => {
    const { id, key } = variantParams.parse(request.params);
    const asset = await characterAssetForMember(db, id, request.user.sub, true);
    const variant = await variantForAsset(db, asset.id, key);
    if (variant.key === DEFAULT_APPEARANCE_VARIANT_KEY) {
      throw new ApiError(400, 'DEFAULT_VARIANT_REQUIRED', '默认形象不可删除');
    }
    await db.assetAppearanceVariant.update({
      where: { id: variant.id },
      data: { deletedAt: new Date() },
    });
    return reply.status(204).send();
  });

  app.post('/assets/:id/appearance-variants/:key/generate', async (request, reply) => {
    const { id, key } = variantParams.parse(request.params);
    const asset = await characterAssetForMember(db, id, request.user.sub, true);
    const variant = await variantForAsset(db, asset.id, key);
    const body = generateBody.parse(request.body ?? {});
    const appearance = resolveAppearanceWithVariant(
      appearanceFromAsset(asset.appearance),
      variant,
    );
    const appearanceBits = Object.values(appearance)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(', ');
    const prompt =
      body.prompt?.trim() ||
      [
        asset.name,
        variant.title,
        variant.changeReason,
        variant.description,
        appearanceBits,
        asset.description,
      ]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .join(', ');

    const providers = createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride());
    const result = await generateAppearanceVariantImage({
      db,
      assetId: asset.id,
      variantKey: variant.key,
      image: providers.image,
      imageModel: providers.imageModel,
      prompt,
      requestId: randomUUID(),
      // Asset-library generate is operator-driven; fail loudly like manual visual regenerate.
      allowFallback: false,
    });

    return reply.status(201).send({
      ...result.variant,
      media: {
        id: result.media.id,
        url: result.media.url,
        access_url: result.media.url,
      },
      provider: providers.selection.image,
      model: providers.imageModel,
    });
  });

  app.post('/assets/:id/appearance-variants/:key/approve', async (request) => {
    const { id, key } = variantParams.parse(request.params);
    const asset = await characterAssetForMember(db, id, request.user.sub, true);
    const variant = await variantForAsset(db, asset.id, key);
    const body = approveBody.parse(request.body ?? {});
    const mediaId = body.media_id ?? variant.candidateMediaIds[0];
    if (!mediaId || !variant.candidateMediaIds.includes(mediaId)) {
      throw new ApiError(409, 'INVALID_APPEARANCE_CANDIDATE', '请选择该形象的候选图片');
    }
    const media = await db.media.findFirst({ where: { id: mediaId, deletedAt: null } });
    if (!media) throw new ApiError(404, 'MEDIA_NOT_FOUND', '候选图片不存在');

    const [approved] = await db.$transaction([
      db.assetAppearanceVariant.update({
        where: { id: variant.id },
        data: {
          state: 'approved',
          anchorMediaId: mediaId,
        },
      }),
      db.asset.update({
        where: { id: asset.id },
        data: {
          state: 'active',
          // Keep asset-level referenceImages in sync for default / first approved anchors.
          referenceImages: [...new Set([...asset.referenceImages, mediaId])],
        },
      }),
    ]);
    return approved;
  });
}
