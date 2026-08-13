import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { z } from 'zod';
import { MockWorkflowRunner } from '../contexts/workflow/mock-runner.js';
import { WorkflowOrchestrator } from '../contexts/workflow/orchestrator.js';
import { GenerationService } from '../contexts/generation/service.js';
import { ApiError } from '../errors.js';
import { ensureProjectMember } from '../contexts/world/local-user.js';

const automationLevel = z.enum(['full_manual', 'assisted', 'semi_auto', 'full_auto']);
const startWorkflowSchema = z
  .object({
    project_id: z.string().uuid(),
    brief: z.string().trim().min(10).max(50_000),
    story_id: z.string().uuid().optional(),
    automation: z
      .object({
        story: automationLevel.optional(),
        scene: automationLevel.optional(),
        visual_assets: automationLevel.optional(),
        shot: automationLevel.optional(),
        prompt: automationLevel.optional(),
        video: automationLevel.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const runParams = z.object({ runId: z.string().uuid() });
const projectParams = z.object({ projectId: z.string().uuid() });
const listRunsQuery = z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) });
const reviewSchema = z
  .object({
    step: z.enum([
      'story_review',
      'scene_review',
      'visual_assets_review',
      'shot_review',
      'prompt_review',
      'video_review',
    ]),
    action: z.enum(['approve', 'approve_all', 'reject', 'retry', 'retry_with_feedback']),
    feedback: z.string().trim().min(1).max(20_000).optional(),
    segment_id: z.string().uuid().optional(),
    scene_id: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === 'retry_with_feedback' && !value.feedback) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['feedback'],
        message: '带反馈重试时必须填写反馈',
      });
    }
    if (value.segment_id && value.step !== 'story_review') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['segment_id'],
        message: 'segment_id 仅用于故事审核闸',
      });
    }
    if (value.scene_id && value.step !== 'scene_review') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scene_id'],
        message: 'scene_id 仅用于场景审核闸',
      });
    }
  });

async function requireProjectMember(
  db: PrismaClient,
  userId: string,
  projectId: string,
  write = false,
): Promise<void> {
  await ensureProjectMember(db, userId, projectId, write);
}

async function getRunForMember(db: PrismaClient, userId: string, runId: string, write = false) {
  const run = await db.workflowRun.findUnique({
    where: { id: runId },
    include: { steps: { orderBy: { order: 'asc' } } },
  });
  if (!run) throw new ApiError(404, 'WORKFLOW_NOT_FOUND', '工作流不存在');
  await requireProjectMember(db, userId, run.projectId, write);
  return run;
}

export function registerWorkflowRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  orchestrator = new WorkflowOrchestrator(db),
  runnerOrFactory: MockWorkflowRunner | (() => MockWorkflowRunner) = () =>
    new MockWorkflowRunner(db, orchestrator, new GenerationService(db)),
): void {
  const runner = () =>
    typeof runnerOrFactory === 'function' ? runnerOrFactory() : runnerOrFactory;
  app.get('/projects/:projectId/workflows', async (request) => {
    const { projectId } = projectParams.parse(request.params);
    const { limit } = listRunsQuery.parse(request.query);
    await requireProjectMember(db, request.user.sub, projectId);
    return db.workflowRun.findMany({
      where: { projectId, type: 'story_to_video' },
      include: { steps: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  });

  app.post('/workflows/story-to-video', async (request, reply) => {
    const body = startWorkflowSchema.parse(request.body);
    await requireProjectMember(db, request.user.sub, body.project_id, true);
    if (body.story_id) {
      const story = await db.story.findFirst({
        where: { id: body.story_id, projectId: body.project_id, deletedAt: null },
        select: { id: true },
      });
      if (!story) throw new ApiError(404, 'STORY_NOT_FOUND', '故事不存在');
    }
    const run = await orchestrator.start(body.project_id, request.user.sub, {
      brief: body.brief,
      ...(body.story_id ? { story_id: body.story_id } : {}),
      ...(body.automation ? { automation: body.automation } : {}),
    });
    return reply.status(202).send(await runner().runUntilGate(run.id, request.user.sub));
  });

  app.get('/workflows/:runId', async (request) => {
    const { runId } = runParams.parse(request.params);
    return getRunForMember(db, request.user.sub, runId);
  });

  app.post('/workflows/:runId/review', async (request) => {
    const { runId } = runParams.parse(request.params);
    const body = reviewSchema.parse(request.body);
    await getRunForMember(db, request.user.sub, runId, true);
    return runner().submitReview(runId, request.user.sub, body);
  });

  app.post('/workflows/:runId/cancel', async (request) => {
    const { runId } = runParams.parse(request.params);
    await getRunForMember(db, request.user.sub, runId, true);
    return orchestrator.cancel(runId, request.user.sub);
  });
}

export { reviewSchema, startWorkflowSchema };
