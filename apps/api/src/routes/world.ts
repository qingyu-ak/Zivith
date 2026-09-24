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
import { applyConversationRollback } from '../contexts/chat/apply-conversation-rollback.js';
import {
  canRollbackToMessage,
  stampAppliedEntityIds,
} from '../contexts/chat/conversation-rollback.js';
import { isGroupChat, parseParticipantIds } from '../contexts/roleplay/group-chat.js';
import { contentRestatesEvent } from '../contexts/roleplay/world-change-drafter.js';
import {
  archiveCreatorChat,
  createWorldInFolder,
  createWorldWorkspace,
  inspectWorkspaceFolder,
  isWorkspaceSeed,
  normalizeWorkspacePath,
  openWorldFolder,
} from '../contexts/world/workspace.js';
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
import { getEntityRevision, listEntityRevisions } from '../contexts/history/entity-revisions.js';
import { flushHttpStream, formatSseEvent } from '../lib/sse.js';
import { canReuseLastUser, isOpenProposalState } from '../lib/chat-turn.js';
import type { LLMAdapter } from '../ports/llm.js';
import {
  effortDto,
  resolveAgentEffort,
  type EffectiveAgentEffort,
} from '../contexts/agent-effort.js';
import { resolveRuntimeLlm } from '../contexts/llm-runtime.js';

const idSchema = z.string().min(1).max(128);
const projectParams = z.object({ projectId: idSchema }).strict();
const entityParams = z.object({ id: idSchema }).strict();

const worldEventPatchBody = worldEventPatchSchema
  .extend({ state: z.enum(['draft', 'review', 'approved']).optional() })
  .strict();

async function requireProject(db: PrismaClient, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      worldview: true,
      settings: true,
      workspacePath: true,
    },
  });
  if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在');
  return project;
}

