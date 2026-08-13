/// <reference types="vitest/globals" />
import type { WorldResourcesDTO } from './types';
import { buildProductionLineModel, buildWorldLineModel } from './world-line';

function resources(overrides?: Partial<WorldResourcesDTO['entities']>): WorldResourcesDTO {
  return {
    project: { id: 'p1', name: '测试世界', worldview: { rules: [] } },
    stage: 'growing',
    entities: {
      stories: [
        {
          id: 'st1',
          project_id: 'p1',
          title: '第一卷',
          order: 1,
        },
      ],
      characters: [],
      locations: [],
      scenes: [
        {
          id: 'sc1',
          story_id: 'st1',
          order: 1,
          title: '开场',
          summary: '山门',
        },
        {
          id: 'sc2',
          story_id: 'st1',
          order: 2,
          title: '夜谈',
        },
      ],
      world_events: [],
      relationships: [],
      shots: [
        { id: 'sh1', scene_id: 'sc1', project_id: 'p1', order: 1, label: '远景', state: 'draft' },
        { id: 'sh2', scene_id: 'sc1', project_id: 'p1', order: 2, label: '近景', state: 'draft' },
        { id: 'sh3', scene_id: 'sc2', project_id: 'p1', order: 1, label: '对白', state: 'review' },
      ],
      ...overrides,
    },
  };
}

describe('buildProductionLineModel shot track', () => {
  it('adds a shot track nested under each scene on the presentation scale', () => {
    const model = buildProductionLineModel(resources());
    expect(model.tracks.map((track) => track.kind)).toEqual(['story', 'scene', 'shot']);
    expect(model.relationships).toEqual([]);

    const shotTrack = model.tracks.find((track) => track.kind === 'shot');
    expect(shotTrack?.items.map((item) => item.id)).toEqual(['sh1', 'sh2', 'sh3']);

    const sceneTrack = model.tracks.find((track) => track.kind === 'scene');
    const scene1 = sceneTrack?.items.find((item) => item.id === 'sc1');
    const scene2 = sceneTrack?.items.find((item) => item.id === 'sc2');
    const [far, close, dialogue] = shotTrack?.items ?? [];

    expect(scene1?.anchorOrder).toBe(1);
    expect(scene2?.anchorOrder).toBe(2);
    expect(far?.anchorOrder).toBeCloseTo(1 + 1 / 3, 10);
    expect(close?.anchorOrder).toBeCloseTo(1 + 2 / 3, 10);
    expect(dialogue?.anchorOrder).toBeCloseTo(2 + 1 / 2, 10);
    expect(far?.anchorOrder ?? 0).toBeGreaterThan(scene1?.anchorOrder ?? 0);
    expect(far?.anchorOrder ?? 0).toBeLessThan(scene2?.anchorOrder ?? 0);
    expect(model.scaleDomain.min).toBe(1);
    expect(model.scaleDomain.max).toBeGreaterThan(2);
  });

  it('keeps two tracks and no shot items when the project has no shots', () => {
    const model = buildProductionLineModel(resources({ shots: [] }));
    const shotTrack = model.tracks.find((track) => track.kind === 'shot');
    expect(shotTrack?.items).toEqual([]);
    expect(model.tracks).toHaveLength(3);
  });
});

describe('buildWorldLineModel character track', () => {
  it('keeps one character track and lists each character as an item', () => {
    const model = buildWorldLineModel(
      resources({
        characters: [
          { id: 'c1', project_id: 'p1', name: '安娜苏', description: '主角', created_at: '2026-01-01' },
          { id: 'c2', project_id: 'p1', name: '安利', description: '配角', created_at: '2026-01-02' },
          {
            id: 'c3',
            project_id: 'p1',
            name: '安娜苏的父亲',
            description: '长辈',
            created_at: '2026-01-03',
          },
        ],
        scenes: [],
        shots: [],
        stories: [],
      }),
    );

    expect(model.tracks.map((track) => track.kind)).toEqual(['character', 'scene', 'world_event']);
    const characterTrack = model.tracks.find((track) => track.kind === 'character');
    expect(characterTrack?.id).toBe('character');
    expect(characterTrack?.title).toBe('角色');
    expect(characterTrack?.items.map((item) => item.id)).toEqual(['c1', 'c2', 'c3']);
    expect(characterTrack?.items.map((item) => item.title)).toEqual([
      '安娜苏',
      '安利',
      '安娜苏的父亲',
    ]);
  });

  it('keeps a single empty character track when the world has no characters', () => {
    const model = buildWorldLineModel(resources({ characters: [], scenes: [], shots: [], stories: [] }));
    const characterTracks = model.tracks.filter((track) => track.kind === 'character');
    expect(characterTracks).toHaveLength(1);
    expect(characterTracks[0]?.title).toBe('角色');
    expect(characterTracks[0]?.items).toEqual([]);
  });
});
