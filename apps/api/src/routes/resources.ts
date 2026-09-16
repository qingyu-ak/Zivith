import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type PrismaClient } from '@zivith/database';
import {
  CHARACTER_SHEET_TURNAROUND_KEY,
  characterSchema,
  locationSchema,
  mergeInherited,
  parseWorldview,
  shotCreateSchema,
  shotPatchSchema,
} from '@zivith/domain';
import { z } from 'zod';
import { ensureDefaultAppearanceVariant } from '../contexts/visual/appearance-variants.js';
import {
  draftLocationSheetPrompt,
  generateLocationSheetImage,
  readLocationSheetPrompt,
} from '../contexts/visual/location-sheet.js';
import { createProviderBundle } from '../providers/registry.js';
import { instrumentProviderBundle } from '../contexts/usage/instrument.js';
import { withUsageContext } from '../contexts/usage/context.js';
import { ApiError } from '../errors.js';
import { ensureProjectMember } from '../contexts/world/local-user.js';
import {
  archiveWorldWorkspace,
  createWorldProject,
  syncWorkspaceMarkerName,
} from '../contexts/world/workspace.js';
import type { StoragePort } from '../ports/index.js';
import { getRuntimeModelOverride, getRuntimeProviderOverride } from './providers.js';
import { maybeRecordEntityChange } from '../contexts/history/index.js';
import {
  ensureAssetBaseline,
  recordAssetHistory,
} from '../contexts/history/record-asset-change.js';

/** Prefer remote/data URLs stored on Media; only sign object storage for local keys. */
async function resolveMediaAccessUrl(
  url: string,
  storageKey: string,
  storage?: StoragePort,
): Promise<string> {
  if (/^(https?:|data:)/i.test(url)) return url;
  if (storage) return storage.signedReadUrl(storageKey);
  return url;
}

const idParams = z.object({ id: z.string().uuid() });
const projectParams = z.object({ pid: z.string().uuid() });
const storyParams = z.object({ sid: z.string().uuid() });
const sceneParams = z.object({ sid: z.string().uuid() });
const orderedIdsReorderSchema = z
  .object({
    ordered_ids: z.array(z.string().uuid()).min(1).max(1000),
  })
  .strict();
const newOrderReorderSchema = z
  .object({
    new_order: z.number().int().positive(),
  })
  .strict();
const reorderSchema = z.union([orderedIdsReorderSchema, newOrderReorderSchema]);
export const projectBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).nullable().optional(),
  defaults: z.record(z.unknown()).optional(),
  worldview: z.record(z.unknown()).optional(),
});
export const storyBodySchema = z.object({
  title: z.string().trim().min(1).max(300),
  logline: z.string().max(10_000).nullable().optional(),
  synopsis: z.string().max(50_000).nullable().optional(),
  genre: z.string().max(200).nullable().optional(),
  theme: z.string().max(2_000).nullable().optional(),
  target_audience: z.string().max(2_000).nullable().optional(),
  tone: z.string().max(2_000).nullable().optional(),
  target_duration_seconds: z.number().int().positive().max(86_400).nullable().optional(),
  language: z.string().trim().min(1).max(50).nullable().optional(),
  screenplay: z.string().max(500_000).nullable().optional(),
  overrides: z.record(z.unknown()).nullable().optional(),
});
export const sceneBodySchema = z.object({
  title: z.string().trim().min(1).max(300),
  summary: z.string().max(50_000).nullable().optional(),
  description: z.string().max(50_000).nullable().optional(),
  time_of_day: z.string().max(200).nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  segment_id: z.string().uuid().nullable().optional(),
  time: z.string().max(200).nullable().optional(),
  weather: z.string().max(200).nullable().optional(),
  mood: z.string().max(200).nullable().optional(),
  order: z.number().int().positive().optional(),
  character_ids: z.array(z.string().uuid()).max(100).optional(),
  overrides: z.record(z.unknown()).nullable().optional(),
});

const clean = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as {
    [K in keyof T as T[K] extends undefined ? never : K]: Exclude<T[K], undefined>;
  };
const replaceBigInt = (_key: string, item: unknown): unknown =>
  typeof item === 'bigint' ? item.toString() : item;
const json = (value: unknown): Prisma.InputJsonValue => {
  const parsed = JSON.parse(JSON.stringify(value, replaceBigInt)) as unknown;
  return parsed as Prisma.InputJsonValue;
};

