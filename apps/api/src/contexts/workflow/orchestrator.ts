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

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

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
    automation:
      state.automation && typeof state.automation === 'object'
        ? (state.automation as StageAutomation)
        : {},
    revision: state.revision,
    feedback: typeof state.feedback === 'string' ? state.feedback : undefined,
  };
}

export interface StartWorkflowInput {
  brief: string;
  story_id?: string;
  automation?: StageAutomation;
}

export interface SubmitReviewInput {
  step: ReviewStep;
  action: WorkflowReviewAction;
  feedback?: string;
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
            where: { workflowRunId_order: { workflowRunId: runId, order: state.current_step_index } },
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
    await this.audit(actorId, run.projectId, run.id, `workflow.review.${input.action}`, before, run);
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
        before: before === undefined ? undefined : json(before),
        after: after === undefined ? undefined : json(after),
      },
    });
  }
}
