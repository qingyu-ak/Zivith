import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { z } from 'zod';
import { ApiError } from '../errors.js';

const sceneParams = z.object({ id: z.string().uuid() });
const requirementParams = z.object({ id: z.string().uuid(), rid: z.string().uuid() });
const requirementBody = z
  .object({
    asset_type: z.enum(['character', 'location']),
    asset_id: z.string().uuid(),
    variant_key: z.string().trim().min(1).max(300),
    required: z.boolean().default(true),
    reason: z.string().trim().min(1).max(10_000),
  })
  .strict();
const approveBody = z.object({ media_id: z.string().uuid().optional() }).strict();
const rejectBody = z.object({ reason: z.string().trim().max(10_000).optional() }).strict();

async function sceneForMember(db: PrismaClient, sceneId: string, userId: string, write = false) {
  const scene = await db.scene.findFirst({
    where: { id: sceneId, deletedAt: null },
    select: { id: true, projectId: true },
  });
  if (!scene) throw new ApiError(404, 'SCENE_NOT_FOUND', '场景不存在');
  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: scene.projectId, userId } },
  });
  if (!member) throw new ApiError(403, 'FORBIDDEN', '你无权访问该项目');
  if (write && member.role === 'viewer') {
    throw new ApiError(403, 'FORBIDDEN', '你无权修改该项目');
  }
  return scene;
}

async function requirementForScene(db: PrismaClient, sceneId: string, requirementId: string) {
  const requirement = await db.visualAssetRequirement.findFirst({
    where: { id: requirementId, sceneId, deletedAt: null },
  });
  if (!requirement) throw new ApiError(404, 'VISUAL_REQUIREMENT_NOT_FOUND', '视觉需求不存在');
  return requirement;
}

export function registerVisualRequirementRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.get('/scenes/:id/visual-requirements', async (request) => {
    const { id } = sceneParams.parse(request.params);
    await sceneForMember(db, id, request.user.sub);
    return db.visualAssetRequirement.findMany({
      where: { sceneId: id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
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
    return reply.status(201).send(requirement);
  });

  app.patch('/scenes/:id/visual-requirements/:rid', async (request) => {
    const { id, rid } = requirementParams.parse(request.params);
    await sceneForMember(db, id, request.user.sub, true);
    await requirementForScene(db, id, rid);
    const body = requirementBody.partial().parse(request.body);
    return db.visualAssetRequirement.update({
      where: { id: rid },
      data: {
        assetType: body.asset_type,
        assetId: body.asset_id,
        variantKey: body.variant_key,
        required: body.required,
        reason: body.reason,
        status: 'pending',
        approvedMediaId: null,
        version: { increment: 1 },
      },
    });
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
    return approved;
  });

  app.post('/scenes/:id/visual-requirements/:rid/reject', async (request) => {
    const { id, rid } = requirementParams.parse(request.params);
    await sceneForMember(db, id, request.user.sub, true);
    await requirementForScene(db, id, rid);
    rejectBody.parse(request.body ?? {});
    return db.visualAssetRequirement.update({
      where: { id: rid },
      data: { status: 'rejected', approvedMediaId: null, version: { increment: 1 } },
    });
  });
}
