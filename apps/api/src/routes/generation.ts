import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { z } from 'zod';
import { GenerationService } from '../contexts/generation/service.js';
import { ApiError } from '../errors.js';

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
    model: z.literal('mock-v1').default('mock-v1'),
    async: z.boolean().optional(),
  })
  .strict();

async function requireShotMember(
  db: PrismaClient,
  shotId: string,
  userId: string,
  write = false,
) {
  const shot = await db.shot.findFirst({
    where: { id: shotId, deletedAt: null },
    select: { id: true, projectId: true },
  });
  if (!shot) throw new ApiError(404, 'SHOT_NOT_FOUND', '镜头不存在');
  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: shot.projectId, userId } },
  });
  if (!member) throw new ApiError(403, 'FORBIDDEN', '你无权访问该项目');
  if (write && member.role === 'viewer') {
    throw new ApiError(403, 'FORBIDDEN', '你无权修改该项目');
  }
  return shot;
}

async function requireProjectMember(db: PrismaClient, projectId: string, userId: string) {
  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw new ApiError(403, 'FORBIDDEN', '你无权访问该项目');
}

export function registerGenerationRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  service = new GenerationService(db),
): void {
  app.post('/shots/:id/generate', async (request, reply) => {
    const { id } = shotParams.parse(request.params);
    await requireShotMember(db, id, request.user.sub, true);
    const body = generateBody.parse(request.body ?? {});
    const output = await service.generate(id, {
      model: body.model,
      ...(body.request_id ? { requestId: body.request_id } : {}),
      ...(body.async !== undefined ? { async: body.async } : {}),
    });
    return reply.status(body.async ? 202 : 201).send(output);
  });

  app.get('/shots/:id/outputs', async (request) => {
    const { id } = shotParams.parse(request.params);
    await requireShotMember(db, id, request.user.sub);
    return db.output.findMany({
      where: { shotId: id },
      orderBy: { createdAt: 'desc' },
    });
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
