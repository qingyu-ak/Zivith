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

export interface RoleplayChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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
): Promise<CharacterState | null> {
  const asset = await db.asset.findFirst({
    where: { id: characterAssetId, projectId, type: 'character', deletedAt: null },
  });
  if (!asset) return null;

  const core = await db.memoryCore.findFirst({
    where: { projectId, kind: 'persona', topic: asset.name },
    orderBy: { version: 'desc' },
  });
  const atoms = await db.memoryAtom.findMany({
    where: { projectId, entityId: asset.id, status: 'active', validTo: null },
    orderBy: { createdAt: 'desc' },
    take: 16,
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
    traits: atoms.map((atom) => atom.content).slice(0, 8),
    userLabel: userSpeaker.label,
    userSection: userSpeaker.section,
    stageLabel: asOf.stageLabel,
  };
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
  memoryDigest: string | null,
  spoilerLocked = false,
): string {
  const experienceBlock =
    state.experiences.length > 0
      ? `\n## 你亲历过的事（当前时间点之前）\n${state.experiences.join('\n')}`
      : state.hasAnchor
        ? '\n## 你亲历过的事\n（到目前为止还没有记在你名下的亲历事件。不要因此编造主线，也不要用对该作品的外部知识补全。）'
        : '\n## 你亲历过的事\n（暂无记录——以角色身份自然应对）';
  const sections = [
    `你正在扮演小说角色「${state.name}」，与「${state.userLabel}」对话。`,
    '\n## 角色档案',
    state.persona,
    `\n${state.userSection}`,
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
    memoryDigest ? `\n## 与这位用户的过往交流记忆\n${memoryDigest}` : '',
    spoilerLocked
      ? '\n## 此轮硬约束\n用户问起的事不在你的亲历里，属于当前时间点之后。你必须表示不知情或听不懂，禁止确认、禁止描述任何细节。'
      : '',
    '\n## 行为准则',
    `1. 始终以「${state.name}」的第一人称视角回应，模仿角色的语气、口癖与性格。`,
    '2. 你只知道上面「你亲历过的事」。绝不知道未来，也绝不知道你未曾亲历的事件——用户问起时，以角色身份自然地表示不知道或疑惑。',
    '3. 禁止使用训练数据或对该作品的外部剧情知识。没写进「亲历过的事」的情节，一律当不知道。',
    '4. 不跳出角色，不以 AI 或助手身份说话，不输出旁白解说（除非用户要求）。',
    `5. 把用户当成「${state.userLabel}」来应答；不要替用户说话或改写用户身份。`,
    '6. 回复长度适中（1-4 句），保持对话感。',
  ];
  return sections.filter(Boolean).join('\n');
}

function mockRoleplayReply(state: CharacterState, text: string, spoilerLocked: boolean): string {
  if (spoilerLocked) {
    return `（${state.name}）……？你说的这事我没印象。这会儿我还不知道你在说什么。`;
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
  memoryDigest?: string | null;
  effort?: EffectiveAgentEffort | null;
}

export class RoleplayAgent {
  constructor(
    private readonly llm: LLMAdapter,
    private readonly model = 'mock-text-v1',
  ) {}

  async respond(input: RoleplayInput): Promise<{ reply: string; promptTokens: number }> {
    const spoilerLocked =
      input.state.hasAnchor && mentionsLaterPlot(input.text, input.state.laterPlot);
    const systemPrompt = buildRoleplaySystemPrompt(
      input.state,
      input.memoryDigest ?? null,
      spoilerLocked,
    );
    const promptTokens =
      estimateTokens(systemPrompt) +
      input.history.reduce((sum, message) => sum + estimateTokens(message.content), 0) +
      estimateTokens(input.text);

    if (spoilerLocked || this.llm.provider === 'mock') {
      return { reply: mockRoleplayReply(input.state, input.text, spoilerLocked), promptTokens };
    }

    const historyTurns = input.effort?.schedule.history_turns ?? 16;
    const historyText = input.history
      .slice(-historyTurns)
      .map(
        (message) =>
          `${message.role === 'user' ? input.state.userLabel : input.state.name}：${message.content}`,
      )
      .join('\n');

    const completion = await this.llm.complete({
      request_id: `roleplay:${Date.now()}`,
      model: this.model,
      system_prompt: systemPrompt,
      user_prompt: `${historyText ? `${historyText}\n\n` : ''}${input.state.userLabel}：${input.text}`,
      temperature: 0.8,
      max_tokens: input.effort?.schedule.max_output_tokens ?? 1_500,
    });
    return {
      reply: completion.text.trim() || mockRoleplayReply(input.state, input.text, spoilerLocked),
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
