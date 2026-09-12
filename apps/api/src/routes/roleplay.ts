// M3 角色扮演路由（设计 §7）——镜像 Creator Chat 的 SSE 协议与消息模型。
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { buildWorldContext } from '../contexts/world-builder/world-context.js';
import { formatMemoryDigest } from '../contexts/memory/retrieval.js';
import type { MemoryService } from '../contexts/memory/service.js';
import {
  RoleplayAgent,
  buildCharacterState,
  type RoleplayChatMessage,
} from '../contexts/roleplay/roleplay-agent.js';
import { flushHttpStream, formatSseEvent } from '../lib/sse.js';
import { canReuseLastUser } from '../lib/chat-turn.js';
import { chunkReply } from '../contexts/world-builder/world-builder-agent.js';
import type { LLMAdapter } from '../ports/llm.js';
import { effortDto, resolveAgentEffort, type EffectiveAgentEffort } from '../contexts/agent-effort.js';
import { resolveRuntimeLlm } from '../contexts/llm-runtime.js';

const idSchema = z.string().min(1).max(128);

function messageDto(message: {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: Date;
}) {
  return {
    id: message.id,
    thread_id: message.threadId,
    role: message.role,
    content: message.content,
    created_at: message.createdAt.toISOString(),
  };
}

function wantsEventStream(request: FastifyRequest): boolean {
  const accept = typeof request.headers.accept === 'string' ? request.headers.accept : '';
  return accept.includes('text/event-stream');
}

