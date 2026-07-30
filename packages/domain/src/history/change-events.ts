/**
 * ChangeEvent vocabulary v1 — system-committed facts (audit / SSE / causation).
 * Not TimelineItems. Not Presentation Time. See entity-state-timeline-track.md §8.
 */

export const CHANGE_EVENT_TYPES = [
  'entity.created',
  'entity.changed',
  'entity.deleted',
  'entity.restored',
  'state.transitioned',
  'review.decided',
  'generation.requested',
  'generation.completed',
  'generation.failed',
  'dependency.staled',
  'timeline.item_placed',
  'timeline.item_moved',
  'timeline.item_removed',
  'timeline.track_configured',
  'branch.created',
  'branch.merged',
  'branch.abandoned',
] as const;

export type ChangeEventType = (typeof CHANGE_EVENT_TYPES)[number];

export const CHANGE_EVENT_SCHEMA_VERSION = 1;

export interface ChangeEventRef {
  project_id: string;
  sequence: number;
  event_type: ChangeEventType;
  schema_version: number;
  entity_type?: string;
  entity_id?: string;
  entity_revision_id?: string;
  actor_type?: 'user' | 'system' | 'agent';
  actor_id?: string | null;
  source_type?: string;
  source_id?: string;
  correlation_id?: string;
  causation_id?: string;
  idempotency_key?: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

export function isChangeEventType(value: string): value is ChangeEventType {
  return (CHANGE_EVENT_TYPES as readonly string[]).includes(value);
}

/** Forbidden legacy names — must not reappear as target model identifiers. */
export const FORBIDDEN_HISTORY_TYPE_NAMES = ['TimelineEvent', 'CreativeTrack'] as const;
