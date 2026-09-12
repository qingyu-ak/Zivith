/// <reference types="vitest/globals" />
import type { WorldResourcesDTO } from './types';
import {
  buildProductionLineModel,
  buildWorldLineModel,
  worldTimeCaption,
  worldTimeMode,
  worldTimeOrder,
  worldTimeRelation,
  resolveDisplayDimensions,
  worldTimeDimensionId,
  countEventsBoundToDimension,
  overlayFocusOfItem,
  isTimelineItemActive,
  clipSpan,
  canEditClip,
  applyWorldLineView,
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
    expect(model.tracks.map((track) => track.kind)).toEqual([
      'story',
      'scene',
      'shot',
      'camera',
      'style',
      'prompt',
      'model',
    ]);
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

  it('keeps derived tracks empty when the project has no shots', () => {
    const model = buildProductionLineModel(resources({ shots: [] }));
    expect(model.tracks.find((track) => track.kind === 'shot')?.items).toEqual([]);
    expect(model.tracks.find((track) => track.kind === 'camera')?.items).toEqual([]);
    expect(model.tracks.find((track) => track.kind === 'style')?.items).toEqual([]);
    expect(model.tracks.find((track) => track.kind === 'prompt')?.items).toEqual([]);
    expect(model.tracks.find((track) => track.kind === 'model')?.items).toEqual([]);
    expect(model.tracks).toHaveLength(7);
  });

  it('projects camera / prompt / model from shot state without new item ids as source', () => {
    const model = buildProductionLineModel(
      resources({
        shots: [
          {
            id: 'sh1',
            scene_id: 'sc1',
            project_id: 'p1',
            order: 1,
            label: '远景',
            state: 'draft',
            camera: { shot_type: 'wide', movement: 'static' },
            lighting: { type: 'rim', direction: 'left' },
            mood: 'cold',
            prompt: { positive: 'a misty courtyard at dawn' },
            approved_prompt: {
              id: 'pv1',
              positive: 'approved courtyard mist',
              approved_at: '2026-08-01',
            },
            output: {
              provider: 'siliconflow',
              model: 'Wan-2.2',
              status: 'completed',
              is_active: true,
            },
          },
        ],
      }),
    );
    const camera = model.tracks.find((track) => track.kind === 'camera')?.items[0];
    const style = model.tracks.find((track) => track.kind === 'style')?.items[0];
    const prompt = model.tracks.find((track) => track.kind === 'prompt')?.items[0];
    const derivedModel = model.tracks.find((track) => track.kind === 'model')?.items[0];
    const shot = model.tracks.find((track) => track.kind === 'shot')?.items[0];
    expect(camera?.title).toBe('wide · static');
    expect(style?.title).toBe('rim · left · cold');
    expect(prompt?.title).toContain('已批准');
    expect(derivedModel?.title).toBe('siliconflow / Wan-2.2');
    expect(camera?.extra?.shot_id).toBe('sh1');
    expect(camera?.anchorOrder).toBe(shot?.anchorOrder);
    expect(isTimelineItemActive(camera!, { kind: 'camera', id: 'sh1' })).toBe(true);
    expect(isTimelineItemActive(shot!, { kind: 'camera', id: 'sh1' })).toBe(true);
    expect(isTimelineItemActive(prompt!, { kind: 'camera', id: 'sh1' })).toBe(false);
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

describe('resolveDisplayDimensions', () => {
  it('falls back to a main worldline when the project has none stored', () => {
    expect(resolveDisplayDimensions({ temporal_dimensions: [] })).toEqual([
      { id: 'main', label: '主世界线', kind: 'worldline' },
    ]);
    expect(
      resolveDisplayDimensions({
        temporal_dimensions: [{ id: 'dream', label: '梦境', kind: 'dream' }],
      }),
    ).toEqual([{ id: 'dream', label: '梦境', kind: 'dream' }]);
  });
});

describe('dimension overlay focus', () => {
  it('counts explicit bindings without interpreting calendar values', () => {
    expect(
      worldTimeDimensionId({ dimension_id: 'calendar-1', mode: 'point', value: '第三纪' }),
    ).toBe('calendar-1');
    expect(
      countEventsBoundToDimension(
        [
          { world_time_envelope: { dimension_id: 'calendar-1', mode: 'point' } },
          { world_time_envelope: { dimension_id: 'dream', mode: 'crossing' } },
          { world_time_envelope: {} },
        ],
        'calendar-1',
      ),
    ).toBe(1);
  });

  it('keeps follow items visible when focusing a non-primary dimension', () => {
    expect(overlayFocusOfItem({ entityType: 'character', extra: {} }, 'calendar-1', false)).toBe(
      'follow',
    );
    expect(
      overlayFocusOfItem(
        {
          entityType: 'world_event',
          extra: { world_time_envelope: { dimension_id: 'calendar-1', mode: 'point' } },
        },
        'calendar-1',
        false,
      ),
    ).toBe('match');
    expect(
      overlayFocusOfItem(
        {
          entityType: 'world_event',
          extra: { world_time_envelope: { dimension_id: 'dream', mode: 'crossing' } },
        },
        'calendar-1',
        false,
      ),
    ).toBe('other');
    expect(
      overlayFocusOfItem(
        {
          entityType: 'world_event',
          extra: { world_time_envelope: { dimension_id: 'calendar-1', mode: 'point' } },
        },
        'main',
        true,
      ),
    ).toBe('none');
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

  it('summarizes H6 range / relative / crossing envelopes without interpreting values', () => {
    expect(worldTimeCaption({ mode: 'range', start: '春', end: '冬' })).toBe('春 – 冬');
    expect(worldTimeCaption({ mode: 'relative', relation: 'before' })).toBe('相对 · 之前');
    expect(worldTimeCaption({ mode: 'parallel', dimension_id: 'dream' })).toBe('平行维度');
    expect(worldTimeRelation({})).toBe('follow');
    expect(worldTimeRelation({ mode: 'crossing', dimension_id: 'dream' })).toBe('crossing');
    expect(worldTimeMode({ mode: 'instant' })).toBe('point');
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
    expect(han?.startOrder).toBeCloseTo(2.88);
    expect(han?.endOrder).toBeCloseTo(5.12);
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
    expect(eventTrack?.items[1]?.extra?.world_time_relation).toBe('explicit');
  });

  it('marks relative and crossing bindings as overlay without rewriting the axis', () => {
    const model = buildWorldLineModel(
      resources({
        scenes: [],
        shots: [],
        world_events: [
          {
            id: 'e1',
            project_id: 'p1',
            title: '成年',
            state: 'draft',
            presentation_order: 2,
            world_time_envelope: { mode: 'point', label: '第三纪元', dimension_id: 'main' },
            created_at: '2026-01-01',
          },
          {
            id: 'e2',
            project_id: 'p1',
            title: '童年闪回',
            state: 'draft',
            presentation_order: 3,
            world_time_envelope: {
              mode: 'relative',
              relation: 'before',
              dimension_id: 'main',
              label: '入门之前',
            },
            created_at: '2026-01-02',
          },
          {
            id: 'e3',
            project_id: 'p1',
            title: '梦境',
            state: 'draft',
            presentation_order: 4,
            world_time_envelope: { mode: 'crossing', dimension_id: 'dream' },
            created_at: '2026-01-03',
          },
        ],
      }),
    );

    expect(model.axisMarks.map((mark) => mark.order)).toEqual([2, 3, 4]);
    expect(model.axisMarks[1]?.worldTimeRelation).toBe('explicit');
    expect(model.axisMarks[1]?.worldTimeLabel).toBe('入门之前');
    expect(model.axisMarks[2]?.worldTimeRelation).toBe('crossing');
    expect(model.axisMarks[2]?.worldTimeLabel).toBe('平行维度');
    const eventTrack = model.tracks.find((track) => track.kind === 'world_event');
    expect(eventTrack?.items[1]?.anchorOrder).toBe(3);
    expect(eventTrack?.items[2]?.extra?.world_time_mode).toBe('crossing');
  });

  it('falls back to scene titles on the axis when there are no events', () => {
    const model = buildWorldLineModel(resources({ world_events: [], shots: [] }));
    expect(model.axisMarks.map((mark) => mark.label)).toEqual(['开场', '夜谈']);
    expect(model.axisMarks.map((mark) => mark.order)).toEqual([1, 2]);
  });

  it('stretches scene clips from this scene order to the next', () => {
    const model = buildWorldLineModel(resources({ world_events: [], shots: [] }));
    const sceneTrack = model.tracks.find((track) => track.kind === 'scene');
    const opening = sceneTrack?.items.find((item) => item.id === 'sc1');
    const night = sceneTrack?.items.find((item) => item.id === 'sc2');
    expect(opening?.startOrder).toBe(1);
    expect(opening?.endOrder).toBeCloseTo(1.94);
    expect(night?.startOrder).toBe(2);
    expect(night?.endOrder).toBeCloseTo(2.9);
  });
});

describe('clipSpan and canEditClip', () => {
  it('falls back to a padded point around the anchor', () => {
    expect(clipSpan({ anchorOrder: 4 })).toEqual({ start: 3.65, end: 4.35 });
  });

  it('uses explicit start and end when present', () => {
    expect(clipSpan({ anchorOrder: 4, startOrder: 3, endOrder: 6 })).toEqual({
      start: 3,
      end: 6,
    });
  });

  it('allows editing events, scenes, characters and locations', () => {
    expect(canEditClip('world_event')).toBe(true);
    expect(canEditClip('scene')).toBe(true);
    expect(canEditClip('character')).toBe(true);
    expect(canEditClip('location')).toBe(true);
    expect(canEditClip('camera')).toBe(false);
  });
});

describe('applyWorldLineView', () => {
  function crowded() {
    return resources({
      characters: [
        {
          id: 'hero',
          project_id: 'p1',
          name: '路明非',
          description: '主角',
          tier: 'full',
          created_at: '2026-01-01',
        },
        {
          id: 'chu',
          project_id: 'p1',
          name: '楚子航',
          description: '主角',
          tier: 'full',
          created_at: '2026-01-02',
        },
        {
          id: 'extra',
          project_id: 'p1',
          name: '路人甲',
          description: '龙族成员',
          tier: 'light',
          created_at: '2026-01-03',
        },
      ],
      scenes: [
        { id: 'sc1', story_id: 'st1', order: 1, title: '开场', location_id: 'loc1' },
        { id: 'sc2', story_id: 'st1', order: 8, title: '夜谈', location_id: 'loc2' },
      ],
      locations: [
        { id: 'loc1', project_id: 'p1', name: '卡塞尔', description: '', created_at: '2026-01-01' },
        { id: 'loc2', project_id: 'p1', name: '楚府', description: '', created_at: '2026-01-02' },
      ],
      world_events: [
        {
          id: 'e1',
          project_id: 'p1',
          title: '入学',
          state: 'draft',
          presentation_order: 1,
          character_ids: ['hero', 'chu'],
          scene_ids: ['sc1'],
          created_at: '2026-01-01',
        },
        {
          id: 'e2',
          project_id: 'p1',
          title: '夜谈',
          state: 'draft',
          presentation_order: 8,
          character_ids: ['hero', 'extra'],
          scene_ids: ['sc2'],
          created_at: '2026-01-02',
        },
      ],
      shots: [],
    });
  }

  it('keeps the full axis in overview', () => {
    const source = crowded();
    const model = buildWorldLineModel(source);
    const viewed = applyWorldLineView(model, source, {
      overview: true,
      from: 1,
      to: 1,
      density: 'all',
    });
    expect(viewed.scaleDomain).toEqual(model.scaleDomain);
    expect(viewed.tracks.find((track) => track.kind === 'world_event')?.items).toHaveLength(2);
  });

  it('narrows to one chapter and drops items outside it', () => {
    const source = crowded();
    const model = buildWorldLineModel(source);
    const viewed = applyWorldLineView(model, source, {
      overview: false,
      from: 1,
      to: 1,
      density: 'all',
    });
    expect(viewed.scaleDomain).toEqual({ min: 1, max: 1 });
    expect(
      viewed.tracks.find((track) => track.kind === 'world_event')?.items.map((item) => item.id),
    ).toEqual(['e1']);
    expect(
      viewed.tracks.find((track) => track.kind === 'scene')?.items.map((item) => item.id),
    ).toEqual(['sc1']);
  });

  it('hides light-tier extras when showing main characters only', () => {
    const source = crowded();
    const model = buildWorldLineModel(source);
    const viewed = applyWorldLineView(model, source, {
      overview: true,
      from: 1,
      to: 8,
      density: 'main',
    });
    expect(
      viewed.tracks.find((track) => track.kind === 'character')?.items.map((item) => item.id),
    ).toEqual(['hero', 'chu']);
  });
});
