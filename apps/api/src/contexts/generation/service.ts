import { randomUUID } from 'node:crypto';
import { asId, type Shot } from '@zivith/domain';
import type { Prisma, PrismaClient } from '@zivith/database';
import { MockGenerationAdapter } from '../../adapters/mock-generation.js';
import { ApiError } from '../../errors.js';
import type { QueuePort } from '../../ports/index.js';
import type { VideoGenerationAdapter } from '../../ports/generation.js';
import { resolveMediaUrls } from '../visual/reference-images.js';
import { withUsageContext } from '../usage/context.js';

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
    (approved.negative ?? null) !== (typeof current.negative === 'string' ? current.negative : null)
  ) {
    throw new ApiError(409, 'PROMPT_APPROVAL_REQUIRED', '当前提示词必须明确审核通过后才能生成视频');
  }
}

export interface GenerateVideoOptions {
  requestId?: string;
  model?: string;
  /** When true, return queued Output immediately without waiting for the worker. */
  async?: boolean;
}

/**
 * Prefer character keyframes for I2V (adapter uses urls[0]). Location refs follow.
 * Within characters, follow shot.characters order when possible.
 */
export function orderVisualMediaIdsForVideo(
  requirements: readonly {
    assetType: string;
    assetId: string;
    approvedMediaId: string | null;
  }[],
  shotCharacterIds: readonly string[],
): string[] {
  const withMedia = requirements.filter(
    (item): item is typeof item & { approvedMediaId: string } => Boolean(item.approvedMediaId),
  );
  const characters = withMedia.filter((item) => item.assetType === 'character');
  const locations = withMedia.filter((item) => item.assetType === 'location');
  const others = withMedia.filter(
    (item) => item.assetType !== 'character' && item.assetType !== 'location',
  );
  const sortedCharacters = [...characters].sort((left, right) => {
    const leftIndex = shotCharacterIds.indexOf(left.assetId);
    const rightIndex = shotCharacterIds.indexOf(right.assetId);
    const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    return leftRank - rightRank;
  });
  return [...sortedCharacters, ...locations, ...others].map((item) => item.approvedMediaId);
}

type VideoAdapterSource = VideoGenerationAdapter | (() => VideoGenerationAdapter);

export class GenerationService {
  private queue: QueuePort | null = null;
  private readonly adapterSource: VideoAdapterSource;

  constructor(
    private readonly db: PrismaClient,
    adapter: VideoAdapterSource = new MockGenerationAdapter(),
  ) {
    this.adapterSource = adapter;
  }

  private get adapter(): VideoGenerationAdapter {
    return typeof this.adapterSource === 'function' ? this.adapterSource() : this.adapterSource;
  }

  private defaultModel(): string {
    return this.adapter.supportedModels[0]?.id ?? 'mock-v1';
  }

  attachQueue(queue: QueuePort): void {
    this.queue = queue;
  }

  async cancelTask(taskId: string) {
    const task = await this.db.task.findUnique({ where: { id: taskId } });
    if (!task) throw new ApiError(404, 'TASK_NOT_FOUND', '生成任务不存在');
    if (task.status === 'completed' || task.status === 'cancelled') {
      return task;
    }
    if (task.status !== 'queued' && task.status !== 'running') {
      throw new ApiError(409, 'TASK_NOT_CANCELLABLE', '只能取消排队中或生成中的任务');
    }

    const payload = record(task.payload);
    const outputId = typeof payload.output_id === 'string' ? payload.output_id : null;
    const shotId = typeof payload.shot_id === 'string' ? payload.shot_id : null;

    if (this.queue) {
      await this.queue.cancel(task.idempotencyKey);
    }

    const providerJobId = task.providerJobId;
    if (providerJobId) {
      try {
        await this.adapter.cancel(providerJobId);
      } catch {
        // Provider cancel is best-effort.
      }
    }

    const updated = await this.db.$transaction(async (tx) => {
      const cancelledTask = await tx.task.update({
        where: { id: taskId },
        data: {
          status: 'cancelled',
          errorCode: 'CANCELLED',
          completedAt: new Date(),
          result: json({ cancelled: true }),
        },
      });
      if (outputId) {
        await tx.output.updateMany({
          where: {
            id: outputId,
            status: { in: ['queued', 'generating'] },
          },
          data: { status: 'failed', errorCode: 'CANCELLED' },
        });
      }
      if (shotId) {
        await tx.shot.updateMany({
          where: { id: shotId, state: 'generating' },
          data: { state: 'draft' },
        });
      }
      return cancelledTask;
    });

    return updated;
  }

