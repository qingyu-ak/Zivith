import { createHash } from 'node:crypto';
import {
  asId,
  type AgentContext,
  type AutomationLevel,
  type StageAutomation,
} from '@zivith/domain';
import { Prisma, type PrismaClient } from '@zivith/database';
import type { GenerationService } from '../generation/service.js';
import { ApiError } from '../../errors.js';
import { AgentRuntime } from '../agent/runtime.js';
import { AssetAgent } from '../agent/asset-agent.js';
import { PromptAgent, type PromptAgentInput } from '../agent/prompt-agent.js';
import { SceneAgent, type GeneratedScenes } from '../agent/scene-agent.js';
import { ShotAgent, type ShotAgentScene, type ShotAgentOutput } from '../agent/shot-agent.js';
import { StoryAgent, type GeneratedStory } from '../agent/story-agent.js';
import { VisualPrepAgent, type VisualPrepScene } from '../agent/visual-prep-agent.js';
import { enrichVisualAssetTraits, mergeVisualPromptIntoAssetData } from '../agent/visual-trait.js';
import { createProviderBundle, type ProviderBundle } from '../../providers/registry.js';
import type { ImageGenerationAdapter } from '../../ports/media.js';
import type { LLMAdapter } from '../../ports/llm.js';
import type { SubmitReviewInput, WorkflowOrchestrator } from './orchestrator.js';

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
  return typeof value === 'string' ? value : fallback;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Local SVG placeholder — avoids placehold.co which is often blocked in CN. */