async function requireOpenThread(db: PrismaClient, threadId: string) {
  const thread = await db.creatorChatThread.findFirst({ where: { id: threadId } });
  if (!thread || thread.state !== 'active') {
    throw new ApiError(404, 'THREAD_NOT_FOUND', '对话不存在');
  }
  if (!thread.projectId) {
    return { thread, projectName: null as string | null, workspacePath: null as string | null };
  }
  const project = await db.project.findFirst({
    where: { id: thread.projectId, deletedAt: null },
    select: { name: true, workspacePath: true },
  });
  if (!project) throw new ApiError(404, 'THREAD_NOT_FOUND', '对话不存在');
  return { thread, projectName: project.name, workspacePath: project.workspacePath };
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
  registerEntityRevisionRoutes(app, db);
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
      workspaceSeed: isWorkspaceSeed(project),
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
        workspace_path: project.workspacePath,
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
// EntityRevision 只读面（角色/地点阶段状态；不是第二条时间线）
// ---------------------------------------------------------------------------

function registerEntityRevisionRoutes(app: FastifyInstance, db: PrismaClient) {
  const revisionParams = z
    .object({
      projectId: idSchema,
      entityType: z.string().min(1).max(64),
      entityId: idSchema,
    })
    .strict();
  const revisionOneParams = revisionParams.extend({
    revision: z.coerce.number().int().positive(),
  });
  const revisionQuery = z
    .object({
      as_of_world_event_id: idSchema.optional(),
      presentation_order: z.coerce.number().int().optional(),
    })
    .strict();

  app.get('/projects/:projectId/entities/:entityType/:entityId/revisions', async (request) => {
    const { projectId, entityType, entityId } = revisionParams.parse(request.params);
    await requireProject(db, projectId);
    const query = revisionQuery.parse(request.query);
    return listEntityRevisions(db, projectId, entityType, entityId, {
      ...(query.as_of_world_event_id ? { asOfWorldEventId: query.as_of_world_event_id } : {}),
      ...(query.presentation_order !== undefined
        ? { presentationOrder: query.presentation_order }
        : {}),
    });
  });

  app.get(
    '/projects/:projectId/entities/:entityType/:entityId/revisions/:revision',
    async (request) => {
      const { projectId, entityType, entityId, revision } = revisionOneParams.parse(request.params);
      await requireProject(db, projectId);
      return getEntityRevision(db, projectId, entityType, entityId, revision);
    },
  );
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

async function forgetChatFactsForEvent(
  db: PrismaClient,
  event: { projectId: string; title: string; description: string | null },
) {
  const [characters, atoms] = await Promise.all([
    db.asset.findMany({
      where: { projectId: event.projectId, type: 'character', deletedAt: null },
      select: { name: true },
    }),
    db.memoryAtom.findMany({
      where: {
        projectId: event.projectId,
        status: 'active',
        factType: { in: ['event', 'episodic'] },
      },
      select: { id: true, content: true },
    }),
  ]);
  const names = characters.map((character) => character.name);
  const ids = atoms
    .filter((atom) =>
      contentRestatesEvent(atom.content, { title: event.title, description: event.description }, names),
    )
    .map((atom) => atom.id);
  if (ids.length === 0) return;
  await db.memoryAtom.updateMany({
    where: { id: { in: ids } },
    data: { status: 'invalidated', validTo: new Date() },
  });
}

  app.delete('/world-events/:id', async (request, reply) => {
    const { id } = entityParams.parse(request.params);
    const existing = await db.worldEvent.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, 'WORLD_EVENT_NOT_FOUND', '世界事件不存在');
    await db.worldEvent.update({ where: { id }, data: { deletedAt: new Date() } });
    await forgetChatFactsForEvent(db, existing);
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

const openFolderBody = z
  .object({
    path: z.string().trim().min(1).max(4096),
    // §18.1/§18.2/§18.3：异常场景的处理方式由前端明确选择，API 不静默降级。
    on_missing: z.enum(['error', 'import']).optional(),
    on_corrupt: z.enum(['error', 'recover']).optional(),
    on_orphan: z.enum(['error', 'create']).optional(),
    rebind_project_id: z.string().trim().min(1).optional(),
  })
  .strict();

const createFolderBody = z
  .object({
    path: z.string().trim().min(1).max(4096),
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const patchThreadBody = z
  .object({
    title: z.string().trim().min(1).max(200),
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
    effort: z
      .union([
        z.enum(['fast', 'balanced', 'deep']),
        z.object({ level: z.enum(['fast', 'balanced', 'deep']) }).strict(),
      ])
      .optional(),
    retry: z.boolean().optional(),
  })
  .strict();

const applyProposalBody = z.object({ proposal_key: z.string().max(256).optional() }).strict();

type ChatThreadRecord = {
  id: string;
  projectId: string | null;
  title: string | null;
  state: string;
  activeHeadMessageId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RoleplayMeta = {
  characterName: string;
  userCharacterName: string | null;
  participantNames: string[];
  isGroup: boolean;
};

async function loadRoleplayMeta(
  db: PrismaClient,
  threadIds: string[],
): Promise<Map<string, RoleplayMeta>> {
  const meta = new Map<string, RoleplayMeta>();
  if (threadIds.length === 0) return meta;
  const roleplays = await db.roleplayThread.findMany({
    where: { threadId: { in: threadIds }, status: 'active' },
    select: {
      threadId: true,
      characterAssetId: true,
      userCharacterAssetId: true,
      participantAssetIds: true,
    },
  });
  if (roleplays.length === 0) return meta;
  const assetIds = [
    ...new Set(
      roleplays.flatMap((item) => {
        const participants = parseParticipantIds(item.participantAssetIds, item.characterAssetId);
        return item.userCharacterAssetId
          ? [...participants, item.userCharacterAssetId]
          : participants;
      }),
    ),
  ];
  const assets =
    assetIds.length > 0
      ? await db.asset.findMany({
          where: { id: { in: assetIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(assets.map((asset) => [asset.id, asset.name]));
  for (const roleplay of roleplays) {
    const participants = parseParticipantIds(
      roleplay.participantAssetIds,
      roleplay.characterAssetId,
    );
    meta.set(roleplay.threadId, {
      characterName: nameById.get(roleplay.characterAssetId) ?? '',
      userCharacterName: roleplay.userCharacterAssetId
        ? (nameById.get(roleplay.userCharacterAssetId) ?? null)
        : null,
      participantNames: participants.map((id) => nameById.get(id) ?? id),
      isGroup: isGroupChat(participants),
    });
  }
  return meta;
}

function chatThreadDto(
  thread: ChatThreadRecord,
  extras?: {
    projectName?: string | null;
    workspacePath?: string | null;
    roleplay?: RoleplayMeta | null;
    pendingProposalCount?: number;
  },
) {
  const roleplay = extras?.roleplay ?? null;
  return {
    id: thread.id,
    project_id: thread.projectId,
    project_name: extras?.projectName ?? null,
    workspace_path: extras?.workspacePath ?? null,
    title: thread.title,
    state: thread.state,
    kind: roleplay ? ('roleplay' as const) : ('world' as const),
    character_name: roleplay?.characterName ? roleplay.characterName : null,
    user_character_name: roleplay?.userCharacterName ?? null,
    is_group: roleplay?.isGroup ?? false,
    participant_names: roleplay?.participantNames ?? [],
    active_head_message_id: thread.activeHeadMessageId ?? null,
    pending_proposal_count: extras?.pendingProposalCount ?? 0,
    created_at: thread.createdAt.toISOString(),
    updated_at: thread.updatedAt.toISOString(),
  };
}

async function loadPendingProposalCounts(
  db: PrismaClient,
  threadIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (threadIds.length === 0) return counts;
  const rows = await db.creatorChatMessage.groupBy({
    by: ['threadId'],
    where: { threadId: { in: threadIds }, proposalState: 'pending', suppressed: false },
    _count: { id: true },
  });
  for (const row of rows) {
    counts.set(row.threadId, row._count.id);
  }
  return counts;
}

async function chatThreadDtos(
  db: PrismaClient,
  threads: ChatThreadRecord[],
  extrasOf: (thread: ChatThreadRecord) => {
    projectName: string | null;
    workspacePath: string | null;
  },
) {
  const ids = threads.map((thread) => thread.id);
  const [meta, pending] = await Promise.all([
    loadRoleplayMeta(db, ids),
    loadPendingProposalCounts(db, ids),
  ]);
  return threads.map((thread) =>
    chatThreadDto(thread, {
      ...extrasOf(thread),
      roleplay: meta.get(thread.id) ?? null,
      pendingProposalCount: pending.get(thread.id) ?? 0,
    }),
  );
}

const PROPOSAL_KIND_LABEL: Record<string, string> = {
  create_project: '项目',
  create_world_event: '事件',
  create_character: '角色',
  create_location: '地点',
  create_scene: '场景',
  create_relationship: '关系',
  update_entity: '更新',
};

function proposalItemName(payload: Record<string, unknown>): string {
  const fields = payload.fields;
  const fromFields =
    typeof fields === 'object' && fields !== null
      ? (() => {
          const record = fields as Record<string, unknown>;
          const name = record.name;
          const title = record.title;
          if (typeof name === 'string' && name.trim()) return name.trim();
          if (typeof title === 'string' && title.trim()) return title.trim();
          return null;
        })()
      : null;
  for (const key of ['name', 'title', 'label'] as const) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fromFields ?? '未命名';
}

function summarizeProposals(raw: unknown): string {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const parts: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const kind = typeof record.kind === 'string' ? record.kind : '';
    const payload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : {};
    const label = PROPOSAL_KIND_LABEL[kind] ?? kind ?? '写入';
    parts.push(`${label}「${proposalItemName(payload)}」`);
  }
  return parts.join(' · ');
}

function chatMessageDto(
  message: {
    id: string;
    threadId: string;
    role: string;
    content: string;
    proposal: unknown;
    proposalKey: string | null;
    proposalState: string | null;
    speakerAssetId?: string | null;
    suppressed?: boolean;
    createdAt: Date;
  },
  speakerName?: string | null,
) {
  return {
    id: message.id,
    thread_id: message.threadId,
    role: message.role,
    content: message.content,
    proposal: message.proposal,
    proposal_key: message.proposalKey,
    proposal_state: message.proposalState,
    speaker_asset_id: message.speakerAssetId ?? null,
    speaker_name: speakerName ?? null,
    suppressed: Boolean(message.suppressed),
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
  effort?: EffectiveAgentEffort,
) {
  const resolved = effort ?? resolveAgentEffort();
  const rows = await db.creatorChatMessage.findMany({
    where: { threadId: thread.id, suppressed: false },
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
      topK: resolved.schedule.retrieve_top_k,
    });
    memoryDigest = formatMemoryDigest(retrieved) || null;
  }

  // M1 上下文窗口：滚动摘要 + 预算内最近原文（无 memory 时回退最近 N 条）
  let history: WorldBuilderChatMessage[];
  let evicted: Array<{ id: string; role: string; content: string }> = [];
  if (memory) {
    const window = await memory.getContextWindow(
      thread.id,
      historyRows.map((row) => ({ id: row.id, role: row.role, content: row.content })),
      {
        tokenBudget: resolved.limits.max_context_tokens,
        keepRecentMessages: resolved.schedule.keep_recent_messages,
      },
    );
    history = window.window.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    evicted = window.evicted;
  } else {
    history = historyRows.slice(-resolved.schedule.history_turns).map((row) => ({
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
    effort: resolved,
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

async function lastMessageForTurn(db: PrismaClient, threadId: string, retry?: boolean) {
  const last = await db.creatorChatMessage.findFirst({
    where: { threadId, suppressed: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!retry || !last || last.role !== 'assistant') return last;
  await db.creatorChatMessage.update({
    where: { id: last.id },
    data: {
      suppressed: true,
      ...(last.proposalState === 'pending' ? { proposalState: 'rejected' } : {}),
    },
  });
  return db.creatorChatMessage.findFirst({
    where: { threadId, suppressed: false },
    orderBy: { createdAt: 'desc' },
  });
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
  effort?: EffectiveAgentEffort,
): Promise<void> {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Content-Encoding': 'identity',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  });
  flushHttpStream(reply.raw);

  let closed = false;
  const writeEvent = (event: string, data: unknown) => {
    if (closed) return;
    reply.raw.write(formatSseEvent(event, data));
    flushHttpStream(reply.raw);
  };
  const markClientGone = () => {
    closed = true;
  };
  reply.raw.on('close', markClientGone);
  const cleanup = () => {
    closed = true;
    reply.raw.off('close', markClientGone);
    try {
      reply.raw.end();
    } catch {
      // stream already closed
    }
  };

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
      effort,
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
    if (closed) {
      await db.creatorChatMessage.update({
        where: { id: assistantMessage.id },
        data: {
          suppressed: true,
          proposalState:
            assistantMessage.proposalState === 'pending'
              ? 'rejected'
              : assistantMessage.proposalState,
        },
      });
      return;
    }
    writeEvent('done', {
      assistant_message: chatMessageDto(assistantMessage),
      effort: effort ? effortDto(effort) : effortDto(resolveAgentEffort()),
    });
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
  const injectedBuilder = llm ? new WorldBuilderAgent(llm, llmModel ?? 'mock-text-v1') : null;

  function currentBuilder(): WorldBuilderAgent {
    if (injectedBuilder) return injectedBuilder;
    const live = resolveRuntimeLlm(db);
    return new WorldBuilderAgent(live.llm, live.model);
  }

  app.post('/creator-chats', async (request, reply) => {
    const body = createThreadBody.parse(request.body ?? {});
    let memberUserId: string | null = null;
    try {
      await request.jwtVerify();
      memberUserId = (request.user as { sub?: string } | undefined)?.sub ?? null;
    } catch {
      memberUserId = null;
    }

    if (body.project_id) {
      await requireProject(db, body.project_id);
      const created = await db.creatorChatThread.create({
        data: {
          projectId: body.project_id,
          title: body.title ?? null,
          state: 'active',
        },
      });
      const project = await db.project.findFirst({
        where: { id: body.project_id, deletedAt: null },
        select: { name: true, workspacePath: true },
      });
      return reply.status(201).send(
        chatThreadDto(created, {
          projectName: project?.name ?? null,
          workspacePath: project?.workspacePath ?? null,
        }),
      );
    }

    const { project, thread } = await createWorldWorkspace(db, {
      title: body.title ?? null,
      memberUserId,
    });
    return reply.status(201).send(
      chatThreadDto(thread, {
        projectName: project.name,
        workspacePath: project.workspacePath,
      }),
    );
  });

  // §8 打开世界前先检查文件夹身份，前端据此渲染 §18 的异常选择对话框。
  app.post('/folders/inspect', (request) => {
    const body = openFolderBody.pick({ path: true }).parse(request.body ?? {});
    const workspacePath = normalizeWorkspacePath(body.path);
    const inspect = inspectWorkspaceFolder(workspacePath);
    return {
      path: workspacePath,
      state: inspect.state,
      world_id: inspect.state === 'ok' ? inspect.marker.worldId : null,
      name: inspect.state === 'ok' ? inspect.marker.name : null,
    };
  });

  // §7 在选定文件夹中创建新世界（.zivith/ + 基础目录 + 数据库 World 同 worldId）。
  app.post('/folders/create', async (request, reply) => {
    const body = createFolderBody.parse(request.body ?? {});
    let memberUserId: string | null = null;
    try {
      await request.jwtVerify();
      memberUserId = (request.user as { sub?: string } | undefined)?.sub ?? null;
    } catch {
      memberUserId = null;
    }
    const { project, thread } = await createWorldInFolder(db, {
      folderPath: body.path,
      ...(body.name !== undefined ? { name: body.name } : {}),
      description: body.description ?? null,
      memberUserId,
    });
    return reply.status(201).send(
      chatThreadDto(thread, {
        projectName: project.name,
        workspacePath: project.workspacePath,
      }),
    );
  });

  app.post('/folders/open', async (request, reply) => {
    const body = openFolderBody.parse(request.body ?? {});
    let memberUserId: string | null = null;
    try {
      await request.jwtVerify();
      memberUserId = (request.user as { sub?: string } | undefined)?.sub ?? null;
    } catch {
      memberUserId = null;
    }
    const { project, thread } = await openWorldFolder(db, body.path, {
      memberUserId,
      ...(body.on_missing ? { onMissing: body.on_missing } : {}),
      ...(body.on_corrupt ? { onCorrupt: body.on_corrupt } : {}),
      ...(body.on_orphan ? { onOrphan: body.on_orphan } : {}),
      ...(body.rebind_project_id ? { rebindProjectId: body.rebind_project_id } : {}),
    });
    return reply.status(200).send(
      chatThreadDto(thread, {
        projectName: project.name,
        workspacePath: project.workspacePath,
      }),
    );
  });

  app.get('/projects/:projectId/creator-chats', async (request) => {
    const { projectId } = projectParams.parse(request.params);
    const project = await requireProject(db, projectId);
    const threads = await db.creatorChatThread.findMany({
      where: { projectId, state: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    return chatThreadDtos(db, threads, () => ({
      projectName: project.name,
      workspacePath: project.workspacePath,
    }));
  });

  app.get('/projects/:projectId/write-log', async (request) => {
    const { projectId } = projectParams.parse(request.params);
    await requireProject(db, projectId);
    const messages = await db.creatorChatMessage.findMany({
      where: {
        proposalState: 'applied',
        thread: { projectId },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { thread: { select: { id: true, title: true } } },
    });
    return {
      items: messages.map((message) => ({
        id: message.id,
        thread_id: message.threadId,
        thread_title: message.thread.title,
        created_at: message.createdAt.toISOString(),
        summary: summarizeProposals(message.proposal),
      })),
    };
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
            select: { id: true, name: true, workspacePath: true },
          })
        : [];
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const visible = threads.filter(
      (thread) => !thread.projectId || projectById.has(thread.projectId),
    );
    return chatThreadDtos(db, visible, (thread) => {
      const project = thread.projectId ? projectById.get(thread.projectId) : undefined;
      return {
        projectName: project?.name ?? null,
        workspacePath: project?.workspacePath ?? null,
      };
    });
  });

  app.get('/creator-chats/:threadId', async (request) => {
    const { threadId } = z.object({ threadId: idSchema }).strict().parse(request.params);
    const { thread, projectName, workspacePath } = await requireOpenThread(db, threadId);
    const messages = await db.creatorChatMessage.findMany({
      where: { threadId, suppressed: false },
      orderBy: { createdAt: 'asc' },
    });
    const roleplayMeta = await loadRoleplayMeta(db, [thread.id]);
    const speakerIds = [
      ...new Set(
        messages.map((item) => item.speakerAssetId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const speakers = speakerIds.length
      ? await db.asset.findMany({
          where: { id: { in: speakerIds } },
          select: { id: true, name: true },
        })
      : [];
    const speakerName = new Map(speakers.map((item) => [item.id, item.name]));
    return {
      thread: chatThreadDto(thread, {
        projectName,
        workspacePath,
        roleplay: roleplayMeta.get(thread.id) ?? null,
      }),
      messages: messages.map((item) =>
        chatMessageDto(
          item,
          item.speakerAssetId ? (speakerName.get(item.speakerAssetId) ?? null) : null,
        ),
      ),
    };
  });

  app.get('/creator-chats/:threadId/context', async (request) => {
    const { threadId } = z.object({ threadId: idSchema }).strict().parse(request.params);
    const query = z
      .object({
        effort: z.enum(['fast', 'balanced', 'deep']).optional(),
      })
      .parse(request.query ?? {});
    const { thread } = await requireOpenThread(db, threadId);
    const effort = resolveAgentEffort(query.effort);
    const messages = await db.creatorChatMessage.findMany({
      where: { threadId, suppressed: false },
      orderBy: { createdAt: 'asc' },
    });
    let tokenEstimate = messages.reduce(
      (sum, message) => sum + Math.max(0, Math.round(message.content.length / 2)),
      0,
    );
    let summaryVersion: number | null = null;
    let rollingSummaryPresent = false;
    if (memory) {
      const window = await memory.getContextWindow(
        threadId,
        messages.map((row) => ({ id: row.id, role: row.role, content: row.content })),
        {
          tokenBudget: effort.limits.max_context_tokens,
          keepRecentMessages: effort.schedule.keep_recent_messages,
        },
      );
      tokenEstimate = window.tokenEstimate;
      const state = await memory.threadContext(threadId);
      summaryVersion = state?.summaryVersion ?? null;
      rollingSummaryPresent = Boolean(state?.rollingSummary);
    }
    return {
      thread_id: thread.id,
      project_id: thread.projectId,
      token_estimate: tokenEstimate,
      token_cap: effort.limits.max_context_tokens,
      message_count: messages.length,
      summary_version: summaryVersion,
      rolling_summary_present: rollingSummaryPresent,
      effort: effortDto(effort),
    };
  });

  app.delete('/creator-chats/:threadId', async (request, reply) => {
    const { threadId } = z.object({ threadId: idSchema }).strict().parse(request.params);
    await archiveCreatorChat(db, threadId);
    return reply.status(204).send();
  });

  app.patch('/creator-chats/:threadId', async (request) => {
    const { threadId } = z.object({ threadId: idSchema }).strict().parse(request.params);
    const { thread, projectName, workspacePath } = await requireOpenThread(db, threadId);
    const body = patchThreadBody.parse(request.body ?? {});
    const updated = await db.creatorChatThread.update({
      where: { id: thread.id },
      data: { title: body.title },
    });
    return chatThreadDto(updated, { projectName, workspacePath });
  });

  app.post('/creator-chats/:threadId/messages', async (request, reply) => {
    const { threadId } = z.object({ threadId: idSchema }).strict().parse(request.params);
    const { thread } = await requireOpenThread(db, threadId);
    const body = sendMessageBody.parse(request.body ?? {});

    // ADR-0010 fence: only the agent (assistant) carries proposals to the world.
    if (body.role === 'user' && (body.proposal || body.proposal_key)) {
      throw new ApiError(400, 'USER_PROPOSAL_FORBIDDEN', '用户消息不允许携带提案');
    }

    const lastMessage = await lastMessageForTurn(db, threadId, body.retry);
    const userMessage =
      canReuseLastUser(lastMessage, body.content, body.retry) && lastMessage
        ? lastMessage
        : await db.creatorChatMessage.create({
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

    const effort = resolveAgentEffort(body.effort);
    const builder = currentBuilder();

    if (body.role === 'user' && wantsEventStream(request)) {
      await pipeCreatorChatSse(
        request,
        reply,
        db,
        builder,
        thread,
        userMessage,
        body.focus,
        memory,
        effort,
      );
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
        effort,
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
      effort: effortDto(effort),
    });
  });

  app.post('/creator-chats/:threadId/messages/stream', async (request, reply) => {
    const { threadId } = z.object({ threadId: idSchema }).strict().parse(request.params);
    const { thread } = await requireOpenThread(db, threadId);
    const body = sendMessageBody.parse(request.body ?? {});
    if (body.role !== 'user') {
      throw new ApiError(400, 'STREAM_USER_ONLY', '流式发送仅支持用户消息');
    }
    if (body.proposal || body.proposal_key) {
      throw new ApiError(400, 'USER_PROPOSAL_FORBIDDEN', '用户消息不允许携带提案');
    }

    const lastMessage = await lastMessageForTurn(db, threadId, body.retry);
    const userMessage =
      canReuseLastUser(lastMessage, body.content, body.retry) && lastMessage
        ? lastMessage
        : await db.creatorChatMessage.create({
            data: {
              threadId,
              role: 'user',
              content: body.content,
            },
          });
    await pipeCreatorChatSse(
      request,
      reply,
      db,
      currentBuilder(),
      thread,
      userMessage,
      body.focus,
      memory,
      resolveAgentEffort(body.effort),
    );
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

    const { thread } = await requireOpenThread(db, threadId);

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
    if (!isOpenProposalState(message.proposalState)) {
      throw new ApiError(409, 'PROPOSAL_ALREADY_HANDLED', '提案已处理，不能重复确认', {
        proposal_state: message.proposalState,
      });
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
      const claimed = await tx.creatorChatMessage.updateMany({
        where: {
          id: messageId,
          threadId,
          OR: [{ proposalState: 'pending' }, { proposalState: null }],
        },
        data: { proposalState: 'applied' },
      });
      if (claimed.count !== 1) {
        const current = await tx.creatorChatMessage.findFirst({
          where: { id: messageId, threadId },
          select: { proposalState: true },
        });
        throw new ApiError(409, 'PROPOSAL_ALREADY_HANDLED', '提案已处理，不能重复确认', {
          proposal_state: current?.proposalState ?? 'applied',
        });
      }
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
          const existing = await tx.project.findFirst({
            where: { id: currentProjectId, deletedAt: null },
            select: { settings: true },
          });
          if (existing && !isWorkspaceSeed(existing)) {
            skipped.push({ kind: proposal.kind, reason: 'PROJECT_ALREADY_EXISTS' });
            continue;
          }
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
        data: {
          proposal: stampAppliedEntityIds(rawProposals, results) as Prisma.InputJsonValue,
        },
      });
      return { results, skipped };
    });
    return { applied: results, skipped };
  });

  app.post('/creator-chats/:threadId/proposals/:messageId/reject', async (request) => {
    const { threadId, messageId } = z
      .object({ threadId: idSchema, messageId: idSchema })
      .strict()
      .parse(request.params);

    await requireOpenThread(db, threadId);

    const message = await db.creatorChatMessage.findFirst({
      where: { id: messageId, threadId },
    });
    if (!message) throw new ApiError(404, 'MESSAGE_NOT_FOUND', '消息不存在');
    if (!message.proposal || !message.proposalKey) {
      throw new ApiError(400, 'NO_PROPOSAL', '该消息没有待确认的提案');
    }
    if (!isOpenProposalState(message.proposalState)) {
      throw new ApiError(409, 'PROPOSAL_ALREADY_HANDLED', '提案已处理，不能再拒绝', {
        proposal_state: message.proposalState,
      });
    }

    const claimed = await db.creatorChatMessage.updateMany({
      where: {
        id: messageId,
        threadId,
        OR: [{ proposalState: 'pending' }, { proposalState: null }],
      },
      data: { proposalState: 'rejected' },
    });
    if (claimed.count !== 1) {
      const current = await db.creatorChatMessage.findFirst({
        where: { id: messageId, threadId },
        select: { proposalState: true },
      });
      throw new ApiError(409, 'PROPOSAL_ALREADY_HANDLED', '提案已处理，不能再拒绝', {
        proposal_state: current?.proposalState ?? 'applied',
      });
    }
    return { rejected: true };
  });

  app.post('/creator-chats/:threadId/rollback', async (request) => {
    const { threadId } = z.object({ threadId: idSchema }).strict().parse(request.params);
    const body = z
      .object({
        message_id: idSchema,
        mode: z.enum(['withdraw', 'keep']).default('keep'),
      })
      .strict()
      .parse(request.body ?? {});
    await requireOpenThread(db, threadId);
    const target = await db.creatorChatMessage.findFirst({
      where: { id: body.message_id, threadId, suppressed: false },
    });
    if (!target) throw new ApiError(404, 'MESSAGE_NOT_FOUND', '找不到这条对话');
    const roleplay = await db.roleplayThread.findFirst({
      where: { threadId },
      select: { id: true },
    });
    if (!canRollbackToMessage({ role: target.role, isRoleplay: Boolean(roleplay) })) {
      throw new ApiError(400, 'ROLLBACK_USER_ONLY', '只能回退到你发出的那一句');
    }
    return applyConversationRollback(db, {
      threadId,
      targetMessageId: body.message_id,
      mode: body.mode,
      ...(memory ? { memory } : {}),
    });
  });
}
