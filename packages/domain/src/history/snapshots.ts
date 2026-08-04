import { snapshotHash } from './canonical-json.js';
import type { CanonicalSnapshotEnvelope, HistoryEntityType } from './types.js';

export const SNAPSHOT_SCHEMA_VERSION = 1;

type Row = Record<string, unknown>;

function pick(row: Row, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  return String(value);
}

function asIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  return null;
}

function asJson(value: unknown): unknown {
  if (value === undefined) return null;
  return value;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function envelope<T extends Row>(
  entityType: HistoryEntityType,
  snapshot: T,
): CanonicalSnapshotEnvelope<T> {
  return {
    entity_type: entityType,
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    snapshot,
    snapshot_hash: snapshotHash(snapshot),
  };
}

export function serializeShotSnapshot(row: Row): CanonicalSnapshotEnvelope {
  return envelope('shot', {
    id: asString(pick(row, 'id')),
    scene_id: asString(pick(row, 'scene_id', 'sceneId')),
    project_id: asString(pick(row, 'project_id', 'projectId')),
    order: asNumber(pick(row, 'order')),
    label: asString(pick(row, 'label')),
    state: asString(pick(row, 'state')),
    narrative_mode: asString(pick(row, 'narrative_mode', 'narrativeMode')),
    location_area: asString(pick(row, 'location_area', 'locationArea')),
    camera: asJson(pick(row, 'camera')),
    composition: asJson(pick(row, 'composition')),
    lighting: asJson(pick(row, 'lighting')),
    color: asJson(pick(row, 'color')),
    mood: asString(pick(row, 'mood')),
    style: asJson(pick(row, 'style')),
    characters: asJson(pick(row, 'characters')),
    dialogue: asJson(pick(row, 'dialogue')),
    action: asJson(pick(row, 'action')),
    audio: asJson(pick(row, 'audio')),
    prompt: asJson(pick(row, 'prompt')),
    approved_snapshot: asJson(pick(row, 'approved_snapshot', 'approvedSnapshot')),
    created_at: asIso(pick(row, 'created_at', 'createdAt')),
    updated_at: asIso(pick(row, 'updated_at', 'updatedAt')),
    deleted_at: asIso(pick(row, 'deleted_at', 'deletedAt')),
  });
}

export function serializePromptVersionSnapshot(row: Row): CanonicalSnapshotEnvelope {
  return envelope('prompt_version', {
    id: asString(pick(row, 'id')),
    shot_id: asString(pick(row, 'shot_id', 'shotId')),
    positive: asString(pick(row, 'positive')),
    negative: asString(pick(row, 'negative')),
    source: asString(pick(row, 'source')),
    approved_at: asIso(pick(row, 'approved_at', 'approvedAt')),
    created_at: asIso(pick(row, 'created_at', 'createdAt')),
  });
}

export function serializeOutputSnapshot(row: Row): CanonicalSnapshotEnvelope {
  return envelope('output', {
    id: asString(pick(row, 'id')),
    shot_id: asString(pick(row, 'shot_id', 'shotId')),
    status: asString(pick(row, 'status')),
    video_url: asString(pick(row, 'video_url', 'videoUrl')),
    thumbnail_url: asString(pick(row, 'thumbnail_url', 'thumbnailUrl')),
    provider: asString(pick(row, 'provider')),
    provider_job_id: asString(pick(row, 'provider_job_id', 'providerJobId')),
    idempotency_key: asString(pick(row, 'idempotency_key', 'idempotencyKey')),
    model: asString(pick(row, 'model')),
    model_version: asString(pick(row, 'model_version', 'modelVersion')),
    parameters: asJson(pick(row, 'parameters')),
    duration_seconds: asNumber(pick(row, 'duration_seconds', 'durationSeconds')),
    resolution: asString(pick(row, 'resolution')),
    file_size_bytes: asString(pick(row, 'file_size_bytes', 'fileSizeBytes')),
    is_active: asBoolean(pick(row, 'is_active', 'isActive')),
    prompt_snapshot: asJson(pick(row, 'prompt_snapshot', 'promptSnapshot')),
    context_snapshot: asJson(pick(row, 'context_snapshot', 'contextSnapshot')),
    visual_media_ids: asStringArray(pick(row, 'visual_media_ids', 'visualMediaIds')),
    error_code: asString(pick(row, 'error_code', 'errorCode')),
    generated_at: asIso(pick(row, 'generated_at', 'generatedAt')),
    created_at: asIso(pick(row, 'created_at', 'createdAt')),
    updated_at: asIso(pick(row, 'updated_at', 'updatedAt')),
  });
}

export function serializeAppearanceVariantSnapshot(row: Row): CanonicalSnapshotEnvelope {
  return envelope('appearance_variant', {
    id: asString(pick(row, 'id')),
    asset_id: asString(pick(row, 'asset_id', 'assetId')),
    key: asString(pick(row, 'key')),
    title: asString(pick(row, 'title')),
    change_reason: asString(pick(row, 'change_reason', 'changeReason')),
    description: asString(pick(row, 'description')),
    anchor_media_id: asString(pick(row, 'anchor_media_id', 'anchorMediaId')),
    candidate_media_ids: asStringArray(pick(row, 'candidate_media_ids', 'candidateMediaIds')),
    state: asString(pick(row, 'state')),
    order: asNumber(pick(row, 'order')),
    created_at: asIso(pick(row, 'created_at', 'createdAt')),
    updated_at: asIso(pick(row, 'updated_at', 'updatedAt')),
    deleted_at: asIso(pick(row, 'deleted_at', 'deletedAt')),
  });
}

export function serializeVisualRequirementSnapshot(row: Row): CanonicalSnapshotEnvelope {
  return envelope('visual_requirement', {
    id: asString(pick(row, 'id')),
    scene_id: asString(pick(row, 'scene_id', 'sceneId')),
    asset_type: asString(pick(row, 'asset_type', 'assetType')),
    asset_id: asString(pick(row, 'asset_id', 'assetId')),
    variant_key: asString(pick(row, 'variant_key', 'variantKey')),
    required: asBoolean(pick(row, 'required')),
    reason: asString(pick(row, 'reason')),
    status: asString(pick(row, 'status')),
    candidate_media_ids: asStringArray(pick(row, 'candidate_media_ids', 'candidateMediaIds')),
    approved_media_id: asString(pick(row, 'approved_media_id', 'approvedMediaId')),
    generation_job_id: asString(pick(row, 'generation_job_id', 'generationJobId')),
    version: asNumber(pick(row, 'version')),
    created_at: asIso(pick(row, 'created_at', 'createdAt')),
    updated_at: asIso(pick(row, 'updated_at', 'updatedAt')),
    deleted_at: asIso(pick(row, 'deleted_at', 'deletedAt')),
  });
}

export function serializeWorldEventSnapshot(row: Row): CanonicalSnapshotEnvelope {
  return envelope('world_event', {
    id: asString(pick(row, 'id')),
    project_id: asString(pick(row, 'project_id', 'projectId')),
    anchor_story_id: asString(pick(row, 'anchor_story_id', 'anchorStoryId')),
    title: asString(pick(row, 'title')),
    description: asString(pick(row, 'description')),
    world_time_envelope: asJson(pick(row, 'world_time_envelope', 'worldTimeEnvelope')),
    presentation_order: asNumber(pick(row, 'presentation_order', 'presentationOrder')),
    state: asString(pick(row, 'state')),
    character_ids: asStringArray(pick(row, 'character_ids', 'characterIds')),
    scene_ids: asStringArray(pick(row, 'scene_ids', 'sceneIds')),
    created_at: asIso(pick(row, 'created_at', 'createdAt')),
    updated_at: asIso(pick(row, 'updated_at', 'updatedAt')),
    deleted_at: asIso(pick(row, 'deleted_at', 'deletedAt')),
  });
}

export function serializeHistorySnapshot(
  entityType: HistoryEntityType,
  row: Row,
): CanonicalSnapshotEnvelope {
  switch (entityType) {
    case 'shot':
      return serializeShotSnapshot(row);
    case 'prompt_version':
      return serializePromptVersionSnapshot(row);
    case 'output':
      return serializeOutputSnapshot(row);
    case 'appearance_variant':
      return serializeAppearanceVariantSnapshot(row);
    case 'visual_requirement':
      return serializeVisualRequirementSnapshot(row);
    case 'world_event':
      return serializeWorldEventSnapshot(row);
    default: {
      const _exhaustive: never = entityType;
      throw new Error(`Unsupported history entity type: ${_exhaustive}`);
    }
  }
}
