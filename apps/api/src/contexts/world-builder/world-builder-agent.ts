import { z } from 'zod';
import { proposalSchema, type Proposal } from '@zivith/domain';
import type { LLMAdapter } from '../../ports/llm.js';
import { buildWorldBuilderSystemPrompt } from './prompt.js';
import type { WorldContext } from './world-context.js';

export type WorldStage = 'bootstrap' | 'growing' | 'mature';

export interface WorldBuilderChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface WorldBuilderInput {
  /** The latest user message (may also appear at the end of history). */
  text: string;
  history: WorldBuilderChatMessage[];
  world: WorldContext | null;
  stage: WorldStage;
}

export const worldStateSchema = z
  .object({
    stage: z.enum(['bootstrap', 'growing', 'mature']),
    open_questions: z.array(z.string().max(300)).max(12).default([]),
    conflicts: z.array(z.string().max(500)).max(12).default([]),
  })
  .strict();

export type WorldState = z.infer<typeof worldStateSchema>;

export const worldBuilderResponseSchema = z
  .object({
    reply: z.string().min(1).max(8_000),
    proposals: z.array(proposalSchema).max(3).default([]),
    world_state: worldStateSchema,
  })
  .strict();

export type WorldBuilderResponse = z.infer<typeof worldBuilderResponseSchema>;

export function inferWorldStage(world: WorldContext | null): WorldStage {
  if (!world) return 'bootstrap';
  const count =
    world.stories.length + world.characters.length + world.locations.length + world.worldEvents.length;
  if (count === 0) return 'bootstrap';
  if (count < 5) return 'growing';
  return 'mature';
}

/** Extract the latest user message from history. */
function latestUserMessage(history: WorldBuilderChatMessage[]): WorldBuilderChatMessage | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (message && message.role === 'user') return message;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rule-based mock responder — usable without any LLM credentials.
// ---------------------------------------------------------------------------

function mockProposal(
  kind: Proposal['kind'],
  projectId: string | null,
  payload: Record<string, unknown>,
): Proposal {
  return { kind, project_id: projectId, payload };
}

/** Extract a likely entity name from user text ("记录艾拉为角色", "记录角色：杰克", "主角叫林澈"…). */
function extractEntityName(text: string): string | null {
  const candidates = [
    // "记录角色：杰克" / "记录一个地点：雾都"
    /[:：]\s*([\u4e00-\u9fa5A-Za-z0-9·]{1,12})/,
    // "记录艾拉为角色" / "设定林澈为主角"
    /(?:记录|创建|新增|添加|设定)([\u4e00-\u9fa5A-Za-z0-9·]{1,12})(?:为|作为|是)?(?:角色|人物|主角|地点|城市|场景|事件)/,
    // "主角叫林澈" / "主角是艾拉"
    /主角(?:是|叫|的名字叫|的名字是|叫作|名为)?([\u4e00-\u9fa5A-Za-z0-9·]{1,12})/,
    // "她叫艾拉" / "名叫雾都"
    /(?:名叫|名字叫|名为|叫做|叫)([\u4e00-\u9fa5A-Za-z0-9·]{1,12})/,
  ];
  for (const pattern of candidates) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].trim().length >= 1) return match[1].trim();
  }
  return null;
}

