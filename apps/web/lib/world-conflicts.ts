import type { WorldConflictDTO, WorldSelection } from './types';

const SELECTABLE = new Set([
  'character',
  'location',
  'scene',
  'world_event',
  'story',
  'project',
  'relationship',
]);

export function selectionFromConflictRef(ref: {
  type: string;
  id: string;
}): WorldSelection {
  if (!SELECTABLE.has(ref.type)) return null;
  return { kind: ref.type as NonNullable<WorldSelection>['kind'], id: ref.id };
}

export function firstConflictSelection(conflict: WorldConflictDTO): WorldSelection {
  const ref = conflict.entity_refs[0];
  return ref ? selectionFromConflictRef(ref) : null;
}
