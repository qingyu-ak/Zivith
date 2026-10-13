import { describe, expect, it } from 'vitest';
import {
  detectWorldGaps,
  nextGuidanceGaps,
  replyAlreadyAsks,
  replyRepeatsPrevious,
  skipGapsAnsweredThisTurn,
  wantsGuidanceTurn,
} from '../src/contexts/world-builder/guidance.js';
import {
  WorldBuilderAgent,
  mockWorldBuilderResponse,
} from '../src/contexts/world-builder/world-builder-agent.js';
import type { LLMAdapter } from '../src/ports/llm.js';
import { buildWorldBuilderSystemPrompt } from '../src/contexts/world-builder/prompt.js';
import type { WorldContext } from '../src/contexts/world-builder/world-context.js';

function world(overrides?: Partial<WorldContext>): WorldContext {
  return {
    projectId: 'p1',
    projectName: '测试世界',
    worldview: { rules: [] },
    stories: [],
    characters: [],
    locations: [],
    scenes: [],
    worldEvents: [],
    relationships: [],
    ...overrides,
  };
}

describe('detectWorldGaps', () => {
  it('asks worldview and protagonist when the world is empty', () => {
    const topics = detectWorldGaps(world()).map((item) => item.topic);
    expect(topics).toContain('worldview');
    expect(topics).toContain('protagonist');
    expect(topics).toContain('story');
  });

  it('asks relationship then pacing once two named characters and a logline exist', () => {
    const gaps = detectWorldGaps(
      world({
        worldview: { genre: '东方玄幻', premise: '凡人修仙', rules: ['灵气有限'] },
        characters: [
          { id: 'c1', name: '林澈', description: '冷静的凡人弟子，一心想成仙', tags: [] },
          { id: 'c2', name: '艾拉', description: '青云宗外门执事，掌管名册', tags: [] },
        ],
        stories: [{ id: 's1', title: '第一卷', genre: '玄幻', logline: '凡人逆天' }],
        locations: [{ id: 'l1', name: '青云宗', description: '山门', tags: [] }],
        worldEvents: [{ id: 'e1', title: '开宗大典', description: null, order: 1 }],
        relationships: [],
      }),
    );
    expect(gaps[0]?.topic).toBe('relationship');
    expect(gaps.some((item) => item.topic === 'pacing')).toBe(true);
  });

  it('skips character-depth when personality is filled even if description is short', () => {
    const gaps = detectWorldGaps(
      world({
        worldview: { genre: '都市', premise: '混血种', rules: ['言灵'] },
        characters: [
          { id: 'c1', name: '路明非', description: '学生', personality: '废柴清醒', tags: [] },
        ],
        stories: [{ id: 's1', title: '龙族', genre: null, logline: '混血种少年屠龙' }],
        locations: [{ id: 'l1', name: '卡塞尔', description: '学院', tags: [] }],
        worldEvents: [{ id: 'e1', title: '入学', description: null, order: 1 }],
        relationships: [],
      }),
    );
    expect(gaps.some((item) => item.topic === 'character_depth')).toBe(false);
  });

  it('caps the next prompt to three questions', () => {
    expect(nextGuidanceGaps(world())).toHaveLength(3);
  });
});

describe('skipGapsAnsweredThisTurn', () => {
  it('drops a gap whose exact question was in the last assistant turn', () => {
    const gaps = detectWorldGaps(world());
    const asked = gaps[0];
    expect(asked).toBeTruthy();
    const remaining = skipGapsAnsweredThisTurn(
      gaps,
      [
        { role: 'assistant', content: `先确认一下：${asked!.question}` },
        { role: 'user', content: '东方玄幻' },
      ],
      '东方玄幻',
    );
    expect(remaining.some((item) => item.id === asked!.id)).toBe(false);
  });

  it('drops the first gap when the last assistant asked a paraphrased question', () => {
    const gaps = detectWorldGaps(
      world({
        worldview: { genre: '东方玄幻', premise: '存在魔法', rules: [] },
      }),
    );
    expect(gaps[0]?.topic).toBe('worldview');
    const remaining = skipGapsAnsweredThisTurn(
      gaps,
      [
        {
          role: 'assistant',
          content: '「魔法」在东方玄幻里更像灵气、道法还是血脉？这个世界的力量从哪里来？',
        },
        { role: 'user', content: '道统传承' },
      ],
      '道统传承',
    );
    expect(remaining[0]?.topic).not.toBe('worldview');
  });

  it('keeps the list when the user only says 继续', () => {
    const gaps = detectWorldGaps(world());
    const remaining = skipGapsAnsweredThisTurn(
      gaps,
      [{ role: 'assistant', content: gaps[0]!.question }],
      '继续',
    );
    expect(remaining).toEqual(gaps);
  });
});

