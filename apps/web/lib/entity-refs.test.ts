/// <reference types="vitest/globals" />
import { namedRefLabel, parseRefKey, refKey, relationshipRefOptions } from './entity-refs';
import type { WorldResourcesDTO } from './types';

function resources(): WorldResourcesDTO {
  return {
    project: { id: 'p1', name: '测试', worldview: { rules: [] } },
    stage: 'growing',
    entities: {
      stories: [{ id: 'st1', project_id: 'p1', title: '第一卷', order: 1 }],
      characters: [
        {
          id: 'c1',
          project_id: 'p1',
          name: '韩立',
          description: '',
        },
      ],
      locations: [
        {
          id: 'l1',
          project_id: 'p1',
          name: '七玄门',
          description: '',
        },
      ],
      scenes: [],
      world_events: [],
      relationships: [],
    },
  };
}

describe('relationshipRefOptions', () => {
  it('labels character and location assets distinctly', () => {
    const options = relationshipRefOptions(resources());
    expect(options.map((item) => item.label)).toEqual([
      '角色 · 韩立',
      '地点 · 七玄门',
      '故事 · 第一卷',
    ]);
    expect(parseRefKey(refKey(options[0]!), options)?.id).toBe('c1');
    expect(namedRefLabel(resources(), 'asset', 'c1')).toBe('角色 · 韩立');
  });
});
