import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import type { MockWorkflowRunner } from '../contexts/workflow/mock-runner.js';

const sceneParams = z.object({ id: z.string().uuid() });
const shotParams = z.object({ id: z.string().uuid() });

export function registerRecomputeRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  createRunner: () => MockWorkflowRunner,
): void {
  app.post('/scenes/:id/recompute-visual-prep', async (request) => {
    const { id } = sceneParams.parse(request.params);
    const scene = await db.scene.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!scene) throw new ApiError(404, 'SCENE_NOT_FOUND', '场景不存在');
    return createRunner().recomputeVisualPrep(id, request.user.sub);
  });

  app.post('/shots/:id/recompute-prompt', async (request) => {
    const { id } = shotParams.parse(request.params);
    const shot = await db.shot.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!shot) throw new ApiError(404, 'SHOT_NOT_FOUND', '镜头不存在');
    return createRunner().recomputePrompt(id, request.user.sub);
  });

  app.post('/shots/:id/recompute-video', async (request) => {
    const { id } = shotParams.parse(request.params);
    const shot = await db.shot.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!shot) throw new ApiError(404, 'SHOT_NOT_FOUND', '镜头不存在');
    return createRunner().recomputeVideo(id, request.user.sub);
  });
}
