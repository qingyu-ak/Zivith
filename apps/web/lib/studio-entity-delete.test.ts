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
      locations: [],
      scenes: [],
      world_events: [],
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
});
