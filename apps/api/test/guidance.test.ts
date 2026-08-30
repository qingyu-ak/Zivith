import { describe, expect, it } from 'vitest';
import {
  detectWorldGaps,
  nextGuidanceGaps,
  wantsGuidanceTurn,
} from '../src/contexts/world-builder/guidance.js';
import { mockWorldBuilderResponse } from '../src/contexts/world-builder/world-builder-agent.js';
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

  it('keeps a create proposal and appends the next question', () => {
    const response = mockWorldBuilderResponse({
      text: '记录角色：林澈',
      history: [{ role: 'user', content: '记录角色：林澈' }],
      world: world({
        worldview: { genre: '东方玄幻', rules: ['灵气有限'] },
      }),
      stage: 'growing',
    });
    expect(response.proposals[0]?.kind).toBe('create_character');
    expect(response.reply).toContain('下一步我想问');
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
