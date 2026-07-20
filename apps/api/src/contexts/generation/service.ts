import { randomUUID } from 'node:crypto';
import { asId, type Shot } from '@zivith/domain';
import { Prisma, type PrismaClient } from '@zivith/database';
import { MockGenerationAdapter } from '../../adapters/mock-generation.js';
import { ApiError } from '../../errors.js';
import type { VideoGenerationAdapter } from '../../ports/generation.js';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function assertPromptApprovedForGeneration(
  db: PrismaClient,
  shotId: string,
): Promise<void> {
  const shot = await db.shot.findUnique({ where: { id: shotId }, select: { prompt: true } });
  const approved = await db.promptVersion.findFirst({
    where: { shotId, approvedAt: { not: null } },
    orderBy: { approvedAt: 'desc' },
  });
  const current = record(shot?.prompt);
  if (
    !approved ||
    approved.positive !== current.positive ||
    (approved.negative ?? null) !==
      (typeof current.negative === 'string' ? current.negative : null)
  ) {
    throw new ApiError(
      409,
      'PROMPT_APPROVAL_REQUIRED',
      '当前提示词必须明确审核通过后才能生成视频',
    );
  }
}

export interface GenerateVideoOptions {
  requestId?: string;
  model?: string;
}

export class GenerationService {
  constructor(
    private readonly db: PrismaClient,
    private readonly adapter: VideoGenerationAdapter = new MockGenerationAdapter(),
  ) {}

