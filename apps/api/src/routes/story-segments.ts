import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { storySegmentCreateSchema, storySegmentPatchSchema } from '@zivith/domain';
import { z } from 'zod';
import { ApiError } from '../errors.js';

const storyParams = z.object({ sid: z.string().uuid() });
const segmentParams = z.object({
  sid: z.string().uuid(),
  segmentId: z.string().uuid(),
});
const reorderBody = z
  .object({
    ordered_ids: z.array(z.string().uuid()).min(1).max(500),
  })
  .strict();

async function requireStoryMember(
  db: PrismaClient,
  userId: string,
  storyId: string,
  write = false,
) {
  const story = await db.story.findFirst({
    where: { id: storyId, deletedAt: null },
    select: { id: true, projectId: true },
  });
  if (!story) throw new ApiError(404, 'STORY_NOT_FOUND', '故事不存在');
  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: story.projectId, userId } },
  });
  if (!member) throw new ApiError(403, 'FORBIDDEN', '你无权访问该项目');
  if (write && member.role === 'viewer') {
    throw new ApiError(403, 'FORBIDDEN', '你无权修改该项目');
  }
  return story;
}

export function registerStorySegmentRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get('/stories/:sid/segments', async (request) => {
    const { sid } = storyParams.parse(request.params);
    await requireStoryMember(db, request.user.sub, sid);
    return db.storySegment.findMany({
      where: { storyId: sid, deletedAt: null },
      orderBy: { order: 'asc' },
    });
  });

  app.post('/stories/:sid/segments', async (request, reply) => {
    const { sid } = storyParams.parse(request.params);
    await requireStoryMember(db, request.user.sub, sid, true);
    const body = storySegmentCreateSchema.parse(request.body ?? {});
    const count = await db.storySegment.count({ where: { storyId: sid, deletedAt: null } });
    const created = await db.storySegment.create({
      data: {
        storyId: sid,
        order: body.order ?? count + 1,
        title: body.title,
        synopsis: body.synopsis ?? null,
        draft: body.draft ?? null,
        state: 'draft',
      },
    });
    return reply.status(201).send(created);
  });

  app.get('/stories/:sid/segments/:segmentId', async (request) => {
    const { sid, segmentId } = segmentParams.parse(request.params);
    await requireStoryMember(db, request.user.sub, sid);
    const segment = await db.storySegment.findFirst({
      where: { id: segmentId, storyId: sid, deletedAt: null },
    });
    if (!segment) throw new ApiError(404, 'STORY_SEGMENT_NOT_FOUND', '故事段落不存在');
    return segment;
  });

  app.patch('/stories/:sid/segments/:segmentId', async (request) => {
    const { sid, segmentId } = segmentParams.parse(request.params);
    await requireStoryMember(db, request.user.sub, sid, true);
    const existing = await db.storySegment.findFirst({
      where: { id: segmentId, storyId: sid, deletedAt: null },
    });
    if (!existing) throw new ApiError(404, 'STORY_SEGMENT_NOT_FOUND', '故事段落不存在');
    const body = storySegmentPatchSchema.parse(request.body ?? {});
    return db.storySegment.update({
      where: { id: segmentId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.synopsis !== undefined ? { synopsis: body.synopsis } : {}),
        ...(body.draft !== undefined ? { draft: body.draft } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
        ...(body.state !== undefined ? { state: body.state } : {}),
      },
    });
  });

  app.delete('/stories/:sid/segments/:segmentId', async (request, reply) => {
    const { sid, segmentId } = segmentParams.parse(request.params);
    await requireStoryMember(db, request.user.sub, sid, true);
    const existing = await db.storySegment.findFirst({
      where: { id: segmentId, storyId: sid, deletedAt: null },
    });
    if (!existing) throw new ApiError(404, 'STORY_SEGMENT_NOT_FOUND', '故事段落不存在');
    // Soft-delete segment; FK onDelete SetNull detaches scenes on hard delete —
    // for soft delete we explicitly clear scene.segmentId.
    await db.$transaction([
      db.scene.updateMany({
        where: { segmentId, deletedAt: null },
        data: { segmentId: null },
      }),
      db.storySegment.update({
        where: { id: segmentId },
        data: { deletedAt: new Date() },
      }),
    ]);
    return reply.status(204).send();
  });

  app.post('/stories/:sid/segments/reorder', async (request) => {
    const { sid } = storyParams.parse(request.params);
    await requireStoryMember(db, request.user.sub, sid, true);
    const body = reorderBody.parse(request.body ?? {});
    const existing = await db.storySegment.findMany({
      where: { storyId: sid, deletedAt: null },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((item) => item.id));
    if (
      body.ordered_ids.length !== existingIds.size ||
      body.ordered_ids.some((id) => !existingIds.has(id))
    ) {
      throw new ApiError(400, 'INVALID_SEGMENT_ORDER', '排序必须覆盖该故事下全部段落');
    }
    await db.$transaction(
      body.ordered_ids.map((id, index) =>
        db.storySegment.update({ where: { id }, data: { order: index + 1 } }),
      ),
    );
    return db.storySegment.findMany({
      where: { storyId: sid, deletedAt: null },
      orderBy: { order: 'asc' },
    });
  });

  app.post('/stories/:sid/segments/:segmentId/approve', async (request) => {
    const { sid, segmentId } = segmentParams.parse(request.params);
    await requireStoryMember(db, request.user.sub, sid, true);
    const existing = await db.storySegment.findFirst({
      where: { id: segmentId, storyId: sid, deletedAt: null },
    });
    if (!existing) throw new ApiError(404, 'STORY_SEGMENT_NOT_FOUND', '故事段落不存在');
    return db.storySegment.update({
      where: { id: segmentId },
      data: { state: 'approved' },
    });
  });
}
