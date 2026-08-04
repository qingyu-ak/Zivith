import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@zivith/database';
import {
  proposalSchema,
  relationshipCreateSchema,
  timelineItemCreateSchema,
  timelineTrackCreateSchema,
  worldEventCreateSchema,
  worldEventPatchSchema,
} from '@zivith/domain';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { applyProposal } from '../contexts/world/proposal-applier.js';
import {
  WorldBuilderAgent,
  inferWorldStage,
  type WorldBuilderChatMessage,
} from '../contexts/world-builder/world-builder-agent.js';
import { buildWorldContext } from '../contexts/world-builder/world-context.js';
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
    select: { id: true, name: true },
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
      data: { projectId, name: 'World Line' },
    });
  }
  return timeline;
}

export function registerWorldRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  llm?: LLMAdapter,
  llmModel?: string,
) {
  registerProjectResources(app, db);
  registerWorldEventRoutes(app, db);
  registerRelationshipRoutes(app, db);
  registerTimelineRoutes(app, db);
  registerCreatorChatRoutes(app, db, llm, llmModel);
}

// ---------------------------------------------------------------------------
// Project resources — Studio 三栏 Explorer 数据源
// ---------------------------------------------------------------------------

function registerProjectResources(app: FastifyInstance, db: PrismaClient) {
  app.get('/projects/:projectId/resources', async (request) => {
    const { projectId } = projectParams.parse(request.params);
    const project = await requireProject(db, projectId);

    const [stories, characters, locations, scenes, worldEvents, relationships] =
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
      ]);

    return {
      project: {
        id: project.id,
        name: project.name,
      },
      entities: {
        stories,
        characters,
        locations,
        scenes,
        world_events: worldEvents,
        relationships,
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
    const count = await db.worldEvent.count({ where: { projectId, deletedAt: null } });
    const created = await db.worldEvent.create({
      data: {
        projectId,
        title: body.title,
        description: body.description ?? null,
        worldTimeEnvelope: body.world_time_envelope as Prisma.InputJsonValue,
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
    return db.worldEvent.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.world_time_envelope !== undefined
          ? { worldTimeEnvelope: body.world_time_envelope as Prisma.InputJsonValue }
          : {}),
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
        ...(body.valid_from
          ? { validFrom: body.valid_from as Prisma.InputJsonValue }
          : {}),
        ...(body.valid_until
          ? { validUntil: body.valid_until as Prisma.InputJsonValue }
          : {}),
        state: 'draft',
      },
    });
    return reply.status(201).send(created);
  });

  app.patch('/relationships/:id', async (request) => {
    const { id } = entityParams.parse(request.params);
    const existing = await db.relationship.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, 'RELATIONSHIP_NOT_FOUND', '关系不存在');
    const body = relationshipCreateSchema.partial().strict().parse(request.body ?? {});
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
    return { timeline, tracks };
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
    const body = timelineTrackCreateSchema.partial().strict().parse(request.body ?? {});
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
    const body = timelineItemCreateSchema.partial().strict().parse(request.body ?? {});
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
        ...(body.metadata !== undefined ? { metadata: body.metadata as Prisma.InputJsonValue } : {}),
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
  })
  .strict();

const applyProposalBody = z.object({ proposal_key: z.string().max(256).optional() }).strict();

function registerCreatorChatRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  llm?: LLMAdapter,
  llmModel?: string,
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
    return reply.status(201).send(created);
  });

  app.get('/projects/:projectId/creator-chats', async (request) => {
    const { projectId } = projectParams.parse(request.params);
    await requireProject(db, projectId);
    return db.creatorChatThread.findMany({
      where: { projectId, state: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
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
        threads
          .map((thread) => thread.projectId)
          .filter((id): id is string => Boolean(id)),
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
    return threads.map((thread) => ({
      ...thread,
      project_name: thread.projectId ? (nameById.get(thread.projectId) ?? null) : null,
    }));
  });

  app.get('/creator-chats/:threadId', async (request) => {
    const { threadId } = z.object({ threadId: idSchema }).strict().parse(request.params);
    const thread = await db.creatorChatThread.findFirst({ where: { id: threadId } });
    if (!thread) throw new ApiError(404, 'THREAD_NOT_FOUND', '对话不存在');
    const messages = await db.creatorChatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });
    return { thread, messages };
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

    // User turns trigger the World Builder: read world → reply → propose.
    let assistantMessage = null;
    if (body.role === 'user') {
      const rows = await db.creatorChatMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' },
        take: 40,
      });
      const history: WorldBuilderChatMessage[] = rows.map((row) => ({
        role:
          row.role === 'user' || row.role === 'assistant' || row.role === 'system'
            ? row.role
            : 'system',
        content: row.content,
      }));
      const world = thread.projectId
        ? await buildWorldContext(db, thread.projectId)
        : null;
      const response = await builder.respond({
        text: userMessage.content,
        history,
        world,
        stage: inferWorldStage(world),
      });
      const proposalKey =
        response.proposals.length > 0
          ? `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
          : null;
      assistantMessage = await db.creatorChatMessage.create({
        data: {
          threadId,
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
    }

    await db.creatorChatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });
    return reply
      .status(201)
      .send({ user_message: userMessage, assistant_message: assistantMessage });
  });

  app.post('/creator-chats/:threadId/proposals/:messageId/apply', async (request) => {
    const { threadId, messageId } = z
      .object({ threadId: idSchema, messageId: idSchema })
      .strict()
      .parse(request.params);
    const body = applyProposalBody.parse(request.body ?? {});

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

    const applied: Array<{ kind: string; project_id: string; entity_type: string; entity_id: string; title: string }> =
      [];
    // Track the project across a proposal batch: create_project may appear
    // alongside entity proposals in the same message.
    let currentProjectId = thread.projectId;
    for (const proposal of proposals) {
      if (proposal.kind === 'create_project' && currentProjectId) {
        throw new ApiError(400, 'PROJECT_ALREADY_EXISTS', '该对话已关联项目，不能重复创建');
      }
      const result = await applyProposal(db, proposal, currentProjectId);
      applied.push({
        kind: result.kind,
        project_id: result.projectId,
        entity_type: result.entityType,
        entity_id: result.entityId,
        title: result.title,
      });
      if (result.entityType === 'project') {
        currentProjectId = result.projectId;
        await db.creatorChatThread.update({
          where: { id: threadId },
          data: { projectId: result.projectId },
        });
      }
    }

    await db.creatorChatMessage.update({
      where: { id: messageId },
      data: { proposalState: 'applied' },
    });
    return { applied };
  });
}
