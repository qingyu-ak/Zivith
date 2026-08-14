import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@zivith/database';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ensureProjectMember } from '../contexts/world/local-user.js';
import type { StoragePort } from '../ports/index.js';
import {
  mergeVisualPromptIntoAssetData,
  readVisualPromptFromAssetData,
} from '../contexts/agent/visual-trait.js';
import {
  removeRequirementCandidate,
  syncVariantAnchorFromRequirement,
} from '../contexts/visual/appearance-variants.js';
import { generateRequirementImage } from '../contexts/visual/generate-requirement-image.js';
import { omitUndefined } from '../lib/omit-undefined.js';
import { createProviderBundle } from '../providers/registry.js';
import { instrumentProviderBundle } from '../contexts/usage/instrument.js';
import { withUsageContext } from '../contexts/usage/context.js';
import { getRuntimeModelOverride, getRuntimeProviderOverride } from './providers.js';
import { maybeRecordEntityChange } from '../contexts/history/index.js';

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

const sceneParams = z.object({ id: z.string().uuid() });
const requirementParams = z.object({ id: z.string().uuid(), rid: z.string().uuid() });
const requirementBody = z
  .object({
    asset_type: z.enum(['character', 'location']),
    asset_id: z.string().uuid(),
    variant_key: z.string().trim().min(1).max(300),
    required: z.boolean().default(true),
    reason: z.string().trim().min(1).max(10_000),
    generation_prompt: z.string().trim().min(1).max(5_000).optional(),
  })
  .strict();
const approveBody = z.object({ media_id: z.string().uuid().optional() }).strict();
const rejectBody = z.object({ reason: z.string().trim().max(10_000).optional() }).strict();
const generateBody = z
  .object({
    prompt: z.string().trim().min(1).max(5_000).optional(),
    count: z.number().int().min(1).max(4).optional().default(1),
  })
  .strict();

async function sceneForMember(db: PrismaClient, sceneId: string, userId: string, write = false) {
  const scene = await db.scene.findFirst({
    where: { id: sceneId, deletedAt: null },
    select: { id: true, projectId: true },
  });
  if (!scene) throw new ApiError(404, 'SCENE_NOT_FOUND', '场景不存在');
  await ensureProjectMember(db, userId, scene.projectId, write);
  return scene;
}

async function requirementForScene(db: PrismaClient, sceneId: string, requirementId: string) {
  const requirement = await db.visualAssetRequirement.findFirst({
    where: { id: requirementId, sceneId, deletedAt: null },
  });
  if (!requirement) throw new ApiError(404, 'VISUAL_REQUIREMENT_NOT_FOUND', '视觉需求不存在');
  return requirement;
}

function appearanceSummary(data: unknown, appearance: unknown): string | undefined {
  if (appearance && typeof appearance === 'object' && !Array.isArray(appearance)) {
    const custom = (appearance as Record<string, unknown>).custom;
    if (typeof custom === 'string' && custom.trim()) return custom.trim();
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const visual = (data as Record<string, unknown>).visual;
    if (visual && typeof visual === 'object' && !Array.isArray(visual)) {
      const summary = (visual as Record<string, unknown>).appearance_summary;
      if (typeof summary === 'string' && summary.trim()) return summary.trim();
    }
  }
  return undefined;
}

async function enrichRequirement(
  db: PrismaClient,
  requirement: {
    id: string;
    sceneId: string;
    assetType: string;
    assetId: string;
    variantKey: string;
    required: boolean;
    reason: string;
    status: string;
    candidateMediaIds: string[];
    approvedMediaId: string | null;
    version: number;
  },
) {
  const asset = await db.asset.findFirst({
    where: { id: requirement.assetId, deletedAt: null },
  });
  const generationPrompt = asset
    ? readVisualPromptFromAssetData(asset.data, requirement.variantKey)
    : undefined;
  return {
    ...requirement,
    generation_prompt: generationPrompt ?? null,
    asset: asset
      ? {
          id: asset.id,
          name: asset.name,
          description: asset.description,
          appearance_summary: appearanceSummary(asset.data, asset.appearance) ?? null,
          type: asset.type,
        }
      : null,
  };
}

