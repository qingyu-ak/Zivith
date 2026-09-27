import { describe, expect, it } from 'vitest';
import { entityRevisionDto } from '../src/contexts/history/entity-revisions.js';
import { listEntityRevisions } from '../src/contexts/history/entity-revisions.js';
import { ApiError } from '../src/errors.js';

describe('entityRevisionDto', () => {
  it('lifts stage binding out of the snapshot', () => {
    const dto = entityRevisionDto({
      id: 'rev-1',
      revision: 2,
      changeKind: 'update',
      createdAt: new Date('2026-09-15T00:00:00.000Z'),
      snapshot: {
        name: '林夜',
        stage_label: '觉醒',
        as_of_world_event_id: 'evt-1',
        as_of_presentation_order: 12,
      },
    });
    expect(dto.stage_label).toBe('觉醒');
    expect(dto.as_of_world_event_id).toBe('evt-1');
    expect(dto.as_of_presentation_order).toBe(12);
    expect(dto.snapshot.name).toBe('林夜');
  });
});

describe('listEntityRevisions', () => {
  it('rejects entity types outside the history contract', async () => {
    const db = {} as never;
    await expect(listEntityRevisions(db, 'project-1', 'skill', 'e1')).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
