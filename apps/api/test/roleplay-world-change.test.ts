import { describe, expect, it, vi } from 'vitest';
import type { ZodType } from 'zod';
import {
  draftRoleplayWorldChanges,
  draftWorldChangesByRule,
  sanitizeLlmChanges,
  type RoleplayDraftInput,
} from '../src/contexts/roleplay/world-change-drafter.js';
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

  it('does not propose anything for small talk or questions', () => {
    expect(draftWorldChangesByRule(input('你好呀'))).toEqual([]);
    expect(draftWorldChangesByRule(input('你今天心情怎么样？'))).toEqual([]);
    expect(draftWorldChangesByRule(input('陈默到底是谁'))).toEqual([]);
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
      input('无关'),
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