describe('replyAlreadyAsks', () => {
  it('detects a reply that already posed a question', () => {
    expect(replyAlreadyAsks('记下了。力量从哪里来？')).toBe(true);
    expect(replyAlreadyAsks('我整理了一条提案，确认后写入世界档案。')).toBe(false);
  });
});

const repeatedDaoReply =
  '道统传承——这条我记下了：力量不是天生的，而是从某条「道」上传下来的。\n\n那顺着这条再往下问一句：这个「道统」是唯一的，还是有好几条互不相容的道？';

describe('replyRepeatsPrevious', () => {
  it('flags a verbatim copy of the last assistant turn', () => {
    expect(
      replyRepeatsPrevious(repeatedDaoReply, [
        { role: 'assistant', content: repeatedDaoReply },
        { role: 'user', content: '天底下只有一条大道' },
      ]),
    ).toBe(true);
    expect(
      replyRepeatsPrevious('记下了。', [{ role: 'assistant', content: repeatedDaoReply }]),
    ).toBe(false);
  });
});

describe('wantsGuidanceTurn', () => {
  it('treats short continue cues as a guidance turn', () => {
    expect(wantsGuidanceTurn('继续')).toBe(true);
    expect(wantsGuidanceTurn('然后呢')).toBe(true);
    expect(wantsGuidanceTurn('好的')).toBe(true);
    expect(wantsGuidanceTurn('记录角色：艾拉')).toBe(false);
  });
});