function svgPlaceholderDataUrl(label: string, size = 1024): string {
  const text = label.slice(0, 18).replace(/[<>&'"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect fill="#141414" width="100%" height="100%"/><text x="50%" y="50%" fill="#a3e635" font-family="sans-serif" font-size="42" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
  private readonly imageAdapter: ImageGenerationAdapter;
  private readonly imageModel: string;
  private readonly llm: LLMAdapter;
  private readonly llmModel: string;
  private readonly providers: ProviderBundle;

  constructor(
    private readonly db: PrismaClient,
    private readonly orchestrator: WorkflowOrchestrator,
    generationService: GenerationService,
    providers: ProviderBundle = createProviderBundle(),
  ) {
    this.providers = providers;
    this.storyAgent = new StoryAgent(providers.llm, providers.llmModel);
    this.sceneAgent = new SceneAgent(providers.llm, providers.llmModel);
    this.generationService = generationService;
    this.imageAdapter = providers.image;
    this.imageModel = providers.imageModel;
    this.llm = providers.llm;
    this.llmModel = providers.llmModel;
  }

  async runUntilGate(runId: string, userId: string): Promise<WorkflowWithSteps> {
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
    const approving = input.action === 'approve' || input.action === 'approve_all';
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

  private async executeStory(run: WorkflowWithSteps, userId: string): Promise<void> {
    const input = record(run.input);
    const result = await this.runtime.execute(
      this.storyAgent,
      {
        brief: asText(input.brief),
        ...(typeof input.language === 'string' ? { language: input.language } : {}),
      },
      this.context(run, userId, 'story'),
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
    await this.orchestrator.completeStep(run.id, 'story', {
      story_id: storyId,
      story: result.data,
      agent_metadata: result.metadata,
    });
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
    const generatedStory: GeneratedStory = {
      title: story.title,
      logline: story.logline ?? '',
      synopsis: story.synopsis ?? '',
      genre: story.genre ?? '',
      theme: story.theme ?? '',
      tone: story.tone ?? '',
      screenplay: story.screenplay,
    };
    const result = await this.runtime.execute(
      this.sceneAgent,
      { story: generatedStory },
      this.context(run, userId, 'scene'),
    );
    if (!result.data || result.status === 'failed') {
      throw new ApiError(422, 'SCENE_AGENT_FAILED', result.warnings[0]?.message ?? '场景生成失败');
    }

    const sceneIds = await this.persistScenes(run.id, run.projectId, storyId, result.data);
    await this.orchestrator.completeStep(run.id, 'scene', {
      story_id: storyId,
      scene_ids: sceneIds,
      scenes: result.data.scenes,
      agent_metadata: result.metadata,
    });
  }

  private async executeVisualPrep(run: WorkflowWithSteps, userId: string): Promise<void> {
    const sceneStep = run.steps.find((step) => step.name === 'scene');
    const output = record(sceneStep?.output);
    const sceneIds = Array.isArray(output.scene_ids)
      ? output.scene_ids.filter((id): id is string => typeof id === 'string')
      : [];
    const scenes = Array.isArray(output.scenes)
      ? output.scenes.filter(
          (scene): scene is Record<string, unknown> =>
            Boolean(scene) && typeof scene === 'object' && !Array.isArray(scene),
        )
      : [];
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

    const result = await this.runtime.execute(
      this.visualPrepAgent,
      { scenes: prepScenes },
      this.context(run, userId, 'visual_assets'),
    );
    if (!result.data || result.status === 'failed') {
      throw new ApiError(
        422,
        'VISUAL_PREP_AGENT_FAILED',
        result.warnings[0]?.message ?? '视觉准备失败',
      );
    }
    const requirementIds: string[] = [];
    const enrichedAssetIds = new Set<string>();
    for (const requirement of result.data.requirements) {
      const requirementId = deterministicUuid(
        `${run.id}:requirement:${requirement.scene_id}:${requirement.asset_type}:${requirement.asset_id}:${requirement.variant_key}`,
      );
      const mediaId = deterministicUuid(`${requirementId}:candidate`);
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
        const traits = await enrichVisualAssetTraits(
          this.llm,
          this.llmModel,
          `${run.id}:trait:${asset.id}`,
          {
            asset_type: requirement.asset_type,
            asset_name: asset.name,
            variant_key: requirement.variant_key,
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
          },
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
          const traits = await enrichVisualAssetTraits(
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

      let imageUrl = svgPlaceholderDataUrl(asset.name);
      let provider = this.imageAdapter.provider;
      let isMock = provider === 'mock';
      try {
        const generated = await this.imageAdapter.generate({
          request_id: `${run.id}:${requirementId}`,
          model: this.imageModel,
          prompt: generationPrompt,
        });
        if (generated.image_url) imageUrl = generated.image_url;
        isMock = Boolean(generated.metadata.is_mock);
      } catch (error) {
        provider = 'mock-fallback';
        isMock = true;
        console.warn(
          '[visual-prep] image generation failed, using placeholder',
          error instanceof Error ? error.message : error,
        );
      }
      await this.db.media.upsert({
        where: { id: mediaId },
        create: {
          id: mediaId,
          projectId: run.projectId,
          name: `${asset.name} Key Image`,
          mediaType: 'image',
          mimeType: 'image/png',
          storageKey: `visual-assets/${mediaId}.png`,
          url: imageUrl,
          source: 'generated',
          generationMetadata: {
            is_mock: isMock,
            provider,
            model: this.imageModel,
            workflow_run_id: run.id,
            generation_prompt: generationPrompt,
          },
          tags: ['generated', requirement.asset_type],
        },
        update: {
          deletedAt: null,
          url: imageUrl,
          generationMetadata: {
            is_mock: isMock,
            provider,
            model: this.imageModel,
            workflow_run_id: run.id,
            generation_prompt: generationPrompt,
          },
        },
      });
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
          status: 'review',
          candidateMediaIds: [mediaId],
        },
        update: {
          required: true,
          reason: requirement.reason,
          status: 'review',
          candidateMediaIds: [mediaId],
          approvedMediaId: null,
          deletedAt: null,
          version: { increment: 1 },
        },
      });
      requirementIds.push(requirementId);
    }
    await this.orchestrator.completeStep(run.id, 'visual_prep', {
      requirement_ids: requirementIds,
      asset_ids: [...assetIds],
      agent_metadata: result.metadata,
      image_provider: this.providers.selection.image,
    });
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

    const result = await this.runtime.execute(
      this.shotAgent,
      { scenes: agentScenes },
      this.context(run, userId, 'shot'),
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

  private async executePrompts(run: WorkflowWithSteps, userId: string): Promise<void> {
    const shotOutput = record(run.steps.find((step) => step.name === 'shot')?.output);
    const shotIds = Array.isArray(shotOutput.shot_ids)
      ? shotOutput.shot_ids.filter((id): id is string => typeof id === 'string')
      : [];
    if (shotIds.length === 0) {
      throw new ApiError(409, 'SHOT_OUTPUT_MISSING', 'Shot Agent 尚未生成可用镜头');
    }
    const shots = await this.db.shot.findMany({
      where: { id: { in: shotIds }, deletedAt: null },
      include: { scene: { include: { story: { include: { project: true } } } } },
      orderBy: [{ sceneId: 'asc' }, { order: 'asc' }],
    });
    const promptVersionIds: string[] = [];
    for (const shot of shots) {
      const promptInput = await this.promptInput(shot);
      const result = await this.runtime.execute(
        this.promptAgent,
        promptInput,
        this.context(run, userId, 'prompt'),
      );
      if (!result.data || result.status === 'failed') {
        throw new ApiError(
          422,
          'PROMPT_AGENT_FAILED',
          result.warnings[0]?.message ?? '提示词生成失败',
        );
      }
      const generated = result.data;
      const promptVersionId = deterministicUuid(`${run.id}:prompt:${shot.id}`);
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
            state: 'prompting',
            prompt: json(generated),
          },
        }),
      ]);
      promptVersionIds.push(promptVersionId);
    }
    await this.orchestrator.completeStep(run.id, 'prompt', {
      shot_ids: shots.map((shot) => shot.id),
      prompt_version_ids: promptVersionIds,
    });
  }

  private async executeVideos(run: WorkflowWithSteps): Promise<void> {
    const promptOutput = record(run.steps.find((step) => step.name === 'prompt')?.output);
    const shotIds = Array.isArray(promptOutput.shot_ids)
      ? promptOutput.shot_ids.filter((id): id is string => typeof id === 'string')
      : [];
    if (shotIds.length === 0) {
      throw new ApiError(409, 'PROMPT_OUTPUT_MISSING', 'Prompt Agent 尚未生成可用提示词');
    }
    const outputs = await Promise.all(
      shotIds.map((shotId) =>
        this.generationService.generate(shotId, {
          requestId: `${run.id}:${shotId}`,
          model: this.providers.videoModel,
        }),
      ),
    );
    await this.orchestrator.completeStep(run.id, 'video', {
      shot_ids: shotIds,
      output_ids: outputs.map((output) => output.id),
      provider: this.providers.selection.video,
      model: this.providers.videoModel,
    });
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
  ): Promise<string[]> {
    const ids = output.scenes.map((scene) => deterministicUuid(`${runId}:scene:${scene.order}`));
    await this.db.$transaction(async (tx) => {
      for (const [index, scene] of output.scenes.entries()) {
        const id = ids[index];
        if (!id) continue;
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
          },
          update: {
            order: scene.order,
            title: scene.title,
            description: scene.description,
            time: scene.time_of_day,
            weather: scene.weather,
            mood: scene.mood,
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
      select: { id: true },
    });
    if (existing) return existing.id;

    const result = await this.runtime.execute(
      this.assetAgent,
      { asset_type: assetType, name, scene_context: sceneContext },
      this.context(run, userId, 'visual_assets'),
    );
    if (!result.data || result.status === 'failed') {
      throw new ApiError(422, 'ASSET_AGENT_FAILED', result.warnings[0]?.message ?? '资产生成失败');
    }
    const id = deterministicUuid(
      `${run.projectId}:asset:${assetType}:${name.trim().toLocaleLowerCase()}`,
    );
    await this.db.asset.upsert({
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
    return id;
  }

  private async approveArtifacts(runId: string, reviewStep: string): Promise<void> {
    const run = await this.getRun(runId);
    if (reviewStep === 'story_review') {
      const storyId = record(run.steps.find((step) => step.name === 'story')?.output).story_id;
      if (typeof storyId === 'string') {
        await this.db.story.update({ where: { id: storyId }, data: { state: 'approved' } });
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