export function registerRoleplayRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  llm?: LLMAdapter,
  llmModel?: string,
  memory?: MemoryService | null,
) {
  const injectedAgent = llm
    ? new RoleplayAgent(llm, llmModel)
    : null;

  function currentAgent(): RoleplayAgent {
    if (injectedAgent) return injectedAgent;
    const live = resolveRuntimeLlm(db);
    return new RoleplayAgent(live.llm, live.model);
  }

  app.post('/roleplay/threads', async (request) => {
    const body = z
      .object({
        project_id: idSchema,
        character_asset_id: idSchema,
        user_character_asset_id: idSchema.nullish(),
        anchored_world_event_id: idSchema.nullish(),
      })
      .strict()
      .parse(request.body ?? {});
    const asset = await db.asset.findFirst({
      where: {
        id: body.character_asset_id,
        projectId: body.project_id,
        type: 'character',
        deletedAt: null,
      },
    });
    if (!asset) throw new ApiError(404, 'CHARACTER_NOT_FOUND', '角色不存在');

    const userCharacterAssetId = body.user_character_asset_id ?? null;
    if (userCharacterAssetId === asset.id) {
      throw new ApiError(400, 'USER_IS_AI_CHARACTER', '不能同时扮演对话双方');
    }
    let userName: string | null = null;
    if (userCharacterAssetId) {
      const userAsset = await db.asset.findFirst({
        where: {
          id: userCharacterAssetId,
          projectId: body.project_id,
          type: 'character',
          deletedAt: null,
        },
        select: { id: true, name: true },
      });
      if (!userAsset) throw new ApiError(404, 'USER_CHARACTER_NOT_FOUND', '你选择的角色卡不存在');
      userName = userAsset.name;
    }

    const anchorId = body.anchored_world_event_id ?? null;
    const existing = await db.roleplayThread.findFirst({
      where: {
        projectId: body.project_id,
        characterAssetId: asset.id,
        userCharacterAssetId,
        anchoredWorldEventId: anchorId,
        status: 'active',
      },
    });
    if (existing) {
      return { id: existing.id, thread_id: existing.threadId, reused: true };
    }
    const title = userName
      ? `与「${asset.name}」对话 · 你是${userName}`
      : `与「${asset.name}」对话`;
    const thread = await db.creatorChatThread.create({
      data: { projectId: body.project_id, title },
    });
    const roleplay = await db.roleplayThread.create({
      data: {
        projectId: body.project_id,
        characterAssetId: asset.id,
        userCharacterAssetId,
        threadId: thread.id,
        anchoredWorldEventId: anchorId,
      },
    });
    return { id: roleplay.id, thread_id: thread.id, reused: false };
  });

  app.get('/roleplay/threads', async (request) => {
    const query = z
      .object({ project_id: idSchema })
      .strict()
      .parse(request.query ?? {});
    const threads = await db.roleplayThread.findMany({
      where: { projectId: query.project_id, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    const assetIds = [
      ...new Set(
        threads.flatMap((t) =>
          t.userCharacterAssetId
            ? [t.characterAssetId, t.userCharacterAssetId]
            : [t.characterAssetId],
        ),
      ),
    ];
    const assets = assetIds.length
      ? await db.asset.findMany({
          where: { id: { in: assetIds } },
          select: { id: true, name: true, description: true },
        })
      : [];
    const anchorIds = [
      ...new Set(
        threads.map((t) => t.anchoredWorldEventId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const anchors = anchorIds.length
      ? await db.worldEvent.findMany({
          where: { id: { in: anchorIds } },
          select: { id: true, title: true },
        })
      : [];
    return {
      items: threads.map((thread) => ({
        id: thread.id,
        thread_id: thread.threadId,
        character_asset_id: thread.characterAssetId,
        character_name: assets.find((a) => a.id === thread.characterAssetId)?.name ?? '未知角色',
        character_description:
          assets.find((a) => a.id === thread.characterAssetId)?.description ?? '',
        user_character_asset_id: thread.userCharacterAssetId,
        user_character_name: thread.userCharacterAssetId
          ? (assets.find((a) => a.id === thread.userCharacterAssetId)?.name ?? null)
          : null,
        anchored_world_event_id: thread.anchoredWorldEventId,
        anchor_title: anchors.find((a) => a.id === thread.anchoredWorldEventId)?.title ?? null,
        updated_at: thread.updatedAt.toISOString(),
      })),
    };
  });

  app.get('/roleplay/threads/:id/messages', async (request) => {
    const { id } = z.object({ id: idSchema }).strict().parse(request.params);
    const roleplay = await db.roleplayThread.findUnique({ where: { id } });
    if (!roleplay) throw new ApiError(404, 'THREAD_NOT_FOUND', '扮演线程不存在');
    const messages = await db.creatorChatMessage.findMany({
      where: { threadId: roleplay.threadId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return { items: messages.map(messageDto) };
  });

  app.post('/roleplay/threads/:id/messages', async (request, reply) => {
    const { id } = z.object({ id: idSchema }).strict().parse(request.params);
    const body = z
      .object({
        content: z.string().trim().min(1).max(8_000),
        effort: z
          .union([
            z.enum(['fast', 'balanced', 'deep']),
            z.object({ level: z.enum(['fast', 'balanced', 'deep']) }).strict(),
          ])
          .optional(),
        retry: z.boolean().optional(),
      })
      .strict()
      .parse(request.body ?? {});
    const roleplay = await db.roleplayThread.findUnique({ where: { id } });
    if (!roleplay || roleplay.status !== 'active') {
      throw new ApiError(404, 'THREAD_NOT_FOUND', '扮演线程不存在或已关闭');
    }
    const lastMessage = body.retry
      ? await db.creatorChatMessage.findFirst({
          where: { threadId: roleplay.threadId },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    const userMessage =
      canReuseLastUser(lastMessage, body.content, body.retry) && lastMessage
        ? lastMessage
        : await db.creatorChatMessage.create({
            data: { threadId: roleplay.threadId, role: 'user', content: body.content },
          });

    const effort = resolveAgentEffort(body.effort);
    const agent = currentAgent();

    if (wantsEventStream(request)) {
      await pipeRoleplaySse(request, reply, db, agent, roleplay, userMessage, memory, effort);
      return;
    }

    const result = await createRoleplayReply(db, agent, roleplay, userMessage, memory, effort);
    await db.creatorChatThread.update({
      where: { id: roleplay.threadId },
      data: { updatedAt: new Date() },
    });
    return reply.status(201).send({
      user_message: messageDto(userMessage),
      assistant_message: messageDto(result.assistantMessage),
      memory_ops: result.memoryOps,
      effort: effortDto(effort),
    });
  });
}

async function createRoleplayReply(
  db: PrismaClient,
  agent: RoleplayAgent,
  roleplay: {
    id: string;
    projectId: string;
    characterAssetId: string;
    userCharacterAssetId: string | null;
    threadId: string;
    anchoredWorldEventId: string | null;
  },
  userMessage: { id: string; content: string },
  memory?: MemoryService | null,
  effort?: EffectiveAgentEffort,
) {
  const resolved = effort ?? resolveAgentEffort();
  const state = await buildCharacterState(
    db,
    roleplay.projectId,
    roleplay.characterAssetId,
    roleplay.anchoredWorldEventId,
    roleplay.userCharacterAssetId,
  );
  if (!state) throw new ApiError(404, 'CHARACTER_NOT_FOUND', '角色不存在');

  const rows = await db.creatorChatMessage.findMany({
    where: { threadId: roleplay.threadId },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  const historyRows = rows.filter((row) => row.id !== userMessage.id);

  let memoryOps = null;
  let memoryDigest: string | null = null;
  if (memory) {
    const world = await buildWorldContext(db, roleplay.projectId);
    memoryOps = await memory.ingest({
      messageId: userMessage.id,
      threadId: roleplay.threadId,
      projectId: roleplay.projectId,
      content: userMessage.content,
      world,
    });
    const retrieved = await memory.retrieve({
      projectId: roleplay.projectId,
      text: userMessage.content,
      world,
      topK: resolved.schedule.retrieve_top_k,
    });
    memoryDigest = formatMemoryDigest(retrieved) || null;
  }

  let history: RoleplayChatMessage[];
  if (memory) {
    const window = await memory.getContextWindow(
      roleplay.threadId,
      historyRows.map((row) => ({ id: row.id, role: row.role, content: row.content })),
      {
        tokenBudget: resolved.limits.max_context_tokens,
        keepRecentMessages: resolved.schedule.keep_recent_messages,
      },
    );
    history = window.window.map((message) => ({ role: message.role, content: message.content }));
  } else {
    history = historyRows.slice(-resolved.schedule.history_turns).map((row) => ({
      role: row.role === 'user' || row.role === 'assistant' ? row.role : 'system',
      content: row.content,
    }));
  }

  const response = await agent.respond({
    text: userMessage.content,
    history,
    state,
    memoryDigest,
    effort: resolved,
  });
  const assistantMessage = await db.creatorChatMessage.create({
    data: { threadId: roleplay.threadId, role: 'assistant', content: response.reply },
  });
  await db.roleplayThread.update({ where: { id: roleplay.id }, data: { updatedAt: new Date() } });
  return { assistantMessage, memoryOps };
}

async function pipeRoleplaySse(
  request: FastifyRequest,
  reply: FastifyReply,
  db: PrismaClient,
  agent: RoleplayAgent,
  roleplay: {
    id: string;
    projectId: string;
    characterAssetId: string;
    userCharacterAssetId: string | null;
    threadId: string;
    anchoredWorldEventId: string | null;
  },
  userMessage: { id: string; threadId: string; role: string; content: string; createdAt: Date },
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

  writeEvent('user', { user_message: messageDto(userMessage) });
  writeEvent('status', { phase: 'thinking' });

  try {
    const { assistantMessage, memoryOps } = await createRoleplayReply(
      db,
      agent,
      roleplay,
      { id: userMessage.id, content: userMessage.content },
      memory,
      effort,
    );
    if (memoryOps) {
      writeEvent('memory', { ops: memoryOps });
    }
    for (const chunk of chunkReply(assistantMessage.content, 8)) {
      writeEvent('delta', { text: chunk });
      if (!closed) await new Promise((resolve) => setTimeout(resolve, 16));
    }
    writeEvent('done', {
      assistant_message: messageDto(assistantMessage),
      effort: effort ? effortDto(effort) : effortDto(resolveAgentEffort()),
    });
  } catch (error) {
    writeEvent('error', {
      message: error instanceof Error ? error.message : '角色扮演回复失败',
    });
  } finally {
    cleanup();
  }
}
