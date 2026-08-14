import {
  STORY_TO_VIDEO_STEPS,
  applyReviewDecision,
  completeWorkflowStep,
  createStoryToVideoState,
  currentWorkflowStep,
  enterReview,
  isReviewStep,
  type ReviewStep,
  type StageAutomation,
  type StoryToVideoStep,
  type StoryToVideoWorkflowState,
  type WorkflowReviewAction,
} from '@zivith/domain';
import { Prisma, type PrismaClient } from '@zivith/database';
import { ApiError } from '../../errors.js';
import { scopedLockKey } from './scoped-recompute.js';

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function recordJson(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseState(value: Prisma.JsonValue): StoryToVideoWorkflowState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(500, 'INVALID_WORKFLOW_STATE', '工作流状态已损坏');
  }
  const state = value as Record<string, unknown>;
  if (
    state.version !== 1 ||
    typeof state.current_step_index !== 'number' ||
    typeof state.revision !== 'number'
  ) {
    throw new ApiError(500, 'INVALID_WORKFLOW_STATE', '工作流状态已损坏');
  }
  return {
    version: 1,
    current_step_index: state.current_step_index,
    awaiting_review:
      typeof state.awaiting_review === 'string' ? (state.awaiting_review as ReviewStep) : null,
    automation: state.automation && typeof state.automation === 'object' ? state.automation : {},
    revision: state.revision,
    feedback: typeof state.feedback === 'string' ? state.feedback : undefined,
  };
}

export interface StartWorkflowInput {
  brief: string;
  story_id?: string | undefined;
  automation?: StageAutomation | undefined;
}

export interface SubmitReviewInput {
  step: ReviewStep;
  action: WorkflowReviewAction;
  feedback?: string | undefined;
  /** When set on story_review, approve/retry applies to one StorySegment only. */
  segment_id?: string | undefined;
  /** When set on scene_review, approve applies to one Scene only. */
  scene_id?: string | undefined;
}

export class WorkflowOrchestrator {
  constructor(private readonly db: PrismaClient) {}

