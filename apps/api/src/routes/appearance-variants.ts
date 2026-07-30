import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@zivith/database';
import {
  appearanceVariantCreateSchema,
  appearanceVariantKeySchema,
  appearanceVariantPatchSchema,
  CHARACTER_SHEET_TURNAROUND_KEY,
  CHARACTER_SHEET_VARIANTS,
  DEFAULT_APPEARANCE_VARIANT_KEY,
  isCharacterSheetVariantKey,
  resolveAppearanceWithVariant,
  type CharacterAppearance,
} from '@zivith/domain';
import { z } from 'zod';
import {
  ensureCharacterSheetVariants,
  ensureDefaultAppearanceVariant,
  generateAppearanceVariantImage,
  nextAppearanceVariantOrder,
  removeAppearanceVariantCandidate,
} from '../contexts/visual/appearance-variants.js';
import {
  enrichVisualAssetTraits,
  mergeVisualPromptIntoAssetData,
} from '../contexts/agent/visual-trait.js';
import { ApiError } from '../errors.js';
import { createProviderBundle } from '../providers/registry.js';
import { instrumentProviderBundle } from '../contexts/usage/instrument.js';
import { withUsageContext } from '../contexts/usage/context.js';
import type { StoragePort } from '../ports/index.js';
import { getRuntimeModelOverride, getRuntimeProviderOverride } from './providers.js';
import { maybeRecordEntityChange } from '../contexts/history/index.js';

