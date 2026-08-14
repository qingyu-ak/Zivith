/// <reference types="vitest/globals" />
import type { WorldConflictDTO } from './types';
import {
  conflictsForSelection,
  firstConflictSelection,
  selectionFromConflictRef,
} from './world-conflicts';

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
    expect(
      firstConflictSelection({
        id: 'y',
        kind: 'duplicate_name',
        summary: '同名',
        entity_refs: undefined,
      } as unknown as WorldConflictDTO),
    ).toBeNull();
  });

  it('lists conflicts that point at the selected entity', () => {
    expect(
      conflictsForSelection(
        [
          {
            id: 'a',
            kind: 'internal_fact_clash',
            summary: '生死',
            entity_refs: [{ type: 'character', id: 'c1' }],
            evidence: ['身亡', '活着'],
          },
          {
            id: 'b',
            kind: 'internal_fact_clash',
            summary: '别的角色',
            entity_refs: [{ type: 'character', id: 'c2' }],
          },
        ],
        { kind: 'character', id: 'c1' },
      ).map((item) => item.id),
    ).toEqual(['a']);
  });
});
