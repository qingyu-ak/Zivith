/// <reference types="vitest/globals" />
import { firstConflictSelection, selectionFromConflictRef } from './world-conflicts';

describe('world conflict selection', () => {
  it('maps a known entity ref to a workspace selection', () => {
    expect(selectionFromConflictRef({ type: 'character', id: 'c1' })).toEqual({
      kind: 'character',
      id: 'c1',
    });
    expect(selectionFromConflictRef({ type: 'world_event', id: 'e1' })).toEqual({
      kind: 'world_event',
      id: 'e1',
    });
  });

  it('ignores refs the inspector cannot open', () => {
    expect(selectionFromConflictRef({ type: 'shot', id: 'sh1' })).toBeNull();
    expect(
      firstConflictSelection({
        id: 'x',
        kind: 'duplicate_name',
        summary: '同名',
        entity_refs: [],
      }),
    ).toBeNull();
  });
});
