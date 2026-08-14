import { createHash, randomUUID as cryptoRandomUuid } from 'node:crypto';
import {
  asId,
  CHARACTER_SHEET_TURNAROUND_KEY,
  CHARACTER_SHEET_VARIANTS,
  type AgentContext,
  type AutomationLevel,
  type StageAutomation,
} from '@zivith/domain';
import { Prisma, type PrismaClient } from '@zivith/database';
import type { GenerationService } from '../generation/service.js';
import { QueueWorkBridge } from '../generation/queue-work-bridge.js';
import { ApiError } from '../../errors.js';
import { ensureProjectMember } from '../world/local-user.js';
import { AgentRuntime } from '../agent/runtime.js';
import { AssetAgent } from '../agent/asset-agent.js';
import { PromptAgent, type PromptAgentInput } from '../agent/prompt-agent.js';
import { SceneAgent, type GeneratedScenes } from '../agent/scene-agent.js';
import { ShotAgent, type ShotAgentScene, type ShotAgentOutput } from '../agent/shot-agent.js';
import { StoryAgent, type GeneratedStory } from '../agent/story-agent.js';
import { VisualPrepAgent, type VisualPrepScene } from '../agent/visual-prep-agent.js';
import { enrichVisualAssetTraits, mergeVisualPromptIntoAssetData } from '../agent/visual-trait.js';
import {
  ensureCharacterSheetVariants,
  ensureDefaultAppearanceVariant,
} from '../visual/appearance-variants.js';
import { createProviderBundle, type ProviderBundle } from '../../providers/registry.js';
import type { LLMAdapter } from '../../ports/llm.js';
import type { SubmitReviewInput, WorkflowOrchestrator } from './orchestrator.js';
import {
  markSceneDownstreamPromptsStale,
  markSceneVisualsStale,
  markShotPromptStale,
  sceneVisualInputSnapshot,
  shotPromptInputSnapshot,
  shotVideoInputSnapshot,
  stableInputHash,
} from './scoped-recompute.js';
import { withUsageContext } from '../usage/context.js';

type WorkflowWithSteps = Awaited<ReturnType<MockWorkflowRunner['getRun']>>;

