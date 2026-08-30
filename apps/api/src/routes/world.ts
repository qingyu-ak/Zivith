import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma, PrismaClient } from '@zivith/database';
import {
  bindingsWorldRelation,
  compactWorldTimeBinding,
  compactWorldTimeBindings,
  parseWorldview,
  parseWorldTimeBindings,
  projectTimelinePatchSchema,
  proposalSchema,
  relationshipCreateSchema,
  resolveTemporalDimensions,
  timelineItemCreateSchema,
  timelineTrackCreateSchema,
  unknownDimensionIds,
  worldEventCreateSchema,
  worldEventPatchSchema,
  type TemporalDimension,
  type WorldTimeEnvelope,
  type MemoryIngestOps,
} from '@zivith/domain';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { applyProposal } from '../contexts/world/proposal-applier.js';
import { assetDto, sceneDto } from './resources.js';
import {
  WorldBuilderAgent,
  inferWorldStage,
  streamReplyChunks,
  worldBuilderPublicError,
  type WorldBuilderChatMessage,
} from '../contexts/world-builder/world-builder-agent.js';
import {
  buildWorldContext,
  assembleWorldContext,
} from '../contexts/world-builder/world-context.js';
import { detectWorldConflicts } from '../contexts/world-builder/conflict-detector.js';
import { formatMemoryDigest } from '../contexts/memory/retrieval.js';
import type { MemoryService } from '../contexts/memory/service.js';
import { formatSseEvent } from '../lib/sse.js';
import type { LLMAdapter } from '../ports/llm.js';

const idSchema = z.string().min(1).max(128);
const projectParams = z.object({ projectId: idSchema }).strict();
const entityParams = z.object({ id: idSchema }).strict();

const worldEventPatchBody = worldEventPatchSchema
  .extend({ state: z.enum(['draft', 'review', 'approved']).optional() })
  .strict();

async function requireProject(db: PrismaClient, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, name: true, description: true, worldview: true },
  });
  if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在');
  return project;
}

async function requireTimeline(db: PrismaClient, projectId: string) {
  let timeline = await db.projectTimeline.findFirst({
    where: { projectId, deletedAt: null },
  });
  if (!timeline) {
    timeline = await db.projectTimeline.create({
      data: {
        projectId,
        name: 'World Line',
        temporalDimensions: resolveTemporalDimensions([]) as Prisma.InputJsonValue,
      },
    });
  }
  return timeline;
}

async function projectDimensions(
  db: PrismaClient,
  projectId: string,
): Promise<TemporalDimension[]> {
  const timeline = await db.projectTimeline.findFirst({
    where: { projectId, deletedAt: null },
    select: { temporalDimensions: true },
  });
  return resolveTemporalDimensions(timeline?.temporalDimensions);
}

function assertBindingDimensions(bindings: WorldTimeEnvelope[], dimensions: TemporalDimension[]) {
  const missing = unknownDimensionIds(bindings, dimensions);
  if (missing.length > 0) {
    throw new ApiError(400, 'TEMPORAL_DIMENSION_NOT_FOUND', `未知时间维度：${missing.join('、')}`);
  }
}

const timelineQuerySchema = z
  .object({
    story_id: idSchema.optional(),
    view: z.enum(['presentation', 'world_overlay']).optional(),
    dimension_id: idSchema.optional(),
    track_kind: z.string().min(1).max(64).optional(),
    world_relation: z.enum(['follow', 'explicit', 'crossing', 'unknown']).optional(),
  })
  .strict();

function itemBindings(item: { worldTimeBindings: Prisma.JsonValue }): WorldTimeEnvelope[] {
  return parseWorldTimeBindings(item.worldTimeBindings ?? []);
}

function itemMatchesTimelineQuery(
  item: { worldTimeBindings: Prisma.JsonValue; entityType: string },
  query: z.infer<typeof timelineQuerySchema>,
): boolean {
  if (query.track_kind && item.entityType !== query.track_kind) return false;
  const bindings = itemBindings(item);
  if (query.dimension_id) {
    const hits = bindings.filter((binding) => binding.dimension_id === query.dimension_id);
    if (hits.length === 0) return false;
  }
  if (query.world_relation && bindingsWorldRelation(bindings) !== query.world_relation) {
    return false;
  }
  return true;
}

export function registerWorldRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  llm?: LLMAdapter,
  llmModel?: string,
  memory?: MemoryService | null,
) {
  registerProjectResources(app, db);
  registerWorldEventRoutes(app, db);
  registerRelationshipRoutes(app, db);
  registerTimelineRoutes(app, db);
  registerCreatorChatRoutes(app, db, llm, llmModel, memory);
}

// ---------------------------------------------------------------------------
// Project resources — Studio 三栏 Explorer 数据源
// ---------------------------------------------------------------------------

