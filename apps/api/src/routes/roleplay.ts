// M3 角色扮演路由（设计 §7）——镜像 Creator Chat 的 SSE 协议与消息模型。
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma, PrismaClient } from '@zivith/database';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { buildWorldContext } from '../contexts/world-builder/world-context.js';
import type { MemoryService } from '../contexts/memory/service.js';
import {
  RoleplayAgent,
  buildCharacterState,
  loadRoleplayTimeIndex,
  type RoleplayChatMessage,
} from '../contexts/roleplay/roleplay-agent.js';
import { filterRetrievedChatCatalog } from '../contexts/roleplay/character-cognition.js';
import {
  assembleRoleplayRecall,
  formatRoleplayRecall,
  roleplayThreadVisibleAtAnchor,
} from '../contexts/roleplay/chat-recall.js';
import {
  groupChatTitle,
  isGroupChat,
  lastAssistantSpeakerId,
  normalizeGroupParticipants,
  parseParticipantIds,
  pickNextSpeaker,
  sameParticipantSet,
} from '../contexts/roleplay/group-chat.js';
import {
  buildGhostwriteCue,
  buildGroupContinueCue,
  collapseRepeatedAssistantBeats,
  isGroupContinueBeat,
  looksStuckRepeating,
  pickContinueTopicSeed,
  resolveContinueRetrieveQuery,
} from '../contexts/roleplay/group-continue.js';
import { flushHttpStream, formatSseEvent } from '../lib/sse.js';
import { canReuseLastUser } from '../lib/chat-turn.js';
import { chunkReply } from '../contexts/world-builder/world-builder-agent.js';
import type { LLMAdapter } from '../ports/llm.js';
import {
  effortDto,
  resolveAgentEffort,
  type EffectiveAgentEffort,
} from '../contexts/agent-effort.js';
import { resolveRuntimeLlm } from '../contexts/llm-runtime.js';

const idSchema = z.string().min(1).max(128);

type RoleplayMessageRow = {
  id: string;
  threadId: string;
  role: string;
  content: string;
  proposal?: unknown;
  proposalKey?: string | null;
  proposalState?: string | null;
  speakerAssetId?: string | null;
  suppressed?: boolean;
  createdAt: Date;
};

/** 与 world.ts 的 chatMessageDto 同形：扮演消息也可携带待确认提案（task-s25）。 */
function messageDto(message: RoleplayMessageRow, speakerName?: string | null) {
  return {
    id: message.id,
    thread_id: message.threadId,
    role: message.role,
    content: message.content,
    proposal: message.proposal ?? null,
    proposal_key: message.proposalKey ?? null,
    proposal_state: message.proposalState ?? null,
    speaker_asset_id: message.speakerAssetId ?? null,
    speaker_name: speakerName ?? null,
    suppressed: Boolean(message.suppressed),
    created_at: message.createdAt.toISOString(),
  };
}

type RoleplayRecord = {
  id: string;
  projectId: string;
  characterAssetId: string;
  userCharacterAssetId: string | null;
  participantAssetIds: unknown;
  threadId: string;
  anchoredWorldEventId: string | null;
};

function rosterIds(roleplay: RoleplayRecord): string[] {
  return parseParticipantIds(roleplay.participantAssetIds, roleplay.characterAssetId);
}