  async generate(shotId: string, options: GenerateVideoOptions = {}) {
    const queued = await this.enqueue(shotId, options);
    if (options.async) return queued;
    return this.waitForOutput(queued.id);
  }

  async enqueue(shotId: string, options: GenerateVideoOptions = {}) {
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
    const idempotencyKey = `mock-video__${requestId}`;
    const existing = await this.db.output.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const outputId = randomUUID();
    const taskId = randomUUID();
    const shotCharacterIds = (Array.isArray(shot.characters) ? shot.characters : [])
      .map((item) => record(item))
      .map((item) => item.character_id)
      .filter((id): id is string => typeof id === 'string');
    const visualMediaIds = orderVisualMediaIdsForVideo(required, shotCharacterIds);
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
    const [output] = await this.db.$transaction([
      this.db.output.create({
        data: {
          id: outputId,
          shotId,
          status: 'queued',
          provider: this.adapter.provider,
          idempotencyKey,
          model: options.model ?? this.defaultModel(),
          modelVersion: '1',
          parameters: json({ is_mock: this.adapter.provider === 'mock' }),
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
          status: 'queued',
          idempotencyKey,
          provider: this.adapter.provider,
          payload: json({
            shot_id: shotId,
            output_id: outputId,
            request_id: requestId,
            model: options.model ?? this.defaultModel(),
            positive,
            negative: negative ?? null,
            visual_media_ids: visualMediaIds,
          }),
          attempts: 0,
        },
      }),
      this.db.shot.update({ where: { id: shotId }, data: { state: 'generating' } }),
    ]);

    if (this.queue) {
      await this.queue.enqueue({
        id: taskId,
        type: 'video_generate',
        idempotency_key: idempotencyKey,
        payload: { output_id: outputId, task_id: taskId, shot_id: shotId },
      });
    } else {
      await this.processQueuedOutput(outputId);
      return this.db.output.findUniqueOrThrow({ where: { id: outputId } });
    }

    return output;
  }