function registerProjectResources(app: FastifyInstance, db: PrismaClient) {
  app.get('/projects/:projectId/resources', async (request) => {
    const { projectId } = projectParams.parse(request.params);
    const project = await requireProject(db, projectId);

    const [stories, characters, locations, scenes, worldEvents, relationships, shots, timeline] =
      await Promise.all([
        db.story.findMany({
          where: { projectId, deletedAt: null },
          orderBy: { order: 'asc' },
        }),
        db.asset.findMany({
          where: { projectId, type: 'character', deletedAt: null },
          orderBy: { createdAt: 'asc' },
        }),
        db.asset.findMany({
          where: { projectId, type: 'location', deletedAt: null },
          orderBy: { createdAt: 'asc' },
        }),
        db.scene.findMany({
          where: { projectId, deletedAt: null },
          orderBy: { order: 'asc' },
        }),
        db.worldEvent.findMany({
          where: { projectId, deletedAt: null },
          orderBy: [{ presentationOrder: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        }),
        db.relationship.findMany({
          where: { projectId, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        }),
        db.shot.findMany({
          where: { projectId, deletedAt: null },
          select: {
            id: true,
            sceneId: true,
            projectId: true,
            order: true,
            label: true,
            state: true,
            mood: true,
            createdAt: true,
            camera: true,
            composition: true,
            lighting: true,
            color: true,
            style: true,
            prompt: true,
            prompts: {
              select: { id: true, positive: true, approvedAt: true },
              orderBy: { createdAt: 'desc' },
            },
            outputs: {
              select: {
                provider: true,
                model: true,
                status: true,
                isActive: true,
              },
              orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
              take: 1,
            },
          },
          orderBy: { order: 'asc' },
        }),
        db.projectTimeline.findFirst({
          where: { projectId, deletedAt: null },
          select: { temporalDimensions: true },
        }),
      ]);

    const entityCount = stories.length + characters.length + locations.length + worldEvents.length;
    const stage = entityCount === 0 ? 'bootstrap' : entityCount < 5 ? 'growing' : 'mature';

    const world = assembleWorldContext({
      projectId: project.id,
      projectName: project.name,
      worldview: project.worldview,
      stories: stories.map((story) => ({
        id: story.id,
        title: story.title,
        genre: story.genre,
        logline: story.logline,
      })),
      characters,
      locations,
      scenes: scenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        description: scene.description,
        time: scene.time,
      })),
      worldEvents: worldEvents.map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        order: event.presentationOrder,
      })),
      relationships: relationships.map((relationship) => ({
        id: relationship.id,
        kind: relationship.kind,
        label: relationship.label,
        direction: relationship.direction,
        sourceType: relationship.sourceType,
        sourceId: relationship.sourceId,
        targetType: relationship.targetType,
        targetId: relationship.targetId,
      })),
    });

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        worldview: parseWorldview(project.worldview),
      },
      stage,
      conflicts: detectWorldConflicts(world),
      temporal_dimensions: resolveTemporalDimensions(timeline?.temporalDimensions),
      entities: {
        stories,
        characters: characters.map((row) => assetDto(row as unknown as Record<string, unknown>)),
        locations: locations.map((row) => assetDto(row as unknown as Record<string, unknown>)),
        scenes: scenes.map((row) => sceneDto(row as unknown as Record<string, unknown>)),
        world_events: worldEvents,
        relationships,
        shots: shots.map((shot) => {
          const approved = shot.prompts.find((version) => version.approvedAt) ?? null;
          const output = shot.outputs[0] ?? null;
          return {
            id: shot.id,
            sceneId: shot.sceneId,
            projectId: shot.projectId,
            order: shot.order,
            label: shot.label,
            state: shot.state,
            mood: shot.mood,
            createdAt: shot.createdAt,
            camera: shot.camera,
            composition: shot.composition,
            lighting: shot.lighting,
            color: shot.color,
            style: shot.style,
            prompt: shot.prompt,
            approvedPrompt: approved
              ? {
                  id: approved.id,
                  positive: approved.positive,
                  approvedAt: approved.approvedAt,
                }
              : null,
            output: output
              ? {
                  provider: output.provider,
                  model: output.model,
                  status: output.status,
                  isActive: output.isActive,
                }
              : null,
          };
        }),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// WorldEvent (ADR-0011)
// ---------------------------------------------------------------------------

function registerWorldEventRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get('/projects/:projectId/world-events', async (request) => {
    const { projectId } = projectParams.parse(request.params);
    await requireProject(db, projectId);
    return db.worldEvent.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ presentationOrder: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
  });

  app.post('/projects/:projectId/world-events', async (request, reply) => {
    const { projectId } = projectParams.parse(request.params);
    await requireProject(db, projectId);
    const body = worldEventCreateSchema.parse(request.body ?? {});
    const envelope = compactWorldTimeBinding(body.world_time_envelope);
    assertBindingDimensions([envelope], await projectDimensions(db, projectId));
    const count = await db.worldEvent.count({ where: { projectId, deletedAt: null } });
    const created = await db.worldEvent.create({
      data: {
        projectId,
        title: body.title,
        description: body.description ?? null,
        worldTimeEnvelope: envelope as Prisma.InputJsonValue,
        anchorStoryId: body.anchor_story_id ?? null,
        presentationOrder: body.presentation_order ?? count + 1,
        characterIds: body.character_ids,
        sceneIds: body.scene_ids,
        state: 'draft',
      },
    });
    return reply.status(201).send(created);
  });

  app.patch('/world-events/:id', async (request) => {
    const { id } = entityParams.parse(request.params);
    const existing = await db.worldEvent.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, 'WORLD_EVENT_NOT_FOUND', '世界事件不存在');
    const body = worldEventPatchBody.parse(request.body ?? {});
    const envelope =
      body.world_time_envelope !== undefined
        ? compactWorldTimeBinding(body.world_time_envelope)
        : undefined;
    if (envelope !== undefined) {
      assertBindingDimensions([envelope], await projectDimensions(db, existing.projectId));
    }
    return db.worldEvent.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(envelope !== undefined ? { worldTimeEnvelope: envelope as Prisma.InputJsonValue } : {}),
        ...(body.anchor_story_id !== undefined ? { anchorStoryId: body.anchor_story_id } : {}),
        ...(body.presentation_order !== undefined
          ? { presentationOrder: body.presentation_order }
          : {}),
        ...(body.character_ids !== undefined ? { characterIds: body.character_ids } : {}),
        ...(body.scene_ids !== undefined ? { sceneIds: body.scene_ids } : {}),
        ...(body.state !== undefined ? { state: body.state } : {}),
      },
    });
  });

  app.delete('/world-events/:id', async (request, reply) => {
    const { id } = entityParams.parse(request.params);
    const existing = await db.worldEvent.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, 'WORLD_EVENT_NOT_FOUND', '世界事件不存在');
    await db.worldEvent.update({ where: { id }, data: { deletedAt: new Date() } });
    return reply.status(204).send();
  });

  app.post('/world-events/:id/approve', async (request) => {
    const { id } = entityParams.parse(request.params);
    const existing = await db.worldEvent.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, 'WORLD_EVENT_NOT_FOUND', '世界事件不存在');
    return db.worldEvent.update({ where: { id }, data: { state: 'approved' } });
  });
}

