import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@zivith/database';
import { asId, type AgentContext } from '@zivith/domain';
import { z } from 'zod';
import { AgentRuntime } from '../contexts/agent/runtime.js';
import { PromptAgent, type PromptAgentInput } from '../contexts/agent/prompt-agent.js';
import { assertPromptApprovedForGeneration } from '../contexts/generation/service.js';
import { ApiError } from '../errors.js';

const shotParams = z.object({ id: z.string().uuid() });
const promptParams = z.object({ id: z.string().uuid(), promptId: z.string().uuid() });

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function shotForMember(db: PrismaClient, shotId: string, userId: string, write = false) {
  const shot = await db.shot.findFirst({
    where: { id: shotId, deletedAt: null },
    include: {
      scene: {
        include: { story: { include: { project: true } }, requirements: true },
      },
    },
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

function assertVisualRequirementsApproved(
  requirements: Array<{
    required: boolean;
    status: string;
    approvedMediaId: string | null;
    deletedAt: Date | null;
  }>,
): void {
  if (
    requirements.some(
      (requirement) =>
        !requirement.deletedAt &&
        requirement.required &&
        (requirement.status !== 'approved' || !requirement.approvedMediaId),
    )
  ) {
    throw new ApiError(
      409,
      'VISUAL_ASSETS_NOT_APPROVED',
      '所有必需角色与地点图片审核通过后才能生成提示词',
    );
  }
}

async function promptInput(
  db: PrismaClient,
  shot: Awaited<ReturnType<typeof shotForMember>>,
): Promise<PromptAgentInput> {
  const characters = Array.isArray(shot.characters)
    ? shot.characters
        .map((character) => record(character))
        .filter((character) => Object.keys(character).length > 0)
    : [];
  const characterIds = characters
    .map((character) => character.character_id)
    .filter((id): id is string => typeof id === 'string');
  const assets = await db.asset.findMany({
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
  const storedPrompt = record(shot.prompt);
  return {
    shot_id: shot.id,
    label: shot.label,
    camera: record(shot.camera),
    composition: record(shot.composition),
    lighting: record(shot.lighting),
    color: record(shot.color),
    mood: shot.mood,
    characters: characters.map((character) => {
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
    style: Object.keys(record(shot.style)).length > 0 ? record(shot.style) : record(defaults.style),
    project_negative_prompt:
      typeof defaults.negative_prompt === 'string' ? defaults.negative_prompt : null,
    shot_negative_prompt: typeof storedPrompt.negative === 'string' ? storedPrompt.negative : null,
    custom_prompt: typeof storedPrompt.custom === 'string' ? storedPrompt.custom : null,
  };
}

export function registerShotPromptRoutes(app: FastifyInstance, db: PrismaClient): void {
  const runtime = new AgentRuntime();
  const agent = new PromptAgent();

  app.post('/shots/:id/generate-prompt', async (request, reply) => {
    const { id } = shotParams.parse(request.params);
    const shot = await shotForMember(db, id, request.user.sub, true);
    if (shot.state === 'approved') {
      throw new ApiError(409, 'SHOT_FROZEN', '已批准镜头必须先解冻');
    }
    assertVisualRequirementsApproved(shot.scene.requirements);
    const context: AgentContext = {
      project_id: asId(shot.projectId),
      user_id: asId(request.user.sub),
      workflow_run_id: asId(`direct-prompt-${shot.id}`),
      previous_results: new Map(),
      automation_level: 'assisted',
    };
    const result = await runtime.execute(agent, await promptInput(db, shot), context);
    if (!result.data || result.status === 'failed') {
      throw new ApiError(
        422,
        'PROMPT_AGENT_FAILED',
        result.warnings[0]?.message ?? '提示词生成失败',
      );
    }
    const generated = result.data;
    const promptVersion = await db.$transaction(async (tx) => {
      await tx.promptVersion.updateMany({
        where: { shotId: id, approvedAt: { not: null } },
        data: { approvedAt: null },
      });
      const version = await tx.promptVersion.create({
        data: {
          id: randomUUID(),
          shotId: id,
          positive: generated.positive,
          negative: generated.negative,
          source: generated.source,
        },
      });
      await tx.shot.update({
        where: { id },
        data: { state: 'prompting', prompt: json(generated) },
      });
      return version;
    });
    return reply.status(201).send({ prompt_version: promptVersion, prompt: generated });
  });

  app.post('/shots/:id/prompts/:promptId/approve', async (request) => {
    const { id, promptId } = promptParams.parse(request.params);
    await shotForMember(db, id, request.user.sub, true);
    const prompt = await db.promptVersion.findFirst({ where: { id: promptId, shotId: id } });
    if (!prompt) throw new ApiError(404, 'PROMPT_NOT_FOUND', '提示词版本不存在');
    const approvedAt = new Date();
    return db.$transaction(async (tx) => {
      await tx.promptVersion.updateMany({
        where: { shotId: id, approvedAt: { not: null } },
        data: { approvedAt: null },
      });
      const approved = await tx.promptVersion.update({
        where: { id: promptId },
        data: { approvedAt },
      });
      await tx.shot.update({
        where: { id },
        data: {
          state: 'prompting',
          prompt: {
            positive: prompt.positive,
            negative: prompt.negative,
            source: prompt.source,
          },
        },
      });
      return approved;
    });
  });
}