  async processQueuedOutput(outputId: string): Promise<void> {
    const output = await this.db.output.findUnique({ where: { id: outputId } });
    if (!output) throw new ApiError(404, 'OUTPUT_NOT_FOUND', '视频输出不存在');
    if (output.status === 'completed' || output.status === 'failed') return;

    const task = await this.db.task.findFirst({
      where: { idempotencyKey: output.idempotencyKey },
    });
    if (!task) throw new ApiError(404, 'TASK_NOT_FOUND', '生成任务不存在');
    if (task.status === 'cancelled') {
      if (output.status === 'queued' || output.status === 'generating') {
        await this.db.output.update({
          where: { id: outputId },
          data: { status: 'failed', errorCode: 'CANCELLED' },
        });
      }
      return;
    }

    const shot = await this.db.shot.findFirst({
      where: { id: output.shotId, deletedAt: null },
      include: {
        scene: { include: { requirements: true, story: { include: { project: true } } } },
      },
    });
    if (!shot) throw new ApiError(404, 'SHOT_NOT_FOUND', '镜头不存在');

    const payload = record(task.payload);
    const positive =
      typeof payload.positive === 'string'
        ? payload.positive
        : typeof record(output.promptSnapshot).positive === 'string'
          ? String(record(output.promptSnapshot).positive)
          : '';
    const negative =
      typeof payload.negative === 'string'
        ? payload.negative
        : typeof record(output.promptSnapshot).negative === 'string'
          ? String(record(output.promptSnapshot).negative)
          : undefined;
    const requestId =
      typeof payload.request_id === 'string' ? payload.request_id : output.idempotencyKey;
    const visualMediaIds = Array.isArray(payload.visual_media_ids)
      ? payload.visual_media_ids.filter((id): id is string => typeof id === 'string')
      : output.visualMediaIds;

    // Asset-Model §2.7: scene approved bindings are already encoded in visual_media_ids.
    // Resolve Media rows to URLs for image-to-video adapters.
    const referenceImageUrls = await resolveMediaUrls(this.db, visualMediaIds);

    await this.db.$transaction([
      this.db.output.update({ where: { id: outputId }, data: { status: 'generating' } }),
      this.db.task.update({
        where: { id: task.id },
        data: {
          status: 'running',
          attempts: { increment: 1 },
          startedAt: task.startedAt ?? new Date(),
        },
      }),
    ]);

    try {
      const result = await withUsageContext(
        { projectId: shot.projectId, taskType: 'video_generate' },
        () =>
          this.adapter.generate({
            request_id: requestId,
            model: output.model,
            positive_prompt: positive,
            ...(negative ? { negative_prompt: negative } : {}),
            shot: this.domainShot(shot),
            reference_image_urls: referenceImageUrls,
            parameters: { output_id: outputId, visual_media_ids: visualMediaIds },
          }),
      );

      const latestTask = await this.db.task.findFirst({ where: { id: task.id } });
      if (latestTask?.status === 'cancelled') {
        await this.db.output.update({
          where: { id: outputId },
          data: { status: 'failed', errorCode: 'CANCELLED' },
        });
        return;
      }

      if (result.status !== 'completed' || !result.video_url) {
        const reason =
          typeof result.metadata?.reason === 'string'
            ? result.metadata.reason
            : typeof result.metadata?.error === 'string'
              ? result.metadata.error
              : result.status;
        throw new Error(`Video generation ended with ${reason}`);
      }
      await this.db.$transaction([
        this.db.output.update({
          where: { id: outputId },
          data: {
            status: 'completed',
            videoUrl: result.video_url,
            ...(result.thumbnail_url !== undefined ? { thumbnailUrl: result.thumbnail_url } : {}),
            providerJobId: result.job_id,
            parameters: json(result.metadata),
            durationSeconds: Number(record(shot.action).duration_hint ?? 5),
            generatedAt: new Date(),
          },
        }),
        this.db.task.update({
          where: { id: task.id },
          data: {
            status: 'completed',
            providerJobId: result.job_id,
            result: json(result),
            completedAt: new Date(),
          },
        }),
        this.db.shot.update({ where: { id: shot.id }, data: { state: 'review' } }),
      ]);
    } catch (error) {
      const latestTask = await this.db.task.findFirst({ where: { id: task.id } });
      if (latestTask?.status === 'cancelled') {
        await this.db.output.update({
          where: { id: outputId },
          data: { status: 'failed', errorCode: 'CANCELLED' },
        });
        return;
      }
      const message = error instanceof Error ? error.message : 'Video generation failed';
      await this.db.$transaction([
        this.db.output.update({
          where: { id: outputId },
          data: { status: 'failed', errorCode: 'VIDEO_GENERATION_FAILED' },
        }),
        this.db.task.update({
          where: { id: task.id },
          data: {
            status: 'failed',
            errorCode: 'VIDEO_GENERATION_FAILED',
            result: json({ message: message.slice(0, 800) }),
            completedAt: new Date(),
          },
        }),
        this.db.shot.update({ where: { id: shot.id }, data: { state: 'draft' } }),
      ]);
      throw new ApiError(502, 'VIDEO_GENERATION_FAILED', `视频生成失败：${message.slice(0, 200)}`);
    }
  }

  private async waitForOutput(outputId: string, timeoutMs = 120_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const output = await this.db.output.findUnique({ where: { id: outputId } });
      if (!output) throw new ApiError(404, 'OUTPUT_NOT_FOUND', '视频输出不存在');
      if (output.status === 'completed') return output;
      if (output.status === 'failed') {
        throw new ApiError(502, 'MOCK_GENERATION_FAILED', 'Mock 视频生成失败');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new ApiError(504, 'GENERATION_TIMEOUT', '视频生成等待超时');
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
    };
  }
}