  async generate(shotId: string, options: GenerateVideoOptions = {}) {
    const shot = await this.db.shot.findFirst({
      where: { id: shotId, deletedAt: null },
      include: {
        scene: { include: { requirements: true, story: { include: { project: true } } } },
      },
    });
    if (!shot) throw new ApiError(404, 'SHOT_NOT_FOUND', '镜头不存在');
    if (shot.state === 'approved') {
      throw new ApiError(409, 'SHOT_FROZEN', '已批准镜头必须先解冻');
    }
    await assertPromptApprovedForGeneration(this.db, shotId);

    const physicalCharacterIds = new Set(
      (Array.isArray(shot.characters) ? shot.characters : [])
        .map((item) => record(item))
        .filter((item) => (item.presence ?? 'physical') === 'physical')
        .map((item) => item.character_id)
        .filter((id): id is string => typeof id === 'string'),
    );
    const required = shot.scene.requirements.filter(
      (requirement) =>
        !requirement.deletedAt &&
        requirement.required &&
        (requirement.assetType === 'location' || physicalCharacterIds.has(requirement.assetId)),
    );
    const missing = required.filter(
      (requirement) => requirement.status !== 'approved' || !requirement.approvedMediaId,
    );
    if (missing.length > 0) {
      throw new ApiError(
        409,
        'VISUAL_ASSETS_NOT_APPROVED',
        '所有必需角色与地点图片审核通过后才能生成视频',
        { requirement_ids: missing.map((requirement) => requirement.id) },
      );
    }

    const prompt = record(shot.prompt);
    const positive = typeof prompt.positive === 'string' ? prompt.positive : '';
    const negative = typeof prompt.negative === 'string' ? prompt.negative : undefined;
    const requestId = options.requestId ?? randomUUID();
    const idempotencyKey = `mock-video:${requestId}`;
    const existing = await this.db.output.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const outputId = randomUUID();
    const taskId = randomUUID();
    const visualMediaIds = required
      .map((requirement) => requirement.approvedMediaId)
      .filter((id): id is string => Boolean(id));
    const contextSnapshot = {
      project: shot.scene.story.project.defaults,
      story: shot.scene.story.overrides,
      scene: shot.scene.overrides,
      shot: {
        camera: shot.camera,
        composition: shot.composition,
        lighting: shot.lighting,
        color: shot.color,
        mood: shot.mood,
        style: shot.style,
        characters: shot.characters,
        action: shot.action,
        dialogue: shot.dialogue,
      },
    };
    await this.db.$transaction([
      this.db.output.create({
        data: {
          id: outputId,
          shotId,
          status: 'queued',
          provider: this.adapter.provider,
          idempotencyKey,
          model: options.model ?? 'mock-v1',
          modelVersion: '1',
          parameters: json({ is_mock: true }),
          promptSnapshot: json({ positive, negative: negative ?? null }),
          contextSnapshot: json(contextSnapshot),
          visualMediaIds,
        },
      }),
      this.db.task.create({
        data: {
          id: taskId,
          projectId: shot.projectId,
          type: 'video_generate',
          status: 'running',
          idempotencyKey,
          provider: this.adapter.provider,
          payload: json({ shot_id: shotId, output_id: outputId }),
          attempts: 1,
          startedAt: new Date(),
        },
      }),
      this.db.shot.update({ where: { id: shotId }, data: { state: 'generating' } }),
    ]);

    try {
      const result = await this.adapter.generate({
        request_id: requestId,
        model: options.model ?? 'mock-v1',
        positive_prompt: positive,
        ...(negative ? { negative_prompt: negative } : {}),
        shot: this.domainShot(shot),
        reference_image_urls: visualMediaIds,
        parameters: { output_id: outputId },
      });
      if (result.status !== 'completed' || !result.video_url) {
        throw new Error(`Mock generation ended with ${result.status}`);
      }
      const [output] = await this.db.$transaction([
        this.db.output.update({
          where: { id: outputId },
          data: {
            status: 'completed',
            videoUrl: result.video_url,
            thumbnailUrl: result.thumbnail_url,
            providerJobId: result.job_id,
            parameters: json(result.metadata),
            durationSeconds: Number(record(shot.action).duration_hint ?? 5),
            generatedAt: new Date(),
          },
        }),
        this.db.task.update({
          where: { id: taskId },
          data: {
            status: 'completed',
            providerJobId: result.job_id,
            result: json(result),
            completedAt: new Date(),
          },
        }),
        this.db.shot.update({ where: { id: shotId }, data: { state: 'review' } }),
      ]);
      return output;
    } catch (error) {
      await this.db.$transaction([
        this.db.output.update({
          where: { id: outputId },
          data: { status: 'failed', errorCode: 'MOCK_GENERATION_FAILED' },
        }),
        this.db.task.update({
          where: { id: taskId },
          data: {
            status: 'failed',
            errorCode: 'MOCK_GENERATION_FAILED',
            result: json({
              message: error instanceof Error ? error.message : 'Mock generation failed',
            }),
            completedAt: new Date(),
          },
        }),
        this.db.shot.update({ where: { id: shotId }, data: { state: 'draft' } }),
      ]);
      throw new ApiError(502, 'MOCK_GENERATION_FAILED', 'Mock 视频生成失败');
    }
  }

  private domainShot(shot: {
    id: string;
    sceneId: string;
    projectId: string;
    order: number;
    label: string | null;
    state: string;
    camera: unknown;
    composition: unknown;
    lighting: unknown;
    color: unknown;
    mood: string | null;
    style: unknown;
    characters: unknown;
    dialogue: unknown;
    action: unknown;
    audio: unknown;
    prompt: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): Shot {
    return {
      id: asId(shot.id),
      scene_id: asId(shot.sceneId),
      project_id: asId(shot.projectId),
      order: shot.order,
      label: shot.label,
      state: shot.state as Shot['state'],
      camera: record(shot.camera),
      composition: record(shot.composition),
      lighting: record(shot.lighting),
      color: record(shot.color),
      mood: shot.mood,
      style: record(shot.style),
      characters: (Array.isArray(shot.characters) ? shot.characters : []) as Shot['characters'],
      dialogue: record(shot.dialogue),
      action: record(shot.action),
      audio: record(shot.audio),
      prompt: record(shot.prompt) as unknown as Shot['prompt'],
      outputs: [],
      created_at: shot.createdAt,
      updated_at: shot.updatedAt,
    } as Shot;
  }
}
