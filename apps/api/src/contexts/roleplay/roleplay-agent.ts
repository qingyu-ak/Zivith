// M3 角色扮演 Agent（设计 §6）
// CharacterStateBuilder 组装：Studio 角色卡（Asset）+ MemoryCore 档案补充 + 锚点前亲历事件 + 关系快照
// + 认知边界（锚点前亲历；问句命中锚点后事件则不调用模型）。Mock 降级 = 模板化应答（无密钥全链路可跑）。
import type { PrismaClient } from '@zivith/database';
import type { LLMAdapter } from '../../ports/llm.js';
import { estimateTokens } from '../memory/context-window.js';
import type { EffectiveAgentEffort } from '../agent-effort.js';
import { pickAssetRevisionAtOrder } from '@zivith/domain';
import {
  cardFromAssetSnapshot,
  composeCharacterPersona,
  formatCharacterCard,
  formatUserSpeakerPrompt,
  personalityFromAssetData,
  type CharacterCardInput,
} from '../world/character-card.js';
import { entityRevisionDto } from '../history/entity-revisions.js';
import {
  draftRoleplayWorldChanges,
  type RoleplayDraftInput,
  type RoleplayDraftResult,
} from './world-change-drafter.js';
import { pickCharacterAtomsForAnchor } from './character-cognition.js';

export interface RoleplayChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  speakerName?: string;
}

export interface CharacterState {
  name: string;
  description: string;
  persona: string;
  experiences: string[];
  relations: string[];
  anchorLabel: string;
  /** 有时间锚点时为 true；全书读完则为 false。 */
  hasAnchor: boolean;
  /** 锚点之后的事件（只用于防剧透检测，不写入提示词）。 */
  laterPlot: Array<{ title: string; description: string | null }>;
  traits: string[];
  userLabel: string;
  userSection: string;
  /** Inspector 阶段名；无锚点或无绑定时为 null。 */
  stageLabel: string | null;
  /** World-time order of the play anchor; null = 全书读完. */
  anchorOrder: number | null;
  /** Other AI speakers in this thread (group chat). Empty for 1:1. */
  companions?: string[];
}

/** 用户问句与锚点之后事件标题/摘要共享足够连续字时，视为在问尚未发生的事。 */
export function mentionsLaterPlot(
  userText: string,
  laterPlot: Array<{ title: string; description: string | null }>,
): boolean {
  const userGrams = cjkNgrams(userText, 4);
  if (userGrams.size === 0) return false;
  for (const event of laterPlot) {
    const blob = `${event.title}\n${event.description ?? ''}`;
    let hits = 0;
    for (const gram of cjkNgrams(blob, 4)) {
      if (userGrams.has(gram)) {
        hits += 1;
        if (hits >= 2) return true;
      }
    }
  }
  return false;
}

function cjkNgrams(text: string, size: number): Set<string> {
  const compact = text.replace(/\s+/g, '');
  const grams = new Set<string>();
  if (compact.length < size) return grams;
  for (let i = 0; i <= compact.length - size; i++) {
    grams.add(compact.slice(i, i + size));
  }
  return grams;
}

