import { describe, expect, it, vi } from 'vitest';
import type { ZodType } from 'zod';
import {
  draftRoleplayWorldChanges,
  draftWorldChangesByRule,
  contentRestatesEvent,
  eventAlreadyRecorded,
  sanitizeLlmChanges,
  userAssertsEvent,
  type RoleplayDraftInput,
} from '../src/contexts/roleplay/world-change-drafter.js';
import { isQuestionOrSmallTalk } from '../src/contexts/world-builder/text-extract.js';
import { assembleWorldContext } from '../src/contexts/world-builder/world-context.js';
import { mockWorldBuilderResponse } from '../src/contexts/world-builder/world-builder-agent.js';
import { resolveAgentEffort } from '../src/contexts/agent-effort.js';
import type {
  CompletionRequest,
  LLMAdapter,
  StructuredCompletionResult,
} from '../src/ports/llm.js';

const world = assembleWorldContext({
  projectId: 'p1',
  projectName: '雾港遗事',
  worldview: {},
  stories: [],
  characters: [
    { id: 'c-ailin', name: '艾琳', description: '灯塔守', tags: [] },
    { id: 'c-chenmo', name: '陈默', description: '走私客', tags: [] },
    { id: 'c-lin', name: '林澈', description: '读者角色', tags: [] },
  ],
  locations: [],
  scenes: [],
  worldEvents: [],
  relationships: [
    {
      id: 'r1',
      kind: 'bond',
      label: '伙伴',
      direction: 'undirected',
      sourceType: 'asset',
      sourceId: 'c-ailin',
      targetType: 'asset',
      targetId: 'c-lin',
    },
  ],
});

function input(text: string, overrides: Partial<RoleplayDraftInput> = {}): RoleplayDraftInput {
  return {
    text,
    reply: '（艾琳）……我知道了。',
    world,
    character: { id: 'c-ailin', name: '艾琳' },
    userCharacter: { id: 'c-lin', name: '林澈' },
    effort: resolveAgentEffort('balanced'),
    ...overrides,
  };
}

