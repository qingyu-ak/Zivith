/// <reference types="vitest/globals" />
import { describe, expect, it } from 'vitest';
import { studioDeleteTarget } from './studio-entity-delete';
import type { WorldResourcesDTO } from './types';

function resources(): WorldResourcesDTO {
  return {
    project: { id: 'p1', name: '开折', worldview: {} },
    stage: 'bootstrap',
    entities: {
      stories: [],
      characters: [
        {
          id: 'c-lin',
          project_id: 'p1',
          name: '林晚 副本',
          description: '简介',
          tags: [],
        },
        {
          id: 'c-me',
          project_id: 'p1',
          name: '我',
          description: '本地创作者',
          tags: ['user_self'],
        },
      ],
      locations: [
        {
          id: 'loc-1',
          project_id: 'p1',
          name: '天台',
          description: '',
        },
      ],
      scenes: [
        {
          id: 'sc-1',
          story_id: 'st-1',
          order: 1,
          title: '未命名场景',
        },
      ],
      world_events: [
        {
          id: 'ev-1',
          project_id: 'p1',
          title: '屋顶相认',
          state: 'draft',
          created_at: '2026-09-01T00:00:00.000Z',
        },
      ],
      relationships: [],
    },
  } as WorldResourcesDTO;
}

describe('studioDeleteTarget', () => {
  it('lets the user delete a playable character card', () => {
    const target = studioDeleteTarget({ kind: 'character', id: 'c-lin' }, resources());
    expect(target?.path).toBe('/assets/c-lin');
    expect(target?.confirm).toMatch(/林晚 副本/);
    expect(target?.confirm).toMatch(/扮演/);
  });

  it('does not offer delete for the user speaker card', () => {
    expect(studioDeleteTarget({ kind: 'character', id: 'c-me' }, resources())).toBeNull();
  });

  it('does nothing when delete is cancelled (no path until confirm)', () => {
    const target = studioDeleteTarget({ kind: 'character', id: 'c-lin' }, resources());
    expect(target).not.toBeNull();
    expect(target?.path).toBe('/assets/c-lin');
  });

  it('lets the user delete a newly added scene from the inspector', () => {
    const target = studioDeleteTarget({ kind: 'scene', id: 'sc-1' }, resources());
    expect(target?.path).toBe('/scenes/sc-1');
    expect(target?.confirm).toMatch(/未命名场景/);
  });

  it('lets the user delete a location or world event from the inspector', () => {
    expect(studioDeleteTarget({ kind: 'location', id: 'loc-1' }, resources())?.path).toBe(
      '/assets/loc-1',
    );
    expect(studioDeleteTarget({ kind: 'world_event', id: 'ev-1' }, resources())?.path).toBe(
      '/world/world-events/ev-1',
    );
  });
});
