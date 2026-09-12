import { describe, expect, it } from 'vitest';
import {
  filterFocusableEntities,
  insertAtTrigger,
  insertMention,
  incompleteMentionHint,
  listFocusableEntities,
  mentionQueryAt,
  NO_MATCH_MENTION_HINT,
  INCOMPLETE_MENTION_HINT,
} from './agent-mentions';
import type { WorldResourcesDTO } from './types';

function resources(): WorldResourcesDTO {
  return {
    project: { id: 'p1', name: '龙族', worldview: { rules: [] } },
    stage: 'growing',
    entities: {
      stories: [{ id: 'st1', project_id: 'p1', title: '第一卷' }],
      characters: [
        { id: 'c1', project_id: 'p1', name: '路明非', description: '主角' },
        { id: 'c2', project_id: 'p1', name: '诺诺', description: '学姐' },
      ],
      locations: [{ id: 'loc1', project_id: 'p1', name: '卡塞尔学院', description: '学校' }],
      scenes: [],
      world_events: [],
      relationships: [],
      shots: [],
    },
  };
}

describe('listFocusableEntities', () => {
  it('lists project and world entities for @ search', () => {
    const items = listFocusableEntities(resources());
    expect(items.map((item) => `${item.kind}:${item.name}`)).toEqual([
      'project:龙族',
      'character:路明非',
      'character:诺诺',
      'location:卡塞尔学院',
      'story:第一卷',
    ]);
  });
});

describe('filterFocusableEntities', () => {
  it('matches name or kind label and caps at 8', () => {
    const items = listFocusableEntities(resources());
    expect(filterFocusableEntities(items, '诺').map((item) => item.name)).toEqual(['诺诺']);
    expect(filterFocusableEntities(items, '角色').every((item) => item.kind === 'character')).toBe(
      true,
    );
  });
});

describe('mentionQueryAt', () => {
  it('opens after @ at start or whitespace, closes on space', () => {
    expect(mentionQueryAt('@诺', 2)).toEqual({ start: 0, query: '诺' });
    expect(mentionQueryAt('看 @路', 4)).toEqual({ start: 2, query: '路' });
    expect(mentionQueryAt('a@x', 3)).toBeNull();
    expect(mentionQueryAt('@诺 诺', 4)).toBeNull();
    expect(mentionQueryAt('没有', 2)).toBeNull();
  });
});

describe('insertMention', () => {
  it('replaces the @query with @name and a trailing space', () => {
    expect(insertMention('@诺', 2, 0, '诺诺')).toEqual({ text: '@诺诺 ', cursor: 4 });
    expect(insertMention('看 @路 然后', 4, 2, '路明非')).toEqual({
      text: '看 @路明非 然后',
      cursor: 7,
    });
  });
});

describe('insertAtTrigger', () => {
  it('inserts @ and prefixes a space when needed', () => {
    expect(insertAtTrigger('', 0)).toEqual({ text: '@', cursor: 1 });
    expect(insertAtTrigger('看', 1)).toEqual({ text: '看 @', cursor: 3 });
    expect(insertAtTrigger('看 ', 2)).toEqual({ text: '看 @', cursor: 3 });
  });
});

describe('incompleteMentionHint', () => {
  it('blocks send while an @ query is still open', () => {
    expect(incompleteMentionHint('@诺', 2, 1)).toBe(INCOMPLETE_MENTION_HINT);
    expect(incompleteMentionHint('@xyz', 4, 0)).toBe(NO_MATCH_MENTION_HINT);
    expect(incompleteMentionHint('@诺诺 你好', 6, 0)).toBeNull();
  });
});