// ---------------------------------------------------------------------------
// Relationship (ADR-0012)
// ---------------------------------------------------------------------------

function registerRelationshipRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get('/projects/:projectId/relationships', async (request) => {
    const { projectId } = projectParams.parse(request.params);
    await requireProject(db, projectId);
    return db.relationship.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  });

  app.post('/projects/:projectId/relationships', async (request, reply) => {
    const { projectId } = projectParams.parse(request.params);
    await requireProject(db, projectId);
    const body = relationshipCreateSchema.parse(request.body ?? {});
    const created = await db.relationship.create({
      data: {
        projectId,
        kind: body.kind,
        sourceType: body.source.type,
        sourceId: body.source.id,
        targetType: body.target.type,
        targetId: body.target.id,
        direction: body.direction,
        label: body.label ?? null,
        description: body.description ?? null,
        ...(body.valid_from ? { validFrom: body.valid_from as Prisma.InputJsonValue } : {}),
        ...(body.valid_until ? { validUntil: body.valid_until as Prisma.InputJsonValue } : {}),
        state: 'draft',
      },
    });
    return reply.status(201).send(created);
  });

  app.patch('/relationships/:id', async (request) => {
    const { id } = entityParams.parse(request.params);
    const existing = await db.relationship.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, 'RELATIONSHIP_NOT_FOUND', '关系不存在');
    const body = relationshipCreateSchema
      .partial()
      .strict()
      .parse(request.body ?? {});
    return db.relationship.update({
      where: { id },
      data: {
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.source !== undefined
          ? { sourceType: body.source.type, sourceId: body.source.id }
          : {}),
        ...(body.target !== undefined
          ? { targetType: body.target.type, targetId: body.target.id }
          : {}),
        ...(body.direction !== undefined ? { direction: body.direction } : {}),
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.valid_from !== undefined
          ? { validFrom: body.valid_from as Prisma.InputJsonValue }
          : {}),
        ...(body.valid_until !== undefined
          ? { validUntil: body.valid_until as Prisma.InputJsonValue }
          : {}),
      },
    });
  });

  app.delete('/relationships/:id', async (request, reply) => {
    const { id } = entityParams.parse(request.params);
    const existing = await db.relationship.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, 'RELATIONSHIP_NOT_FOUND', '关系不存在');
    await db.relationship.update({ where: { id }, data: { deletedAt: new Date() } });
    return reply.status(204).send();
  });
}

// ---------------------------------------------------------------------------
// Presentation Timeline (world line) — H4+ / Track K
// ---------------------------------------------------------------------------

function registerTimelineRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get('/projects/:projectId/timeline', async (request) => {
    const { projectId } = projectParams.parse(request.params);
    const query = timelineQuerySchema.parse(request.query ?? {});
    await requireProject(db, projectId);
    const timeline = await requireTimeline(db, projectId);
    const tracks = await db.timelineTrack.findMany({
      where: { timelineId: timeline.id, deletedAt: null },
      orderBy: { order: 'asc' },
      include: {
        items: {
          where: { deletedAt: null },
          orderBy: { presentationOrder: 'asc' },
        },
      },
    });
    const filtered = tracks
      .filter((track) => !query.track_kind || track.kind === query.track_kind)
      .map((track) => ({
        ...track,
        items: track.items.filter((item) => itemMatchesTimelineQuery(item, query)),
      }));
    return {
      timeline: {
        ...timeline,
        temporalDimensions: resolveTemporalDimensions(timeline.temporalDimensions),
      },
      tracks: filtered,
      view: query.view ?? 'presentation',
    };
  });

  app.patch('/projects/:projectId/timeline', async (request) => {
    const { projectId } = projectParams.parse(request.params);
    await requireProject(db, projectId);
    const timeline = await requireTimeline(db, projectId);
    const body = projectTimelinePatchSchema.parse(request.body ?? {});
    const dimensions = body.temporal_dimensions
      ? resolveTemporalDimensions(body.temporal_dimensions)
      : undefined;
    const updated = await db.projectTimeline.update({
      where: { id: timeline.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(dimensions !== undefined
          ? { temporalDimensions: dimensions as Prisma.InputJsonValue }
          : {}),
      },
    });
    return {
      ...updated,
      temporalDimensions: resolveTemporalDimensions(updated.temporalDimensions),
    };
  });

  app.get('/projects/:projectId/timeline/items', async (request) => {
    const { projectId } = projectParams.parse(request.params);
    const query = timelineQuerySchema.parse(request.query ?? {});
    await requireProject(db, projectId);
    const timeline = await requireTimeline(db, projectId);
    const tracks = await db.timelineTrack.findMany({
      where: { timelineId: timeline.id, deletedAt: null },
      include: {
        items: {
          where: { deletedAt: null },
          orderBy: { presentationOrder: 'asc' },
        },
      },
    });
    const items = tracks.flatMap((track) =>
      track.items
        .filter((item) =>
          itemMatchesTimelineQuery(item, { ...query, track_kind: query.track_kind }),
        )
        .filter(() => !query.track_kind || track.kind === query.track_kind)
        .map((item) => ({ ...item, track_id: track.id, track_kind: track.kind })),
    );
    return { items, view: query.view ?? 'presentation' };
  });

  app.post('/projects/:projectId/timeline/tracks', async (request, reply) => {
    const { projectId } = projectParams.parse(request.params);
    await requireProject(db, projectId);
    const timeline = await requireTimeline(db, projectId);
    const body = timelineTrackCreateSchema.parse(request.body ?? {});
    const count = await db.timelineTrack.count({
      where: { timelineId: timeline.id, deletedAt: null },
    });
    const created = await db.timelineTrack.create({
      data: {
        timelineId: timeline.id,
        kind: body.kind,
        title: body.title,
        order: body.order ?? count + 1,
      },
    });
    return reply.status(201).send(created);
  });

  app.patch('/timeline/tracks/:trackId', async (request) => {
    const { trackId } = z.object({ trackId: idSchema }).strict().parse(request.params);
    const existing = await db.timelineTrack.findFirst({
      where: { id: trackId, deletedAt: null },
    });
    if (!existing) throw new ApiError(404, 'TRACK_NOT_FOUND', '轨道不存在');
    const body = timelineTrackCreateSchema
      .partial()
      .strict()
      .parse(request.body ?? {});
    return db.timelineTrack.update({
      where: { id: trackId },
      data: {
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
      },
    });
  });

  app.delete('/timeline/tracks/:trackId', async (request, reply) => {
    const { trackId } = z.object({ trackId: idSchema }).strict().parse(request.params);
    const existing = await db.timelineTrack.findFirst({
      where: { id: trackId, deletedAt: null },
    });
    if (!existing) throw new ApiError(404, 'TRACK_NOT_FOUND', '轨道不存在');
    await db.timelineTrack.update({ where: { id: trackId }, data: { deletedAt: new Date() } });
    return reply.status(204).send();
  });

  app.post('/timeline/tracks/:trackId/items', async (request, reply) => {
    const { trackId } = z.object({ trackId: idSchema }).strict().parse(request.params);
    const track = await db.timelineTrack.findFirst({
      where: { id: trackId, deletedAt: null },
    });
    if (!track) throw new ApiError(404, 'TRACK_NOT_FOUND', '轨道不存在');
    const body = timelineItemCreateSchema.parse(request.body ?? {});
    const bindings = compactWorldTimeBindings(body.world_time_bindings);
    const timeline = await db.projectTimeline.findFirst({
      where: { id: track.timelineId, deletedAt: null },
    });
    if (!timeline) throw new ApiError(404, 'TIMELINE_NOT_FOUND', '时间线不存在');
    assertBindingDimensions(bindings, resolveTemporalDimensions(timeline.temporalDimensions));
    const count = await db.timelineItem.count({
      where: { trackId, deletedAt: null },
    });
    const created = await db.timelineItem.create({
      data: {
        trackId,
        entityType: body.entity_type,
        entityId: body.entity_id,
        presentationOrder: body.presentation_order ?? count + 1,
        startOffsetMs: body.start_offset_ms ?? null,
        durationMs: body.duration_ms ?? null,
        worldTimeBindings: bindings as Prisma.InputJsonValue,
        metadata: body.metadata as Prisma.InputJsonValue,
      },
    });
    return reply.status(201).send(created);
  });

  app.patch('/timeline/items/:itemId', async (request) => {
    const { itemId } = z.object({ itemId: idSchema }).strict().parse(request.params);
    const existing = await db.timelineItem.findFirst({
      where: { id: itemId, deletedAt: null },
    });
    if (!existing) throw new ApiError(404, 'TIMELINE_ITEM_NOT_FOUND', '时间线项不存在');
    const body = timelineItemCreateSchema
      .partial()
      .strict()
      .parse(request.body ?? {});
    const bindings =
      body.world_time_bindings !== undefined
        ? compactWorldTimeBindings(body.world_time_bindings)
        : undefined;
    if (bindings !== undefined) {
      const track = await db.timelineTrack.findFirst({
        where: { id: existing.trackId, deletedAt: null },
      });
      if (!track) throw new ApiError(404, 'TRACK_NOT_FOUND', '轨道不存在');
      const timeline = await db.projectTimeline.findFirst({
        where: { id: track.timelineId, deletedAt: null },
      });
      if (!timeline) throw new ApiError(404, 'TIMELINE_NOT_FOUND', '时间线不存在');
      assertBindingDimensions(bindings, resolveTemporalDimensions(timeline.temporalDimensions));
    }
    return db.timelineItem.update({
      where: { id: itemId },
      data: {
        ...(body.entity_type !== undefined ? { entityType: body.entity_type } : {}),
        ...(body.entity_id !== undefined ? { entityId: body.entity_id } : {}),
        ...(body.presentation_order !== undefined
          ? { presentationOrder: body.presentation_order }
          : {}),
        ...(body.start_offset_ms !== undefined ? { startOffsetMs: body.start_offset_ms } : {}),
        ...(body.duration_ms !== undefined ? { durationMs: body.duration_ms } : {}),
        ...(bindings !== undefined ? { worldTimeBindings: bindings as Prisma.InputJsonValue } : {}),
        ...(body.metadata !== undefined
          ? { metadata: body.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
  });

  app.delete('/timeline/items/:itemId', async (request, reply) => {
    const { itemId } = z.object({ itemId: idSchema }).strict().parse(request.params);
    const existing = await db.timelineItem.findFirst({
      where: { id: itemId, deletedAt: null },
    });
    if (!existing) throw new ApiError(404, 'TIMELINE_ITEM_NOT_FOUND', '时间线项不存在');
    await db.timelineItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
    return reply.status(204).send();
  });
}

// ---------------------------------------------------------------------------
// Creator Chat (ADR-0010 revised / ADR-0013) — local single user
// ---------------------------------------------------------------------------

const createThreadBody = z
  .object({
    project_id: idSchema.nullable().optional(),
    title: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

const sendMessageBody = z
  .object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1).max(100_000),
    proposal: proposalSchema.nullable().optional(),
    proposal_key: z.string().max(256).nullable().optional(),
    focus: z
      .object({
        kind: z.enum([
          'character',
          'location',
          'scene',
          'world_event',
          'story',
          'relationship',
          'project',
        ]),
        id: idSchema,
        name: z.string().trim().min(1).max(200),
      })
      .strict()
      .optional(),
  })
  .strict();

const applyProposalBody = z.object({ proposal_key: z.string().max(256).optional() }).strict();

type ChatThreadRecord = {
  id: string;
  projectId: string | null;
  title: string | null;
  state: string;
  createdAt: Date;
  updatedAt: Date;
};

type RoleplayMeta = { characterName: string };

async function loadRoleplayMeta(
  db: PrismaClient,
  threadIds: string[],
): Promise<Map<string, RoleplayMeta>> {
  const meta = new Map<string, RoleplayMeta>();
  if (threadIds.length === 0) return meta;
  const roleplays = await db.roleplayThread.findMany({
    where: { threadId: { in: threadIds }, status: 'active' },
    select: { threadId: true, characterAssetId: true },
  });
  if (roleplays.length === 0) return meta;
  const assetIds = [...new Set(roleplays.map((item) => item.characterAssetId))];
  const assets =
    assetIds.length > 0
      ? await db.asset.findMany({
          where: { id: { in: assetIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(assets.map((asset) => [asset.id, asset.name]));
  for (const roleplay of roleplays) {
    meta.set(roleplay.threadId, {
      characterName: nameById.get(roleplay.characterAssetId) ?? '',
    });
  }
  return meta;
}

function chatThreadDto(
  thread: ChatThreadRecord,
  extras?: { projectName?: string | null; roleplay?: RoleplayMeta | null },
) {
  const roleplay = extras?.roleplay ?? null;
  return {
    id: thread.id,
    project_id: thread.projectId,
    project_name: extras?.projectName ?? null,
    title: thread.title,
    state: thread.state,
    kind: roleplay ? ('roleplay' as const) : ('world' as const),
    character_name: roleplay?.characterName ? roleplay.characterName : null,
    created_at: thread.createdAt.toISOString(),
    updated_at: thread.updatedAt.toISOString(),
  };
}

async function chatThreadDtos(
  db: PrismaClient,
  threads: ChatThreadRecord[],
  projectNameOf: (thread: ChatThreadRecord) => string | null,
) {
  const meta = await loadRoleplayMeta(
    db,
    threads.map((thread) => thread.id),
  );
  return threads.map((thread) =>
    chatThreadDto(thread, {
      projectName: projectNameOf(thread),
      roleplay: meta.get(thread.id) ?? null,
    }),
  );
}

function chatMessageDto(message: {
  id: string;
  threadId: string;
  role: string;
  content: string;
  proposal: unknown;
  proposalKey: string | null;
  proposalState: string | null;
  createdAt: Date;
}) {
  return {
    id: message.id,
    thread_id: message.threadId,
    role: message.role,
    content: message.content,
    proposal: message.proposal,
    proposal_key: message.proposalKey,
    proposal_state: message.proposalState,
    created_at: message.createdAt.toISOString(),
  };
}

async function createAssistantReply(
  db: PrismaClient,
  builder: WorldBuilderAgent,
  thread: { id: string; projectId: string | null },
  userMessage: { id: string; content: string },
  focus?: z.infer<typeof sendMessageBody>['focus'],
  memory?: MemoryService | null,
) {
  const rows = await db.creatorChatMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  const historyRows = rows.filter((row) => row.id !== userMessage.id);
  const world = thread.projectId ? await buildWorldContext(db, thread.projectId) : null;

  // M1 记忆：同步归档 + 三路召回注入
  let memoryOps: MemoryIngestOps | null = null;
  let memoryDigest: string | null = null;
  if (memory && thread.projectId) {
    memoryOps = await memory.ingest({
      messageId: userMessage.id,
      threadId: thread.id,
      projectId: thread.projectId,
      content: userMessage.content,
      world,
    });
    const retrieved = await memory.retrieve({
      projectId: thread.projectId,
      text: userMessage.content,
      world,
    });
    memoryDigest = formatMemoryDigest(retrieved) || null;
  }

  // M1 上下文窗口：滚动摘要 + 预算内最近原文（无 memory 时回退最近 40 条）
  let history: WorldBuilderChatMessage[];
  let evicted: Array<{ id: string; role: string; content: string }> = [];
  if (memory) {
    const window = await memory.getContextWindow(
      thread.id,
      historyRows.map((row) => ({ id: row.id, role: row.role, content: row.content })),
    );
    history = window.window.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    evicted = window.evicted;
  } else {
    history = historyRows.slice(-40).map((row) => ({
      role:
        row.role === 'user' || row.role === 'assistant' || row.role === 'system'
          ? row.role
          : 'system',
      content: row.content,
    }));
  }

  const response = await builder.respond({
    text: userMessage.content,
    history,
    world,
    stage: inferWorldStage(world),
    focus: focus ?? null,
    memoryDigest,
  });
  const proposalKey =
    response.proposals.length > 0
      ? `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      : null;
  const assistantMessage = await db.creatorChatMessage.create({
    data: {
      threadId: thread.id,
      role: 'assistant',
      content: response.reply,
      ...(response.proposals.length > 0
        ? {
            proposal: response.proposals as unknown as Prisma.InputJsonValue,
            proposalKey,
            proposalState: 'pending',
          }
        : {}),
    },
  });
  if (memory && evicted.length > 0) {
    await memory.updateThreadSummary(thread.id, evicted);
  }
  return { assistantMessage, response, memoryOps };
}

function wantsEventStream(request: FastifyRequest): boolean {
  const accept = request.headers.accept;
  return typeof accept === 'string' && accept.includes('text/event-stream');
}

async function pipeCreatorChatSse(
  request: FastifyRequest,
  reply: FastifyReply,
  db: PrismaClient,
  builder: WorldBuilderAgent,
  thread: { id: string; projectId: string | null },
  userMessage: {
    id: string;
    threadId: string;
    role: string;
    content: string;
    proposal: unknown;
    proposalKey: string | null;
    proposalState: string | null;
    createdAt: Date;
  },
  focus?: z.infer<typeof sendMessageBody>['focus'],
  memory?: MemoryService | null,
): Promise<void> {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  });

  let closed = false;
  const writeEvent = (event: string, data: unknown) => {
    if (closed) return;
    reply.raw.write(formatSseEvent(event, data));
  };
  const cleanup = () => {
    closed = true;
    request.raw.off('close', cleanup);
    try {
      reply.raw.end();
    } catch {
      // stream already closed
    }
  };
  request.raw.on('close', cleanup);

  writeEvent('user', { user_message: chatMessageDto(userMessage) });
  writeEvent('status', { phase: 'thinking' });

  try {
    const { assistantMessage, response, memoryOps } = await createAssistantReply(
      db,
      builder,
      thread,
      { id: userMessage.id, content: userMessage.content },
      focus,
      memory,
    );
    if (memoryOps) {
      writeEvent('memory', { ops: memoryOps });
    }
    await db.creatorChatThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });
    await streamReplyChunks(
      response.reply,
      (chunk) => {
        writeEvent('delta', { text: chunk });
      },
      { delayMs: closed ? 0 : 16 },
    );
    writeEvent('done', { assistant_message: chatMessageDto(assistantMessage) });
  } catch (error) {
    writeEvent('error', {
      message: worldBuilderPublicError(error),
    });
  } finally {
    cleanup();
  }
}

function registerCreatorChatRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  llm?: LLMAdapter,
  llmModel?: string,
  memory?: MemoryService | null,
) {
  const builder = new WorldBuilderAgent(
    llm ??
      ({
        provider: 'mock',
        supportedModels: [],
        complete: () => {
          throw new ApiError(503, 'LLM_UNAVAILABLE', 'LLM 不可用');
        },
        completeStructured: () => {
          throw new ApiError(503, 'LLM_UNAVAILABLE', 'LLM 不可用');
        },
      } as LLMAdapter),
    llmModel ?? 'mock-text-v1',
  );

  app.post('/creator-chats', async (request, reply) => {
    const body = createThreadBody.parse(request.body ?? {});
    if (body.project_id) await requireProject(db, body.project_id);
    const created = await db.creatorChatThread.create({
      data: {
        projectId: body.project_id ?? null,
        title: body.title ?? null,
        state: 'active',
      },
    });
    return reply.status(201).send(chatThreadDto(created));
  });

  app.get('/projects/:projectId/creator-chats', async (request) => {
    const { projectId } = projectParams.parse(request.params);
    const project = await requireProject(db, projectId);
    const threads = await db.creatorChatThread.findMany({
      where: { projectId, state: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    return chatThreadDtos(db, threads, () => project.name);
  });

  // Local single user (ADR-0013): list every active thread with its project name.
  app.get('/creator-chats', async () => {
    const threads = await db.creatorChatThread.findMany({
      where: { state: 'active' },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    const projectIds = [
      ...new Set(
        threads.map((thread) => thread.projectId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const projects =
      projectIds.length > 0
        ? await db.project.findMany({
            where: { id: { in: projectIds }, deletedAt: null },
            select: { id: true, name: true },
          })
        : [];
    const nameById = new Map(projects.map((project) => [project.id, project.name]));
    return chatThreadDtos(db, threads, (thread) =>
      thread.projectId ? (nameById.get(thread.projectId) ?? null) : null,
    );
  });

  app.get('/creator-chats/:threadId', async (request) => {
    const { threadId } = z.object({ threadId: idSchema }).strict().parse(request.params);
    const thread = await db.creatorChatThread.findFirst({ where: { id: threadId } });
    if (!thread) throw new ApiError(404, 'THREAD_NOT_FOUND', '对话不存在');
    const messages = await db.creatorChatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });
    const projectName = thread.projectId
      ? ((
          await db.project.findFirst({
            where: { id: thread.projectId, deletedAt: null },
            select: { name: true },
          })
        )?.name ?? null)
      : null;
    const roleplayMeta = await loadRoleplayMeta(db, [thread.id]);
    return {
      thread: chatThreadDto(thread, {
        projectName,
        roleplay: roleplayMeta.get(thread.id) ?? null,
      }),
      messages: messages.map(chatMessageDto),
    };
  });

  app.post('/creator-chats/:threadId/messages', async (request, reply) => {
    const { threadId } = z.object({ threadId: idSchema }).strict().parse(request.params);
    const thread = await db.creatorChatThread.findFirst({ where: { id: threadId } });
    if (!thread) throw new ApiError(404, 'THREAD_NOT_FOUND', '对话不存在');
    const body = sendMessageBody.parse(request.body ?? {});

    // ADR-0010 fence: only the agent (assistant) carries proposals to the world.
    if (body.role === 'user' && (body.proposal || body.proposal_key)) {
      throw new ApiError(400, 'USER_PROPOSAL_FORBIDDEN', '用户消息不允许携带提案');
    }

    const userMessage = await db.creatorChatMessage.create({
      data: {
        threadId,
        role: body.role,
        content: body.content,
        ...(body.proposal
          ? {
              proposal: body.proposal as Prisma.InputJsonValue,
              proposalKey: body.proposal_key ?? null,
              proposalState: 'pending',
            }
          : {}),
      },
    });

    if (body.role === 'user' && wantsEventStream(request)) {
      await pipeCreatorChatSse(request, reply, db, builder, thread, userMessage, body.focus, memory);
      return;
    }

    // User turns trigger the World Builder: read world → reply → propose.
    let assistantMessage = null;
    let memoryOps: MemoryIngestOps | null = null;
    if (body.role === 'user') {
      const created = await createAssistantReply(
        db,
        builder,
        thread,
        { id: userMessage.id, content: userMessage.content },
        body.focus,
        memory,
      );
      assistantMessage = created.assistantMessage;
      memoryOps = created.memoryOps;
    }

    await db.creatorChatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });
    return reply.status(201).send({
      user_message: chatMessageDto(userMessage),
      assistant_message: assistantMessage ? chatMessageDto(assistantMessage) : null,
      memory_ops: memoryOps,
    });
  });

  app.post('/creator-chats/:threadId/messages/stream', async (request, reply) => {
    const { threadId } = z.object({ threadId: idSchema }).strict().parse(request.params);
    const thread = await db.creatorChatThread.findFirst({ where: { id: threadId } });
    if (!thread) throw new ApiError(404, 'THREAD_NOT_FOUND', '对话不存在');
    const body = sendMessageBody.parse(request.body ?? {});
    if (body.role !== 'user') {
      throw new ApiError(400, 'STREAM_USER_ONLY', '流式发送仅支持用户消息');
    }
    if (body.proposal || body.proposal_key) {
      throw new ApiError(400, 'USER_PROPOSAL_FORBIDDEN', '用户消息不允许携带提案');
    }

    const userMessage = await db.creatorChatMessage.create({
      data: {
        threadId,
        role: 'user',
        content: body.content,
      },
    });
    await pipeCreatorChatSse(request, reply, db, builder, thread, userMessage, body.focus, memory);
  });

  app.post('/creator-chats/:threadId/proposals/:messageId/apply', async (request) => {
    const { threadId, messageId } = z
      .object({ threadId: idSchema, messageId: idSchema })
      .strict()
      .parse(request.params);
    const body = applyProposalBody.parse(request.body ?? {});

    // World routes are unauthenticated (ADR-0013), but the web client still sends
    // a Bearer token. Resolve the signed-in user when present so new projects get
    // a member record visible in /projects; anonymous callers fall back to the
    // local owner inside applyCreateProject.
    let memberUserId: string | null = null;
    try {
      await request.jwtVerify();
      memberUserId = (request.user as { sub?: string } | undefined)?.sub ?? null;
    } catch {
      memberUserId = null;
    }

    const thread = await db.creatorChatThread.findFirst({ where: { id: threadId } });
    if (!thread) throw new ApiError(404, 'THREAD_NOT_FOUND', '对话不存在');

    const message = await db.creatorChatMessage.findFirst({
      where: { id: messageId, threadId },
    });
    if (!message) throw new ApiError(404, 'MESSAGE_NOT_FOUND', '消息不存在');
    if (!message.proposal || !message.proposalKey) {
      throw new ApiError(400, 'NO_PROPOSAL', '该消息没有待确认的提案');
    }
    if (body.proposal_key && body.proposal_key !== message.proposalKey) {
      throw new ApiError(400, 'PROPOSAL_KEY_MISMATCH', '提案标识不匹配');
    }
    if (message.proposalState && message.proposalState !== 'pending') {
      throw new ApiError(409, 'PROPOSAL_ALREADY_HANDLED', '提案已处理，不能重复确认');
    }

    // The agent stores a proposals array on the assistant message (ADR-0010).
    // Confirming applies every proposal in the message, in order.
    const rawProposals = message.proposal;
    const proposals = (Array.isArray(rawProposals) ? rawProposals : [rawProposals])
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => proposalSchema.parse(item));
    if (proposals.length === 0) {
      throw new ApiError(400, 'NO_PROPOSAL', '该消息没有可应用的提案');
    }

    const { results, skipped } = await db.$transaction(async (tx) => {
      const results: Array<{
        kind: string;
        project_id: string;
        entity_type: string;
        entity_id: string;
        title: string;
      }> = [];
      const skipped: Array<{ kind: string; reason: string }> = [];
      // Track the project across a proposal batch: create_project may appear
      // alongside entity proposals in the same message.
      let currentProjectId = thread.projectId;
      for (const proposal of proposals) {
        if (proposal.kind === 'create_project' && currentProjectId) {
          // 已有关联项目时，LLM 偶尔会误产出 create_project（创作者意图是向已有
          // 项目添加实体，而非重复建项目）。跳过该提案而不阻断整批实体提案；
          // 全部提案均被跳过时才报错（保留「纯重复建项目」的原语义）。
          skipped.push({ kind: proposal.kind, reason: 'PROJECT_ALREADY_EXISTS' });
          continue;
        }
        const result = await applyProposal(tx, proposal, currentProjectId, memberUserId);
        results.push({
          kind: result.kind,
          project_id: result.projectId,
          entity_type: result.entityType,
          entity_id: result.entityId,
          title: result.title,
        });
        if (result.entityType === 'project') {
          currentProjectId = result.projectId;
          await tx.creatorChatThread.update({
            where: { id: threadId },
            data: {
              projectId: result.projectId,
              ...(thread.title?.trim() ? {} : { title: result.title }),
            },
          });
        }
      }
      if (results.length === 0 && skipped.length > 0) {
        throw new ApiError(400, 'PROJECT_ALREADY_EXISTS', '该对话已关联项目，不能重复创建');
      }
      await tx.creatorChatMessage.update({
        where: { id: messageId },
        data: { proposalState: 'applied' },
      });
      return { results, skipped };
    });
    return { applied: results, skipped };
  });
}
