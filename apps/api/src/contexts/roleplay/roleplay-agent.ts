// M3 角色扮演 Agent（设计 §6）
// CharacterStateBuilder 组装：角色卡（MemoryCore persona）+ 锚点前亲历事件 + 关系快照
// + 认知边界（只含角色亲历事件，防剧透）。Mock 降级 = 模板化应答（无密钥全链路可跑）。
import type { PrismaClient } from '@prisma/client';
import type { LLMAdapter } from '../../ports/llm.js';
import { estimateTokens } from '../memory/context-window.js';

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
  traits: string[];
}

export async function buildCharacterState(
  db: PrismaClient,
  projectId: string,
  characterAssetId: string,
  anchoredWorldEventId: string | null,
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
    ? await db.worldEvent.findFirst({ where: { id: anchoredWorldEventId, projectId, deletedAt: null } })
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
    ? await db.asset.findMany({ where: { id: { in: counterpartIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(counterparts.map((c) => [c.id, c.name]));
  const relations = relationships
    .map((rel) => {
      const otherId = rel.sourceId === asset.id ? rel.targetId : rel.sourceId;
      const other = nameById.get(otherId) ?? '某人';
      return `· 与「${other}」：${rel.label ?? rel.kind}${rel.description ? `（${rel.description}）` : ''}`;
    })
    .slice(0, 12);

  return {
    name: asset.name,
    description: asset.description,
    persona: core?.content ?? `角色「${asset.name}」：${asset.description}`,
    experiences,
    relations,
    anchorLabel: anchor ? `《${anchor.title}》之后` : '全书读完（知晓全部亲历剧情）',
    traits: atoms.map((atom) => atom.content).slice(0, 8),
  };
}

function buildRoleplaySystemPrompt(
  state: CharacterState,
  memoryDigest: string | null,
): string {
  const sections = [
    `你正在扮演小说角色「${state.name}」，与用户（扮演故事中的另一位人物或读者）对话。`,
    '\n## 角色档案',
    state.persona,
    state.traits.length > 0 ? `\n## 关于你的已知细节\n${state.traits.map((t) => `· ${t}`).join('\n')}` : '',
    state.relations.length > 0 ? `\n## 你认识的人\n${state.relations.join('\n')}` : '',
    state.experiences.length > 0
      ? `\n## 你亲历过的事（当前时间点之前）\n${state.experiences.join('\n')}`
      : '\n## 你亲历过的事\n（暂无记录——以角色身份自然应对）',
    `\n## 当前时间点\n${state.anchorLabel}`,
    memoryDigest ? `\n## 与这位用户的过往交流记忆\n${memoryDigest}` : '',
    '\n## 行为准则',
    `1. 始终以「${state.name}」的第一人称视角回应，模仿角色的语气、口癖与性格。`,
    '2. 你只知道上面「你亲历过的事」。绝不知道未来，也绝不知道你未曾亲历的事件——用户问起时，以角色身份自然地表示不知道或疑惑。',
    '3. 不跳出角色，不以 AI 或助手身份说话，不输出旁白解说（除非用户要求）。',
    '4. 回复长度适中（1-4 句），保持对话感。',
  ];
  return sections.filter(Boolean).join('\n');
}

function mockRoleplayReply(state: CharacterState, text: string): string {
  const trimmed = text.trim().slice(0, 60) || '……';
  const trait = state.traits[0] ?? state.persona.split('\n')[0] ?? '';
  const experience = state.experiences[Math.min(1, state.experiences.length - 1)];
  const lines = [
    `（${state.name}的语气）嗯……「${trimmed}」是吗。`,
    trait ? `我这人${trait.includes('：') ? trait.split('：').slice(1).join('：') : trait}，这事我自有分寸。` : '这事我自有分寸。',
    experience ? `这让我想起——${experience.replace(/^· /, '')}……罢了，不提也罢。` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export interface RoleplayInput {
  text: string;
  history: RoleplayChatMessage[];
  state: CharacterState;
  memoryDigest?: string | null;
}

export class RoleplayAgent {
  constructor(
    private readonly llm: LLMAdapter,
    private readonly model = 'mock-text-v1',
  ) {}

  async respond(input: RoleplayInput): Promise<{ reply: string; promptTokens: number }> {
    const systemPrompt = buildRoleplaySystemPrompt(input.state, input.memoryDigest ?? null);
    const promptTokens =
      estimateTokens(systemPrompt) +
      input.history.reduce((sum, message) => sum + estimateTokens(message.content), 0) +
      estimateTokens(input.text);

    if (this.llm.provider === 'mock') {
      return { reply: mockRoleplayReply(input.state, input.text), promptTokens };
    }

    const historyText = input.history
      .slice(-16)
      .map((message) => `${message.role === 'user' ? '用户' : input.state.name}：${message.content}`)
      .join('\n');

    const completion = await this.llm.complete({
      request_id: `roleplay:${Date.now()}`,
      model: this.model,
      system_prompt: systemPrompt,
      user_prompt: `${historyText ? `${historyText}\n\n` : ''}用户：${input.text}`,
      temperature: 0.8,
      max_tokens: 1_500,
    });
    return { reply: completion.text.trim() || mockRoleplayReply(input.state, input.text), promptTokens };
  }
}
