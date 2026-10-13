/// <reference types="vitest/globals" />
import {
  characterIdsWithout,
  compactMemoryLine,
  eventsExperiencedBy,
  isSparseImportArchive,
  relationshipsForCharacter,
} from './character-memory-view';
import type { WorldResourcesDTO } from './types';

function resources(): WorldResourcesDTO {
  return {
    project: { id: 'p1', name: '龙族', worldview: { rules: [] } },
    stage: 'growing',
    entities: {
      stories: [],
      characters: [
        { id: 'c1', project_id: 'p1', name: '酒德麻衣', description: '' },
        { id: 'c2', project_id: 'p1', name: '路明非', description: '' },
      ],
      locations: [],
      scenes: [],
      world_events: [
        {
          id: 'e1',
          project_id: 'p1',
          title: '卡塞尔毕业',
          description: '她来送路明非',
          state: 'draft',
          created_at: '2026-01-01',
          presentation_order: 2,
          character_ids: ['c1', 'c2'],
        },
        {
          id: 'e0',
          project_id: 'p1',
          title: '路明非入学',
          state: 'draft',
          created_at: '2026-01-01',
          presentation_order: 1,
          character_ids: ['c2'],
        },
      ],
      relationships: [
        {
          id: 'r1',
          project_id: 'p1',
          kind: 'mentor',
          source_type: 'character',
          source_id: 'c1',
          target_type: 'character',
          target_id: 'c2',
          label: '师徒',
          state: 'draft',
          created_at: '2026-01-01',
        },
      ],
      shots: [],
    },
  };
}

describe('isSparseImportArchive', () => {
  it('treats import stats as not real plot memory', () => {
    expect(isSparseImportArchive('姓名：酒德麻衣\n出场：34 章，提及 294 次')).toBe(true);
    expect(isSparseImportArchive('姓名：酒德麻衣\n背景1：混血种专员')).toBe(false);
  });
});

describe('character memory inventory', () => {
  it('reads camelCase characterIds from the resources API', () => {
    const world = resources();
    world.entities.world_events.push({
      id: 'e-camel',
      project_id: 'p1',
      title: '专员到访',
      state: 'draft',
      created_at: '2026-01-01',
      presentationOrder: 3,
      characterIds: ['c1'],
    } as never);
    expect(eventsExperiencedBy(world, 'c1').map((item) => item.title)).toEqual([
      '卡塞尔毕业',
      '专员到访',
    ]);
  });

  it('hides later plot when playing at an earlier world time', () => {
    expect(eventsExperiencedBy(resources(), 'c2', 1).map((item) => item.title)).toEqual([
      '路明非入学',
    ]);
    expect(eventsExperiencedBy(resources(), 'c2').map((item) => item.title)).toEqual([
      '路明非入学',
      '卡塞尔毕业',
    ]);
  });

  it('drops a character from an event without touching others', () => {
    const [event] = resources().entities.world_events;
    expect(characterIdsWithout(event!, 'c1')).toEqual(['c2']);
  });

  it('lists relationships in readable form', () => {
    expect(relationshipsForCharacter(resources(), 'c1')).toEqual([
      {
        id: 'r1',
        otherName: '路明非',
        kind: 'mentor',
        name: '师徒',
        description: '',
        label: '与「路明非」：师徒',
      },
    ]);
  });
});

describe('compactMemoryLine', () => {
  it('keeps short important chat and truncates a verbatim dump', () => {
    expect(compactMemoryLine('林夕怕黑')).toBe('林夕怕黑');
    const dumped =
      '我怕黑，晚上一个人走那条巷子的时候一定要有人陪着，还要记得带灯，否则我会停下来不敢往前。'.repeat(
        2,
      );
    const compact = compactMemoryLine(dumped, 40);
    expect(compact.length).toBeLessThan(dumped.length);
    expect(compact.endsWith('…')).toBe(true);
  });
});