async function loadNameMap(
  db: PrismaClient,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const assets = await db.asset.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(assets.map((item) => [item.id, item.name]));
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
  const injectedAgent = llm ? new RoleplayAgent(llm, llmModel) : null;

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
        participant_asset_ids: z.array(idSchema).max(4).optional(),
      })
      .strict()
      .parse(request.body ?? {});

    const requestedParticipants = normalizeGroupParticipants(body.participant_asset_ids ?? []);
    const isGroup = requestedParticipants.length >= 2;
    const roster = isGroup ? requestedParticipants : [body.character_asset_id];
    const leadId = roster[0] ?? body.character_asset_id;

    const assets = await db.asset.findMany({
      where: {
        id: { in: roster },
        projectId: body.project_id,
        type: 'character',
        deletedAt: null,
      },
      select: { id: true, name: true },
    });
    if (assets.length !== roster.length) {
      throw new ApiError(404, 'CHARACTER_NOT_FOUND', isGroup ? '有的角色不在这个世界里' : '角色不存在');
    }
    const nameById = new Map(assets.map((item) => [item.id, item.name]));
    const lead = assets.find((item) => item.id === leadId);
    if (!lead) throw new ApiError(404, 'CHARACTER_NOT_FOUND', '角色不存在');

    const userCharacterAssetId = body.user_character_asset_id ?? null;
    if (userCharacterAssetId && roster.includes(userCharacterAssetId)) {
      throw new ApiError(400, 'USER_IS_AI_CHARACTER', '你是谁不能和正在开口的角色重复');
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
    const candidates = await db.roleplayThread.findMany({
      where: {
        projectId: body.project_id,
        userCharacterAssetId,
        anchoredWorldEventId: anchorId,
        status: 'active',
      },
    });
    const existing = candidates.find((item) => {
      const ids = parseParticipantIds(item.participantAssetIds, item.characterAssetId);
      if (isGroup) return sameParticipantSet(ids, roster);
      return item.characterAssetId === leadId && !isGroupChat(ids);
    });
    if (existing) {
      return { id: existing.id, thread_id: existing.threadId, reused: true };
    }
    const title = isGroup
      ? groupChatTitle(roster.map((id) => nameById.get(id) ?? id))
      : userName
        ? `与「${lead.name}」对话 · 你是${userName}`
        : `与「${lead.name}」对话`;
    const thread = await db.creatorChatThread.create({
      data: { projectId: body.project_id, title },
    });
    const roleplay = await db.roleplayThread.create({
      data: {
        projectId: body.project_id,
        characterAssetId: leadId,
        userCharacterAssetId,
        participantAssetIds: isGroup ? roster : [],
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
        threads.flatMap((thread) => {
          const participants = parseParticipantIds(thread.participantAssetIds, thread.characterAssetId);
          return thread.userCharacterAssetId
            ? [...participants, thread.userCharacterAssetId]
            : participants;
        }),
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
      items: threads.map((thread) => {
        const participants = parseParticipantIds(thread.participantAssetIds, thread.characterAssetId);
        return {
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
        participant_asset_ids: participants,
        participant_names: participants.map(
          (id) => assets.find((asset) => asset.id === id)?.name ?? id,
        ),
        is_group: isGroupChat(participants),
        anchored_world_event_id: thread.anchoredWorldEventId,
        anchor_title: anchors.find((a) => a.id === thread.anchoredWorldEventId)?.title ?? null,
        updated_at: thread.updatedAt.toISOString(),
      };
      }),
    };
  });

  app.get('/roleplay/threads/:id/messages', async (request) => {
    const { id } = z.object({ id: idSchema }).strict().parse(request.params);
    const roleplay = await db.roleplayThread.findUnique({ where: { id } });
    if (!roleplay) throw new ApiError(404, 'THREAD_NOT_FOUND', '扮演线程不存在');
    const messages = await db.creatorChatMessage.findMany({
      where: { threadId: roleplay.threadId, suppressed: false },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const speakerIds = [
      ...new Set(
        messages
          .map((item) => item.speakerAssetId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const names = await loadNameMap(db, [
      ...speakerIds,
      ...rosterIds(roleplay),
      roleplay.userCharacterAssetId ?? '',
    ]);
    return {
      items: messages.map((item) =>
        messageDto(item, item.speakerAssetId ? (names.get(item.speakerAssetId) ?? null) : null),
      ),
    };
  });

  app.post('/roleplay/threads/:id/messages', async (request, reply) => {
    const { id } = z.object({ id: idSchema }).strict().parse(request.params);
    const body = z
      .object({
        content: z.string().max(8_000).optional().default(''),
        speaker_asset_id: idSchema.optional(),
        muted_asset_ids: z.array(idSchema).max(3).optional(),
        effort: z
          .union([
            z.enum(['fast', 'balanced', 'deep']),
            z.object({ level: z.enum(['fast', 'balanced', 'deep']) }).strict(),
          ])
          .optional(),
        retry: z.boolean().optional(),
        ghostwrite: z.boolean().optional(),
      })
      .strict()
      .parse(request.body ?? {});
    const roleplay = await db.roleplayThread.findUnique({ where: { id } });
    if (!roleplay || roleplay.status !== 'active') {
      throw new ApiError(404, 'THREAD_NOT_FOUND', '扮演线程不存在或已关闭');
    }
    const participants = rosterIds(roleplay);
    const names = await loadNameMap(db, [
      ...participants,
      roleplay.userCharacterAssetId ?? '',
    ]);
    const namesById = Object.fromEntries(names);
    const text = body.content.trim();
    const ghostwrite = Boolean(body.ghostwrite);
    if (ghostwrite) {
      if (!roleplay.userCharacterAssetId) {
        throw new ApiError(400, 'USER_CHARACTER_REQUIRED', '先选一个你扮演的角色，才能交给 AI 接着说');
      }
      if (text) {
        throw new ApiError(400, 'GHOSTWRITE_EMPTY', '接管这一拍不要同时提交你自己打的字');
      }
    }
    if (!text && !body.speaker_asset_id && !ghostwrite) {
      throw new ApiError(400, 'CONTENT_REQUIRED', '请先说一句，或指定谁开口');
    }
    if (body.speaker_asset_id && !participants.includes(body.speaker_asset_id)) {
      throw new ApiError(400, 'SPEAKER_NOT_IN_GROUP', '这个人不在这场对话里');
    }

    const lastMessage = body.retry
      ? await db.creatorChatMessage.findFirst({
          where: { threadId: roleplay.threadId, suppressed: false },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    const liveRows = await db.creatorChatMessage.findMany({
      where: { threadId: roleplay.threadId, suppressed: false },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const userMessage =
      text.length === 0
        ? null
        : canReuseLastUser(lastMessage, text, body.retry) && lastMessage
          ? lastMessage
          : await db.creatorChatMessage.create({
              data: {
                threadId: roleplay.threadId,
                role: 'user',
                content: text,
                speakerAssetId: roleplay.userCharacterAssetId,
              },
            });

    const speakerAssetId = ghostwrite
      ? roleplay.userCharacterAssetId!
      : body.speaker_asset_id ||
        pickNextSpeaker({
          participantIds: participants,
          namesById,
          userText: text || liveRows.filter((row) => row.role === 'user').at(-1)?.content || '',
          lastSpeakerId: lastAssistantSpeakerId(liveRows),
          ...(body.muted_asset_ids ? { mutedIds: body.muted_asset_ids } : {}),
        });
    if (!speakerAssetId) {
      throw new ApiError(400, 'SPEAKER_REQUIRED', '这场对话里没有能开口的角色');
    }

    const effort = resolveAgentEffort(body.effort);
    const agent = currentAgent();
    const turn = {
      userMessage,
      speakerAssetId,
      namesById,
      participants,
      ...(ghostwrite ? { ghostwrite: true as const } : {}),
    };

    if (wantsEventStream(request)) {
      await pipeRoleplaySse(request, reply, db, agent, roleplay, turn, memory, effort);
      return;
    }

    const result = await createRoleplayReply(db, agent, roleplay, turn, memory, effort);
    const userName = roleplay.userCharacterAssetId
      ? (namesById[roleplay.userCharacterAssetId] ?? null)
      : null;
    if (result.ghostwriteMessage) {
      return reply.status(201).send({
        user_message: messageDto(result.ghostwriteMessage, userName),
        assistant_message: null,
        ghostwrite: true,
        effort: effortDto(effort),
      });
    }
    if (!result.assistantMessage) {
      return reply.status(200).send({
        user_message: userMessage ? messageDto(userMessage, userName) : null,
        assistant_message: null,
        cancelled: true,
        effort: effortDto(effort),
      });
    }
    const finalMessage = await attachWorldChangeProposals(db, agent, roleplay, {
      userText: result.worldChangeUserText,
      assistantMessage: result.assistantMessage,
      world: result.world,
      speakerAssetId,
      effort,
      log: (error) => request.log.warn({ err: error }, 'roleplay world-change draft failed'),
    });
    await db.creatorChatThread.update({
      where: { id: roleplay.threadId },
      data: { updatedAt: new Date() },
    });
    return reply.status(201).send({
      user_message: userMessage
        ? messageDto(userMessage, roleplay.userCharacterAssetId ? namesById[roleplay.userCharacterAssetId] ?? null : null)
        : null,
      assistant_message: messageDto(finalMessage, namesById[speakerAssetId] ?? null),
      memory_ops: result.memoryOps,
      world_change: { mode: finalMessage.draftMode },
      effort: effortDto(effort),
    });
  });
}

/**
 * 对白落库后起草世界变化提案并挂到同一条 assistant 消息上（task-s25）。
 * 起草失败只记日志，不影响已保存的对白；无提案时消息保持原样，不假装「已记录」。
 */
async function attachWorldChangeProposals(
  db: PrismaClient,
  agent: RoleplayAgent,
  roleplay: RoleplayRecord,
  input: {
    userText: string;
    assistantMessage: RoleplayMessageRow;
    world: Awaited<ReturnType<typeof buildWorldContext>>;
    speakerAssetId: string;
    effort: EffectiveAgentEffort;
    log: (error: unknown) => void;
  },
): Promise<RoleplayMessageRow & { draftMode: 'none' | 'rule' | 'llm' }> {
  const world = input.world;
  if (!world) return { ...input.assistantMessage, draftMode: 'none' };
  const character = world.characters.find((item) => item.id === input.speakerAssetId);
  if (!character) return { ...input.assistantMessage, draftMode: 'none' };
  const userCharacter = roleplay.userCharacterAssetId
    ? (world.characters.find((item) => item.id === roleplay.userCharacterAssetId) ?? null)
    : null;

  let draft: Awaited<ReturnType<RoleplayAgent['draftWorldChanges']>>;
  try {
    draft = await agent.draftWorldChanges(
      {
        text: input.userText,
        reply: input.assistantMessage.content,
        world,
        character: { id: character.id, name: character.name },
        userCharacter: userCharacter ? { id: userCharacter.id, name: userCharacter.name } : null,
        effort: input.effort,
      },
      { onLlmError: input.log },
    );
  } catch (error) {
    input.log(error);
    return { ...input.assistantMessage, draftMode: 'none' };
  }
  if (draft.proposals.length === 0) return { ...input.assistantMessage, draftMode: draft.mode };

  const proposalKey = `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const updated = await db.creatorChatMessage.update({
    where: { id: input.assistantMessage.id },
    data: {
      proposal: draft.proposals as unknown as Prisma.InputJsonValue,
      proposalKey,
      proposalState: 'pending',
    },
  });
  return { ...updated, draftMode: draft.mode };
}

async function createRoleplayReply(
  db: PrismaClient,
  agent: RoleplayAgent,
  roleplay: RoleplayRecord,
  turn: {
    userMessage: RoleplayMessageRow | null;
    speakerAssetId: string;
    namesById: Record<string, string>;
    participants: string[];
    aborted?: () => boolean;
    ghostwrite?: boolean;
  },
  memory?: MemoryService | null,
  effort?: EffectiveAgentEffort,
) {
  const resolved = effort ?? resolveAgentEffort();
  const speakerAssetId = turn.speakerAssetId;
  const companionNames = turn.participants
    .filter((id) => id !== speakerAssetId)
    .map((id) => turn.namesById[id] ?? id);
  const state = await buildCharacterState(
    db,
    roleplay.projectId,
    speakerAssetId,
    roleplay.anchoredWorldEventId,
    turn.ghostwrite ? null : roleplay.userCharacterAssetId,
    companionNames,
  );
  if (!state) throw new ApiError(404, 'CHARACTER_NOT_FOUND', '角色不存在');

  const rows = await db.creatorChatMessage.findMany({
    where: { threadId: roleplay.threadId, suppressed: false },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  const historyRows = turn.userMessage
    ? rows.filter((row) => row.id !== turn.userMessage?.id)
    : rows;
  const lastUserText =
    turn.userMessage?.content ||
    [...historyRows].reverse().find((row) => row.role === 'user')?.content ||
    '';
  const group = isGroupChat(turn.participants);
  const lastLiveRole = turn.userMessage?.role ?? historyRows.at(-1)?.role ?? null;
  const ghostwrite = Boolean(turn.ghostwrite);
  const continueBeat =
    !ghostwrite &&
    isGroupContinueBeat({
      isGroup: group,
      userMessageContent: turn.userMessage?.content ?? null,
      lastLiveRole,
    });
  const recentAssistants = historyRows
    .filter((row) => row.role === 'assistant')
    .map((row) => row.content);
  const lastAssistantText = recentAssistants.at(-1) ?? null;
  const recentSpoken = historyRows
    .filter((row) => row.role === 'assistant' || row.role === 'user')
    .map((row) => row.content);
  const stuckRepeating =
    (continueBeat || ghostwrite) && looksStuckRepeating(continueBeat ? recentAssistants : recentSpoken);
  const topicSeed =
    continueBeat || ghostwrite
      ? pickContinueTopicSeed({
          relations: state.relations,
          experiences: state.experiences,
          traits: state.traits,
          companions: state.companions ?? [],
          recentAssistantTexts: (continueBeat ? recentAssistants : recentSpoken).slice(-8),
          beatSalt: historyRows.length,
        })
      : null;
  const cueText = ghostwrite
    ? buildGhostwriteCue({
        speakerName: state.name,
        companions: state.companions ?? [],
        topicSeed,
        stuckRepeating,
      })
    : continueBeat
      ? buildGroupContinueCue({
          speakerName: state.name,
          userLabel: state.userLabel,
          companions: state.companions ?? [],
          topicSeed,
          stuckRepeating,
        })
      : lastUserText.trim() || '请用角色身份接着说一句。';
  const retrieveQuery =
    continueBeat || ghostwrite
      ? resolveContinueRetrieveQuery({
          lastAssistantText,
          topicSeed,
          stuckRepeating,
          fallback: cueText,
        })
      : cueText;
  const worldChangeUserText = continueBeat || ghostwrite ? '' : cueText;

  const world = await buildWorldContext(db, roleplay.projectId);
  let memoryOps = null;
  let chatCatalog: string | null = null;
  let evicted: Array<{ id: string; role: string; content: string }> = [];
  if (memory) {
    if (turn.userMessage && !group) {
      memoryOps = await memory.ingest({
        messageId: turn.userMessage.id,
        threadId: roleplay.threadId,
        projectId: roleplay.projectId,
        content: turn.userMessage.content,
        world,
        ingestMode: 'roleplay',
        defaultEntity: { entityType: 'character', entityId: speakerAssetId },
      });
    }
    const retrieved = await memory.retrieve({
      projectId: roleplay.projectId,
      text: retrieveQuery,
      world,
      topK: resolved.schedule.retrieve_top_k,
    });
    const allRoleplays = await db.roleplayThread.findMany({
      where: { projectId: roleplay.projectId, status: 'active' },
      select: {
        threadId: true,
        anchoredWorldEventId: true,
        characterAssetId: true,
        participantAssetIds: true,
      },
    });
    const siblingThreads = allRoleplays.filter((item) =>
      parseParticipantIds(item.participantAssetIds, item.characterAssetId).includes(speakerAssetId),
    );
    const atomIds = retrieved.filter((item) => item.source === 'atom').map((item) => item.id);
    const atomRows = await memory.atomsByIds(atomIds);
    const indexThreadIds = [
      ...new Set([
        ...atomRows.map((atom) => atom.threadId).filter((id): id is string => Boolean(id)),
        ...siblingThreads.map((thread) => thread.threadId),
      ]),
    ];
    const { roleplayByThreadId, eventOrderById } = await loadRoleplayTimeIndex(db, indexThreadIds);
    const catalog = filterRetrievedChatCatalog({
      items: retrieved,
      atoms: atomRows,
      characterAssetId: speakerAssetId,
      currentAnchorOrder: state.anchorOrder,
      roleplayByThreadId,
      eventOrderById,
    });
    const visibleAtomIds = new Set(catalog.map((item) => item.id));
    const visibleThreadIds = siblingThreads
      .filter((thread) =>
        roleplayThreadVisibleAtAnchor({
          anchoredWorldEventId: thread.anchoredWorldEventId,
          eventOrderById,
          currentAnchorOrder: state.anchorOrder,
        }),
      )
      .map((thread) => thread.threadId);
    const cores =
      visibleAtomIds.size > 0 || retrieved.some((item) => item.source === 'core')
        ? await memory.listCores(roleplay.projectId)
        : [];
    const logs =
      visibleThreadIds.length > 0
        ? await db.creatorChatMessage.findMany({
            where: { threadId: { in: visibleThreadIds }, suppressed: false },
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: { id: true, content: true },
          })
        : [];
    const recentMessageIds = new Set(
      historyRows.slice(-resolved.schedule.keep_recent_messages).map((row) => row.id),
    );
    if (turn.userMessage) recentMessageIds.add(turn.userMessage.id);
    chatCatalog = formatRoleplayRecall(
      assembleRoleplayRecall({
        retrieved,
        cores,
        atoms: atomRows,
        visibleAtomIds,
        characterName: state.name,
        query: retrieveQuery,
        logs,
        recentMessageIds,
      }),
    );
  }

  const speakerOf = (row: { role: string; speakerAssetId?: string | null }): string => {
    if (row.role === 'user') {
      return roleplay.userCharacterAssetId
        ? (turn.namesById[roleplay.userCharacterAssetId] ?? state.userLabel)
        : state.userLabel;
    }
    if (row.speakerAssetId && turn.namesById[row.speakerAssetId]) {
      return turn.namesById[row.speakerAssetId] ?? state.name;
    }
    return state.name;
  };

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
    const byId = new Map(historyRows.map((row) => [row.id, row]));
    history = window.window.map((message) => {
      const row = byId.get(message.id);
      const speakerName = row ? speakerOf(row) : '';
      return speakerName
        ? { role: message.role, content: message.content, speakerName }
        : { role: message.role, content: message.content };
    });
    evicted = window.evicted;
  } else {
    history = historyRows.slice(-resolved.schedule.history_turns).map((row) => ({
      role: row.role === 'user' || row.role === 'assistant' ? row.role : 'system',
      content: row.content,
      speakerName: speakerOf(row),
    }));
  }
  if (continueBeat || ghostwrite) {
    history = collapseRepeatedAssistantBeats(history);
  }

  const response = await agent.respond({
    text: cueText,
    history,
    state,
    chatCatalog,
    effort: resolved,
    ...(continueBeat ? { continueBeat: true } : {}),
    ...(ghostwrite ? { ghostwrite: true } : {}),
  });
  if (turn.aborted?.()) {
    return {
      assistantMessage: null,
      ghostwriteMessage: null,
      memoryOps,
      world,
      cueText,
      worldChangeUserText,
    };
  }
  if (ghostwrite) {
    const ghostwriteMessage = await db.creatorChatMessage.create({
      data: {
        threadId: roleplay.threadId,
        role: 'user',
        content: response.reply,
        speakerAssetId: roleplay.userCharacterAssetId,
      },
    });
    if (memory) {
      await memory.ingest({
        messageId: ghostwriteMessage.id,
        threadId: roleplay.threadId,
        projectId: roleplay.projectId,
        content: response.reply,
        world,
        ingestMode: 'roleplay',
        defaultEntity: roleplay.userCharacterAssetId
          ? { entityType: 'character', entityId: roleplay.userCharacterAssetId }
          : undefined,
      });
      if (evicted.length > 0) {
        await memory.updateThreadSummary(roleplay.threadId, evicted);
      }
    }
    await db.roleplayThread.update({ where: { id: roleplay.id }, data: { updatedAt: new Date() } });
    return {
      assistantMessage: null,
      ghostwriteMessage,
      memoryOps,
      world,
      cueText,
      worldChangeUserText,
    };
  }
  const assistantMessage = await db.creatorChatMessage.create({
    data: {
      threadId: roleplay.threadId,
      role: 'assistant',
      content: response.reply,
      speakerAssetId,
    },
  });
  if (memory) {
    await memory.ingest({
      messageId: assistantMessage.id,
      threadId: roleplay.threadId,
      projectId: roleplay.projectId,
      content: response.reply,
      world,
      ingestMode: 'roleplay',
      defaultEntity: { entityType: 'character', entityId: speakerAssetId },
    });
    if (evicted.length > 0) {
      await memory.updateThreadSummary(roleplay.threadId, evicted);
    }
  }
  await db.roleplayThread.update({ where: { id: roleplay.id }, data: { updatedAt: new Date() } });
  return { assistantMessage, ghostwriteMessage: null, memoryOps, world, cueText, worldChangeUserText };
}

async function pipeRoleplaySse(
  request: FastifyRequest,
  reply: FastifyReply,
  db: PrismaClient,
  agent: RoleplayAgent,
  roleplay: RoleplayRecord,
  turn: {
    userMessage: RoleplayMessageRow | null;
    speakerAssetId: string;
    namesById: Record<string, string>;
    participants: string[];
    ghostwrite?: boolean;
  },
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

  const speakerName = turn.namesById[turn.speakerAssetId] ?? null;
  const userName = roleplay.userCharacterAssetId
    ? (turn.namesById[roleplay.userCharacterAssetId] ?? null)
    : null;
  if (turn.userMessage) {
    writeEvent('user', { user_message: messageDto(turn.userMessage, userName) });
  }
  writeEvent('status', {
    phase: 'thinking',
    speaker_asset_id: turn.speakerAssetId,
    speaker_name: speakerName,
  });

  const resolvedEffort = effort ?? resolveAgentEffort();
  try {
    const { assistantMessage, ghostwriteMessage, memoryOps, world, worldChangeUserText } =
      await createRoleplayReply(
        db,
        agent,
        roleplay,
        { ...turn, aborted: () => closed },
        memory,
        resolvedEffort,
      );
    if (ghostwriteMessage) {
      if (closed) {
        await db.creatorChatMessage.update({
          where: { id: ghostwriteMessage.id },
          data: { suppressed: true },
        });
        return;
      }
      if (memoryOps) writeEvent('memory', { ops: memoryOps });
      writeEvent('user', { user_message: messageDto(ghostwriteMessage, userName) });
      writeEvent('done', {
        user_message: messageDto(ghostwriteMessage, userName),
        ghostwrite: true,
        effort: effortDto(resolvedEffort),
      });
      return;
    }
    if (!assistantMessage) return;
    if (memoryOps) {
      writeEvent('memory', { ops: memoryOps });
    }
    for (const chunk of chunkReply(assistantMessage.content, 8)) {
      writeEvent('delta', { text: chunk });
      if (!closed) await new Promise((resolve) => setTimeout(resolve, 16));
    }
    if (closed) {
      await db.creatorChatMessage.update({
        where: { id: assistantMessage.id },
        data: {
          suppressed: true,
          proposalState:
            assistantMessage.proposalState === 'pending' ? 'rejected' : assistantMessage.proposalState,
        },
      });
      return;
    }
    writeEvent('status', { phase: 'drafting_world_change', speaker_name: speakerName });
    const finalMessage = await attachWorldChangeProposals(db, agent, roleplay, {
      userText: worldChangeUserText,
      assistantMessage,
      world,
      speakerAssetId: turn.speakerAssetId,
      effort: resolvedEffort,
      log: (err) => request.log.warn({ err }, 'roleplay world-change draft failed'),
    });
    writeEvent('done', {
      assistant_message: messageDto(finalMessage, speakerName),
      world_change: { mode: finalMessage.draftMode },
      effort: effortDto(resolvedEffort),
    });
  } catch (error) {
    writeEvent('error', {
      message: error instanceof Error ? error.message : '没能让角色开口。对白没写进世界。',
    });
  } finally {
    cleanup();
  }
}