const assetParams = z.object({ id: z.string().uuid() });
const variantParams = z.object({
  id: z.string().uuid(),
  key: appearanceVariantKeySchema,
});
const generateBody = z
  .object({
    prompt: z.string().trim().min(1).max(5_000).optional(),
    count: z.number().int().min(1).max(4).optional().default(1),
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
    await ensureDefaultAppearanceVariant(db, asset);
    await ensureCharacterSheetVariants(db, asset.id);
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
    if (body.key === DEFAULT_APPEARANCE_VARIANT_KEY || isCharacterSheetVariantKey(body.key)) {
      throw new ApiError(
        409,
        'RESERVED_VARIANT_KEY',
        '默认形象与参考图槽位（正/侧/后/面部）已预留，请编辑现有项或使用其他键名',
      );
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

  // Must register before /:key routes so these paths are not captured as keys.
  app.post('/assets/:id/appearance-variants/draft-sheet-prompt', async (request) => {
    const { id } = assetParams.parse(request.params);
    const asset = await characterAssetForMember(db, id, request.user.sub, true);
    await ensureDefaultAppearanceVariant(db, asset);
    await ensureCharacterSheetVariants(db, asset.id);
    const sheet = CHARACTER_SHEET_VARIANTS[0];
    const variant = await variantForAsset(db, asset.id, CHARACTER_SHEET_TURNAROUND_KEY);
    const providers = instrumentProviderBundle(
      db,
      createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()),
    );
    const appearance = appearanceFromAsset(asset.appearance);
    const appearanceBits = Object.values(appearance)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(', ');

    const traits = await withUsageContext({ projectId: asset.projectId, taskType: 'llm' }, () =>
      enrichVisualAssetTraits(providers.llm, providers.llmModel, randomUUID(), {
        asset_type: 'character',
        asset_name: asset.name,
        variant_key: CHARACTER_SHEET_TURNAROUND_KEY,
        purpose: 'character_sheet',
        scene_title: 'character reference sheet',
        existing_description: asset.description,
        appearance_bits: appearanceBits,
      }),
    );

    const updated = await db.assetAppearanceVariant.update({
      where: { id: variant.id },
      data: { description: traits.generation_prompt, state: 'draft' },
    });
    await db.asset.update({
      where: { id: asset.id },
      data: {
        data: JSON.parse(
          JSON.stringify(
            mergeVisualPromptIntoAssetData(
              asset.data,
              CHARACTER_SHEET_TURNAROUND_KEY,
              traits.generation_prompt,
              traits.appearance_summary,
            ),
          ),
        ) as Prisma.InputJsonValue,
      },
    });

    return {
      asset_id: asset.id,
      key: sheet.key,
      title: sheet.title,
      generation_prompt: traits.generation_prompt,
      appearance_summary: traits.appearance_summary,
      description: traits.description,
      variant: updated,
      provider: providers.selection.llm,
      model: providers.llmModel,
      note: '仅起草提示词，未调用生图。审核后请「按提示词生成设定表」。',
    };
  });

  app.post('/assets/:id/appearance-variants/generate-sheet', async (request, reply) => {
    const { id } = assetParams.parse(request.params);
    const asset = await characterAssetForMember(db, id, request.user.sub, true);
    await ensureDefaultAppearanceVariant(db, asset);
    await ensureCharacterSheetVariants(db, asset.id);
    const body = generateBody.parse(request.body ?? {});
    const sheet = CHARACTER_SHEET_VARIANTS[0];
    const variant = await variantForAsset(db, asset.id, CHARACTER_SHEET_TURNAROUND_KEY);
    const providers = instrumentProviderBundle(
      db,
      createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()),
    );
    const appearance = appearanceFromAsset(asset.appearance);
    const appearanceBits = Object.values(appearance)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(', ');

    const prompt =
      body.prompt?.trim() ||
      variant.description?.trim() ||
      [asset.name, sheet.title, sheet.prompt_clause, appearanceBits, asset.description]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .join(', ');

    const item = await withUsageContext(
      { projectId: asset.projectId, taskType: 'image_generate' },
      () =>
        generateAppearanceVariantImage({
          db,
          assetId: asset.id,
          variantKey: sheet.key,
          image: providers.image,
          imageModel: providers.imageModel,
          imageI2iModel: providers.imageI2iModel,
          prompt,
          requestId: randomUUID(),
          count: body.count ?? 1,
          allowFallback: false,
          ...(storage ? { storage } : {}),
        }),
    );

    const primaryMediaId = item.medias[0]?.id;
    // Persist the prompt used for review / regeneration; promote first candidate to cover.
    await db.assetAppearanceVariant.update({
      where: { id: item.variant.id },
      data: {
        description: prompt,
        ...(primaryMediaId
          ? {
              anchorMediaId: primaryMediaId,
              state: 'review' as const,
            }
          : {}),
      },
    });
    if (primaryMediaId) {
      await db.asset.update({
        where: { id: asset.id },
        data: {
          state: 'active',
          referenceImages: [
            primaryMediaId,
            ...asset.referenceImages.filter((id) => id !== primaryMediaId),
          ],
        },
      });
    }

    return reply.status(201).send({
      asset_id: asset.id,
      sheets: [
        {
          key: sheet.key,
          title: sheet.title,
          variant: item.variant,
          medias: item.medias,
        },
      ],
      generation_prompt: prompt,
      provider: providers.selection.image,
      model: providers.imageModel,
      note: '单图多视角设定表（一次 T2I），已设为封面。',
    });
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
    if (isCharacterSheetVariantKey(variant.key)) {
      throw new ApiError(400, 'SHEET_VARIANT_REQUIRED', '参考图槽位不可删除，可删除其中的候选图');
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
      appearanceFromAsset(asset.appearance) as CharacterAppearance,
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

    const providers = instrumentProviderBundle(
      db,
      createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()),
    );
    const result = await withUsageContext(
      { projectId: asset.projectId, taskType: 'image_generate' },
      () =>
        generateAppearanceVariantImage({
          db,
          assetId: asset.id,
          variantKey: variant.key,
          image: providers.image,
          imageModel: providers.imageModel,
          imageI2iModel: providers.imageI2iModel,
          prompt,
          requestId: randomUUID(),
          count: body.count,
          // Asset-library generate is operator-driven; fail loudly like manual visual regenerate.
          allowFallback: false,
          ...(storage ? { storage } : {}),
        }),
    );

    return reply.status(201).send({
      ...result.variant,
      media: {
        id: result.media.id,
        url: result.media.url,
        access_url: result.media.url,
      },
      medias: result.medias.map((item) => ({
        id: item.id,
        url: item.url,
        access_url: item.url,
      })),
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
    const generationMeta =
      media.generationMetadata &&
      typeof media.generationMetadata === 'object' &&
      !Array.isArray(media.generationMetadata)
        ? (media.generationMetadata as Record<string, unknown>)
        : {};
    if (
      typeof generationMeta.generation_error === 'string' ||
      generationMeta.provider === 'mock-fallback'
    ) {
      throw new ApiError(
        409,
        'FAILED_PLACEHOLDER_NOT_APPROVABLE',
        '生图失败占位图不可批准，请修改提示词后重新生成',
      );
    }

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
    await maybeRecordEntityChange(db, {
      projectId: asset.projectId,
      entityType: 'appearance_variant',
      entityId: approved.id,
      row: approved as unknown as Record<string, unknown>,
      changeKind: 'transition',
      eventType: 'review.decided',
      idempotencyKey: `appearance_variant:approve:${approved.id}:${mediaId}`,
      actorId: request.user.sub,
      actorType: 'user',
      sourceType: 'http',
      sourceId: 'POST /assets/:id/appearance-variants/:key/approve',
      payload: { decision: 'approve', media_id: mediaId },
    });
    return approved;
  });

  app.delete(
    '/assets/:id/appearance-variants/:key/candidates/:mediaId',
    async (request, reply) => {
      const params = z
        .object({
          id: z.string().uuid(),
          key: appearanceVariantKeySchema,
          mediaId: z.string().uuid(),
        })
        .parse(request.params);
      const asset = await characterAssetForMember(db, params.id, request.user.sub, true);
      await removeAppearanceVariantCandidate(db, {
        assetId: asset.id,
        variantKey: params.key,
        mediaId: params.mediaId,
      });
      return reply.status(204).send();
    },
  );
}