describe('draftWorldChangesByRule', () => {
  it('turns an explicit happening into a world event with the participants', () => {
    const proposals = draftWorldChangesByRule(
      input('你把灯塔的秘密告诉了陈默，然后我们一起离开了雾港'),
    );
    const event = proposals.find((item) => item.kind === 'create_world_event');
    expect(event).toBeDefined();
    expect(event?.project_id).toBe('p1');
    expect(event?.payload.title).toBe('艾琳把灯塔的秘密告诉了陈默');
    expect(event?.payload.character_ids).toEqual(
      expect.arrayContaining(['c-ailin', 'c-lin', 'c-chenmo']),
    );
  });

  it('drafts a relationship between two different characters, never self-referencing', () => {
    const proposals = draftWorldChangesByRule(input('从今天起你和陈默就是盟友了'));
    const relationship = proposals.find((item) => item.kind === 'create_relationship');
    expect(relationship).toBeDefined();
    const source = relationship?.payload.source as { id: string };
    const target = relationship?.payload.target as { id: string };
    expect(source.id).toBe('c-ailin');
    expect(target.id).toBe('c-chenmo');
    expect(relationship?.payload.kind).toBe('ally');
  });

  it('skips a relationship that already exists in the world', () => {
    const proposals = draftWorldChangesByRule(input('你和林澈早就是伙伴了'));
    expect(proposals.filter((item) => item.kind === 'create_relationship')).toEqual([]);
  });

  it('does not draft another event when the title is already on the timeline', () => {
    const recorded = assembleWorldContext({
      projectId: 'p1',
      projectName: '雾港遗事',
      worldview: {},
      stories: [],
      characters: world.characters,
      locations: [],
      scenes: [],
      worldEvents: [
        {
          id: 'e1',
          title: '艾琳把灯塔的秘密告诉了陈默',
          description: null,
          order: 1,
        },
      ],
      relationships: [],
    });
    const proposals = draftWorldChangesByRule(
      input('你把灯塔的秘密告诉了陈默，然后我们一起离开了雾港', { world: recorded }),
    );
    expect(proposals.filter((item) => item.kind === 'create_world_event')).toEqual([]);
  });

  it('treats a rephrased title about the same people as the same event', () => {
    const fog = assembleWorldContext({
      projectId: 'p1',
      projectName: '走查雾城信',
      worldview: {},
      stories: [],
      characters: [
        { id: 'lin', name: '林晚', description: null, tags: [] },
        { id: 'chen', name: '陈叔', description: null, tags: [] },
      ],
      locations: [],
      scenes: [],
      worldEvents: [
        {
          id: 'e-tea',
          title: '林晚在雾城酒馆向陈叔递交信件（Studio 改过）',
          description: '林晚亲手将一封信交到雾城酒馆店主陈叔手中，陈叔收下信件并请她喝了一碗热茶。',
          order: 2,
        },
      ],
      relationships: [],
    });
    expect(eventAlreadyRecorded('林晚在雾城酒馆向陈叔递信并喝热茶', fog)).toBe(true);
    const earlierOnly = assembleWorldContext({
      ...{
        projectId: fog.projectId,
        projectName: fog.projectName,
        worldview: {},
        stories: [],
        characters: fog.characters,
        locations: [],
        scenes: [],
        relationships: [],
      },
      worldEvents: [
        {
          id: 'e-letter',
          title: '林晚在雾城酒馆将一封信交给店主',
          description: '林晚当面把一封信交给了雾城酒馆的店主。',
          order: 1,
        },
      ],
    });
    expect(eventAlreadyRecorded('林晚在雾城酒馆向陈叔递信并喝热茶', earlierOnly)).toBe(false);
  });

  it('treats chat facts that restate a deleted event as the same event', () => {
    const event = {
      title: '林晚在雾城酒馆向陈叔递交信件（Studio 改过）',
      description: '林晚亲手将一封信交到雾城酒馆店主陈叔手中，陈叔收下信件并请她喝了一碗热茶。',
    };
    const names = ['林晚', '陈叔'];
    expect(
      contentRestatesEvent('林晚在雾城酒馆向陈叔递交了信件，并喝了热茶。', event, names),
    ).toBe(true);
    expect(contentRestatesEvent('林晚确认信已亲手交到陈叔手上，茶也喝了。', event, names)).toBe(
      true,
    );
    expect(contentRestatesEvent('雾大。钟声听不太清。', event, names)).toBe(false);
  });

  it('treats a rephrased terrace confession as the same event even if one name is an alias', () => {
    const longzu = assembleWorldContext({
      projectId: 'p-longzu',
      projectName: '龙族',
      worldview: {},
      stories: [],
      characters: [
        { id: 'c-lmf', name: '路明非', description: null, tags: [] },
        { id: 'c-nuonuo', name: '陈墨淳', description: null, aliases: ['诺诺'], tags: [] },
      ],
      locations: [],
      scenes: [],
      worldEvents: [
        {
          id: 'e-terrace',
          title: '路明非在天台向诺诺坦白见过龙王',
          description: '后半夜，路明非在卡塞尔学院天台当面告诉诺诺自己见过龙王。',
          order: 1,
        },
      ],
      relationships: [],
    });
    expect(eventAlreadyRecorded('路明非在天台对诺诺说“你见过龙王”', longzu)).toBe(true);
  });

  it('does not propose anything for small talk or questions', () => {
    expect(draftWorldChangesByRule(input('你好呀'))).toEqual([]);
    expect(draftWorldChangesByRule(input('你今天心情怎么样？'))).toEqual([]);
    expect(draftWorldChangesByRule(input('陈默到底是谁'))).toEqual([]);
    const remember = '你还记得后半夜在天台对诺诺说的事吗？你当时说了什么？';
    expect(isQuestionOrSmallTalk(remember)).toBe(true);
    expect(userAssertsEvent(remember)).toBe(false);
    expect(draftWorldChangesByRule(input(remember))).toEqual([]);
  });

  it('never produces a relationship when the only mentioned character is the speaker', () => {
    const proposals = draftWorldChangesByRule(
      input('艾琳，你和我结为盟友吧', { userCharacter: null }),
    );
    expect(proposals.filter((item) => item.kind === 'create_relationship')).toEqual([]);
  });
});