export function registerVisualRequirementRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  storage?: StoragePort,
): void {
  app.get('/scenes/:id/visual-requirements', async (request) => {
    const { id } = sceneParams.parse(request.params);
    await sceneForMember(db, id, request.user.sub);
    const requirements = await db.visualAssetRequirement.findMany({
      where: { sceneId: id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(requirements.map((item) => enrichRequirement(db, item)));
  });

  app.post('/scenes/:id/visual-requirements', async (request, reply) => {
    const { id } = sceneParams.parse(request.params);
    await sceneForMember(db, id, request.user.sub, true);
    const body = requirementBody.parse(request.body);
    const requirement = await db.visualAssetRequirement.create({
      data: {
        sceneId: id,
        assetType: body.asset_type,
        assetId: body.asset_id,
        variantKey: body.variant_key,
        required: body.required,
        reason: body.reason,
      },
    });
    if (body.generation_prompt) {
      const asset = await db.asset.findFirst({
        where: { id: body.asset_id, deletedAt: null },
      });
      if (asset) {
        await db.asset.update({
          where: { id: asset.id },
          data: {
            data: json(
              mergeVisualPromptIntoAssetData(asset.data, body.variant_key, body.generation_prompt),
            ),
          },
        });
      }
    }
    return reply.status(201).send(await enrichRequirement(db, requirement));
  });

  app.patch('/scenes/:id/visual-requirements/:rid', async (request) => {
    const { id, rid } = requirementParams.parse(request.params);
    await sceneForMember(db, id, request.user.sub, true);
    const existing = await requirementForScene(db, id, rid);
    const body = requirementBody.partial().parse(request.body);
    const requirement = await db.visualAssetRequirement.update({
      where: { id: rid },
      data: omitUndefined({
        assetType: body.asset_type,
        assetId: body.asset_id,
        variantKey: body.variant_key,
        required: body.required,
        reason: body.reason,
        status: 'pending' as const,
        approvedMediaId: null,
        version: { increment: 1 },
      }),
    });
    if (body.generation_prompt) {
      const assetId = body.asset_id ?? existing.assetId;
      const variantKey = body.variant_key ?? existing.variantKey;
      const asset = await db.asset.findFirst({ where: { id: assetId, deletedAt: null } });
      if (asset) {
        await db.asset.update({
          where: { id: asset.id },
          data: {
            data: json(
              mergeVisualPromptIntoAssetData(asset.data, variantKey, body.generation_prompt),
            ),
          },
        });
      }
    }
    return enrichRequirement(db, requirement);
  });

  app.post('/scenes/:id/visual-requirements/:rid/generate', async (request, reply) => {
    const { id, rid } = requirementParams.parse(request.params);
    const scene = await sceneForMember(db, id, request.user.sub, true);
    const requirement = await requirementForScene(db, id, rid);
    const body = generateBody.parse(request.body ?? {});
    const asset = await db.asset.findFirst({
      where: { id: requirement.assetId, deletedAt: null },
    });
    if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '关联资产不存在');

    const prompt =
      body.prompt?.trim() ||
      readVisualPromptFromAssetData(asset.data, requirement.variantKey) ||
      [asset.name, asset.description, requirement.reason, `variant ${requirement.variantKey}`]
        .filter(Boolean)
        .join(', ');

    const providers = instrumentProviderBundle(
      db,
      createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()),
    );
    await db.visualAssetRequirement.update({
      where: { id: rid },
      data: { status: 'generating' },
    });

    try {
      const result = await withUsageContext(
        { projectId: scene.projectId, taskType: 'image_generate' },
        () =>
          generateRequirementImage({
            db,
            requirementId: rid,
            image: providers.image,
            imageModel: providers.imageModel,
            imageI2iModel: providers.imageI2iModel,
            prompt,
            requestId: randomUUID(),
            count: body.count,
            // Manual regenerate must fail loudly so operators can fix model/provider settings.
            allowFallback: false,
            ...(storage ? { storage } : {}),
          }),
      );
      if (!result) throw new ApiError(404, 'VISUAL_REQUIREMENT_NOT_FOUND', '视觉需求不存在');

      return reply.status(201).send({
        ...(await enrichRequirement(db, result.requirement)),
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
    } catch (error) {
      await db.visualAssetRequirement.update({
        where: { id: rid },
        data: { status: 'review' },
      });
      throw error;
    }
  });

  app.post('/scenes/:id/visual-requirements/:rid/approve', async (request) => {
    const { id, rid } = requirementParams.parse(request.params);
    await sceneForMember(db, id, request.user.sub, true);
    const requirement = await requirementForScene(db, id, rid);
    const body = approveBody.parse(request.body ?? {});
    const mediaId = body.media_id ?? requirement.candidateMediaIds[0];
    if (!mediaId || !requirement.candidateMediaIds.includes(mediaId)) {
      throw new ApiError(409, 'INVALID_VISUAL_CANDIDATE', '请选择该需求的候选图片');
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
    const asset = await db.asset.findFirst({
      where: { id: requirement.assetId, deletedAt: null },
    });
    if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '关联资产不存在');

    const [approved] = await db.$transaction([
      db.visualAssetRequirement.update({
        where: { id: rid },
        data: { status: 'approved', approvedMediaId: mediaId },
      }),
      db.asset.update({
        where: { id: asset.id },
        data: {
          state: 'active',
          referenceImages: [...new Set([...asset.referenceImages, mediaId])],
        },
      }),
    ]);
    await maybeRecordEntityChange(db, {
      projectId: asset.projectId,
      entityType: 'visual_requirement',
      entityId: approved.id,
      row: approved,
      changeKind: 'transition',
      eventType: 'review.decided',
      idempotencyKey: `visual_requirement:approve:${approved.id}:${mediaId}`,
      actorId: request.user.sub,
      actorType: 'user',
      sourceType: 'http',
      sourceId: 'POST .../visual-requirements/:rid/approve',
      payload: { decision: 'approve', media_id: mediaId },
    });
    if (asset.type === 'character') {
      await syncVariantAnchorFromRequirement(db, {
        assetId: asset.id,
        variantKey: requirement.variantKey,
        mediaId,
      });
    }
    return enrichRequirement(db, approved);
  });

  app.post('/scenes/:id/visual-requirements/:rid/reject', async (request) => {
    const { id, rid } = requirementParams.parse(request.params);
    await sceneForMember(db, id, request.user.sub, true);
    await requirementForScene(db, id, rid);
    rejectBody.parse(request.body ?? {});
    const rejected = await db.visualAssetRequirement.update({
      where: { id: rid },
      data: { status: 'rejected', approvedMediaId: null, version: { increment: 1 } },
    });
    return enrichRequirement(db, rejected);
  });

  app.delete('/scenes/:id/visual-requirements/:rid/candidates/:mediaId', async (request, reply) => {
    const params = z
      .object({
        id: z.string().uuid(),
        rid: z.string().uuid(),
        mediaId: z.string().uuid(),
      })
      .parse(request.params);
    await sceneForMember(db, params.id, request.user.sub, true);
    await requirementForScene(db, params.id, params.rid);
    await removeRequirementCandidate(db, {
      requirementId: params.rid,
      mediaId: params.mediaId,
    });
    return reply.status(204).send();
  });
}
