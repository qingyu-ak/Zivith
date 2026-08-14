import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { z } from 'zod';
import { GenerationService } from '../contexts/generation/service.js';
import { ApiError } from '../errors.js';
import { ensureProjectMember } from '../contexts/world/local-user.js';
import type { StoragePort } from '../ports/index.js';

const shotParams = z.object({ id: z.string().uuid() });
const outputParams = z.object({ id: z.string().uuid(), oid: z.string().uuid() });
const projectParams = z.object({ projectId: z.string().uuid() });
const listTasksQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(['video_generate']).default('video_generate'),
});
const generateBody = z
  .object({
    request_id: z.string().trim().min(1).max(200).optional(),
    model: z.string().trim().min(1).max(200).optional(),
    async: z.boolean().optional(),
  })
  .strict();

async function resolveOutputVideoUrl(
  videoUrl: string | null | undefined,
  storage?: StoragePort,
): Promise<string | null | undefined> {
  if (!videoUrl) return videoUrl;
  if (/^https?:\/\//i.test(videoUrl) || videoUrl.startsWith('data:')) return videoUrl;
  if (!storage) return videoUrl;
  // s3://bucket/key or bare object key
  const key = videoUrl.startsWith('s3://')
    ? videoUrl.replace(/^s3:\/\/[^/]+\//, '')
    : videoUrl.replace(/^\//, '');
  if (!key) return videoUrl;
  try {
    return await storage.signedReadUrl(key, 6 * 3600);
  } catch {
    return videoUrl;
  }
}

async function requireShotMember(db: PrismaClient, shotId: string, userId: string, write = false) {
  const shot = await db.shot.findFirst({
    where: { id: shotId, deletedAt: null },
    select: { id: true, projectId: true },
  });
  if (!shot) throw new ApiError(404, 'SHOT_NOT_FOUND', '镜头不存在');
  await ensureProjectMember(db, userId, shot.projectId, write);
  return shot;
}

async function requireProjectMember(
  db: PrismaClient,
  projectId: string,
  userId: string,
  write = false,
) {
  await ensureProjectMember(db, userId, projectId, write);
}

export function registerGenerationRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  service = new GenerationService(db),
  storage?: StoragePort,
): void {
  app.post('/shots/:id/generate', async (request, reply) => {
    const { id } = shotParams.parse(request.params);
    await requireShotMember(db, id, request.user.sub, true);
    const body = generateBody.parse(request.body ?? {});
    const output = await service.generate(id, {
      ...(body.model ? { model: body.model } : {}),
      ...(body.request_id ? { requestId: body.request_id } : {}),
      ...(body.async !== undefined ? { async: body.async } : {}),
    });
    return reply.status(body.async ? 202 : 201).send(output);
  });

  app.get('/shots/:id/outputs', async (request) => {
    const { id } = shotParams.parse(request.params);
    await requireShotMember(db, id, request.user.sub);
    const rows = await db.output.findMany({
      where: { shotId: id },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        videoUrl: await resolveOutputVideoUrl(row.videoUrl, storage),
      })),
    );
  });

  app.get('/projects/:projectId/generation-tasks', async (request) => {
    const { projectId } = projectParams.parse(request.params);
    const query = listTasksQuery.parse(request.query);
    await requireProjectMember(db, projectId, request.user.sub);
    return db.task.findMany({
      where: { projectId, type: query.type },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
  });

  app.post('/projects/:projectId/generation-tasks/:taskId/cancel', async (request) => {
    const params = z
      .object({ projectId: z.string().uuid(), taskId: z.string().uuid() })
      .parse(request.params);
    await requireProjectMember(db, params.projectId, request.user.sub, true);
    const task = await db.task.findFirst({
      where: { id: params.taskId, projectId: params.projectId },
    });
    if (!task) throw new ApiError(404, 'TASK_NOT_FOUND', '生成任务不存在');
    return service.cancelTask(task.id);
  });

  app.post('/shots/:id/outputs/:oid/activate', async (request) => {
    const { id, oid } = outputParams.parse(request.params);
    await requireShotMember(db, id, request.user.sub, true);
    const output = await db.output.findFirst({ where: { id: oid, shotId: id } });
    if (!output) throw new ApiError(404, 'OUTPUT_NOT_FOUND', '视频输出不存在');
    if (output.status !== 'completed') {
      throw new ApiError(409, 'OUTPUT_NOT_COMPLETED', '只能激活已完成的视频输出');
    }
    return db.$transaction(async (tx) => {
      await tx.output.updateMany({ where: { shotId: id }, data: { isActive: false } });
      return tx.output.update({ where: { id: oid }, data: { isActive: true } });
    });
  });
}

export { listTasksQuery };