describe('sanitizeLlmChanges', () => {
  it('drops unknown ids, self-references and duplicates of existing relationships', () => {
    const proposals = sanitizeLlmChanges(
      {
        changes: [
          {
            kind: 'create_world_event',
            title: '灯塔的秘密外泄',
            character_ids: ['c-chenmo', 'ghost-id'],
          },
          {
            kind: 'create_relationship',
            source_id: 'c-ailin',
            target_id: 'c-ailin',
            relation: '盟友',
            direction: 'undirected',
          },
          {
            kind: 'create_relationship',
            source_id: 'c-ailin',
            target_id: 'nobody',
            relation: '盟友',
            direction: 'undirected',
          },
          {
            kind: 'create_relationship',
            source_id: 'c-ailin',
            target_id: 'c-lin',
            relation: '伙伴',
            direction: 'undirected',
          },
          {
            kind: 'create_relationship',
            source_id: 'c-ailin',
            target_id: 'c-chenmo',
            relation: '对手',
            direction: 'undirected',
          },
        ],
      },
      input('你把灯塔的秘密告诉了陈默，你和陈默成了对手'),
    );
    expect(proposals).toHaveLength(2);
    expect(proposals[0]?.payload.character_ids).toEqual(['c-ailin', 'c-chenmo']);
    expect(proposals[1]?.payload.kind).toBe('rival');
  });
});