export async function buildCharacterState(
  db: PrismaClient,
  projectId: string,
  characterAssetId: string,
  anchoredWorldEventId: string | null,
  userCharacterAssetId?: string | null,
  companionNames: string[] = [],
): Promise<CharacterState | null> {
  const asset = await db.asset.findFirst({
    where: { id: characterAssetId, projectId, type: 'character', deletedAt: null },
  });
  if (!asset) return null;

  const core = await db.memoryCore.findFirst({
    where: { projectId, kind: 'persona', topic: asset.name },
    orderBy: { version: 'desc' },
  });
  const rawAtoms = await db.memoryAtom.findMany({
    where: { projectId, entityId: asset.id, status: 'active', validTo: null },
    orderBy: { createdAt: 'desc' },
    take: 48,
  });

  // 时间锚定：只取锚点之前且角色亲历的事件（认知边界，防剧透）。
  // 无锚点（或锚点缺序号）= 全书读完：不加 presentationOrder 过滤，避免大哨兵值溢出 INT4。
  const anchor = anchoredWorldEventId
    ? await db.worldEvent.findFirst({
        where: { id: anchoredWorldEventId, projectId, deletedAt: null },
      })
    : null;
  const anchorOrder =
    anchor?.presentationOrder !== null && anchor?.presentationOrder !== undefined
      ? anchor.presentationOrder
      : null;
  const events = await db.worldEvent.findMany({
    where: {
      projectId,
      deletedAt: null,
      ...(anchorOrder !== null ? { presentationOrder: { lte: anchorOrder } } : {}),
    },
    orderBy: { presentationOrder: 'asc' },
    take: 200,
  });
  const laterPlot =
    anchorOrder !== null
      ? await db.worldEvent.findMany({
          where: { projectId, deletedAt: null, presentationOrder: { gt: anchorOrder } },
          orderBy: { presentationOrder: 'asc' },
          take: 80,
          select: { title: true, description: true },
        })
      : [];
  const atoms = await selectAtomsAtAnchor(db, rawAtoms, anchorOrder);

  const experiences = events
    .filter((event) => event.characterIds.includes(asset.id))
    .slice(0, 40)
    .map((event) => `· ${event.title}${event.description ? `：${event.description}` : ''}`);

  const relationships = await db.relationship.findMany({
    where: {
      projectId,
      deletedAt: null,
      OR: [{ sourceId: asset.id }, { targetId: asset.id }],
    },
    take: 30,
  });
  const counterpartIds = [
    ...new Set(
      relationships.map((rel) => (rel.sourceId === asset.id ? rel.targetId : rel.sourceId)),
    ),
  ];
  const counterparts = counterpartIds.length
    ? await db.asset.findMany({
        where: { id: { in: counterpartIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(counterparts.map((c) => [c.id, c.name]));
  const relations = relationships
    .map((rel) => {
      const otherId = rel.sourceId === asset.id ? rel.targetId : rel.sourceId;
      const other = nameById.get(otherId) ?? '某人';
      return `· 与「${other}」：${rel.label ?? rel.kind}${rel.description ? `（${rel.description}）` : ''}`;
    })
    .slice(0, 12);

  const currentCard: CharacterCardInput = {
    name: asset.name,
    description: asset.description,
    personality: personalityFromAssetData(asset.data),
    aliases: asset.aliases,
  };
  const asOf = await resolveAssetCardAtAnchor(db, asset.id, currentCard, anchorOrder);
  const card = formatCharacterCard(asOf.card);
  const userSpeaker = await loadUserSpeaker(
    db,
    projectId,
    userCharacterAssetId ?? null,
    anchorOrder,
  );
  return {
    name: asOf.card.name,
    description: asOf.card.description ?? '',
    persona: composeCharacterPersona(card, core?.content),
    experiences,
    relations,
    anchorLabel: anchor ? `《${anchor.title}》之后` : '全书读完（知晓全部亲历剧情）',
    hasAnchor: Boolean(anchor),
    laterPlot,
    traits: atoms.map((atom) => atom.content).slice(0, 16),
    userLabel: userSpeaker.label,
    userSection: userSpeaker.section,
    stageLabel: asOf.stageLabel,
    anchorOrder,
    companions: companionNames.filter((name) => name && name !== asOf.card.name),
  };
}

export async function loadRoleplayTimeIndex(
  db: PrismaClient,
  threadIds: string[],
): Promise<{
  roleplayByThreadId: Map<string, { anchoredWorldEventId: string | null; characterAssetId: string }>;
  eventOrderById: Map<string, number | null>;
}> {
  const roleplayByThreadId = new Map<
    string,
    { anchoredWorldEventId: string | null; characterAssetId: string }
  >();
  const eventOrderById = new Map<string, number | null>();
  if (threadIds.length === 0) return { roleplayByThreadId, eventOrderById };
  const roleplays = await db.roleplayThread.findMany({
    where: { threadId: { in: threadIds } },
    select: { threadId: true, anchoredWorldEventId: true, characterAssetId: true },
  });
  for (const thread of roleplays) {
    roleplayByThreadId.set(thread.threadId, {
      anchoredWorldEventId: thread.anchoredWorldEventId,
      characterAssetId: thread.characterAssetId,
    });
  }
  const eventIds = [
    ...new Set(
      roleplays
        .map((thread) => thread.anchoredWorldEventId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (eventIds.length > 0) {
    const sourceEvents = await db.worldEvent.findMany({
      where: { id: { in: eventIds }, deletedAt: null },
      select: { id: true, presentationOrder: true },
    });
    for (const event of sourceEvents) {
      eventOrderById.set(event.id, event.presentationOrder);
    }
  }
  return { roleplayByThreadId, eventOrderById };
}

async function selectAtomsAtAnchor<T extends { threadId: string | null }>(
  db: PrismaClient,
  atoms: T[],
  currentAnchorOrder: number | null,
): Promise<T[]> {
  const threadIds = [
    ...new Set(atoms.map((atom) => atom.threadId).filter((id): id is string => Boolean(id))),
  ];
  const { roleplayByThreadId, eventOrderById } = await loadRoleplayTimeIndex(db, threadIds);
  return pickCharacterAtomsForAnchor(atoms, roleplayByThreadId, eventOrderById, currentAnchorOrder);
}

export async function resolveAssetCardAtAnchor(
  db: PrismaClient,
  assetId: string,
  current: CharacterCardInput,
  presentationOrder: number | null,
): Promise<{ card: CharacterCardInput; stageLabel: string | null; revision: number | null }> {
  if (presentationOrder === null) {
    return { card: current, stageLabel: null, revision: null };
  }
  const rows = await db.entityRevision.findMany({
    where: { entityId: assetId, entityType: 'character', branchId: null },
    orderBy: { revision: 'asc' },
  });
  if (rows.length === 0) {
    return { card: current, stageLabel: null, revision: null };
  }
  const picked = pickAssetRevisionAtOrder(rows.map(entityRevisionDto), presentationOrder);
  if (!picked) return { card: current, stageLabel: null, revision: null };
  return {
    card: cardFromAssetSnapshot(picked.snapshot, current.name),
    stageLabel: picked.stage_label,
    revision: picked.revision,
  };
}

async function loadUserSpeaker(
  db: PrismaClient,
  projectId: string,
  userCharacterAssetId: string | null,
  presentationOrder: number | null,
) {
  if (!userCharacterAssetId) return formatUserSpeakerPrompt(null);
  const userAsset = await db.asset.findFirst({
    where: { id: userCharacterAssetId, projectId, type: 'character', deletedAt: null },
  });
  if (!userAsset) return formatUserSpeakerPrompt(null);
  const userCore = await db.memoryCore.findFirst({
    where: { projectId, kind: 'persona', topic: userAsset.name },
    orderBy: { version: 'desc' },
  });
  const current: CharacterCardInput = {
    name: userAsset.name,
    description: userAsset.description,
    personality: personalityFromAssetData(userAsset.data),
    aliases: userAsset.aliases,
  };
  const asOf = await resolveAssetCardAtAnchor(db, userAsset.id, current, presentationOrder);
  const userCard = formatCharacterCard(asOf.card);
  return formatUserSpeakerPrompt({
    name: asOf.card.name,
    card: composeCharacterPersona(userCard, userCore?.content),
  });
}

export function buildRoleplaySystemPrompt(
  state: CharacterState,
  spoilerLocked = false,
  chatRecall: string | null = null,
  continueBeat = false,
  ghostwrite = false,
): string {
  const experienceBlock =
    state.experiences.length > 0
      ? `\n## 你亲历过的事（当前时间点之前）\n${state.experiences.join('\n')}`
      : state.hasAnchor
        ? '\n## 你亲历过的事\n（到目前为止还没有记在你名下的亲历事件。不要因此编造主线，也不要用对该作品的外部知识补全。）'
        : '\n## 你亲历过的事\n（暂无记录——以角色身份自然应对）';
  const companions = state.companions ?? [];
  const groupLine = ghostwrite
    ? companions.length > 0
      ? `创作者把「${state.name}」交给你接着演。也在场的还有：${companions.join('、')}。用第一人称说你自己的话，不要替别人开口，也不要对着读者说话。`
      : `创作者把「${state.name}」交给你接着演。用第一人称把场面往下推，不要解释你在代打。`
    : companions.length > 0
      ? `你正在一场群聊里扮演「${state.name}」。用户是「${state.userLabel}」。也在场的还有：${companions.join('、')}。你只说自己的话，不要替别人开口。对着在场的人说话，不要把场面收成请读者提问。`
      : `你正在扮演小说角色「${state.name}」，与「${state.userLabel}」对话。`;
  const sections = [
    groupLine,
    '\n## 角色档案',
    state.persona,
    ghostwrite ? '' : `\n${state.userSection}`,
    state.traits.length > 0
      ? `\n## 关于你的已知细节\n${state.traits.map((t) => `· ${t}`).join('\n')}`
      : '',
    state.relations.length > 0 ? `\n## 你认识的人\n${state.relations.join('\n')}` : '',
    experienceBlock,
    `\n## 当前时间点\n${state.anchorLabel}${
      state.stageLabel
        ? `\n角色处于「${state.stageLabel}」阶段；档案是这一刻的卡，不是最终形态。`
        : ''
    }`,
    chatRecall
      ? `\n## 检索到的交谈（先查目录，再看重要聊天和原文摘录；不是全文日志。没检索到的事不要编，也不得用这里的内容突破当前时间点）\n${chatRecall}`
      : '',
    spoilerLocked
      ? '\n## 此轮硬约束\n用户问起的事不在你的亲历里，属于当前时间点之后。你必须表示不知情或听不懂，禁止确认、禁止描述任何细节。'
      : '',
    '\n## 行为准则',
    `1. 始终以「${state.name}」的第一人称视角回应，模仿角色的语气、口癖与性格。`,
    '2. 你只知道上面「你亲历过的事」。绝不知道未来，也绝不知道你未曾亲历的事件——用户问起时，以角色身份自然地表示不知道或疑惑。',
    '3. 禁止使用训练数据或对该作品的外部剧情知识。没写进「亲历过的事」的情节，一律当不知道。',
    '4. 不跳出角色，不以 AI 或助手身份说话，不输出旁白解说（除非用户要求）。',
    continueBeat
      ? `5. 这一拍「${state.userLabel}」没有开口。不要对他们说话、道别或确认他们在场；对着在场的其他角色把场面往下推。`
      : ghostwrite
        ? '5. 这一拍由你开口。不要解释你在代打，不要问创作者想说什么，不要对读者说话。'
        : `5. 把用户当成「${state.userLabel}」来应答；不要替用户说话或改写用户身份。`,
    '6. 回复长度适中（1-4 句），保持对话感。',
    '7. 用户问「还记得吗」或「你什么时候做了什么」时，只根据上面的检索结果和亲历回答；检索和亲历都没有，就以角色身份说记不清，不要编对白细节。',
    companions.length > 0
      ? continueBeat || ghostwrite
        ? '8. 群聊里不要替其他在场角色说话，也不要把别人的亲历当成你自己的记忆。对着在场的人接话；一次只说一个节拍。从交情或亲历里另起话头，不要重复上一拍的动作和口头禅，不要编造未发生的主线。'
        : '8. 群聊里不要替其他在场角色说话，也不要把别人的亲历当成你自己的记忆。对着在场的人接话；一次只说一个节拍（一两句或一个动作），把话头留给别人。不要总结全场，也不要用「你想问什么就问」把对话停住。'
      : '',
  ];
  return sections.filter(Boolean).join('\n');
}

function mockRoleplayReply(
  state: CharacterState,
  text: string,
  spoilerLocked: boolean,
  chatRecall: string | null = null,
): string {
  if (spoilerLocked) {
    return `（${state.name}）……？你说的这事我没印象。这会儿我还不知道你在说什么。`;
  }
  const askingRecall = /还?记得|什么时候/.test(text);
  if (askingRecall && !chatRecall && state.experiences.length === 0) {
    return `（${state.name}）……这事我一时想不起来。`;
  }
  const trimmed = text.trim().slice(0, 60) || '……';
  const trait = state.traits[0] ?? state.persona.split('\n')[0] ?? '';
  const experience = state.experiences[Math.min(1, state.experiences.length - 1)];
  const lines = [
    `（${state.name}的语气）嗯……「${trimmed}」是吗。`,
    trait
      ? `我这人${trait.includes('：') ? trait.split('：').slice(1).join('：') : trait}，这事我自有分寸。`
      : '这事我自有分寸。',
    experience ? `这让我想起——${experience.replace(/^· /, '')}……罢了，不提也罢。` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export interface RoleplayInput {
  text: string;
  history: RoleplayChatMessage[];
  state: CharacterState;
  chatCatalog?: string | null;
  effort?: EffectiveAgentEffort | null;
  /** Group beat with no new user utterance: they talk among themselves. */
  continueBeat?: boolean;
  /** Speak as the human's character for one beat; stored as a user line. */
  ghostwrite?: boolean;
}

export function buildRoleplayUserPrompt(input: {
  history: RoleplayChatMessage[];
  historyTurns: number;
  text: string;
  userLabel: string;
  speakerFallback?: string;
  continueBeat?: boolean;
  ghostwrite?: boolean;
}): string {
  const historyText = input.history
    .slice(-input.historyTurns)
    .map((message) => {
      const speaker =
        message.speakerName ||
        (message.role === 'user' ? input.userLabel : input.speakerFallback || '角色');
      return `${speaker}：${message.content}`;
    })
    .join('\n');
  const prefix = historyText ? `${historyText}\n\n` : '';
  if (input.continueBeat || input.ghostwrite) {
    return `${prefix}（场面提示，不是「${input.userLabel}」在说话）\n${input.text}`;
  }
  return `${prefix}${input.userLabel}：${input.text}`;
}

export class RoleplayAgent {
  constructor(
    private readonly llm: LLMAdapter,
    private readonly model = 'mock-text-v1',
  ) {}

  async respond(input: RoleplayInput): Promise<{ reply: string; promptTokens: number }> {
    const continueBeat = Boolean(input.continueBeat);
    const ghostwrite = Boolean(input.ghostwrite);
    const spoilerLocked =
      !continueBeat &&
      !ghostwrite &&
      input.state.hasAnchor &&
      mentionsLaterPlot(input.text, input.state.laterPlot);
    const systemPrompt = buildRoleplaySystemPrompt(
      input.state,
      spoilerLocked,
      input.chatCatalog ?? null,
      continueBeat,
      ghostwrite,
    );
    const promptTokens =
      estimateTokens(systemPrompt) +
      input.history.reduce((sum, message) => sum + estimateTokens(message.content), 0) +
      estimateTokens(input.text);

    if (spoilerLocked || this.llm.provider === 'mock') {
      return {
        reply: mockRoleplayReply(input.state, input.text, spoilerLocked, input.chatCatalog ?? null),
        promptTokens,
      };
    }

    const historyTurns = input.effort?.schedule.history_turns ?? 16;
    const userPrompt = buildRoleplayUserPrompt({
      history: input.history,
      historyTurns,
      text: input.text,
      userLabel: input.state.userLabel,
      speakerFallback: input.state.name,
      ...(continueBeat ? { continueBeat: true } : {}),
      ...(ghostwrite ? { ghostwrite: true } : {}),
    });

    const completion = await this.llm.complete({
      request_id: `roleplay:${Date.now()}`,
      model: this.model,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      temperature: continueBeat || ghostwrite ? 0.92 : 0.8,
      max_tokens: input.effort?.schedule.max_output_tokens ?? 1_500,
    });
    return {
      reply: completion.text.trim() || mockRoleplayReply(input.state, input.text, spoilerLocked, input.chatCatalog ?? null),
      promptTokens,
    };
  }

  /**
   * 对白结束后起草「这一轮让世界发生了什么」。只提议不写库；
   * 产物挂在 assistant 消息上，等用户在提案卡确认（task-s25）。
   */
  draftWorldChanges(
    input: RoleplayDraftInput,
    options?: { onLlmError?: (error: unknown) => void },
  ): Promise<RoleplayDraftResult> {
    return draftRoleplayWorldChanges(this.llm, this.model, input, options);
  }
}