describe('world builder proactive guidance', () => {
  it('asks the next gap on 继续 without creating an entity', () => {
    const response = mockWorldBuilderResponse({
      text: '继续',
      history: [{ role: 'user', content: '继续' }],
      world: world({
        characters: [{ id: 'c1', name: '林澈', description: '凡人', tags: [] }],
      }),
      stage: 'growing',
    });
    expect(response.proposals).toEqual([]);
    expect(response.world_state.open_questions.length).toBeGreaterThan(0);
    expect(response.reply).toContain('提案');
    expect(response.reply).toMatch(/主角|梗概|地点|事件|题材/);
  });

  it('appends the next gap only when the reply did not already ask', () => {
    const response = mockWorldBuilderResponse({
      text: '题材是东方玄幻',
      history: [{ role: 'user', content: '题材是东方玄幻' }],
      world: world(),
      stage: 'growing',
    });
    expect(response.proposals[0]?.kind).toBe('update_entity');
    expect(response.reply).toContain('下一步我想问');
  });

  it('after answering a paraphrased power-source question, advances to the protagonist not the story', () => {
    const response = mockWorldBuilderResponse({
      text: '题材是东方玄幻，力量来自道统传承',
      history: [
        {
          role: 'assistant',
          content: '「魔法」在东方玄幻里更像灵气、道法还是血脉？这个世界的力量从哪里来？',
        },
        { role: 'user', content: '题材是东方玄幻，力量来自道统传承' },
      ],
      world: world({
        worldview: { genre: '', premise: '存在魔法', rules: [] },
      }),
      stage: 'growing',
    });
    expect(response.proposals[0]?.kind).toBe('update_entity');
    expect(response.reply).toContain('下一步我想问');
    expect(response.reply).toContain('故事的主角是谁');
    expect(response.reply).not.toMatch(/灵气|血脉天赋|力量从哪里来/);
  });

  it('omits the answered worldview gap from the system prompt', () => {
    const prompt = buildWorldBuilderSystemPrompt(
      world({
        worldview: { genre: '东方玄幻', premise: '存在魔法', rules: [] },
      }),
      'growing',
      null,
      null,
      null,
      [
        {
          role: 'assistant',
          content: '「魔法」在东方玄幻里更像灵气、道法还是血脉？这个世界的力量从哪里来？',
        },
      ],
      '道统传承',
    );
    expect(prompt).not.toContain('这个世界有没有一条必须遵守的规则');
    expect(prompt).toContain('故事的主角是谁');
  });

  it('keeps a create proposal and does not append a second question if the reply already asked', () => {
    const response = mockWorldBuilderResponse({
      text: '记录角色：林澈',
      history: [{ role: 'user', content: '记录角色：林澈' }],
      world: world({
        worldview: { genre: '东方玄幻', rules: ['灵气有限'] },
      }),
      stage: 'growing',
    });
    expect(response.proposals[0]?.kind).toBe('create_character');
    expect(response.reply).not.toContain('下一步我想问');
    expect(response.world_state.open_questions.length).toBeGreaterThan(0);
  });

  it('asks about the focused entity instead of the next world gap', () => {
    const response = mockWorldBuilderResponse({
      text: '继续',
      history: [{ role: 'user', content: '继续' }],
      world: world({
        worldview: { genre: '东方玄幻', premise: '凡人修仙', rules: ['灵气有限'] },
        characters: [{ id: 'c1', name: '韩立', description: '凡人弟子', tags: [] }],
      }),
      stage: 'growing',
      focus: { kind: 'character', id: 'c1', name: '韩立' },
    });
    expect(response.reply).toContain('韩立');
    expect(response.proposals).toEqual([]);
  });

  it('treats a Studio handoff line as a focus guidance turn', () => {
    const response = mockWorldBuilderResponse({
      text: '从 Studio 继续：角色「韩立」',
      history: [{ role: 'user', content: '从 Studio 继续：角色「韩立」' }],
      world: world({
        worldview: { genre: '东方玄幻', premise: '凡人修仙', rules: ['灵气有限'] },
        characters: [{ id: 'c1', name: '韩立', description: '凡人弟子', tags: [] }],
      }),
      stage: 'growing',
      focus: { kind: 'character', id: 'c1', name: '韩立' },
    });
    expect(response.reply).toContain('韩立');
    expect(response.reply).toContain('已经满意');
    expect(response.reply).not.toContain('下一步我想问');
    expect(response.proposals).toEqual([]);
  });

  it('replaces a copied assistant reply with the next unanswered gap', async () => {
    const userText = '天底下只有一条大道，谁参透了谁就是「大法师」';
    const llm = {
      provider: 'openai',
      supportedModels: [],
      complete: () => {
        throw new Error('unused');
      },
      completeStructured: async () => ({
        text: '',
        model: 'test',
        input_tokens: 0,
        output_tokens: 0,
        metadata: {},
        data: {
          reply: repeatedDaoReply,
          proposals: [],
          world_state: { stage: 'growing' as const, open_questions: [], conflicts: [] },
        },
      }),
    } as unknown as LLMAdapter;
    const response = await new WorldBuilderAgent(llm, 'test').respond({
      text: userText,
      history: [
        { role: 'assistant', content: repeatedDaoReply },
        { role: 'user', content: userText },
      ],
      world: world({
        worldview: { genre: '东方玄幻', premise: '存在魔法', rules: [] },
      }),
      stage: 'growing',
    });
    expect(response.reply).toContain('记下了');
    expect(response.reply).toContain('主角');
    expect(response.reply).not.toContain('顺着这条再往下问');
  });

  it('proposes update_entity for the focused character', () => {
    const response = mockWorldBuilderResponse({
      text: '把性格写得更冷一点',
      history: [{ role: 'user', content: '把性格写得更冷一点' }],
      world: world({
        worldview: { genre: '东方玄幻', rules: ['灵气有限'] },
        characters: [{ id: 'c1', name: '韩立', description: '凡人弟子', tags: [] }],
      }),
      stage: 'growing',
      focus: { kind: 'character', id: 'c1', name: '韩立' },
    });
    expect(response.proposals[0]).toMatchObject({
      kind: 'update_entity',
      payload: { type: 'character', id: 'c1' },
    });
  });
});
