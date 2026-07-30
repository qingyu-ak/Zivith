import { describe, expect, it } from 'vitest';
import {
  CHANGE_EVENT_TYPES,
  FORBIDDEN_HISTORY_TYPE_NAMES,
  HISTORY_ENTITY_TYPES,
  HISTORY_SCHEMA_MIGRATION_POLICY,
  SNAPSHOT_SCHEMA_VERSION,
  canonicalizeJson,
  isChangeEventType,
  serializeAppearanceVariantSnapshot,
  serializeHistorySnapshot,
  serializeOutputSnapshot,
  serializePromptVersionSnapshot,
  serializeShotSnapshot,
  serializeVisualRequirementSnapshot,
  snapshotHash,
} from '../src/index.js';

describe('canonical JSON / snapshot hash', () => {
  it('is stable across key order', () => {
    const a = canonicalizeJson({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalizeJson({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(snapshotHash({ b: 1, a: { d: 2, c: 3 } })).toBe(
      snapshotHash({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  it('ignores updated_at for hashing', () => {
    const base = { id: '1', label: 'x', updated_at: '2026-01-01T00:00:00.000Z' };
    const later = { id: '1', label: 'x', updated_at: '2026-07-29T00:00:00.000Z' };
    expect(snapshotHash(base)).toBe(snapshotHash(later));
  });

  it('changes hash when a business field changes', () => {
    expect(snapshotHash({ id: '1', label: 'a' })).not.toBe(snapshotHash({ id: '1', label: 'b' }));
  });
});

describe('history snapshot serializers', () => {
  const created = new Date('2026-07-20T10:00:00.000Z');
  const updated = new Date('2026-07-21T10:00:00.000Z');

  it('serializes shot from Prisma camelCase with schema_version 1', () => {
    const first = serializeShotSnapshot({
      id: 'shot-1',
      sceneId: 'scene-1',
      projectId: 'project-1',
      order: 2,
      label: '建立',
      state: 'draft',
      narrativeMode: 'present',
      locationArea: null,
      camera: { angle: 'eye_level' },
      composition: null,
      lighting: null,
      color: null,
      mood: 'tense',
      style: null,
      characters: [],
      dialogue: null,
      action: { summary: 'fly' },
      audio: null,
      prompt: { source: 'auto', positive: 'p' },
      approvedSnapshot: null,
      createdAt: created,
      updatedAt: updated,
      deletedAt: null,
    });
    const second = serializeShotSnapshot({
      id: 'shot-1',
      scene_id: 'scene-1',
      project_id: 'project-1',
      order: 2,
      label: '建立',
      state: 'draft',
      narrative_mode: 'present',
      location_area: null,
      camera: { angle: 'eye_level' },
      composition: null,
      lighting: null,
      color: null,
      mood: 'tense',
      style: null,
      characters: [],
      dialogue: null,
      action: { summary: 'fly' },
      audio: null,
      prompt: { source: 'auto', positive: 'p' },
      approved_snapshot: null,
      created_at: created.toISOString(),
      updated_at: '2099-01-01T00:00:00.000Z',
      deleted_at: null,
    });

    expect(first.entity_type).toBe('shot');
    expect(first.schema_version).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(first.snapshot_hash).toBe(second.snapshot_hash);
    expect(first.snapshot.label).toBe('建立');
  });

  it('serializes remaining first-batch entities', () => {
    expect(serializePromptVersionSnapshot({ id: 'pv', shotId: 's', positive: 'x', source: 'auto', createdAt: created }).entity_type).toBe(
      'prompt_version',
    );
    expect(
      serializeOutputSnapshot({
        id: 'o',
        shotId: 's',
        status: 'completed',
        provider: 'siliconflow',
        idempotencyKey: 'k',
        model: 'Wan',
        parameters: {},
        promptSnapshot: {},
        contextSnapshot: {},
        visualMediaIds: ['m1'],
        fileSizeBytes: 123n,
        isActive: true,
        createdAt: created,
        updatedAt: updated,
      }).snapshot.file_size_bytes,
    ).toBe('123');
    expect(
      serializeAppearanceVariantSnapshot({
        id: 'av',
        assetId: 'a',
        key: 'default',
        title: 'Default',
        candidateMediaIds: [],
        state: 'draft',
        order: 0,
        createdAt: created,
        updatedAt: updated,
      }).entity_type,
    ).toBe('appearance_variant');
    expect(
      serializeVisualRequirementSnapshot({
        id: 'vr',
        sceneId: 'sc',
        assetType: 'character',
        assetId: 'a',
        variantKey: 'default',
        required: true,
        reason: 'cast',
        status: 'pending',
        candidateMediaIds: [],
        version: 1,
        createdAt: created,
        updatedAt: updated,
      }).entity_type,
    ).toBe('visual_requirement');
  });

  it('dispatch covers every HISTORY_ENTITY_TYPES entry', () => {
    for (const type of HISTORY_ENTITY_TYPES) {
      const envelope = serializeHistorySnapshot(type, { id: 'x', createdAt: created, updatedAt: updated });
      expect(envelope.entity_type).toBe(type);
      expect(envelope.schema_version).toBe(1);
      expect(envelope.snapshot_hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});

describe('ChangeEvent vocabulary', () => {
  it('includes the v1 set from the architecture document', () => {
    expect(CHANGE_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        'entity.created',
        'entity.changed',
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
      ]),
    );
    expect(isChangeEventType('entity.created')).toBe(true);
    expect(isChangeEventType('TimelineEvent')).toBe(false);
  });

  it('forbids legacy type names as target identifiers', () => {
    expect(FORBIDDEN_HISTORY_TYPE_NAMES).toEqual(['TimelineEvent', 'CreativeTrack']);
  });
});

describe('schema migration policy', () => {
  it('freezes schema_version 1', () => {
    expect(HISTORY_SCHEMA_MIGRATION_POLICY.snapshot_schema_version).toBe(1);
    expect(HISTORY_SCHEMA_MIGRATION_POLICY.change_event_schema_version).toBe(1);
    expect(HISTORY_SCHEMA_MIGRATION_POLICY.rules.length).toBeGreaterThan(0);
  });
});