describe('draftRoleplayWorldChanges', () => {
  const mockLlm: LLMAdapter = {
    provider: 'mock',
    supportedModels: [],
    complete: vi.fn(),
    completeStructured: vi.fn(),
  };

  it('uses rules without any LLM call when the provider is mock', async () => {
    const result = await draftRoleplayWorldChanges(mockLlm, 'mock', input('你决定明天出发去北境'));
    expect(result.mode).toBe('rule');
    expect(result.proposals[0]?.kind).toBe('create_world_event');
    expect(mockLlm.completeStructured).not.toHaveBeenCalled();
  });

  it('caps proposals by the effort schedule', async () => {
    const result = await draftRoleplayWorldChanges(
      mockLlm,
      'mock',
      input('你把秘密告诉了陈默，你们成了盟友', { effort: resolveAgentEffort('fast') }),
    );
    expect(result.proposals.length).toBeLessThanOrEqual(1);
  });

  it('falls back to rules when the structured LLM call fails', async () => {
    const failing: LLMAdapter = {
      provider: 'deepseek',
      supportedModels: [],
      complete: vi.fn(),
      completeStructured: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const onLlmError = vi.fn();
    const result = await draftRoleplayWorldChanges(failing, 'x', input('你决定明天出发去北境'), {
      onLlmError,
    });
    expect(onLlmError).toHaveBeenCalledOnce();
    expect(result.mode).toBe('rule');
    expect(result.proposals).toHaveLength(1);
  });

  it('trusts an empty LLM answer over rule heuristics', async () => {
    const completeStructured = async <T>(
      request: CompletionRequest,
      schema: ZodType<T>,
    ): Promise<StructuredCompletionResult<T>> => ({
      data: schema.parse({ changes: [] }),
      text: '{"changes":[]}',
      model: request.model,
      input_tokens: 0,
      output_tokens: 0,
      metadata: {},
    });
    const quiet: LLMAdapter = {
      provider: 'deepseek',
      supportedModels: [],
      complete: vi.fn(),
      completeStructured,
    };
    const result = await draftRoleplayWorldChanges(quiet, 'x', input('你决定明天出发去北境'));
    expect(result.mode).toBe('llm');
    expect(result.proposals).toEqual([]);
  });

  it('drops an LLM event when the user was only chatting', async () => {
    const completeStructured = async <T>(
      request: CompletionRequest,
      schema: ZodType<T>,
    ): Promise<StructuredCompletionResult<T>> => ({
      data: schema.parse({
        changes: [
          {
            kind: 'create_world_event',
            title: '林晚雾中送信至钟楼拐角折返',
            character_ids: ['c-ailin'],
          },
        ],
      }),
      text: '{}',
      model: request.model,
      input_tokens: 0,
      output_tokens: 0,
      metadata: {},
    });
    const chatty: LLMAdapter = {
      provider: 'deepseek',
      supportedModels: [],
      complete: vi.fn(),
      completeStructured,
    };
    const result = await draftRoleplayWorldChanges(chatty, 'x', input('今天雾很大，随便聊聊'));
    expect(result.proposals).toEqual([]);
  });

  it('drops an LLM event when the user only asked if the character remembers', async () => {
    const completeStructured = async <T>(
      request: CompletionRequest,
      schema: ZodType<T>,
    ): Promise<StructuredCompletionResult<T>> => ({
      data: schema.parse({
        changes: [
          {
            kind: 'create_world_event',
            title: '路明非在天台对诺诺说“你见过龙王”',
            character_ids: ['c-ailin'],
          },
        ],
      }),
      text: '{}',
      model: request.model,
      input_tokens: 0,
      output_tokens: 0,
      metadata: {},
    });
    const probing: LLMAdapter = {
      provider: 'deepseek',
      supportedModels: [],
      complete: vi.fn(),
      completeStructured,
    };
    const result = await draftRoleplayWorldChanges(
      probing,
      'x',
      input('你还记得后半夜在天台对诺诺说的事吗？你当时说了什么？'),
    );
    expect(result.proposals).toEqual([]);
  });

  it('drops an LLM event that repeats one already on the timeline', async () => {
    const recorded = assembleWorldContext({
      projectId: 'p1',
      projectName: '雾港遗事',
      worldview: {},
      stories: [],
      characters: world.characters,
      locations: [],
      scenes: [],
      worldEvents: [
        {
          id: 'e1',
          title: '路明非在天台向诺诺坦白见过龙王',
          description: null,
          order: 1,
        },
      ],
      relationships: [],
    });
    const completeStructured = async <T>(
      request: CompletionRequest,
      schema: ZodType<T>,
    ): Promise<StructuredCompletionResult<T>> => ({
      data: schema.parse({
        changes: [
          {
            kind: 'create_world_event',
            title: '路明非在天台向诺诺坦白见过龙王',
            character_ids: ['c-ailin'],
          },
        ],
      }),
      text: '{}',
      model: request.model,
      input_tokens: 0,
      output_tokens: 0,
      metadata: {},
    });
    const repeating: LLMAdapter = {
      provider: 'deepseek',
      supportedModels: [],
      complete: vi.fn(),
      completeStructured,
    };
    const result = await draftRoleplayWorldChanges(
      repeating,
      'x',
      input('刚才路明非在天台向诺诺坦白见过龙王，这件事已经发生了', { world: recorded }),
    );
    expect(result.proposals).toEqual([]);
  });
});

describe('world builder mock guards (P0-4)', () => {
  const base = {
    history: [],
    stage: 'growing' as const,
  };

  it('does not invent an unnamed character', () => {
    const response = mockWorldBuilderResponse({
      ...base,
      text: '再添加一个角色',
      history: [{ role: 'user', content: '再添加一个角色' }],
      world,
    });
    expect(response.proposals).toEqual([]);
    expect(response.reply).toContain('叫什么');
  });

  it('only proposes a relationship between two recognised, different characters', () => {
    const vague = mockWorldBuilderResponse({
      ...base,
      text: '给他们加一段关系',
      history: [{ role: 'user', content: '给他们加一段关系' }],
      world,
    });
    expect(vague.proposals).toEqual([]);

    const concrete = mockWorldBuilderResponse({
      ...base,
      text: '记录：陈默和艾琳是宿敌',
      history: [{ role: 'user', content: '记录：陈默和艾琳是宿敌' }],
      world,
    });
    const relationship = concrete.proposals.find((item) => item.kind === 'create_relationship');
    expect(relationship).toBeDefined();
    const source = relationship?.payload.source as { id: string };
    const target = relationship?.payload.target as { id: string };
    expect(source.id).not.toBe(target.id);
    expect(new Set([source.id, target.id])).toEqual(new Set(['c-chenmo', 'c-ailin']));
  });
});