export function mockWorldBuilderResponse(input: WorldBuilderInput): WorldBuilderResponse {
  const world = input.world;
  const projectId = world?.projectId ?? null;
  const latest = latestUserMessage(input.history);
  const text = input.text.trim() || (latest?.content ?? '');
  const conflicts: string[] = [];
  const openQuestions: string[] = [];
  const proposals: Proposal[] = [];

  // No project yet — always propose creating one.
  if (!world) {
    proposals.push(
      mockProposal('create_project', null, {
        name: '新 IP 世界',
        description: '由 Creator Chat 引导创建的世界',
      }),
    );
    return {
      reply:
        '好的，我们开始构建你的 IP 世界！我先为你创建一个项目。\n\n在开始之前，我想先了解三件事：\n1. 这个世界是什么题材？（科幻 / 奇幻 / 现实 / 悬疑…）\n2. 故事的核心主角是什么样的人？\n3. 你想传达的核心主题是什么？',
      proposals,
      world_state: {
        stage: 'bootstrap',
        open_questions: ['世界观题材', '核心主角', '核心主题'],
        conflicts,
      },
    };
  }

  const hasCharacters = world.characters.length > 0;
  const hasStories = world.stories.length > 0;
  const hasLocations = world.locations.length > 0;
  const hasEvents = world.worldEvents.length > 0;

  // Signals for declaring a new entity vs. merely asking about an existing one.
  const wantsCharacter = /角色|人物|主角|characters?/i.test(text);
  const wantsLocation = /地点|城市|场景|环境|where|location/i.test(text);
  const wantsEvent = /事件|发生了什么|历史|event/i.test(text);
  const incremental = /增加|添加|新增|再|又|还有|记录|补充|设定|创建|加入|登场/i.test(text);

  if (wantsCharacter && (!hasCharacters || incremental)) {
    proposals.push(
      mockProposal('create_character', projectId, {
        name: extractEntityName(text) ?? (hasCharacters ? '新角色' : '未命名主角'),
        description: text.length > 40 ? text.slice(0, 200) : '由对话引导创建的角色',
      }),
    );
    return {
      reply:
        '我来帮你建立角色档案。为了更准确，告诉我角色的：\n1. 名字和身份\n2. 性格核心（比如：冷静、热血、偏执）\n3. 他/她的目标或欲望是什么？',
      proposals,
      world_state: { stage: 'growing', open_questions: ['角色名字', '性格核心', '目标欲望'], conflicts },
    };
  }

  if (wantsLocation && (!hasLocations || incremental)) {
    proposals.push(
      mockProposal('create_location', projectId, {
        name: extractEntityName(text) ?? (hasLocations ? '新地点' : '未命名地点'),
        description: '由对话引导创建的核心地点',
      }),
    );
    return {
      reply: '好的，我们建立一个核心地点。这个地点是：\n1. 一座城市、一片区域，还是一个建筑？\n2. 它在这个世界里的地位（家园 / 战场 / 圣地…）？',
      proposals,
      world_state: { stage: 'growing', open_questions: ['地点形态', '地点地位'], conflicts },
    };
  }

  if (wantsEvent && (!hasEvents || incremental)) {
    proposals.push(
      mockProposal('create_world_event', projectId, {
        title: extractEntityName(text) ?? (hasEvents ? '新事件' : '关键事件'),
        description: '由对话引导创建的世界事件',
        world_time_envelope: { order: 1 },
      }),
    );
    return {
      reply: '这个世界发生过什么？请描述一个关键事件：\n1. 事件名称\n2. 它发生在什么时候（世界纪元 / 年份）\n3. 它对世界产生了什么影响？',
      proposals,
      world_state: { stage: 'growing', open_questions: ['事件名称', '时间定位', '世界影响'], conflicts },
    };
  }

  if (
    /关系|和|与|relationship/i.test(text) &&
    hasCharacters &&
    (world.relationships.length === 0 || incremental)
  ) {
    const a = world.characters[0];
    if (!a) {
      return {
        reply: '我注意到你想建立角色关系。不过世界档案里暂时没有可用的角色，先告诉我主角是谁？',
        proposals,
        world_state: { stage: 'growing', open_questions: ['主角信息'], conflicts },
      };
    }
    proposals.push(
      mockProposal('create_relationship', projectId, {
        kind: 'bond',
        source: { type: 'asset', id: a.id },
        target: { type: 'asset', id: a.id },
        direction: 'undirected',
        label: '同伴',
        description: '由对话引导创建的角色关系',
      }),
    );
    return {
      reply: `我看到你提到了关系。目前世界里有角色「${a.name}」。你想建立谁和谁的关系？关系类型是（伙伴 / 对手 / 家人 / 师徒…）？`,
      proposals,
      world_state: { stage: 'growing', open_questions: ['关系双方', '关系类型'], conflicts },
    };
  }

  if (!hasStories) {
    return {
      reply:
        '世界的骨架正在成形。接下来我建议先确立一条故事主线，方便后续把角色、场景和事件组织起来。\n\n可以告诉我：\n1. 故事一句话梗概？\n2. 主要冲突是什么？',
      proposals,
      world_state: {
        stage: 'growing',
        open_questions: ['故事梗概', '主要冲突'],
        conflicts,
      },
    };
  }

  return {
    reply:
      '我已经把世界信息记录下来了。你可以继续补充新的设定，比如：\n- 「增加一个角色：×××」\n- 「这里发生过一场战争」\n- 「A 和 B 是师徒关系」\n\n或者让我帮你检查现有设定中的矛盾。',
    proposals,
    world_state: { stage: 'mature', open_questions: [], conflicts },
  };
}

// ---------------------------------------------------------------------------
// World Builder agent
// ---------------------------------------------------------------------------

export class WorldBuilderAgent {
  constructor(
    private readonly llm: LLMAdapter,
    private readonly model = 'mock-text-v1',
  ) {}

  async respond(input: WorldBuilderInput): Promise<WorldBuilderResponse> {
    if (this.llm.provider === 'mock') {
      return mockWorldBuilderResponse(input);
    }

    const historyText = input.history
      .map((m) => `${m.role === 'user' ? '创作者' : m.role === 'assistant' ? '世界构建者' : '系统'}：${m.content}`)
      .slice(-24)
      .join('\n');

    const completion = await this.llm.completeStructured(
      {
        request_id: `world-builder:${Date.now()}`,
        model: this.model,
        system_prompt: buildWorldBuilderSystemPrompt(input.world, input.stage),
        user_prompt: JSON.stringify({
          recent_conversation: historyText,
          required_schema: {
            reply: '给创作者的自然语言回复（与创作者同语言）',
            proposals: '需要创作者确认的提案数组（最多 2 个，无则 []）',
            world_state: {
              stage: 'bootstrap|growing|mature',
              open_questions: '下一步引导问题',
              conflicts: '发现的设定冲突',
            },
          },
        }),
        temperature: 0.7,
        max_tokens: 2_000,
      },
      worldBuilderResponseSchema,
    );
    // Re-parse so defaults (proposals/open_questions/conflicts) are always materialized.
    const parsed = worldBuilderResponseSchema.parse(completion.data);

    // LLMs sometimes answer with prose only and forget to emit proposals.
    // Fall back to rule-based extraction so user-provided settings still
    // surface as confirmable proposals (ADR-0010 fence).
    if (parsed.proposals.length === 0) {
      const fallback = mockWorldBuilderResponse(input);
      if (fallback.proposals.length > 0) {
        parsed.proposals.push(...fallback.proposals);
        parsed.reply = `${parsed.reply}\n\n（检测到你提供了新的设定信息，我已整理成提案，请确认后写入世界档案。）`;
        parsed.world_state.open_questions = fallback.world_state.open_questions;
      }
    }

    return parsed;
  }
}
