/**
 * Track H H1 — canonical Entity history contracts.
 * Naming red lines (ADR-0007): ChangeEvent ≠ Presentation Timeline;
 * Track = semantic Timeline lane; CreativeBranch ≠ Track (deferred).
 */

export const HISTORY_ENTITY_TYPES = [
  'shot',
  'prompt_version',
  'output',
  'appearance_variant',
  'visual_requirement',
  'world_event',
] as const;

export type HistoryEntityType = (typeof HISTORY_ENTITY_TYPES)[number];

export interface EntityRef {
  project_id: string;
  entity_type: HistoryEntityType | string;
  entity_id: string;
}

export const ENTITY_CHANGE_KINDS = [
  'baseline',
  'create',
  'update',
  'transition',
  'delete',
  'restore',
  'merge',
] as const;

export type EntityChangeKind = (typeof ENTITY_CHANGE_KINDS)[number];

/** Presentation Time — Timeline primary axis (H4+). Not used for ChangeEvent ordering. */
export interface PresentationTime {
  story_id: string;
  order: number;
  start_ms?: number | null;
  duration_ms?: number | null;
}

/** World Time binding envelope — opaque Project-defined values (H6+). */
export interface WorldTimeBinding {
  dimension_id: string;
  mode: 'follow' | 'exact' | 'range' | 'relative' | 'parallel' | 'unknown';
  relation?: string;
  value?: unknown;
  start?: unknown;
  end?: unknown;
  schema?: unknown;
}

export interface EntityCommand<TPayload = unknown> {
  project_id: string;
  entity: EntityRef;
  /** 0 for create / first revision. */
  expected_revision: number;
  idempotency_key: string;
  correlation_id?: string;
  payload: TPayload;
}

export interface CanonicalSnapshotEnvelope<TSnapshot = Record<string, unknown>> {
  entity_type: HistoryEntityType;
  schema_version: number;
  snapshot: TSnapshot;
  snapshot_hash: string;
}
