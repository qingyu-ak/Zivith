/// <reference types="vitest/globals" />
import type { WorldResourcesDTO } from './types';
import {
  buildProductionLineModel,
  buildWorldLineModel,
  worldTimeCaption,
  worldTimeOrder,
} from './world-line';

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
          {
            id: 'c1',
            project_id: 'p1',
            name: '安娜苏',
            description: '主角',
            created_at: '2026-01-01',
          },
          {
            id: 'c2',
            project_id: 'p1',
            name: '安利',
            description: '配角',
            created_at: '2026-01-02',
          },
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

    expect(model.tracks.map((track) => track.kind)).toEqual([
      'character',
      'location',
      'scene',
      'world_event',
    ]);
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
    const model = buildWorldLineModel(
      resources({ characters: [], scenes: [], shots: [], stories: [] }),
    );
    const characterTracks = model.tracks.filter((track) => track.kind === 'character');
    expect(characterTracks).toHaveLength(1);
    expect(characterTracks[0]?.title).toBe('角色');
    expect(characterTracks[0]?.items).toEqual([]);
  });
});

describe('worldTimeCaption / worldTimeOrder', () => {
  it('reads opaque label without converting time', () => {
    expect(worldTimeCaption({ label: '第一纪元 · 秋', order: 12 })).toBe('第一纪元 · 秋');
    expect(worldTimeCaption({ value: 'raw-string' })).toBe('raw-string');
    expect(worldTimeCaption({})).toBeNull();
    expect(worldTimeOrder({ order: 12 })).toBe(12);
    expect(worldTimeOrder({ order: 1.5 })).toBeNull();
  });
});

describe('buildWorldLineModel location track and anchoring', () => {
  it('puts locations on their own track so relationships can connect', () => {
    const model = buildWorldLineModel(
      resources({
        characters: [
          {
            id: 'c1',
            project_id: 'p1',
            name: '韩立',
            description: '主角',
            created_at: '2026-01-01',
          },
        ],
        locations: [
          {
            id: 'loc1',
            project_id: 'p1',
            name: '天南大陆',
            description: '修真界',
            created_at: '2026-01-01',
          },
        ],
        scenes: [
          {
            id: 'sc1',
            story_id: 'st1',
            order: 2,
            title: '山门',
            location_id: 'loc1',
          },
        ],
        relationships: [
          {
            id: 'r1',
            project_id: 'p1',
            kind: 'resides',
            source_type: 'character',
            source_id: 'c1',
            target_type: 'location',
            target_id: 'loc1',
            label: '栖居',
            state: 'draft',
            created_at: '2026-01-01',
          },
        ],
        world_events: [],
        shots: [],
      }),
    );

    const locationTrack = model.tracks.find((track) => track.kind === 'location');
    expect(locationTrack?.items.map((item) => item.id)).toEqual(['loc1']);
    expect(locationTrack?.items[0]?.anchorOrder).toBe(2);
    expect(locationTrack?.items[0]?.extra?.anchor_scene_id).toBe('sc1');
    expect(model.relationships[0]?.sourceItemId).toBe('c1');
    expect(model.relationships[0]?.targetItemId).toBe('loc1');
  });

  it('anchors characters to the earliest event that lists them', () => {
    const model = buildWorldLineModel(
      resources({
        characters: [
          {
            id: 'c1',
            project_id: 'p1',
            name: '韩立',
            description: '主角',
            created_at: '2026-01-01',
          },
          {
            id: 'c2',
            project_id: 'p1',
            name: '南宫婉',
            description: '配角',
            created_at: '2026-01-02',
          },
        ],
        scenes: [{ id: 'sc1', story_id: 'st1', order: 1, title: '开场' }],
        world_events: [
          {
            id: 'e1',
            project_id: 'p1',
            title: '入门',
            state: 'draft',
            presentation_order: 3,
            character_ids: ['c1'],
            created_at: '2026-01-01',
          },
          {
            id: 'e2',
            project_id: 'p1',
            title: '夜谈',
            state: 'draft',
            presentation_order: 5,
            character_ids: ['c1', 'c2'],
            created_at: '2026-01-02',
          },
        ],
        shots: [],
      }),
    );

    const characterTrack = model.tracks.find((track) => track.kind === 'character');
    const han = characterTrack?.items.find((item) => item.id === 'c1');
    const nan = characterTrack?.items.find((item) => item.id === 'c2');
    expect(han?.anchorOrder).toBe(3);
    expect(han?.extra?.anchor_event_id).toBe('e1');
    expect(nan?.anchorOrder).toBe(5);
    expect(nan?.extra?.anchor_event_id).toBe('e2');
  });

  it('uses event titles as axis marks and flags world-time divergence', () => {
    const model = buildWorldLineModel(
      resources({
        scenes: [],
        shots: [],
        world_events: [
          {
            id: 'e1',
            project_id: 'p1',
            title: '开宗',
            state: 'draft',
            presentation_order: 1,
            world_time_envelope: { label: '第一纪元 · 春', order: 1 },
            created_at: '2026-01-01',
          },
          {
            id: 'e2',
            project_id: 'p1',
            title: '叛逃',
            state: 'draft',
            presentation_order: 2,
            world_time_envelope: { label: '第三纪元 · 冬', order: 90 },
            created_at: '2026-01-02',
          },
        ],
      }),
    );

    expect(model.axisMarks.map((mark) => mark.label)).toEqual(['开宗', '叛逃']);
    expect(model.axisMarks[0]?.worldTimeDiverges).toBe(false);
    expect(model.axisMarks[1]?.worldTimeDiverges).toBe(true);
    expect(model.axisMarks[1]?.worldTimeLabel).toBe('第三纪元 · 冬');
    const eventTrack = model.tracks.find((track) => track.kind === 'world_event');
    expect(eventTrack?.items[1]?.extra?.world_time_diverges).toBe(true);
  });

  it('falls back to scene titles on the axis when there are no events', () => {
    const model = buildWorldLineModel(resources({ world_events: [], shots: [] }));
    expect(model.axisMarks.map((mark) => mark.label)).toEqual(['开场', '夜谈']);
    expect(model.axisMarks.map((mark) => mark.order)).toEqual([1, 2]);
  });
});