  async start(projectId: string, actorId: string, input: StartWorkflowInput) {
    const state = createStoryToVideoState(input.automation);
    const run = await this.db.workflowRun.create({
      data: {
        projectId,
        type: 'story_to_video',
        status: 'queued',
        input: json(input),
        state: json(state),
        steps: {
          create: STORY_TO_VIDEO_STEPS.map((name, order) => ({
            name,
            order,
            status: 'queued',
            input: json({}),
          })),
        },
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    await this.audit(actorId, projectId, run.id, 'workflow.start', undefined, run);
    return run;
  }

  async beginNextStep(runId: string) {
    return this.db.$transaction(async (tx) => {
      const run = await tx.workflowRun.findUnique({
        where: { id: runId },
        include: { steps: { orderBy: { order: 'asc' } } },
      });
      if (!run) throw new ApiError(404, 'WORKFLOW_NOT_FOUND', '工作流不存在');
      if (run.status === 'cancelled' || run.status === 'failed' || run.status === 'completed') {
        throw new ApiError(409, 'WORKFLOW_TERMINAL', '工作流已结束');
      }

      let state = parseState(run.state);
      let stepName = currentWorkflowStep(state);
      while (stepName && isReviewStep(stepName)) {
        state = enterReview(state, stepName);
        if (state.awaiting_review) {
          await tx.workflowStep.update({
            where: {
              workflowRunId_order: { workflowRunId: runId, order: state.current_step_index },
            },
            data: { status: 'running', startedAt: new Date() },
          });
          await tx.workflowRun.update({
            where: { id: runId },
            data: { status: 'running', state: json(state) },
          });
          return { kind: 'awaiting_review' as const, step: stepName, state };
        }
        await tx.workflowStep.update({
          where: {
            workflowRunId_order: {
              workflowRunId: runId,
              order: state.current_step_index - 1,
            },
          },
          data: { status: 'completed', completedAt: new Date() },
        });
        stepName = currentWorkflowStep(state);
      }

      if (!stepName) {
        await tx.workflowRun.update({
          where: { id: runId },
          data: { status: 'completed', state: json(state) },
        });
        return { kind: 'completed' as const, state };
      }

      const step = await tx.workflowStep.update({
        where: {
          workflowRunId_order: {
            workflowRunId: runId,
            order: state.current_step_index,
          },
        },
        data: { status: 'running', startedAt: new Date() },
      });
      await tx.workflowRun.update({
        where: { id: runId },
        data: { status: 'running', state: json(state) },
      });
      return { kind: 'step' as const, step, state };
    });
  }

  async completeStep(runId: string, step: StoryToVideoStep, output: unknown) {
    return this.db.$transaction(async (tx) => {
      const run = await tx.workflowRun.findUnique({ where: { id: runId } });
      if (!run) throw new ApiError(404, 'WORKFLOW_NOT_FOUND', '工作流不存在');
      const state = parseState(run.state);
      if (isReviewStep(step)) {
        throw new ApiError(409, 'REVIEW_DECISION_REQUIRED', '审核步骤必须由用户明确处理');
      }
      let nextState: StoryToVideoWorkflowState;
      try {
        nextState = completeWorkflowStep(state, step);
      } catch (error) {
        throw new ApiError(409, 'WORKFLOW_STEP_MISMATCH', (error as Error).message);
      }
      await tx.workflowStep.update({
        where: { workflowRunId_order: { workflowRunId: runId, order: state.current_step_index } },
        data: { status: 'completed', output: json(output), completedAt: new Date() },
      });
      await tx.workflowRun.update({ where: { id: runId }, data: { state: json(nextState) } });
      return nextState;
    });
  }

  async review(runId: string, actorId: string, input: SubmitReviewInput) {
    const before = await this.db.workflowRun.findUnique({ where: { id: runId } });
    if (!before) throw new ApiError(404, 'WORKFLOW_NOT_FOUND', '工作流不存在');
    const state = parseState(before.state);
    let nextState: StoryToVideoWorkflowState;
    try {
      nextState = applyReviewDecision(state, input.step, input.action, input.feedback);
    } catch (error) {
      throw new ApiError(409, 'REVIEW_NOT_PENDING', (error as Error).message);
    }

    const approved = input.action === 'approve' || input.action === 'approve_all';
    const reviewOrder = state.current_step_index;
    const run = await this.db.$transaction(async (tx) => {
      await tx.workflowStep.update({
        where: { workflowRunId_order: { workflowRunId: runId, order: reviewOrder } },
        data: approved
          ? { status: 'completed', completedAt: new Date(), output: json({ action: input.action }) }
          : {
              status: 'queued',
              startedAt: null,
              completedAt: null,
              output: Prisma.JsonNull,
            },
      });
      if (!approved) {
        await tx.workflowStep.update({
          where: {
            workflowRunId_order: {
              workflowRunId: runId,
              order: nextState.current_step_index,
            },
          },
          data: {
            status: 'queued',
            startedAt: null,
            completedAt: null,
            input: json({ feedback: input.feedback ?? null, action: input.action }),
          },
        });
      }
      return tx.workflowRun.update({
        where: { id: runId },
        data: { status: 'queued', state: json(nextState) },
        include: { steps: { orderBy: { order: 'asc' } } },
      });
    });
    await this.audit(
      actorId,
      run.projectId,
      run.id,
      `workflow.review.${input.action}`,
      before,
      run,
    );
    return run;
  }

  async cancel(runId: string, actorId: string) {
    const before = await this.db.workflowRun.findUnique({ where: { id: runId } });
    if (!before) throw new ApiError(404, 'WORKFLOW_NOT_FOUND', '工作流不存在');
    if (before.status === 'completed' || before.status === 'cancelled') {
      throw new ApiError(409, 'WORKFLOW_TERMINAL', '工作流已结束');
    }
    const run = await this.db.$transaction(async (tx) => {
      await tx.workflowStep.updateMany({
        where: { workflowRunId: runId, status: { in: ['queued', 'running'] } },
        data: { status: 'cancelled', completedAt: new Date() },
      });
      return tx.workflowRun.update({ where: { id: runId }, data: { status: 'cancelled' } });
    });
    await this.audit(actorId, run.projectId, run.id, 'workflow.cancel', before, run);
    return run;
  }

  async recoverInterruptedRuns(): Promise<number> {
    const interrupted = await this.db.workflowRun.findMany({
      where: { type: 'story_to_video', status: 'running' },
      select: { id: true },
    });
    for (const run of interrupted) {
      await this.db.$transaction([
        this.db.workflowStep.updateMany({
          where: { workflowRunId: run.id, status: 'running' },
          data: { status: 'queued', startedAt: null },
        }),
        this.db.workflowRun.update({ where: { id: run.id }, data: { status: 'queued' } }),
      ]);
    }
    return interrupted.length;
  }

  /**
   * Resolve the latest story-to-video run for a project that matches the story
   * (when storyId provided) and owns the named step.
   */
  async findScopedRun(projectId: string, stepName: string, storyId?: string) {
    const runs = await this.db.workflowRun.findMany({
      where: {
        projectId,
        type: 'story_to_video',
        status: { notIn: ['cancelled', 'failed'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    for (const run of runs) {
      const step = run.steps.find((item) => item.name === stepName);
      if (!step) continue;
      if (storyId) {
        const storyOutput = recordJson(run.steps.find((item) => item.name === 'story')?.output);
        const runStoryId =
          typeof storyOutput.story_id === 'string' ? storyOutput.story_id : undefined;
        if (runStoryId !== storyId) continue;
      }
      return { run, step };
    }
    return null;
  }

  async beginScopedRecompute(input: {
    projectId: string;
    stepName: 'visual_prep' | 'prompt' | 'video';
    entityType: 'scene' | 'shot';
    entityId: string;
    inputHash: string;
    actorId: string;
    storyId?: string;
    usage?: unknown;
  }) {
    const resolved = await this.findScopedRun(input.projectId, input.stepName, input.storyId);
    if (!resolved) {
      throw new ApiError(
        409,
        'WORKFLOW_STEP_NOT_READY',
        '尚未找到可局部重跑的工作流步骤，请先启动故事到视频工作流',
      );
    }
    const { run, step } = resolved;
    if (step.status === 'queued' && step.order > 0) {
      const priorIncomplete = run.steps.some(
        (item) => item.order < step.order && item.status !== 'completed',
      );
      if (priorIncomplete) {
        throw new ApiError(
          409,
          'WORKFLOW_STEP_NOT_READY',
          `步骤「${input.stepName}」尚未执行，无法局部重跑`,
        );
      }
    }

    const lockKey = scopedLockKey(input.stepName, input.entityType, input.entityId);
    const result = await this.db.$transaction(async (tx) => {
      const fresh = await tx.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
      const raw = recordJson(fresh.state);
      const locks = recordJson(raw.scoped_locks);
      if (typeof locks[lockKey] === 'string') {
        throw new ApiError(
          409,
          'RECOMPUTE_IN_PROGRESS',
          '该实体已有进行中的局部重跑，请稍后再试',
        );
      }
      const last = await tx.workflowStepAttempt.findFirst({
        where: { workflowStepId: step.id },
        orderBy: { attempt: 'desc' },
        select: { attempt: true },
      });
      const attemptNumber = (last?.attempt ?? 0) + 1;
      const attempt = await tx.workflowStepAttempt.create({
        data: {
          workflowStepId: step.id,
          attempt: attemptNumber,
          status: 'running',
          inputHash: input.inputHash,
          usage: json({
            scope: {
              entity_type: input.entityType,
              entity_id: input.entityId,
              kind: input.stepName,
            },
            ...(input.usage && typeof input.usage === 'object' ? input.usage : {}),
          }),
          startedAt: new Date(),
        },
      });
      await tx.workflowRun.update({
        where: { id: run.id },
        data: {
          state: json({
            ...raw,
            scoped_locks: { ...locks, [lockKey]: attempt.id },
          }),
        },
      });
      return { run: fresh, step, attempt, lockKey };
    });

    await this.audit(
      input.actorId,
      input.projectId,
      run.id,
      `workflow.recompute.${input.stepName}.begin`,
      undefined,
      {
        attempt_id: result.attempt.id,
        entity_type: input.entityType,
        entity_id: input.entityId,
        input_hash: input.inputHash,
      },
    );
    return result;
  }

  async finishScopedRecompute(input: {
    runId: string;
    attemptId: string;
    lockKey: string;
    status: 'completed' | 'failed';
    provider?: string | undefined;
    model?: string | undefined;
    usage?: unknown;
    errorCode?: string | undefined;
    errorMessage?: string | undefined;
  }) {
    await this.db.$transaction(async (tx) => {
      const attempt = await tx.workflowStepAttempt.findUnique({
        where: { id: input.attemptId },
      });
      if (!attempt) return;
      const existingUsage = recordJson(attempt.usage);
      await tx.workflowStepAttempt.update({
        where: { id: input.attemptId },
        data: {
          status: input.status,
          finishedAt: new Date(),
          ...(input.provider !== undefined ? { provider: input.provider } : {}),
          ...(input.model !== undefined ? { model: input.model } : {}),
          ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
          ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
          usage: json({
            ...existingUsage,
            ...(input.usage && typeof input.usage === 'object'
              ? (input.usage as Record<string, unknown>)
              : {}),
          }),
        },
      });
      const run = await tx.workflowRun.findUnique({ where: { id: input.runId } });
      if (!run) return;
      const raw = recordJson(run.state);
      const locks = { ...recordJson(raw.scoped_locks) };
      if (locks[input.lockKey] === input.attemptId) {
        delete locks[input.lockKey];
      }
      await tx.workflowRun.update({
        where: { id: input.runId },
        data: { state: json({ ...raw, scoped_locks: locks }) },
      });
    });
  }

  /** Merge entity-scoped ids into an existing completed step output without advancing the run. */
  async mergeStepOutput(runId: string, stepName: string, patch: Record<string, unknown>) {
    const run = await this.db.workflowRun.findUnique({
      where: { id: runId },
      include: { steps: true },
    });
    if (!run) throw new ApiError(404, 'WORKFLOW_NOT_FOUND', '工作流不存在');
    const step = run.steps.find((item) => item.name === stepName);
    if (!step) throw new ApiError(404, 'WORKFLOW_STEP_NOT_FOUND', '工作流步骤不存在');
    const current = recordJson(step.output);
    const merged: Record<string, unknown> = { ...current, ...patch };
    for (const key of Object.keys(patch)) {
      const next = patch[key];
      const prev = current[key];
      if (Array.isArray(next) && Array.isArray(prev)) {
        merged[key] = [...new Set([...prev, ...next])];
      }
    }
    await this.db.workflowStep.update({
      where: { id: step.id },
      data: { output: json(merged) },
    });
    return merged;
  }

  private async audit(
    actorId: string,
    projectId: string,
    runId: string,
    action: string,
    before?: unknown,
    after?: unknown,
  ): Promise<void> {
    await this.db.auditLog.create({
      data: {
        actorId,
        projectId,
        entityType: 'workflow_run',
        entityId: runId,
        action,
        ...(before === undefined ? {} : { before: json(before) }),
        ...(after === undefined ? {} : { after: json(after) }),
      },
    });
  }
}