function multipartString(field: { value?: unknown } | undefined): string | undefined {
  return typeof field?.value === 'string' ? field.value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function computeReorderIds(
  siblingIds: readonly string[],
  currentId: string,
  newOrder: number,
): string[] {
  if (!siblingIds.includes(currentId)) throw new ApiError(404, 'NOT_FOUND', '排序资源不存在');
  if (newOrder < 1 || newOrder > siblingIds.length) {
    throw new ApiError(400, 'INVALID_ORDER', '新顺序超出有效范围');
  }
  const withoutCurrent = siblingIds.filter((id) => id !== currentId);
  withoutCurrent.splice(newOrder - 1, 0, currentId);
  return withoutCurrent;
}

export function sceneDto<T extends Record<string, unknown>>(
  scene: T,
): T & {
  summary: unknown;
  time_of_day: unknown;
} {
  return {
    ...scene,
    summary: scene.description ?? null,
    time_of_day: scene.time ?? null,
  };
}

export type ParsedAssetInput =
  | { asset_type: 'character'; data: z.infer<typeof characterSchema> }
  | { asset_type: 'location'; data: z.infer<typeof locationSchema> };

const assetEnvelopeSchema = z
  .object({
    type: z.enum(['character', 'location']),
    data: z.unknown(),
  })
  .strict();

export function parseAssetCreateInput(input: unknown): ParsedAssetInput {
  const record = z.record(z.unknown()).parse(input);
  if ('data' in record) {
    const envelope = assetEnvelopeSchema.parse(record);
    return envelope.type === 'character'
      ? { asset_type: 'character', data: characterSchema.parse(envelope.data) }
      : { asset_type: 'location', data: locationSchema.parse(envelope.data) };
  }

  const inferredType = record.asset_type ?? (record.type === 'character' ? 'character' : undefined);
  const assetType = z.enum(['character', 'location']).parse(inferredType);
  if (assetType === 'character') {
    const data = { ...record };
    const type = data.type;
    delete data.asset_type;
    delete data.type;
    if (type !== undefined && type !== 'character') {
      throw new ApiError(400, 'INVALID_ASSET_TYPE', '角色资产的 type 必须为 character');
    }
    return { asset_type: 'character', data: characterSchema.parse(data) };
  }
  const data = { ...record };
  delete data.asset_type;
  if (data.type === 'location') delete data.type;
  return { asset_type: 'location', data: locationSchema.parse(data) };
}

export function parseAssetPatchInput(
  assetType: 'character' | 'location',
  input: unknown,
): Record<string, unknown> {
  const data = { ...z.record(z.unknown()).parse(input) };
  delete data.asset_type;
  if (assetType === 'character') {
    if (data.type !== undefined && data.type !== 'character') {
      throw new ApiError(400, 'INVALID_ASSET_TYPE', '角色资产的 type 必须为 character');
    }
    delete data.type;
    return characterSchema.partial().parse(data);
  }
  if (data.type === 'location') delete data.type;
  return locationSchema.partial().parse(data);
}

/** Strip world-time stage fields so they never land in Asset.data. */
export function splitAssetHistoryMeta(input: unknown): {
  body: Record<string, unknown>;
  asOfWorldEventId?: string | null;
  stageLabel?: string | null;
} {
  const record = z.record(z.unknown()).parse(input);
  const rawAsOf = record.as_of_world_event_id;
  const rawLabel = record.stage_label;
  let asOfWorldEventId: string | null | undefined;
  if (rawAsOf === undefined) asOfWorldEventId = undefined;
  else if (rawAsOf === null || rawAsOf === '') asOfWorldEventId = null;
  else asOfWorldEventId = z.string().uuid().parse(rawAsOf);
  let stageLabel: string | null | undefined;
  if (rawLabel === undefined) stageLabel = undefined;
  else if (rawLabel === null) stageLabel = null;
  else stageLabel = z.string().trim().max(80).parse(rawLabel);
  const body = { ...record };
  delete body.as_of_world_event_id;
  delete body.stage_label;
  const result: {
    body: Record<string, unknown>;
    asOfWorldEventId?: string | null;
    stageLabel?: string | null;
  } = { body };
  if (asOfWorldEventId !== undefined) result.asOfWorldEventId = asOfWorldEventId;
  if (stageLabel !== undefined) result.stageLabel = stageLabel;
  return result;
}

export function assetDto<T extends Record<string, unknown>>(asset: T): Record<string, unknown> {
  const data = isRecord(asset.data) ? asset.data : {};
  const base: Record<string, unknown> = { ...asset };
  const assetType = base.type;
  return {
    ...data,
    ...base,
    asset_type: assetType,
    type: assetType === 'location' && typeof data.type === 'string' ? data.type : assetType,
  };
}

async function mediaRefDto(
  db: PrismaClient,
  mediaId: string,
  storage?: StoragePort,
): Promise<{ id: string; url: string; access_url: string; thumbnail_url: string } | null> {
  const media = await db.media.findFirst({ where: { id: mediaId, deletedAt: null } });
  if (!media) return null;
  const accessUrl = await resolveMediaAccessUrl(media.url, media.storageKey, storage);
  return {
    id: media.id,
    url: media.url,
    access_url: accessUrl,
    thumbnail_url: accessUrl,
  };
}

/** Resolve media ids → URLs and prefer sheet/cover for list thumbnails. */
async function enrichAssetForClient(
  db: PrismaClient,
  asset: {
    id: string;
    type: string;
    referenceImages: string[];
    data: unknown;
    [key: string]: unknown;
  },
  storage?: StoragePort,
): Promise<Record<string, unknown>> {
  const dto = assetDto(asset);
  let coverId: string | undefined = asset.referenceImages[0];
  if (asset.type === 'character') {
    const sheet = await db.assetAppearanceVariant.findFirst({
      where: { assetId: asset.id, key: CHARACTER_SHEET_TURNAROUND_KEY, deletedAt: null },
      select: { anchorMediaId: true, candidateMediaIds: true },
    });
    coverId = sheet?.anchorMediaId ?? sheet?.candidateMediaIds[0] ?? coverId;
  }
  const orderedIds = [
    ...(coverId ? [coverId] : []),
    ...asset.referenceImages.filter((id) => id !== coverId),
  ];
  const referenceImages: Array<{
    id: string;
    url: string;
    access_url: string;
    thumbnail_url: string;
  }> = [];
  for (const id of orderedIds) {
    const media = await mediaRefDto(db, id, storage);
    if (media) referenceImages.push(media);
  }
  const coverImage = coverId
    ? ((await mediaRefDto(db, coverId, storage)) ?? referenceImages[0] ?? null)
    : (referenceImages[0] ?? null);
  const locationSheetPrompt =
    asset.type === 'location' ? readLocationSheetPrompt(asset.data) : undefined;
  return {
    ...dto,
    referenceImages,
    coverImage,
    ...(locationSheetPrompt ? { locationSheetPrompt } : {}),
  };
}

function hasValidImageSignature(body: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (mimeType === 'image/png')
    return body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/webp') {
    return (
      body.subarray(0, 4).toString('ascii') === 'RIFF' &&
      body.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

async function requireMember(db: PrismaClient, userId: string, projectId: string, write = false) {
  return ensureProjectMember(db, userId, projectId, write);
}

async function projectOfStory(db: PrismaClient, id: string): Promise<string> {
  const entity = await db.story.findFirst({
    where: { id, deletedAt: null },
    select: { projectId: true },
  });
  if (!entity) throw new ApiError(404, 'STORY_NOT_FOUND', '故事不存在');
  return entity.projectId;
}

async function projectOfScene(db: PrismaClient, id: string): Promise<string> {
  const entity = await db.scene.findFirst({
    where: { id, deletedAt: null },
    select: { projectId: true },
  });
  if (!entity) throw new ApiError(404, 'SCENE_NOT_FOUND', '场景不存在');
  return entity.projectId;
}

async function projectOfShot(db: PrismaClient, id: string): Promise<string> {
  const entity = await db.shot.findFirst({
    where: { id, deletedAt: null },
    select: { projectId: true },
  });
  if (!entity) throw new ApiError(404, 'SHOT_NOT_FOUND', '镜头不存在');
  return entity.projectId;
}

async function resolveAppearance(
  db: PrismaClient,
  asset: { id: string; projectId: string; baseCharacterId: string | null; appearance: unknown },
  visited = new Set<string>(),
): Promise<unknown> {
  if (!asset.baseCharacterId) return asset.appearance;
  if (visited.has(asset.id)) throw new ApiError(409, 'CHARACTER_CYCLE', '角色基础外观存在循环引用');
  visited.add(asset.id);
  const base = await db.asset.findFirst({
    where: {
      id: asset.baseCharacterId,
      projectId: asset.projectId,
      type: 'character',
      deletedAt: null,
    },
  });
  if (!base) throw new ApiError(409, 'BASE_CHARACTER_NOT_FOUND', '基础角色不存在');
  return mergeInherited(await resolveAppearance(db, base, visited), asset.appearance);
}

async function resolveShotAssets(
  db: PrismaClient,
  projectId: string,
  characters: unknown,
  scene: {
    locationId: string | null;
    requirements: Array<{ assetId: string; status: string; approvedMediaId: string | null }>;
  },
): Promise<unknown> {
  const refs = (Array.isArray(characters) ? characters : []) as Array<{
    character_id?: string;
    presence?: string;
    outfit_override?: string | null;
    [key: string]: unknown;
  }>;
  const assets = await db.asset.findMany({
    where: {
      id: { in: refs.flatMap((item) => (item.character_id ? [item.character_id] : [])) },
      projectId,
      type: 'character',
      deletedAt: null,
    },
  });
  const resolvedCharacters = await Promise.all(
    refs.map(async (ref) => {
      const asset = assets.find((item) => item.id === ref.character_id);
      if (!asset) return { ...ref, asset: null };
      const binding = scene.requirements.find(
        (item) => item.assetId === asset.id && item.status === 'approved' && item.approvedMediaId,
      );
      return {
        ...ref,
        asset: { ...asset, resolved_appearance: await resolveAppearance(db, asset) },
        outfit:
          ref.outfit_override ?? (asset.data as Record<string, unknown>).default_outfit ?? null,
        visual_media_id:
          ref.presence === 'voice_only' || ref.presence === 'implied'
            ? null
            : (binding?.approvedMediaId ?? asset.referenceImages[0] ?? null),
      };
    }),
  );
  const location = scene.locationId
    ? await db.asset.findFirst({
        where: { id: scene.locationId, projectId, type: 'location', deletedAt: null },
      })
    : null;
  const locationBinding = location
    ? scene.requirements.find(
        (item) =>
          item.assetId === location.id && item.status === 'approved' && item.approvedMediaId,
      )
    : undefined;
  return {
    characters: resolvedCharacters,
    location: location
      ? {
          ...location,
          visual_media_id: locationBinding?.approvedMediaId ?? location.referenceImages[0] ?? null,
        }
      : null,
  };
}

async function audit(
  db: PrismaClient,
  request: FastifyRequest,
  projectId: string,
  entityType: string,
  entityId: string,
  action: string,
  before?: unknown,
  after?: unknown,
) {
  await db.auditLog.create({
    data: clean({
      actorId: request.user.sub,
      projectId,
      entityType,
      entityId,
      action,
      before: before == null ? undefined : json(before),
      after: after == null ? undefined : json(after),
    }),
  });
}

function shotDto(shot: Record<string, unknown>, resolved?: unknown) {
  return { ...shot, ...(resolved ? { resolved } : {}) };
}

export function registerResourceRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  storage?: StoragePort,
): void {
  app.get('/projects', async () => {
    const projects = await db.project.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    // §19 路径管理：currentPath 只是本机最近位置，列表顺便报告文件夹是否仍在，
    // 供前端展示「当前文件夹不存在 → [重新定位][移除本机绑定]」。
    return projects.map((project) => ({
      ...project,
      workspace_exists:
        project.workspacePath === null ? null : fs.existsSync(project.workspacePath),
    }));
  });
  app.post('/projects', async (request, reply) => {
    const body = projectBody.parse(request.body);
    const project = await createWorldProject(db, {
      name: body.name,
      description: body.description ?? null,
      memberUserId: request.user.sub,
      seed: false,
      ...(body.worldview ? { worldview: json(parseWorldview(body.worldview)) } : {}),
      ...(body.defaults ? { defaults: json({ language: 'zh-CN', ...body.defaults }) } : {}),
    });
    return reply.status(201).send(project);
  });
  app.get('/projects/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    await requireMember(db, request.user.sub, id);
    const project = await db.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在');
    return project;
  });
  app.patch('/projects/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    await requireMember(db, request.user.sub, id, true);
    const body = projectBody.partial().parse(request.body);
    const project = await db.project.update({
      where: { id },
      data: clean({
        name: body.name,
        description: body.description,
        defaults: body.defaults ? json(body.defaults) : undefined,
        // 编辑器语义：worldview 为整组替换（parseWorldview 规范化），
        // 允许清空单个字段；agent 侧走 mergeWorldview（proposal-applier）。
        worldview: body.worldview === undefined ? undefined : json(parseWorldview(body.worldview)),
      }),
    });
    // 改显示名后同步已绑定文件夹里的工作区标记（不重命名磁盘目录）。
    if (body.name !== undefined) syncWorkspaceMarkerName(project);
    return project;
  });
  app.delete('/projects/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const member = await requireMember(db, request.user.sub, id, true);
    if (member.role !== 'owner')
      throw new ApiError(403, 'OWNER_REQUIRED', '仅项目所有者可删除项目');
    await archiveWorldWorkspace(db, id);
    return reply.status(204).send();
  });
  // §19 移除本机绑定：保留世界运行数据，只清除与本机文件夹的路径关联。
  app.delete('/projects/:id/workspace', async (request) => {
    const { id } = idParams.parse(request.params);
    await requireMember(db, request.user.sub, id, true);
    return db.project.update({ where: { id }, data: { workspacePath: null } });
  });
  app.get('/projects/:id/settings', async (request) => {
    const { id } = idParams.parse(request.params);
    await requireMember(db, request.user.sub, id);
    return db.project.findUniqueOrThrow({ where: { id }, select: { settings: true } });
  });
  app.put('/projects/:id/settings', async (request) => {
    const { id } = idParams.parse(request.params);
    await requireMember(db, request.user.sub, id, true);
    const settings = z.record(z.unknown()).parse(request.body);
    return db.project.update({
      where: { id },
      data: { settings: json(settings) },
      select: { settings: true },
    });
  });

  app.get('/projects/:pid/stories', async (request) => {
    const { pid } = projectParams.parse(request.params);
    await requireMember(db, request.user.sub, pid);
    return db.story.findMany({
      where: { projectId: pid, deletedAt: null },
      orderBy: { order: 'asc' },
    });
  });
  app.post('/projects/:pid/stories', async (request, reply) => {
    const { pid } = projectParams.parse(request.params);
    await requireMember(db, request.user.sub, pid, true);
    const body = storyBodySchema.parse(request.body);
    const count = await db.story.count({ where: { projectId: pid, deletedAt: null } });
    const story = await db.story.create({
      data: clean({
        projectId: pid,
        order: count + 1,
        title: body.title,
        logline: body.logline,
        synopsis: body.synopsis,
        genre: body.genre,
        theme: body.theme,
        targetAudience: body.target_audience,
        tone: body.tone,
        targetDurationSeconds: body.target_duration_seconds,
        language: body.language,
        screenplay: body.screenplay,
        overrides: body.overrides ? json(body.overrides) : undefined,
      }),
    });
    return reply.status(201).send(story);
  });
  app.get('/stories/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    await requireMember(db, request.user.sub, await projectOfStory(db, id));
    const story = await db.story.findUnique({
      where: { id },
      include: {
        scenes: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
        segments: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
      },
    });
    return story
      ? { ...story, scenes: story.scenes.map(sceneDto), segments: story.segments }
      : null;
  });
  app.patch('/stories/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const projectId = await projectOfStory(db, id);
    await requireMember(db, request.user.sub, projectId, true);
    const body = storyBodySchema.partial().parse(request.body);
    return db.story.update({
      where: { id },
      data: clean({
        title: body.title,
        logline: body.logline,
        synopsis: body.synopsis,
        genre: body.genre,
        theme: body.theme,
        targetAudience: body.target_audience,
        tone: body.tone,
        targetDurationSeconds: body.target_duration_seconds,
        language: body.language,
        screenplay: body.screenplay,
        overrides:
          body.overrides === undefined
            ? undefined
            : body.overrides === null
              ? Prisma.JsonNull
              : json(body.overrides),
      }),
    });
  });
  app.delete('/stories/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireMember(db, request.user.sub, await projectOfStory(db, id), true);
    await db.story.update({ where: { id }, data: { deletedAt: new Date() } });
    return reply.status(204).send();
  });

  app.get('/stories/:sid/scenes', async (request) => {
    const { sid } = storyParams.parse(request.params);
    await requireMember(db, request.user.sub, await projectOfStory(db, sid));
    const scenes = await db.scene.findMany({
      where: { storyId: sid, deletedAt: null },
      orderBy: { order: 'asc' },
    });
    return scenes.map(sceneDto);
  });
  app.post('/stories/:sid/scenes', async (request, reply) => {
    const { sid } = storyParams.parse(request.params);
    const projectId = await projectOfStory(db, sid);
    await requireMember(db, request.user.sub, projectId, true);
    const body = sceneBodySchema.parse(request.body);
    if (body.segment_id) {
      const segment = await db.storySegment.findFirst({
        where: { id: body.segment_id, storyId: sid, deletedAt: null },
        select: { id: true },
      });
      if (!segment) throw new ApiError(400, 'INVALID_SEGMENT', '段落不存在或不属于该故事');
    }
    const count = await db.scene.count({ where: { storyId: sid, deletedAt: null } });
    const scene = await db.scene.create({
      data: clean({
        storyId: sid,
        projectId,
        order: body.order ?? count + 1,
        title: body.title,
        description: body.summary !== undefined ? body.summary : body.description,
        locationId: body.location_id,
        segmentId: body.segment_id,
        time: body.time_of_day !== undefined ? body.time_of_day : body.time,
        weather: body.weather,
        mood: body.mood,
        characterIds: body.character_ids ?? [],
        overrides: body.overrides ? json(body.overrides) : undefined,
      }),
    });
    return reply.status(201).send(sceneDto(scene));
  });
  app.get('/scenes/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    await requireMember(db, request.user.sub, await projectOfScene(db, id));
    const scene = await db.scene.findUnique({
      where: { id },
      include: {
        shots: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
        requirements: true,
      },
    });
    return scene ? sceneDto(scene) : null;
  });
  app.patch('/scenes/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const projectId = await projectOfScene(db, id);
    await requireMember(db, request.user.sub, projectId, true);
    const body = sceneBodySchema.partial().parse(request.body);
    if (body.segment_id) {
      const scene = await db.scene.findFirst({
        where: { id, deletedAt: null },
        select: { storyId: true },
      });
      if (!scene) throw new ApiError(404, 'SCENE_NOT_FOUND', '场景不存在');
      const segment = await db.storySegment.findFirst({
        where: { id: body.segment_id, storyId: scene.storyId, deletedAt: null },
        select: { id: true },
      });
      if (!segment) throw new ApiError(400, 'INVALID_SEGMENT', '段落不存在或不属于该故事');
    }
    return db.$transaction(async (tx) => {
      const updated = await tx.scene.update({
        where: { id },
        data: clean({
          title: body.title,
          description: body.summary !== undefined ? body.summary : body.description,
          locationId: body.location_id,
          segmentId: body.segment_id,
          time: body.time_of_day !== undefined ? body.time_of_day : body.time,
          weather: body.weather,
          mood: body.mood,
          order: body.order,
          characterIds: body.character_ids,
          overrides:
            body.overrides === undefined
              ? undefined
              : body.overrides === null
                ? Prisma.JsonNull
                : json(body.overrides),
          state: 'draft' as const,
          approvedSnapshot: Prisma.JsonNull,
        }),
      });
      await tx.visualAssetRequirement.updateMany({
        where: { sceneId: id },
        data: { status: 'pending', approvedMediaId: null, version: { increment: 1 } },
      });
      return sceneDto(updated);
    });
  });
  app.delete('/scenes/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireMember(db, request.user.sub, await projectOfScene(db, id), true);
    await db.scene.update({ where: { id }, data: { deletedAt: new Date() } });
    return reply.status(204).send();
  });
  app.post('/scenes/:id/reorder', async (request) => {
    const { id } = idParams.parse(request.params);
    const scene = await db.scene.findFirst({ where: { id, deletedAt: null } });
    if (!scene) throw new ApiError(404, 'SCENE_NOT_FOUND', '场景不存在');
    await requireMember(db, request.user.sub, scene.projectId, true);
    const reorder = reorderSchema.parse(request.body);
    const siblings = await db.scene.findMany({
      where: { storyId: scene.storyId, deletedAt: null },
      select: { id: true },
      orderBy: { order: 'asc' },
    });
    const orderedIds =
      'ordered_ids' in reorder
        ? reorder.ordered_ids
        : computeReorderIds(
            siblings.map((item) => item.id),
            id,
            reorder.new_order,
          );
    if (
      siblings.length !== orderedIds.length ||
      siblings.some((item) => !orderedIds.includes(item.id))
    ) {
      throw new ApiError(400, 'INVALID_REORDER_SET', '排序列表必须包含故事中的全部场景');
    }
    await db.$transaction([
      ...orderedIds.map((sceneId, index) =>
        db.scene.update({ where: { id: sceneId }, data: { order: -(index + 1) } }),
      ),
      ...orderedIds.map((sceneId, index) =>
        db.scene.update({ where: { id: sceneId }, data: { order: index + 1 } }),
      ),
    ]);
    return { ordered_ids: orderedIds, new_order: orderedIds.indexOf(id) + 1 };
  });

  app.get('/scenes/:sid/shots', async (request) => {
    const { sid } = sceneParams.parse(request.params);
    await requireMember(db, request.user.sub, await projectOfScene(db, sid));
    return db.shot.findMany({
      where: { sceneId: sid, deletedAt: null },
      orderBy: { order: 'asc' },
    });
  });
  app.post('/scenes/:sid/shots', async (request, reply) => {
    const { sid } = sceneParams.parse(request.params);
    const projectId = await projectOfScene(db, sid);
    await requireMember(db, request.user.sub, projectId, true);
    const body = shotCreateSchema.parse(request.body);
    const order =
      body.order ?? (await db.shot.count({ where: { sceneId: sid, deletedAt: null } })) + 1;
    const shot = await db.shot.create({
      data: clean({
        sceneId: sid,
        projectId,
        order,
        label: body.label,
        narrativeMode: body.narrative_mode,
        locationArea: body.location_area,
        camera: body.camera ? json(body.camera) : undefined,
        composition: body.composition ? json(body.composition) : undefined,
        lighting: body.lighting ? json(body.lighting) : undefined,
        color: body.color ? json(body.color) : undefined,
        mood: body.mood,
        style: body.style ? json(body.style) : undefined,
        characters: json(body.characters),
        dialogue: body.dialogue ? json(body.dialogue) : undefined,
        action: body.action ? json(body.action) : undefined,
        audio: body.audio ? json(body.audio) : undefined,
        prompt: json(body.prompt),
      }),
    });
    await maybeRecordEntityChange(db, {
      projectId,
      entityType: 'shot',
      entityId: shot.id,
      row: shot,
      changeKind: 'create',
      eventType: 'entity.created',
      idempotencyKey: `shot:create:${shot.id}`,
      expectedRevision: 0,
      actorId: request.user.sub,
      actorType: 'user',
      sourceType: 'http',
      sourceId: 'POST /scenes/:sid/shots',
    });
    return reply.status(201).send(shot);
  });
  app.get('/shots/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    await requireMember(db, request.user.sub, await projectOfShot(db, id));
    const shot = await db.shot.findUnique({
      where: { id },
      include: {
        outputs: { orderBy: { createdAt: 'desc' } },
        scene: { include: { requirements: true, story: { include: { project: true } } } },
      },
    });
    if (!shot) throw new ApiError(404, 'SHOT_NOT_FOUND', '镜头不存在');
    const inherited =
      shot.state === 'approved'
        ? shot.approvedSnapshot
        : mergeInherited(
            shot.scene.story.project.defaults,
            shot.scene.story.overrides,
            shot.scene.overrides,
            {
              style: shot.style,
              lighting: shot.lighting,
              color: shot.color,
              mood: shot.mood,
            },
          );
    const resolved =
      shot.state === 'approved'
        ? inherited
        : {
            context: inherited,
            assets: await resolveShotAssets(db, shot.projectId, shot.characters, shot.scene),
          };
    return shotDto(shot, resolved);
  });
  app.patch('/shots/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const projectId = await projectOfShot(db, id);
    await requireMember(db, request.user.sub, projectId, true);
    const existing = await db.shot.findUniqueOrThrow({ where: { id } });
    if (existing.state === 'approved')
      throw new ApiError(409, 'SHOT_FROZEN', '已批准镜头必须先解冻');
    const body = shotPatchSchema.parse(request.body);
    const updated = await db.shot.update({
      where: { id },
      data: clean({
        label: body.label,
        order: body.order,
        narrativeMode: body.narrative_mode,
        locationArea: body.location_area,
        camera:
          body.camera === undefined
            ? undefined
            : body.camera === null
              ? Prisma.JsonNull
              : json(body.camera),
        composition:
          body.composition === undefined
            ? undefined
            : body.composition === null
              ? Prisma.JsonNull
              : json(body.composition),
        lighting:
          body.lighting === undefined
            ? undefined
            : body.lighting === null
              ? Prisma.JsonNull
              : json(body.lighting),
        color:
          body.color === undefined
            ? undefined
            : body.color === null
              ? Prisma.JsonNull
              : json(body.color),
        mood: body.mood,
        style:
          body.style === undefined
            ? undefined
            : body.style === null
              ? Prisma.JsonNull
              : json(body.style),
        characters: body.characters ? json(body.characters) : undefined,
        dialogue:
          body.dialogue === undefined
            ? undefined
            : body.dialogue === null
              ? Prisma.JsonNull
              : json(body.dialogue),
        action:
          body.action === undefined
            ? undefined
            : body.action === null
              ? Prisma.JsonNull
              : json(body.action),
        audio:
          body.audio === undefined
            ? undefined
            : body.audio === null
              ? Prisma.JsonNull
              : json(body.audio),
        prompt: body.prompt ? json(body.prompt) : undefined,
      }),
    });
    await audit(db, request, projectId, 'shot', id, 'update', existing, updated);
    await maybeRecordEntityChange(db, {
      projectId,
      entityType: 'shot',
      entityId: id,
      row: updated,
      changeKind: 'update',
      eventType: 'entity.changed',
      idempotencyKey: `shot:update:${id}:${updated.updatedAt.toISOString()}`,
      actorId: request.user.sub,
      actorType: 'user',
      sourceType: 'http',
      sourceId: 'PATCH /shots/:id',
    });
    return updated;
  });
  app.delete('/shots/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireMember(db, request.user.sub, await projectOfShot(db, id), true);
    await db.shot.update({ where: { id }, data: { deletedAt: new Date() } });
    return reply.status(204).send();
  });
  app.post('/shots/:id/duplicate', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const projectId = await projectOfShot(db, id);
    await requireMember(db, request.user.sub, projectId, true);
    const source = await db.shot.findUniqueOrThrow({ where: { id } });
    const order =
      (await db.shot.count({ where: { sceneId: source.sceneId, deletedAt: null } })) + 1;
    const copy = await db.shot.create({
      data: clean({
        sceneId: source.sceneId,
        projectId,
        order,
        label: source.label ? `${source.label}（副本）` : null,
        state: 'draft' as const,
        narrativeMode: source.narrativeMode,
        locationArea: source.locationArea,
        camera: source.camera ?? undefined,
        composition: source.composition ?? undefined,
        lighting: source.lighting ?? undefined,
        color: source.color ?? undefined,
        mood: source.mood,
        style: source.style ?? undefined,
        characters: json(source.characters),
        dialogue: source.dialogue ?? undefined,
        action: source.action ?? undefined,
        audio: source.audio ?? undefined,
        prompt: json(source.prompt),
      }),
    });
    return reply.status(201).send(copy);
  });
  app.post('/shots/:id/reorder', async (request) => {
    const { id } = idParams.parse(request.params);
    const shot = await db.shot.findUniqueOrThrow({ where: { id } });
    await requireMember(db, request.user.sub, shot.projectId, true);
    const reorder = reorderSchema.parse(request.body);
    const siblings = await db.shot.findMany({
      where: { sceneId: shot.sceneId, deletedAt: null },
      select: { id: true },
      orderBy: { order: 'asc' },
    });
    const orderedIds =
      'ordered_ids' in reorder
        ? reorder.ordered_ids
        : computeReorderIds(
            siblings.map((item) => item.id),
            id,
            reorder.new_order,
          );
    if (
      siblings.length !== orderedIds.length ||
      siblings.some((item) => !orderedIds.includes(item.id))
    ) {
      throw new ApiError(400, 'INVALID_REORDER_SET', '排序列表必须包含场景中的全部镜头');
    }
    await db.$transaction([
      ...orderedIds.map((shotId, index) =>
        db.shot.update({ where: { id: shotId }, data: { order: -(index + 1) } }),
      ),
      ...orderedIds.map((shotId, index) =>
        db.shot.update({ where: { id: shotId }, data: { order: index + 1 } }),
      ),
    ]);
    return { ordered_ids: orderedIds, new_order: orderedIds.indexOf(id) + 1 };
  });
  app.post('/shots/:id/approve', async (request) => {
    const { id } = idParams.parse(request.params);
    const projectId = await projectOfShot(db, id);
    await requireMember(db, request.user.sub, projectId, true);
    const shot = await db.shot.findUnique({
      where: { id },
      include: {
        outputs: true,
        scene: { include: { story: { include: { project: true } }, requirements: true } },
      },
    });
    if (!shot || shot.state !== 'review')
      throw new ApiError(409, 'INVALID_STATE_TRANSITION', '仅待审核镜头可批准');
    if (!shot.outputs.some((output) => output.status === 'completed')) {
      throw new ApiError(409, 'COMPLETED_OUTPUT_REQUIRED', '批准镜头需要已完成的输出');
    }
    const snapshot = {
      context: mergeInherited(
        shot.scene.story.project.defaults,
        shot.scene.story.overrides,
        shot.scene.overrides,
        {
          camera: shot.camera,
          composition: shot.composition,
          lighting: shot.lighting,
          color: shot.color,
          mood: shot.mood,
          style: shot.style,
          characters: shot.characters,
        },
      ),
      assets: await resolveShotAssets(db, shot.projectId, shot.characters, shot.scene),
    };
    const updated = await db.shot.update({
      where: { id },
      data: { state: 'approved', approvedSnapshot: json(snapshot) },
    });
    await audit(db, request, projectId, 'shot', id, 'approve', shot, updated);
    return updated;
  });
  app.post('/shots/:id/unfreeze', async (request) => {
    const { id } = idParams.parse(request.params);
    const projectId = await projectOfShot(db, id);
    await requireMember(db, request.user.sub, projectId, true);
    const shot = await db.shot.findUniqueOrThrow({ where: { id } });
    if (shot.state !== 'approved')
      throw new ApiError(409, 'INVALID_STATE_TRANSITION', '仅已批准镜头可解冻');
    const updated = await db.shot.update({
      where: { id },
      data: { state: 'draft', approvedSnapshot: Prisma.JsonNull },
    });
    await audit(db, request, projectId, 'shot', id, 'unfreeze', shot, updated);
    return updated;
  });

  app.get('/projects/:pid/assets', async (request) => {
    const { pid } = projectParams.parse(request.params);
    await requireMember(db, request.user.sub, pid);
    const query = z
      .object({
        type: z.enum(['character', 'location']).optional(),
        asset_type: z.enum(['character', 'location']).optional(),
        state: z.enum(['draft', 'active', 'archived']).optional(),
        tag: z.string().optional(),
        q: z.string().optional(),
      })
      .parse(request.query);
    const assets = await db.asset.findMany({
      where: clean({
        projectId: pid,
        deletedAt: null,
        type: query.asset_type ?? query.type,
        state: query.state,
        tags: query.tag ? { has: query.tag } : undefined,
        OR: query.q
          ? [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { description: { contains: query.q, mode: 'insensitive' as const } },
            ]
          : undefined,
      }),
      orderBy: { updatedAt: 'desc' },
    });
    return Promise.all(assets.map((asset) => enrichAssetForClient(db, asset, storage)));
  });
  app.post('/projects/:pid/assets', async (request, reply) => {
    const { pid } = projectParams.parse(request.params);
    await requireMember(db, request.user.sub, pid, true);
    const parsed = parseAssetCreateInput(request.body);
    const asset =
      parsed.asset_type === 'character'
        ? await (async () => {
            const body = parsed.data;
            return db.asset.create({
              data: clean({
                projectId: pid,
                type: 'character' as const,
                state: body.state,
                name: body.name,
                description: body.description,
                tags: body.tags,
                referenceImages: body.reference_images,
                aliases: body.aliases,
                baseCharacterId: body.base_character_id,
                appearance: json(body.appearance),
                data: json(body),
              }),
            });
          })()
        : await (async () => {
            const body = parsed.data;
            return db.asset.create({
              data: {
                projectId: pid,
                type: 'location',
                state: body.state,
                name: body.name,
                description: body.description,
                tags: body.tags,
                referenceImages: body.reference_images,
                data: json(body),
              },
            });
          })();
    if (asset.type === 'character') {
      await ensureDefaultAppearanceVariant(db, asset);
    }
    await recordAssetHistory(db, {
      asset,
      changeKind: 'create',
      eventType: 'entity.created',
      idempotencyKey: `asset:create:${asset.id}`,
      actorId: request.user.sub,
      actorType: 'user',
      sourceType: 'http',
      sourceId: 'POST /projects/:pid/assets',
    });
    return reply.status(201).send(assetDto(asset));
  });
  app.get('/assets/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const asset = await db.asset.findFirst({ where: { id, deletedAt: null } });
    if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
    await requireMember(db, request.user.sub, asset.projectId);
    const enriched = await enrichAssetForClient(db, asset, storage);
    if (asset.type === 'character' && asset.baseCharacterId) {
      return {
        ...enriched,
        resolved_appearance: await resolveAppearance(db, asset),
      };
    }
    return enriched;
  });

  const sheetBody = z
    .object({
      prompt: z.string().trim().min(1).max(5_000).optional(),
      count: z.number().int().min(1).max(4).optional().default(1),
    })
    .strict();

  app.post('/assets/:id/location-sheet/draft-prompt', async (request) => {
    const { id } = idParams.parse(request.params);
    const asset = await db.asset.findFirst({ where: { id, deletedAt: null, type: 'location' } });
    if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '地点资产不存在');
    await requireMember(db, request.user.sub, asset.projectId, true);
    const providers = instrumentProviderBundle(
      db,
      createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()),
    );
    const traits = await withUsageContext({ projectId: asset.projectId, taskType: 'llm' }, () =>
      draftLocationSheetPrompt({
        db,
        assetId: asset.id,
        llm: providers.llm,
        llmModel: providers.llmModel,
        requestId: randomUUID(),
      }),
    );
    return {
      asset_id: asset.id,
      generation_prompt: traits.generation_prompt,
      appearance_summary: traits.appearance_summary,
      description: traits.description,
      provider: providers.selection.llm,
      model: providers.llmModel,
      note: '仅起草地点设定表提示词，未调用生图。',
    };
  });

  app.post('/assets/:id/location-sheet/generate', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const asset = await db.asset.findFirst({ where: { id, deletedAt: null, type: 'location' } });
    if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '地点资产不存在');
    await requireMember(db, request.user.sub, asset.projectId, true);
    const body = sheetBody.parse(request.body ?? {});
    const providers = instrumentProviderBundle(
      db,
      createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()),
    );
    const result = await withUsageContext(
      { projectId: asset.projectId, taskType: 'image_generate' },
      () =>
        generateLocationSheetImage({
          db,
          assetId: asset.id,
          image: providers.image,
          imageModel: providers.imageModel,
          requestId: randomUUID(),
          count: body.count,
          ...(body.prompt ? { prompt: body.prompt } : {}),
          ...(storage ? { storage } : {}),
        }),
    );
    return reply.status(201).send({
      asset_id: asset.id,
      media: {
        id: result.media.id,
        url: result.media.url,
        access_url: result.media.url,
      },
      medias: result.medias.map((item) => ({
        id: item.id,
        url: item.url,
        access_url: item.url,
      })),
      generation_prompt: result.generation_prompt,
      provider: providers.selection.image,
      model: providers.imageModel,
      note: '地点多角度设定表（一次 T2I），已设为封面。',
    });
  });
  app.patch('/assets/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const asset = await db.asset.findFirst({ where: { id, deletedAt: null } });
    if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
    await requireMember(db, request.user.sub, asset.projectId, true);
    if (asset.type !== 'character' && asset.type !== 'location') {
      throw new ApiError(400, 'UNSUPPORTED_ASSET_TYPE', '当前仅支持角色和地点资产');
    }
    const { body: patchInput, asOfWorldEventId, stageLabel } = splitAssetHistoryMeta(request.body);
    const body = parseAssetPatchInput(asset.type, patchInput);
    await ensureAssetBaseline(db, asset, {
      sourceType: 'http',
      actorId: request.user.sub,
    });
    const updated = await db.asset.update({
      where: { id },
      data: clean({
        name: body.name as string | undefined,
        description: body.description as string | undefined,
        state: body.state as 'draft' | 'active' | 'archived' | undefined,
        tags: body.tags as string[] | undefined,
        referenceImages: body.reference_images as string[] | undefined,
        aliases: body.aliases as string[] | undefined,
        baseCharacterId: body.base_character_id as string | null | undefined,
        appearance: body.appearance ? json(body.appearance) : undefined,
        data: json({ ...(asset.data as object), ...body }),
      }),
    });
    await recordAssetHistory(db, {
      asset: updated,
      changeKind: 'update',
      eventType: 'entity.changed',
      idempotencyKey: `asset:update:${updated.id}:${updated.updatedAt.toISOString()}`,
      actorId: request.user.sub,
      actorType: 'user',
      sourceType: 'http',
      sourceId: 'PATCH /assets/:id',
      asOfWorldEventId: asOfWorldEventId ?? null,
      stageLabel: stageLabel ?? null,
    });
    return assetDto(updated);
  });
  app.delete('/assets/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const asset = await db.asset.findFirst({ where: { id, deletedAt: null } });
    if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
    await requireMember(db, request.user.sub, asset.projectId, true);
    await db.asset.update({ where: { id }, data: { deletedAt: new Date() } });
    return reply.status(204).send();
  });
  app.get('/assets/:id/references', async (request) => {
    const { id } = idParams.parse(request.params);
    const asset = await db.asset.findFirst({ where: { id, deletedAt: null } });
    if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
    await requireMember(db, request.user.sub, asset.projectId);
    const [scenes, shots, requirements] = await Promise.all([
      db.scene.findMany({
        where: { projectId: asset.projectId, deletedAt: null },
        select: { id: true, locationId: true, characterIds: true },
      }),
      db.shot.findMany({
        where: { projectId: asset.projectId, deletedAt: null },
        select: { id: true, characters: true, style: true },
      }),
      db.visualAssetRequirement.findMany({
        where: { assetId: id },
        select: { id: true, sceneId: true },
      }),
    ]);
    return {
      scenes: scenes
        .filter((scene) => scene.locationId === id || scene.characterIds.includes(id))
        .map(({ id: sceneId }) => ({ id: sceneId, type: 'scene' })),
      shots: shots
        .filter((shot) => JSON.stringify([shot.characters, shot.style]).includes(id))
        .map(({ id: shotId }) => ({ id: shotId, type: 'shot' })),
      visual_requirements: requirements,
    };
  });

  app.get('/media/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const media = await db.media.findFirst({ where: { id, deletedAt: null } });
    if (!media) throw new ApiError(404, 'MEDIA_NOT_FOUND', '媒体不存在');
    await requireMember(db, request.user.sub, media.projectId);
    return {
      ...media,
      access_url: await resolveMediaAccessUrl(media.url, media.storageKey, storage),
    };
  });

  app.post('/assets/media/upload', async (request, reply) => {
    if (!storage) throw new ApiError(503, 'STORAGE_UNAVAILABLE', '对象存储尚未配置');
    const part = await request.file();
    if (!part) throw new ApiError(400, 'FILE_REQUIRED', '请选择要上传的图片');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(part.mimetype)) {
      throw new ApiError(415, 'INVALID_MEDIA_TYPE', '仅支持 JPEG、PNG 或 WebP 图片');
    }
    const fields = part.fields as Record<string, { value?: unknown } | undefined>;
    const projectId = multipartString(fields.project_id) ?? '';
    z.string().uuid().parse(projectId);
    await requireMember(db, request.user.sub, projectId, true);
    const assetId = multipartString(fields.asset_id);
    const asset = assetId
      ? await db.asset.findFirst({
          where: {
            id: z.string().uuid().parse(assetId),
            projectId,
            type: { in: ['character', 'location'] },
            deletedAt: null,
          },
        })
      : undefined;
    if (assetId && !asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '角色或场景资产不存在');
    const body = await part.toBuffer();
    if (!hasValidImageSignature(body, part.mimetype)) {
      throw new ApiError(415, 'INVALID_FILE_CONTENT', '图片内容与声明的格式不匹配');
    }
    const extension = part.filename.split('.').pop()?.toLowerCase() ?? 'bin';
    const key = `projects/${projectId}/images/${randomUUID()}.${extension}`;
    const stored = await storage.put({ key, body, content_type: part.mimetype });
    const media = await db.media.create({
      data: {
        projectId,
        name: part.filename,
        mediaType: 'image',
        mimeType: part.mimetype,
        storageKey: stored.key,
        url: stored.url,
        fileSizeBytes: BigInt(body.byteLength),
        source: 'uploaded',
      },
    });
    if (asset) {
      await db.asset.update({
        where: { id: asset.id },
        data: { referenceImages: { push: media.id } },
      });
    }
    return reply.status(201).send({
      ...media,
      fileSizeBytes: media.fileSizeBytes?.toString(),
      access_url: await storage.signedReadUrl(media.storageKey),
    });
  });
}