function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex
    .slice(12, 16)
    .join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class MockWorkflowRunner {
  private readonly runtime = new AgentRuntime();
  private readonly storyAgent: StoryAgent;
  private readonly sceneAgent: SceneAgent;
  private readonly assetAgent = new AssetAgent();
  private readonly visualPrepAgent = new VisualPrepAgent();
  private readonly shotAgent = new ShotAgent();
  private readonly promptAgent = new PromptAgent();
  private readonly generationService: GenerationService;
  private readonly imageModel: string;
  private readonly llm: LLMAdapter;
  private readonly llmModel: string;
  private readonly providers: ProviderBundle;
  private readonly queueWork: QueueWorkBridge;

  constructor(
    private readonly db: PrismaClient,
    private readonly orchestrator: WorkflowOrchestrator,
    generationService: GenerationService,
    providers: ProviderBundle = createProviderBundle(),
    queueWork?: QueueWorkBridge,
  ) {
    this.providers = providers;
    this.storyAgent = new StoryAgent(providers.llm, providers.llmModel);
    this.sceneAgent = new SceneAgent(providers.llm, providers.llmModel);
    this.generationService = generationService;
    this.imageModel = providers.imageModel;
    this.llm = providers.llm;
    this.llmModel = providers.llmModel;
    this.queueWork = queueWork ?? QueueWorkBridge.createLocal();
  }

  async runUntilGate(runId: string, userId: string): Promise<WorkflowWithSteps> {
    const seed = await this.getRun(runId);
    return withUsageContext({ projectId: seed.projectId }, () =>
      this.runUntilGateInner(runId, userId),
    );
  }

  private async runUntilGateInner(runId: string, userId: string): Promise<WorkflowWithSteps> {
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const run = await this.getRun(runId);
      const nextQueued = run.steps.find((step) => step.status === 'queued');
      if (!nextQueued) {
        const hasRunningStep = run.steps.some((step) => step.status === 'running');
        if (!hasRunningStep && (run.status === 'queued' || run.status === 'running')) {
          await this.orchestrator.beginNextStep(runId);
          return this.getRun(runId);
        }
        return run;
      }
      const supported =
        nextQueued.name === 'story' ||
        nextQueued.name === 'scene' ||
        nextQueued.name === 'visual_prep' ||
        nextQueued.name === 'shot' ||
        nextQueued.name === 'prompt' ||
        nextQueued.name === 'video' ||
        nextQueued.name.endsWith('_review');
      if (!supported) return run;

      const claim = await this.orchestrator.beginNextStep(runId);
      if (claim.kind !== 'step') return this.getRun(runId);

      if (claim.step.name === 'story') {
        await this.executeStory(run, userId);
      } else if (claim.step.name === 'scene') {
        await this.approveArtifacts(run.id, 'story_review');
        await this.executeScenes(run, userId);
      } else if (claim.step.name === 'visual_prep') {
        await this.approveArtifacts(run.id, 'scene_review');
        await this.executeVisualPrep(run, userId);
      } else if (claim.step.name === 'shot') {
        await this.executeShots(run, userId);
      } else if (claim.step.name === 'prompt') {
        await this.executePrompts(run, userId);
      } else if (claim.step.name === 'video') {
        await this.executeVideos(run);
      } else {
        await this.releaseUnsupportedStep(run.id, claim.step.order);
        return this.getRun(runId);
      }
    }
    throw new ApiError(500, 'WORKFLOW_LOOP_LIMIT', '工作流自动推进次数超出限制');
  }

  async submitReview(
    runId: string,
    userId: string,
    input: SubmitReviewInput,
  ): Promise<WorkflowWithSteps> {
    if (input.step === 'story_review' && input.segment_id) {
      return this.submitStorySegmentReview(runId, userId, input);
    }
    if (input.step === 'scene_review' && input.scene_id) {
      return this.submitSceneReview(runId, userId, input);
    }

    const approving = input.action === 'approve' || input.action === 'approve_all';
    if (approving && input.step === 'story_review') {
      await this.assertStorySegmentsApproved(runId);
    }
    if (approving && input.step === 'scene_review') {
      await this.assertScenesApproved(runId);
    }
    if (approving && input.step === 'visual_assets_review') {
      const before = await this.getRun(runId);
      const requirementIds = record(
        before.steps.find((step) => step.name === 'visual_prep')?.output,
      ).requirement_ids;
      const ids = Array.isArray(requirementIds)
        ? requirementIds.filter((id): id is string => typeof id === 'string')
        : [];
      const unapproved = await this.db.visualAssetRequirement.count({
        where: {
          id: { in: ids },
          required: true,
          OR: [{ status: { not: 'approved' } }, { approvedMediaId: null }],
          deletedAt: null,
        },
      });
      if (ids.length === 0 || unapproved > 0) {
        throw new ApiError(
          409,
          'VISUAL_ASSETS_NOT_APPROVED',
          '所有必需角色与地点图片审核通过后才能继续',
        );
      }
    }
    if (approving && input.step === 'prompt_review') {
      const before = await this.getRun(runId);
      const promptIds = record(
        before.steps.find((step) => step.name === 'prompt')?.output,
      ).prompt_version_ids;
      const ids = Array.isArray(promptIds)
        ? promptIds.filter((id): id is string => typeof id === 'string')
        : [];
      const prompts = await this.db.promptVersion.findMany({
        where: { id: { in: ids } },
        include: { shot: { select: { prompt: true } } },
      });
      const invalid = prompts.some((prompt) => {
        const current = record(prompt.shot.prompt);
        return (
          !prompt.approvedAt ||
          current.positive !== prompt.positive ||
          (typeof current.negative === 'string' ? current.negative : null) !==
            (prompt.negative ?? null)
        );
      });
      if (ids.length === 0 || prompts.length !== ids.length || invalid) {
        throw new ApiError(
          409,
          'PROMPTS_NOT_APPROVED',
          '所有镜头提示词必须逐一审核通过后才能生成视频',
        );
      }
    }
    await this.orchestrator.review(runId, userId, input);
    if (approving) {
      await this.approveArtifacts(runId, input.step);
      return this.runUntilGate(runId, userId);
    }
    return this.runUntilGate(runId, userId);
  }

  async getRun(runId: string) {
    const run = await this.db.workflowRun.findUnique({
      where: { id: runId },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    if (!run) throw new ApiError(404, 'WORKFLOW_NOT_FOUND', '工作流不存在');
    return run;
  }

  async recomputeVisualPrep(sceneId: string, userId: string) {
    const scene = await this.db.scene.findFirst({
      where: { id: sceneId, deletedAt: null },
      include: { story: { select: { id: true, projectId: true } } },
    });
    if (!scene) throw new ApiError(404, 'SCENE_NOT_FOUND', '场景不存在');
    await this.assertProjectEditor(scene.story.projectId, userId);
    return withUsageContext({ projectId: scene.story.projectId, taskType: 'image_generate' }, () =>
      this.recomputeVisualPrepInner(scene, userId),
    );
  }

  private async recomputeVisualPrepInner(
    scene: {
      id: string;
      title: string;
      description: string | null;
      time: string | null;
      weather: string | null;
      mood: string | null;
      locationId: string | null;
      characterIds: string[];
      overrides: unknown;
      story: { id: string; projectId: string };
    },
    userId: string,
  ) {
    const sceneId = scene.id;
    const inputHash = stableInputHash(sceneVisualInputSnapshot(scene));
    const staleRequirements = await markSceneVisualsStale(this.db, sceneId);
    const staleShots = await markSceneDownstreamPromptsStale(this.db, sceneId);

    const scoped = await this.orchestrator.beginScopedRecompute({
      projectId: scene.story.projectId,
      stepName: 'visual_prep',
      entityType: 'scene',
      entityId: sceneId,
      inputHash,
      actorId: userId,
      storyId: scene.story.id,
      usage: { stale_requirements: staleRequirements, stale_shots: staleShots },
    });

    try {
      const run = await this.getRun(scoped.run.id);
      const result = await this.executeVisualPrep(run, userId, {
        sceneIds: [sceneId],
        advance: false,
        preserveApproved: true,
      });
      await this.orchestrator.finishScopedRecompute({
        runId: scoped.run.id,
        attemptId: scoped.attempt.id,
        lockKey: scoped.lockKey,
        status: 'completed',
        provider: this.providers.selection.image,
        model: this.imageModel,
        usage: {
          requirement_ids: result.requirementIds,
          input_hash: inputHash,
          identical_input_attempt: await this.findIdenticalAttempt(
            scoped.step.id,
            inputHash,
            scoped.attempt.id,
          ),
        },
      });
      return {
        run_id: scoped.run.id,
        attempt_id: scoped.attempt.id,
        attempt: scoped.attempt.attempt,
        input_hash: inputHash,
        requirement_ids: result.requirementIds,
        stale_requirements: staleRequirements,
        stale_shots: staleShots,
      };
    } catch (error) {
      await this.orchestrator.finishScopedRecompute({
        runId: scoped.run.id,
        attemptId: scoped.attempt.id,
        lockKey: scoped.lockKey,
        status: 'failed',
        provider: this.providers.selection.image,
        model: this.imageModel,
        errorCode: error instanceof ApiError ? error.code : 'RECOMPUTE_FAILED',
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error),
      });
      throw error;
    }
  }

  async recomputePrompt(shotId: string, userId: string) {
    const shot = await this.db.shot.findFirst({
      where: { id: shotId, deletedAt: null },
      include: {
        scene: { include: { story: { select: { id: true, projectId: true } } } },
      },
    });
    if (!shot) throw new ApiError(404, 'SHOT_NOT_FOUND', '镜头不存在');
    await this.assertProjectEditor(shot.scene.story.projectId, userId);
    if (shot.state === 'approved') {
      throw new ApiError(409, 'SHOT_APPROVED', '已批准镜头的提示词不可局部重跑，请先解冻');
    }
    return withUsageContext({ projectId: shot.scene.story.projectId, taskType: 'llm' }, () =>
      this.recomputePromptInner(shot, userId),
    );
  }

  private async recomputePromptInner(
    shot: {
      id: string;
      state: string;
      camera: unknown;
      composition: unknown;
      lighting: unknown;
      color: unknown;
      mood: string | null;
      characters: unknown;
      dialogue: unknown;
      action: unknown;
      style: unknown;
      prompt: unknown;
      scene: { story: { id: string; projectId: string } };
    },
    userId: string,
  ) {
    const shotId = shot.id;
    const inputHash = stableInputHash(shotPromptInputSnapshot(shot));
    await markShotPromptStale(this.db, shotId);

    const scoped = await this.orchestrator.beginScopedRecompute({
      projectId: shot.scene.story.projectId,
      stepName: 'prompt',
      entityType: 'shot',
      entityId: shotId,
      inputHash,
      actorId: userId,
      storyId: shot.scene.story.id,
    });

    try {
      const run = await this.getRun(scoped.run.id);
      const result = await this.executePrompts(run, userId, {
        shotIds: [shotId],
        advance: false,
      });
      await this.orchestrator.finishScopedRecompute({
        runId: scoped.run.id,
        attemptId: scoped.attempt.id,
        lockKey: scoped.lockKey,
        status: 'completed',
        provider: this.providers.selection.llm,
        model: this.llmModel,
        usage: {
          prompt_version_ids: result.promptVersionIds,
          input_hash: inputHash,
          identical_input_attempt: await this.findIdenticalAttempt(
            scoped.step.id,
            inputHash,
            scoped.attempt.id,
          ),
        },
      });
      return {
        run_id: scoped.run.id,
        attempt_id: scoped.attempt.id,
        attempt: scoped.attempt.attempt,
        input_hash: inputHash,
        prompt_version_ids: result.promptVersionIds,
      };
    } catch (error) {
      await this.orchestrator.finishScopedRecompute({
        runId: scoped.run.id,
        attemptId: scoped.attempt.id,
        lockKey: scoped.lockKey,
        status: 'failed',
        provider: this.providers.selection.llm,
        model: this.llmModel,
        errorCode: error instanceof ApiError ? error.code : 'RECOMPUTE_FAILED',
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error),
      });
      throw error;
    }
  }

  async recomputeVideo(shotId: string, userId: string) {
    const shot = await this.db.shot.findFirst({
      where: { id: shotId, deletedAt: null },
      include: {
        scene: { include: { story: { select: { id: true, projectId: true } } } },
      },
    });
    if (!shot) throw new ApiError(404, 'SHOT_NOT_FOUND', '镜头不存在');
    await this.assertProjectEditor(shot.scene.story.projectId, userId);
    if (shot.state === 'approved') {
      throw new ApiError(409, 'SHOT_APPROVED', '已批准镜头不可局部重跑视频，请先解冻');
    }

    const approvedPrompt = await this.db.promptVersion.findFirst({
      where: { shotId, approvedAt: { not: null } },
      orderBy: { approvedAt: 'desc' },
    });
    if (!approvedPrompt) {
      throw new ApiError(409, 'PROMPT_NOT_APPROVED', '请先审核通过提示词再重跑视频');
    }

    return withUsageContext(
      { projectId: shot.scene.story.projectId, taskType: 'video_generate' },
      () => this.recomputeVideoInner(shot, userId),
    );
  }

  private async recomputeVideoInner(
    shot: {
      id: string;
      prompt: unknown;
      scene: { story: { id: string; projectId: string } };
    },
    userId: string,
  ) {
    const shotId = shot.id;
    const inputHash = stableInputHash(shotVideoInputSnapshot(shot));
    const scoped = await this.orchestrator.beginScopedRecompute({
      projectId: shot.scene.story.projectId,
      stepName: 'video',
      entityType: 'shot',
      entityId: shotId,
      inputHash,
      actorId: userId,
      storyId: shot.scene.story.id,
    });

    try {
      const run = await this.getRun(scoped.run.id);
      const result = await this.executeVideos(run, {
        shotIds: [shotId],
        advance: false,
      });
      await this.orchestrator.finishScopedRecompute({
        runId: scoped.run.id,
        attemptId: scoped.attempt.id,
        lockKey: scoped.lockKey,
        status: 'completed',
        provider: this.providers.selection.video,
        model: this.providers.videoModel,
        usage: {
          output_ids: result.outputIds,
          input_hash: inputHash,
          identical_input_attempt: await this.findIdenticalAttempt(
            scoped.step.id,
            inputHash,
            scoped.attempt.id,
          ),
        },
      });
      return {
        run_id: scoped.run.id,
        attempt_id: scoped.attempt.id,
        attempt: scoped.attempt.attempt,
        input_hash: inputHash,
        output_ids: result.outputIds,
      };
    } catch (error) {
      await this.orchestrator.finishScopedRecompute({
        runId: scoped.run.id,
        attemptId: scoped.attempt.id,
        lockKey: scoped.lockKey,
        status: 'failed',
        provider: this.providers.selection.video,
        model: this.providers.videoModel,
        errorCode: error instanceof ApiError ? error.code : 'RECOMPUTE_FAILED',
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error),
      });
      throw error;
    }
  }

  private async findIdenticalAttempt(
    stepId: string,
    inputHash: string,
    excludeAttemptId: string,
  ): Promise<string | null> {
    const prior = await this.db.workflowStepAttempt.findFirst({
      where: {
        workflowStepId: stepId,
        inputHash,
        status: 'completed',
        id: { not: excludeAttemptId },
      },
      orderBy: { attempt: 'desc' },
      select: { id: true },
    });
    return prior?.id ?? null;
  }

  private async assertProjectEditor(projectId: string, userId: string): Promise<void> {
    await ensureProjectMember(this.db, userId, projectId, true);
  }

  private async executeStory(run: WorkflowWithSteps, userId: string): Promise<void> {
    const input = record(run.input);
    const result = await this.queueWork.run('workflow_step', `${run.id}:story-agent`, () =>
      this.runtime.execute(
        this.storyAgent,
        {
          brief: asText(input.brief),
          ...(typeof input.language === 'string' ? { language: input.language } : {}),
        },
        this.context(run, userId, 'story'),
      ),
    );
    if (!result.data || result.status === 'failed') {
      throw new ApiError(422, 'STORY_AGENT_FAILED', result.warnings[0]?.message ?? '故事生成失败');
    }

    const storyId =
      typeof input.story_id === 'string' ? input.story_id : deterministicUuid(`${run.id}:story`);
    const count = await this.db.story.count({
      where: { projectId: run.projectId, deletedAt: null, NOT: { id: storyId } },
    });
    await this.db.story.upsert({
      where: { id: storyId },
      create: {
        id: storyId,
        projectId: run.projectId,
        order: count + 1,
        ...this.storyData(result.data),
      },
      update: this.storyData(result.data),
    });
    const segmentIds = await this.persistStorySegments(storyId, result.data.segments);
    await this.orchestrator.completeStep(run.id, 'story', {
      story_id: storyId,
      story: result.data,
      segment_ids: segmentIds,
      agent_metadata: result.metadata,
    });
  }

  private async persistStorySegments(
    storyId: string,
    segments: GeneratedStory['segments'] | undefined,
  ): Promise<string[]> {
    if (!segments || segments.length === 0) {
      // Ungrouped stories: soft-delete any leftover draft segments from prior runs.
      await this.db.storySegment.updateMany({
        where: { storyId, deletedAt: null, state: { not: 'approved' } },
        data: { deletedAt: new Date() },
      });
      return [];
    }

    const ids: string[] = [];
    await this.db.$transaction(async (tx) => {
      for (const [index, segment] of segments.entries()) {
        const id = deterministicUuid(`${storyId}:segment:${index + 1}`);
        ids.push(id);
        await tx.storySegment.upsert({
          where: { id },
          create: {
            id,
            storyId,
            order: index + 1,
            title: segment.title,
            synopsis: segment.synopsis ?? null,
            draft: segment.draft,
            state: 'review',
          },
          update: {
            order: index + 1,
            title: segment.title,
            synopsis: segment.synopsis ?? null,
            draft: segment.draft,
            state: 'review',
            deletedAt: null,
          },
        });
      }
      await tx.storySegment.updateMany({
        where: { storyId, id: { notIn: ids }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await tx.scene.updateMany({
        where: { storyId, segmentId: { notIn: ids }, deletedAt: null },
        data: { segmentId: null },
      });
    });
    return ids;
  }

  private async assertScenesApproved(runId: string): Promise<void> {
    const run = await this.getRun(runId);
    const sceneIds = Array.isArray(
      record(run.steps.find((step) => step.name === 'scene')?.output).scene_ids,
    )
      ? (
          record(run.steps.find((step) => step.name === 'scene')?.output).scene_ids as unknown[]
        ).filter((id): id is string => typeof id === 'string')
      : [];
    if (sceneIds.length === 0) return;
    const scenes = await this.db.scene.findMany({
      where: { id: { in: sceneIds }, deletedAt: null },
      select: { id: true, state: true, title: true },
    });
    const pending = scenes.filter((item) => item.state !== 'approved');
    if (pending.length > 0) {
      throw new ApiError(409, 'SCENES_NOT_APPROVED', '请先逐条审核通过全部场景，再继续', {
        scene_ids: pending.map((item) => item.id),
      });
    }
  }

  private async submitSceneReview(
    runId: string,
    userId: string,
    input: SubmitReviewInput,
  ): Promise<WorkflowWithSteps> {
    void userId;
    const run = await this.getRun(runId);
    const sceneIds = Array.isArray(
      record(run.steps.find((step) => step.name === 'scene')?.output).scene_ids,
    )
      ? (
          record(run.steps.find((step) => step.name === 'scene')?.output).scene_ids as unknown[]
        ).filter((id): id is string => typeof id === 'string')
      : [];
    if (!input.scene_id || !sceneIds.includes(input.scene_id)) {
      throw new ApiError(404, 'SCENE_NOT_FOUND', '场景不存在或不属于本工作流');
    }
    const scene = await this.db.scene.findFirst({
      where: { id: input.scene_id, deletedAt: null },
    });
    if (!scene) throw new ApiError(404, 'SCENE_NOT_FOUND', '场景不存在');

    if (input.action === 'approve' || input.action === 'approve_all') {
      await this.db.scene.update({
        where: { id: scene.id },
        data: { state: 'approved' },
      });
      return this.getRun(runId);
    }

    // Per-scene rewrite is not yet a first-class Scene Agent path; mark review + keep gate open.
    await this.db.scene.update({
      where: { id: scene.id },
      data: { state: 'review' },
    });
    return this.getRun(runId);
  }

  private async assertStorySegmentsApproved(runId: string): Promise<void> {
    const run = await this.getRun(runId);
    const storyId = record(run.steps.find((step) => step.name === 'story')?.output).story_id;
    if (typeof storyId !== 'string') return;
    const segments = await this.db.storySegment.findMany({
      where: { storyId, deletedAt: null },
      select: { id: true, state: true },
    });
    if (segments.length === 0) return;
    const pending = segments.filter((item) => item.state !== 'approved');
    if (pending.length > 0) {
      throw new ApiError(
        409,
        'STORY_SEGMENTS_NOT_APPROVED',
        '请先逐段审核通过全部故事段落，再继续',
        { segment_ids: pending.map((item) => item.id) },
      );
    }
  }

  private async submitStorySegmentReview(
    runId: string,
    userId: string,
    input: SubmitReviewInput,
  ): Promise<WorkflowWithSteps> {
    const run = await this.getRun(runId);
    const storyId = record(run.steps.find((step) => step.name === 'story')?.output).story_id;
    if (typeof storyId !== 'string' || !input.segment_id) {
      throw new ApiError(409, 'STORY_OUTPUT_MISSING', '故事或段落材料缺失');
    }
    const segment = await this.db.storySegment.findFirst({
      where: { id: input.segment_id, storyId, deletedAt: null },
    });
    if (!segment) throw new ApiError(404, 'STORY_SEGMENT_NOT_FOUND', '故事段落不存在');

    if (input.action === 'approve' || input.action === 'approve_all') {
      await this.db.storySegment.update({
        where: { id: segment.id },
        data: { state: 'approved' },
      });
      return this.getRun(runId);
    }

    if (
      input.action === 'retry_with_feedback' ||
      input.action === 'retry' ||
      input.action === 'reject'
    ) {
      const segments = await this.db.storySegment.findMany({
        where: { storyId, deletedAt: null },
        orderBy: { order: 'asc' },
      });
      const story = await this.db.story.findUnique({ where: { id: storyId } });
      if (!story) throw new ApiError(404, 'STORY_NOT_FOUND', '故事不存在');

      const result = await this.queueWork.run(
        'workflow_step',
        `${run.id}:story-segment-rewrite:${segment.id}`,
        () =>
          this.runtime.execute(
            this.storyAgent,
            {
              brief: asText(record(run.input).brief),
              rewrite_segment_order: segment.order,
              rewrite_feedback: input.feedback ?? '请按审核意见重写本段',
              existing_segments: segments.map((item) => ({
                title: item.title,
                ...(item.synopsis ? { synopsis: item.synopsis } : {}),
                draft: item.draft ?? '',
              })),
            },
            this.context(run, userId, 'story'),
          ),
      );
      if (!result.data || result.status === 'failed') {
        throw new ApiError(
          422,
          'STORY_AGENT_FAILED',
          result.warnings[0]?.message ?? '故事段落重写失败',
        );
      }
      const rewritten = result.data.segments?.[segment.order - 1] ?? result.data.segments?.[0];
      if (!rewritten) {
        throw new ApiError(422, 'STORY_SEGMENT_REWRITE_EMPTY', '段落重写未返回内容');
      }
      await this.db.$transaction([
        this.db.storySegment.update({
          where: { id: segment.id },
          data: {
            title: rewritten.title,
            synopsis: rewritten.synopsis ?? null,
            draft: rewritten.draft,
            state: 'review',
          },
        }),
        this.db.story.update({
          where: { id: storyId },
          data: this.storyData(result.data),
        }),
      ]);
      return this.getRun(runId);
    }

    throw new ApiError(400, 'INVALID_SEGMENT_REVIEW_ACTION', '不支持的段落审核动作');
  }

  private async executeScenes(run: WorkflowWithSteps, userId: string): Promise<void> {
    const storyStep = run.steps.find((step) => step.name === 'story');
    const storyId = record(storyStep?.output).story_id;
    if (typeof storyId !== 'string') {
      throw new ApiError(409, 'STORY_OUTPUT_MISSING', 'Story Agent 尚未生成可用故事');
    }
    const story = await this.db.story.findUnique({ where: { id: storyId } });
    if (!story || !story.screenplay) {
      throw new ApiError(409, 'STORY_OUTPUT_MISSING', 'Story Agent 尚未生成可用故事');
    }
    const approvedSegments = await this.db.storySegment.findMany({
      where: { storyId, deletedAt: null, state: 'approved' },
      orderBy: { order: 'asc' },
    });
    const generatedStory: GeneratedStory = {
      title: story.title,
      logline: story.logline ?? '',
      synopsis: story.synopsis ?? '',
      genre: story.genre ?? '',
      theme: story.theme ?? '',
      tone: story.tone ?? '',
      screenplay: story.screenplay,
      ...(approvedSegments.length > 0
        ? {
            segments: approvedSegments.map((segment) => ({
              title: segment.title,
              ...(segment.synopsis ? { synopsis: segment.synopsis } : {}),
              draft: segment.draft ?? '',
            })),
          }
        : {}),
    };
    const result = await this.queueWork.run('workflow_step', `${run.id}:scene-agent`, () =>
      this.runtime.execute(
        this.sceneAgent,
        {
          story: generatedStory,
          ...(approvedSegments.length > 0
            ? {
                segments: approvedSegments.map((segment) => ({
                  order: segment.order,
                  title: segment.title,
                  synopsis: segment.synopsis,
                  draft: segment.draft ?? '',
                })),
              }
            : {}),
        },
        this.context(run, userId, 'scene'),
      ),
    );
    if (!result.data || result.status === 'failed') {
      throw new ApiError(422, 'SCENE_AGENT_FAILED', result.warnings[0]?.message ?? '场景生成失败');
    }

    const segmentIdByOrder = new Map(approvedSegments.map((item) => [item.order, item.id]));
    const sceneIds = await this.persistScenes(
      run.id,
      run.projectId,
      storyId,
      result.data,
      segmentIdByOrder,
    );
    await this.orchestrator.completeStep(run.id, 'scene', {
      story_id: storyId,
      scene_ids: sceneIds,
      scenes: result.data.scenes,
      agent_metadata: result.metadata,
    });
  }

  private async executeVisualPrep(
    run: WorkflowWithSteps,
    userId: string,
    options?: {
      sceneIds?: string[];
      advance?: boolean;
      preserveApproved?: boolean;
    },
  ): Promise<{ requirementIds: string[]; assetIds: string[] }> {
    const sceneStep = run.steps.find((step) => step.name === 'scene');
    const output = record(sceneStep?.output);
    let sceneIds = Array.isArray(output.scene_ids)
      ? output.scene_ids.filter((id): id is string => typeof id === 'string')
      : [];
    let scenes = Array.isArray(output.scenes)
      ? output.scenes.filter(
          (scene): scene is Record<string, unknown> =>
            Boolean(scene) && typeof scene === 'object' && !Array.isArray(scene),
        )
      : [];

    if (options?.sceneIds?.length) {
      const wanted = new Set(options.sceneIds);
      const filtered: Array<{ id: string; meta: Record<string, unknown> }> = [];
      for (const [index, sceneId] of sceneIds.entries()) {
        if (!wanted.has(sceneId)) continue;
        filtered.push({ id: sceneId, meta: scenes[index] ?? {} });
      }
      for (const sceneId of options.sceneIds) {
        if (filtered.some((item) => item.id === sceneId)) continue;
        const dbScene = await this.db.scene.findFirst({
          where: { id: sceneId, deletedAt: null },
        });
        if (!dbScene) throw new ApiError(404, 'SCENE_NOT_FOUND', '场景不存在');
        filtered.push({
          id: sceneId,
          meta: {
            title: dbScene.title,
            summary: dbScene.description,
            description: dbScene.description,
            time_of_day: dbScene.time,
            mood: dbScene.mood,
            character_names: [],
            location_name: null,
          },
        });
      }
      sceneIds = filtered.map((item) => item.id);
      scenes = filtered.map((item) => item.meta);
    }

    if (sceneIds.length === 0 || sceneIds.length !== scenes.length) {
      throw new ApiError(409, 'SCENE_OUTPUT_MISSING', 'Scene Agent 尚未生成可用场景');
    }

    const prepScenes: VisualPrepScene[] = [];
    const assetIds = new Set<string>();
    for (const [index, scene] of scenes.entries()) {
      const sceneId = sceneIds[index];
      if (!sceneId) continue;
      const title = asText(scene.title, `场景 ${index + 1}`);
      const locationId = await this.ensureAsset(
        run,
        userId,
        'location',
        asText(scene.location_name, `${title}地点`),
        title,
      );
      const characterNames = Array.isArray(scene.character_names)
        ? scene.character_names.filter((name): name is string => typeof name === 'string')
        : [];
      const characterIds = await Promise.all(
        characterNames.map((name) => this.ensureAsset(run, userId, 'character', name, title)),
      );
      assetIds.add(locationId);
      characterIds.forEach((id) => assetIds.add(id));
      await this.db.scene.update({
        where: { id: sceneId },
        data: { locationId, characterIds },
      });
      prepScenes.push({
        scene_id: sceneId,
        title,
        location_asset_id: locationId,
        character_asset_ids: characterIds,
        variant_key: `${asText(scene.time_of_day, 'default')}_${asText(scene.mood, 'neutral')}`,
      });
    }

    const storyOutput = record(run.steps.find((step) => step.name === 'story')?.output);
    const storyId = typeof storyOutput.story_id === 'string' ? storyOutput.story_id : null;
    const story = storyId
      ? await this.db.story.findFirst({ where: { id: storyId, deletedAt: null } })
      : null;
    const storyScreenplay = story?.screenplay?.slice(0, 4_000);

    const result = await this.queueWork.run('workflow_step', `${run.id}:visual-prep-agent`, () =>
      this.runtime.execute(
        this.visualPrepAgent,
        { scenes: prepScenes },
        this.context(run, userId, 'visual_assets'),
      ),
    );
    if (!result.data || result.status === 'failed') {
      throw new ApiError(
        422,
        'VISUAL_PREP_AGENT_FAILED',
        result.warnings[0]?.message ?? '视觉准备失败',
      );
    }

    // Consistency: draft multi-view character sheet prompts from screenplay for user review.
    // Do NOT call T2I here — operator reviews then generates one turnaround image in the asset library.
    const characterIdsForSheets = [
      ...new Set(
        result.data.requirements
          .filter((item) => item.asset_type === 'character')
          .map((item) => item.asset_id),
      ),
    ];
    for (const characterId of characterIdsForSheets) {
      const character = await this.db.asset.findFirst({
        where: { id: characterId, deletedAt: null, type: 'character' },
      });
      if (!character) continue;
      await ensureDefaultAppearanceVariant(this.db, character);
      await ensureCharacterSheetVariants(this.db, character.id);
      const sheetMeta = CHARACTER_SHEET_VARIANTS[0];
      const variant = await this.db.assetAppearanceVariant.findFirst({
        where: { assetId: character.id, key: CHARACTER_SHEET_TURNAROUND_KEY, deletedAt: null },
      });
      if (!variant) continue;
      if (variant.anchorMediaId || variant.candidateMediaIds.length > 0) continue;
      const existingPrompt = variant.description?.trim() ?? '';
      // Keep operator/LLM draft; re-draft only when empty or still the raw template clause.
      if (existingPrompt && existingPrompt !== sheetMeta.prompt_clause) continue;
      const appearance = record(character.appearance);
      const appearanceBits = Object.values(appearance)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(', ');
      try {
        const traits = await this.queueWork.run(
          'workflow_step',
          `${run.id}:sheet-prompt:${character.id}`,
          () =>
            enrichVisualAssetTraits(
              this.llm,
              this.llmModel,
              `${run.id}:sheet-prompt:${character.id}`,
              {
                asset_type: 'character',
                asset_name: character.name,
                variant_key: CHARACTER_SHEET_TURNAROUND_KEY,
                purpose: 'character_sheet',
                scene_title: 'character reference sheet',
                story_title: story?.title,
                story_synopsis: story?.synopsis ?? undefined,
                story_screenplay_excerpt: storyScreenplay,
                existing_description: character.description,
                appearance_bits: appearanceBits,
              },
            ),
        );
        await this.db.assetAppearanceVariant.update({
          where: { id: variant.id },
          data: {
            description: traits.generation_prompt,
            state: variant.state === 'approved' ? variant.state : 'draft',
          },
        });
        await this.db.asset.update({
          where: { id: character.id },
          data: {
            data: json(
              mergeVisualPromptIntoAssetData(
                character.data,
                CHARACTER_SHEET_TURNAROUND_KEY,
                traits.generation_prompt,
                traits.appearance_summary,
              ),
            ),
          },
        });
      } catch (error) {
        console.warn(
          '[visual-prep] character sheet prompt draft failed',
          character.name,
          error instanceof Error ? error.message : error,
        );
      }
    }

    const requirementIds: string[] = [];
    const enrichedAssetIds = new Set<string>();
    for (const requirement of result.data.requirements) {
      if (options?.sceneIds && !options.sceneIds.includes(requirement.scene_id)) continue;
      const requirementId = deterministicUuid(
        `${run.id}:requirement:${requirement.scene_id}:${requirement.asset_type}:${requirement.asset_id}:${requirement.variant_key}`,
      );
      if (options?.preserveApproved) {
        const existing = await this.db.visualAssetRequirement.findFirst({
          where: { id: requirementId, deletedAt: null },
        });
        if (existing?.status === 'approved') {
          requirementIds.push(requirementId);
          continue;
        }
      }
      const asset = await this.db.asset.findUniqueOrThrow({ where: { id: requirement.asset_id } });
      const sceneMeta = scenes[sceneIds.indexOf(requirement.scene_id)] ?? {};
      const sceneTitle = asText(sceneMeta.title, requirement.reason);

      let generationPrompt = [
        asset.name,
        asset.description,
        requirement.reason,
        `variant ${requirement.variant_key}`,
        'cinematic key visual, high detail',
      ]
        .filter(Boolean)
        .join(', ');

      if (!enrichedAssetIds.has(asset.id)) {
        const traits = await this.queueWork.run(
          'workflow_step',
          `${run.id}:trait:${asset.id}`,
          () =>
            enrichVisualAssetTraits(this.llm, this.llmModel, `${run.id}:trait:${asset.id}`, {
              asset_type: requirement.asset_type,
              asset_name: asset.name,
              variant_key: requirement.variant_key,
              purpose: requirement.asset_type === 'location' ? 'location_sheet' : 'keyframe',
              scene_title: sceneTitle,
              scene_context: [
                typeof sceneMeta.summary === 'string' ? sceneMeta.summary : '',
                typeof sceneMeta.description === 'string' ? sceneMeta.description : '',
                typeof sceneMeta.mood === 'string' ? `mood:${sceneMeta.mood}` : '',
                typeof sceneMeta.time_of_day === 'string' ? `time:${sceneMeta.time_of_day}` : '',
              ]
                .filter(Boolean)
                .join(' | '),
              story_title: story?.title,
              story_synopsis: story?.synopsis ?? undefined,
              story_screenplay_excerpt: storyScreenplay,
              existing_description: asset.description,
            }),
        );
        generationPrompt = traits.generation_prompt;
        await this.db.asset.update({
          where: { id: asset.id },
          data: {
            description: traits.description,
            appearance: json({
              custom: traits.appearance_summary,
            }),
            data: json(
              mergeVisualPromptIntoAssetData(
                asset.data,
                requirement.variant_key,
                traits.generation_prompt,
                traits.appearance_summary,
              ),
            ),
          },
        });
        enrichedAssetIds.add(asset.id);
      } else {
        const refreshed = await this.db.asset.findUniqueOrThrow({ where: { id: asset.id } });
        const fromData = record(record(refreshed.data).visual);
        const prompts = record(fromData.generation_prompts);
        if (typeof prompts[requirement.variant_key] === 'string') {
          generationPrompt = String(prompts[requirement.variant_key]);
        } else {
          const traits = await this.queueWork.run(
            'workflow_step',
            `${run.id}:trait:${asset.id}:${requirement.variant_key}`,
            () =>
              enrichVisualAssetTraits(
                this.llm,
                this.llmModel,
                `${run.id}:trait:${asset.id}:${requirement.variant_key}`,
                {
                  asset_type: requirement.asset_type,
                  asset_name: refreshed.name,
                  variant_key: requirement.variant_key,
                  scene_title: sceneTitle,
                  story_title: story?.title,
                  story_synopsis: story?.synopsis ?? undefined,
                  existing_description: refreshed.description,
                },
              ),
          );
          generationPrompt = traits.generation_prompt;
          await this.db.asset.update({
            where: { id: asset.id },
            data: {
              data: json(
                mergeVisualPromptIntoAssetData(
                  refreshed.data,
                  requirement.variant_key,
                  traits.generation_prompt,
                  traits.appearance_summary,
                ),
              ),
            },
          });
        }
      }

      // Cost control: do NOT auto-generate scene keyframes here.
      // Persist prompts only; operator generates one card at a time in visual review.
      await this.db.visualAssetRequirement.upsert({
        where: { id: requirementId },
        create: {
          id: requirementId,
          sceneId: requirement.scene_id,
          assetType: requirement.asset_type,
          assetId: requirement.asset_id,
          variantKey: requirement.variant_key,
          required: true,
          reason: requirement.reason,
          status: 'pending',
          candidateMediaIds: [],
        },
        update: {
          required: true,
          reason: requirement.reason,
          status: 'pending',
          candidateMediaIds: [],
          approvedMediaId: null,
          deletedAt: null,
          version: { increment: 1 },
        },
      });
      // Keep generation prompt on the asset for the review UI / regenerate endpoint.
      const refreshedForPrompt = await this.db.asset.findUniqueOrThrow({
        where: { id: asset.id },
      });
      await this.db.asset.update({
        where: { id: asset.id },
        data: {
          data: json(
            mergeVisualPromptIntoAssetData(
              refreshedForPrompt.data,
              requirement.variant_key,
              generationPrompt,
            ),
          ),
        },
      });
      requirementIds.push(requirementId);
    }
    const payload = {
      requirement_ids: requirementIds,
      asset_ids: [...assetIds],
      agent_metadata: result.metadata,
      image_provider: this.providers.selection.image,
    };
    if (options?.advance === false) {
      await this.orchestrator.mergeStepOutput(run.id, 'visual_prep', payload);
    } else {
      await this.orchestrator.completeStep(run.id, 'visual_prep', payload);
    }
    return { requirementIds, assetIds: [...assetIds] };
  }

  private async executeShots(run: WorkflowWithSteps, userId: string): Promise<void> {
    const sceneOutput = record(run.steps.find((step) => step.name === 'scene')?.output);
    const sceneIds = Array.isArray(sceneOutput.scene_ids)
      ? sceneOutput.scene_ids.filter((id): id is string => typeof id === 'string')
      : [];
    if (sceneIds.length === 0) {
      throw new ApiError(409, 'SCENE_OUTPUT_MISSING', 'Scene Agent 尚未生成可用场景');
    }
    const unapproved = await this.db.visualAssetRequirement.count({
      where: {
        sceneId: { in: sceneIds },
        required: true,
        deletedAt: null,
        OR: [{ status: { not: 'approved' } }, { approvedMediaId: null }],
      },
    });
    if (unapproved > 0) {
      throw new ApiError(
        409,
        'VISUAL_ASSETS_NOT_APPROVED',
        '所有必需角色与地点图片审核通过后才能生成镜头',
      );
    }

    const scenes = await this.db.scene.findMany({
      where: { id: { in: sceneIds }, deletedAt: null },
      orderBy: { order: 'asc' },
    });
    const agentScenes: ShotAgentScene[] = [];
    for (const scene of scenes) {
      const assets = await this.db.asset.findMany({
        where: {
          id: {
            in: [scene.locationId, ...scene.characterIds].filter(
              (id): id is string => typeof id === 'string',
            ),
          },
          deletedAt: null,
        },
        select: { id: true, type: true, name: true },
      });
      const location = assets.find((asset) => asset.id === scene.locationId);
      agentScenes.push({
        id: scene.id,
        title: scene.title,
        description: scene.description ?? '',
        time_of_day: scene.time,
        weather: scene.weather,
        mood: scene.mood,
        location_name: location?.name ?? null,
        characters: assets
          .filter((asset) => asset.type === 'character')
          .map((asset) => ({ id: asset.id, name: asset.name })),
      });
    }

    const result = await this.queueWork.run('workflow_step', `${run.id}:shot-agent`, () =>
      this.runtime.execute(
        this.shotAgent,
        { scenes: agentScenes },
        this.context(run, userId, 'shot'),
      ),
    );
    if (!result.data || result.status === 'failed') {
      throw new ApiError(422, 'SHOT_AGENT_FAILED', result.warnings[0]?.message ?? '镜头生成失败');
    }
    const shotIds = await this.persistShots(run.id, run.projectId, result.data);
    await this.orchestrator.completeStep(run.id, 'shot', {
      shot_ids: shotIds,
      shots: result.data.shots,
      agent_metadata: result.metadata,
    });
  }

  private async executePrompts(
    run: WorkflowWithSteps,
    userId: string,
    options?: { shotIds?: string[]; advance?: boolean },
  ): Promise<{ promptVersionIds: string[]; shotIds: string[] }> {
    const shotOutput = record(run.steps.find((step) => step.name === 'shot')?.output);
    let shotIds = Array.isArray(shotOutput.shot_ids)
      ? shotOutput.shot_ids.filter((id): id is string => typeof id === 'string')
      : [];
    if (options?.shotIds?.length) {
      shotIds = options.shotIds;
    }
    if (shotIds.length === 0) {
      throw new ApiError(409, 'SHOT_OUTPUT_MISSING', 'Shot Agent 尚未生成可用镜头');
    }
    const shots = await this.db.shot.findMany({
      where: { id: { in: shotIds }, deletedAt: null },
      include: { scene: { include: { story: { include: { project: true } } } } },
      orderBy: [{ sceneId: 'asc' }, { order: 'asc' }],
    });
    if (shots.length === 0) {
      throw new ApiError(404, 'SHOT_NOT_FOUND', '镜头不存在');
    }
    const promptVersionIds: string[] = [];
    for (const shot of shots) {
      const promptInput = await this.promptInput(shot);
      const result = await this.queueWork.run(
        'prompt_construct',
        `${run.id}:prompt:${shot.id}`,
        () =>
          this.runtime.execute(this.promptAgent, promptInput, this.context(run, userId, 'prompt')),
      );
      if (!result.data || result.status === 'failed') {
        throw new ApiError(
          422,
          'PROMPT_AGENT_FAILED',
          result.warnings[0]?.message ?? '提示词生成失败',
        );
      }
      const generated = result.data;
      const approved = await this.db.promptVersion.findFirst({
        where: { shotId: shot.id, approvedAt: { not: null } },
        orderBy: { approvedAt: 'desc' },
      });
      const promptVersionId =
        options?.advance === false && approved
          ? cryptoRandomUuid()
          : deterministicUuid(`${run.id}:prompt:${shot.id}`);
      await this.db.$transaction([
        this.db.promptVersion.upsert({
          where: { id: promptVersionId },
          create: {
            id: promptVersionId,
            shotId: shot.id,
            positive: generated.positive,
            negative: generated.negative,
            source: generated.source,
          },
          update: {
            positive: generated.positive,
            negative: generated.negative,
            source: generated.source,
            approvedAt: null,
          },
        }),
        this.db.shot.update({
          where: { id: shot.id },
          data: {
            state: shot.state === 'approved' ? 'approved' : 'prompting',
            prompt: json(generated),
          },
        }),
      ]);
      promptVersionIds.push(promptVersionId);
    }
    const payload = {
      shot_ids: shots.map((shot) => shot.id),
      prompt_version_ids: promptVersionIds,
    };
    if (options?.advance === false) {
      await this.orchestrator.mergeStepOutput(run.id, 'prompt', payload);
    } else {
      await this.orchestrator.completeStep(run.id, 'prompt', payload);
    }
    return { promptVersionIds, shotIds: shots.map((shot) => shot.id) };
  }

  private async executeVideos(
    run: WorkflowWithSteps,
    options?: { shotIds?: string[]; advance?: boolean },
  ): Promise<{ outputIds: string[]; shotIds: string[] }> {
    const promptOutput = record(run.steps.find((step) => step.name === 'prompt')?.output);
    let shotIds = Array.isArray(promptOutput.shot_ids)
      ? promptOutput.shot_ids.filter((id): id is string => typeof id === 'string')
      : [];
    if (options?.shotIds?.length) {
      shotIds = options.shotIds;
    }
    if (shotIds.length === 0) {
      throw new ApiError(409, 'PROMPT_OUTPUT_MISSING', 'Prompt Agent 尚未生成可用提示词');
    }
    // Cost control: do not auto-enqueue every shot. Operator generates one video at a time
    // from the video review cards ("重跑本镜头视频" / generate).
    if (options?.shotIds?.length && options.advance === false) {
      const outputs = [];
      for (const shotId of shotIds) {
        // Async enqueue: Wan2.2 often exceeds HTTP sync wait (was 120s → false timeouts
        // while the worker was still polling SiliconFlow).
        const output = await this.generationService.generate(shotId, {
          requestId: `${run.id}:${shotId}:recompute:${Date.now()}`,
          model: this.providers.videoModel,
          async: true,
        });
        outputs.push(output);
      }
      const payload = {
        shot_ids: shotIds,
        output_ids: outputs.map((output) => output.id),
        provider: this.providers.selection.video,
        model: this.providers.videoModel,
      };
      await this.orchestrator.mergeStepOutput(run.id, 'video', payload);
      return { outputIds: outputs.map((output) => output.id), shotIds };
    }

    const payload = {
      shot_ids: shotIds,
      output_ids: [] as string[],
      deferred_generation: true,
      provider: this.providers.selection.video,
      model: this.providers.videoModel,
    };
    await this.orchestrator.completeStep(run.id, 'video', payload);
    return { outputIds: [], shotIds };
  }

  private async persistShots(
    runId: string,
    projectId: string,
    output: ShotAgentOutput,
  ): Promise<string[]> {
    const ids: string[] = [];
    await this.db.$transaction(async (tx) => {
      for (const shot of output.shots) {
        const id = deterministicUuid(`${runId}:shot:${shot.scene_id}:${shot.order}`);
        ids.push(id);
        await tx.shot.upsert({
          where: { id },
          create: {
            id,
            sceneId: shot.scene_id,
            projectId,
            order: shot.order,
            label: shot.label,
            narrativeMode: shot.narrative_mode,
            locationArea: shot.location_area,
            camera: json(shot.camera),
            composition: json(shot.composition),
            lighting: json(shot.lighting),
            color: json(shot.color),
            mood: shot.mood,
            characters: json(shot.characters),
            dialogue: shot.dialogue ? json(shot.dialogue) : Prisma.JsonNull,
            action: json(shot.action),
            audio: json(shot.audio),
            prompt: json(shot.prompt),
          },
          update: {
            order: shot.order,
            label: shot.label,
            narrativeMode: shot.narrative_mode,
            locationArea: shot.location_area,
            camera: json(shot.camera),
            composition: json(shot.composition),
            lighting: json(shot.lighting),
            color: json(shot.color),
            mood: shot.mood,
            characters: json(shot.characters),
            dialogue: shot.dialogue ? json(shot.dialogue) : Prisma.JsonNull,
            action: json(shot.action),
            audio: json(shot.audio),
            prompt: json(shot.prompt),
            state: 'draft',
            deletedAt: null,
          },
        });
      }
    });
    return ids;
  }

  private async promptInput(shot: {
    id: string;
    label: string | null;
    camera: unknown;
    composition: unknown;
    lighting: unknown;
    color: unknown;
    mood: string | null;
    characters: unknown;
    dialogue: unknown;
    action: unknown;
    style: unknown;
    prompt: unknown;
    scene: {
      title: string;
      description: string | null;
      time: string | null;
      weather: string | null;
      locationId: string | null;
      story: { project: { defaults: unknown } };
    };
  }): Promise<PromptAgentInput> {
    const shotCharacters = Array.isArray(shot.characters)
      ? shot.characters.filter(
          (character): character is Record<string, unknown> =>
            Boolean(character) && typeof character === 'object' && !Array.isArray(character),
        )
      : [];
    const characterIds = shotCharacters
      .map((character) => character.character_id)
      .filter((id): id is string => typeof id === 'string');
    const assets = await this.db.asset.findMany({
      where: {
        id: {
          in: [shot.scene.locationId, ...characterIds].filter(
            (id): id is string => typeof id === 'string',
          ),
        },
        deletedAt: null,
      },
    });
    const location = assets.find((asset) => asset.id === shot.scene.locationId);
    const defaults = record(shot.scene.story.project.defaults);
    const prompt = record(shot.prompt);
    return {
      shot_id: shot.id,
      label: shot.label,
      camera: record(shot.camera),
      composition: record(shot.composition),
      lighting: record(shot.lighting),
      color: record(shot.color),
      mood: shot.mood,
      characters: shotCharacters.map((character) => {
        const id = typeof character.character_id === 'string' ? character.character_id : '';
        const asset = assets.find((candidate) => candidate.id === id);
        return {
          name: asset?.name ?? 'Unknown character',
          presence: typeof character.presence === 'string' ? character.presence : undefined,
          action: typeof character.action === 'string' ? character.action : undefined,
          emotion: typeof character.emotion === 'string' ? character.emotion : undefined,
          pose: typeof character.pose === 'string' ? character.pose : undefined,
          expression: typeof character.expression === 'string' ? character.expression : undefined,
          outfit:
            typeof character.outfit_override === 'string'
              ? character.outfit_override
              : typeof record(asset?.data).default_outfit === 'string'
                ? String(record(asset?.data).default_outfit)
                : undefined,
        };
      }),
      dialogue: record(shot.dialogue),
      action: record(shot.action),
      scene: {
        title: shot.scene.title,
        description: shot.scene.description,
        time: shot.scene.time,
        weather: shot.scene.weather,
        location_name: location?.name ?? null,
      },
      style:
        Object.keys(record(shot.style)).length > 0 ? record(shot.style) : record(defaults.style),
      project_negative_prompt:
        typeof defaults.negative_prompt === 'string' ? defaults.negative_prompt : null,
      shot_negative_prompt: typeof prompt.negative === 'string' ? prompt.negative : null,
      custom_prompt: typeof prompt.custom === 'string' ? prompt.custom : null,
    };
  }

  private async persistScenes(
    runId: string,
    projectId: string,
    storyId: string,
    output: GeneratedScenes,
    segmentIdByOrder: Map<number, string> = new Map(),
  ): Promise<string[]> {
    const ids = output.scenes.map((scene) => deterministicUuid(`${runId}:scene:${scene.order}`));
    await this.db.$transaction(async (tx) => {
      for (const [index, scene] of output.scenes.entries()) {
        const id = ids[index];
        if (!id) continue;
        const segmentId =
          scene.segment_order !== undefined
            ? (segmentIdByOrder.get(scene.segment_order) ?? null)
            : null;
        await tx.scene.upsert({
          where: { id },
          create: {
            id,
            storyId,
            projectId,
            order: scene.order,
            title: scene.title,
            description: scene.description,
            time: scene.time_of_day,
            weather: scene.weather,
            mood: scene.mood,
            characterIds: [],
            segmentId,
            state: 'review',
          },
          update: {
            order: scene.order,
            title: scene.title,
            description: scene.description,
            time: scene.time_of_day,
            weather: scene.weather,
            mood: scene.mood,
            segmentId,
            state: 'review',
            deletedAt: null,
          },
        });
      }
      await tx.scene.updateMany({
        where: { storyId, id: { notIn: ids }, state: 'draft', deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });
    return ids;
  }

  private async ensureAsset(
    run: WorkflowWithSteps,
    userId: string,
    assetType: 'character' | 'location',
    name: string,
    sceneContext: string,
  ): Promise<string> {
    const existing = await this.db.asset.findFirst({
      where: {
        projectId: run.projectId,
        type: assetType,
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (existing) {
      if (assetType === 'character') {
        await ensureDefaultAppearanceVariant(this.db, existing);
      }
      return existing.id;
    }

    const result = await this.queueWork.run(
      'workflow_step',
      `${run.projectId}:asset-agent:${assetType}:${name.trim().toLocaleLowerCase()}`,
      () =>
        this.runtime.execute(
          this.assetAgent,
          { asset_type: assetType, name, scene_context: sceneContext },
          this.context(run, userId, 'visual_assets'),
        ),
    );
    if (!result.data || result.status === 'failed') {
      throw new ApiError(422, 'ASSET_AGENT_FAILED', result.warnings[0]?.message ?? '资产生成失败');
    }
    const id = deterministicUuid(
      `${run.projectId}:asset:${assetType}:${name.trim().toLocaleLowerCase()}`,
    );
    const asset = await this.db.asset.upsert({
      where: { id },
      create: {
        id,
        projectId: run.projectId,
        type: assetType,
        state: 'draft',
        name: result.data.name,
        description: result.data.description,
        data: result.data.data,
        tags: result.data.tags,
      },
      update: {
        deletedAt: null,
        name: result.data.name,
        description: result.data.description,
        data: result.data.data,
        tags: result.data.tags,
      },
    });
    if (assetType === 'character') {
      await ensureDefaultAppearanceVariant(this.db, asset);
    }
    return id;
  }

  private async approveArtifacts(runId: string, reviewStep: string): Promise<void> {
    const run = await this.getRun(runId);
    if (reviewStep === 'story_review') {
      const storyId = record(run.steps.find((step) => step.name === 'story')?.output).story_id;
      if (typeof storyId === 'string') {
        await this.db.$transaction([
          this.db.story.update({ where: { id: storyId }, data: { state: 'approved' } }),
          this.db.storySegment.updateMany({
            where: { storyId, deletedAt: null },
            data: { state: 'approved' },
          }),
        ]);
      }
    }
    if (reviewStep === 'scene_review') {
      const sceneIds = record(run.steps.find((step) => step.name === 'scene')?.output).scene_ids;
      if (Array.isArray(sceneIds)) {
        await this.db.scene.updateMany({
          where: { id: { in: sceneIds.filter((id): id is string => typeof id === 'string') } },
          data: { state: 'approved' },
        });
      }
    }
    if (reviewStep === 'video_review') {
      const output = record(run.steps.find((step) => step.name === 'video')?.output);
      const shotIds = Array.isArray(output.shot_ids)
        ? output.shot_ids.filter((id): id is string => typeof id === 'string')
        : [];
      const outputIds = Array.isArray(output.output_ids)
        ? output.output_ids.filter((id): id is string => typeof id === 'string')
        : [];
      const shots = await this.db.shot.findMany({ where: { id: { in: shotIds } } });
      await this.db.$transaction([
        this.db.output.updateMany({
          where: { id: { in: outputIds }, status: 'completed' },
          data: { isActive: true },
        }),
        ...shots.map((shot) =>
          this.db.shot.update({
            where: { id: shot.id },
            data: {
              state: 'approved',
              approvedSnapshot: json({
                context: {
                  camera: shot.camera,
                  composition: shot.composition,
                  lighting: shot.lighting,
                  color: shot.color,
                  mood: shot.mood,
                  style: shot.style,
                  characters: shot.characters,
                },
                workflow_run_id: runId,
              }),
            },
          }),
        ),
      ]);
    }
  }

  private async releaseUnsupportedStep(runId: string, order: number): Promise<void> {
    await this.db.$transaction([
      this.db.workflowStep.update({
        where: { workflowRunId_order: { workflowRunId: runId, order } },
        data: { status: 'queued', startedAt: null },
      }),
      this.db.workflowRun.update({ where: { id: runId }, data: { status: 'queued' } }),
    ]);
  }

  private context(
    run: WorkflowWithSteps,
    userId: string,
    stage: keyof StageAutomation,
  ): AgentContext {
    const input = record(run.input);
    const automation = record(input.automation);
    const level = automation[stage] as AutomationLevel | undefined;
    return {
      project_id: asId(run.projectId),
      user_id: asId(userId),
      workflow_run_id: asId(run.id),
      previous_results: new Map(),
      automation_level: level ?? 'assisted',
    };
  }

  private storyData(story: GeneratedStory) {
    return {
      title: story.title,
      logline: story.logline,
      synopsis: story.synopsis,
      genre: story.genre,
      theme: story.theme,
      tone: story.tone,
      screenplay: story.screenplay,
      state: 'draft' as const,
    };
  }
}
