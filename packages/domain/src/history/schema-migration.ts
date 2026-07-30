/**
 * Snapshot / ChangeEvent schema evolution policy (Track H H1).
 *
 * - Field meanings for a given schema_version are immutable.
 * - Additive optional fields may land in a minor bump only when readers tolerate absence;
 *   H1 freezes schema_version = 1 with no silent field reuse.
 * - Breaking changes require a new schema_version (snapshots) or a new ChangeEvent type /
 *   schema_version (events). Readers must branch on version.
 * - Never rewrite stored EntityRevision.snapshot or ChangeEvent.payload in place.
 */

import { CHANGE_EVENT_SCHEMA_VERSION } from './change-events.js';
import { SNAPSHOT_SCHEMA_VERSION } from './snapshots.js';

export interface SchemaMigrationPolicy {
  snapshot_schema_version: number;
  change_event_schema_version: number;
  rules: readonly string[];
}

export const HISTORY_SCHEMA_MIGRATION_POLICY: SchemaMigrationPolicy = {
  snapshot_schema_version: SNAPSHOT_SCHEMA_VERSION,
  change_event_schema_version: CHANGE_EVENT_SCHEMA_VERSION,
  rules: [
    'Do not change semantics of existing fields within a schema_version.',
    'Breaking snapshot changes increment schema_version and keep dual readers until backfill completes.',
    'Breaking ChangeEvent changes publish a new event_type or increment event schema_version.',
    'Append-only: never UPDATE/DELETE entity_revisions or change_events rows.',
    'approved_snapshot / prompt_snapshot / context_snapshot remain domain freeze records; history revisions do not rewrite them.',
  ],
};
