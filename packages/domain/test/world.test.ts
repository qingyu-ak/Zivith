import { describe, expect, it } from 'vitest';
import {
  HISTORY_ENTITY_TYPES,
  creatorChatMessageSchema,
  creatorChatThreadSchema,
  entityRefSchema,
  proposalSchema,
  proposalStateSchema,
  projectTimelineSchema,
  relationshipCreateSchema,
  relationshipSchema,
  serializeHistorySnapshot,
  serializeRelationshipSnapshot,
  serializeWorldEventSnapshot,
  timelineItemCreateSchema,
  timelineTrackCreateSchema,
  canonicalizeWorldTimeMode,
  compactWorldTimeBinding,
  compactWorldTimeBindings,
  isFollowWorldTime,
  bindingWorldRelation,
  bindingsWorldRelation,
  resolveTemporalDimensions,
  temporalDimensionsSchema,
  unknownDimensionIds,
  worldEventCreateSchema,
  worldEventPatchSchema,
  worldEventSchema,
  worldTimeEnvelopeSchema,
  worldviewSchema,
  parseWorldview,
  mergeWorldview,
} from '../src/index.js';

describe('worldEvent schema', () => {
  it('parses minimal create payload and applies defaults', () => {
    const parsed = worldEventCreateSchema.parse({ title: ' 决战前夜 ' });
    expect(parsed.title).toBe('决战前夜');
    expect(parsed.world_time_envelope).toEqual({});
    expect(parsed.character_ids).toEqual([]);
    expect(parsed.scene_ids).toEqual([]);
    expect(parsed.description).toBeUndefined();
    expect(parsed.presentation_order).toBeUndefined();
  });

  it('accepts full create payload', () => {
    const parsed = worldEventCreateSchema.parse({
      title: '决战前夜',
      description: '全员集结',
      world_time_envelope: { label: '第一纪元 · 秋', order: 12 },
      anchor_story_id: 'story-1',
      presentation_order: 7,
      character_ids: ['char-1', 'char-2'],
      scene_ids: ['scene-1'],
    });
    expect(parsed.anchor_story_id).toBe('story-1');
    expect(parsed.presentation_order).toBe(7);
    expect(parsed.character_ids).toHaveLength(2);
  });

  it('rejects unknown keys (strict) and oversized title', () => {
    expect(() => worldEventCreateSchema.parse({ title: 'x', extra: 1 })).toThrow();
    expect(() => worldEventCreateSchema.parse({ title: '' })).toThrow();
    expect(() => worldEventCreateSchema.parse({ title: 'x', presentation_order: -1 })).toThrow();
    expect(() =>
      worldEventCreateSchema.parse({ title: 'x', character_ids: ['a'.repeat(129)] }),
    ).toThrow();
  });

  it('patch schema is partial and strict', () => {
    expect(worldEventPatchSchema.parse({})).toEqual({});
    expect(worldEventPatchSchema.parse({ title: '新标题' }).title).toBe('新标题');
    expect(() => worldEventPatchSchema.parse({ unknown_field: 1 })).toThrow();
  });

  it('full entity schema defaults state to draft', () => {
    const parsed = worldEventSchema.parse({
      id: 'we-1',
      project_id: 'project-1',
      title: '事件',
      created_at: '2026-08-05T10:00:00.000Z',
      updated_at: '2026-08-05T10:00:00.000Z',
    });
    expect(parsed.state).toBe('draft');
    expect(parsed.deleted_at).toBeUndefined();
  });
});

describe('world time envelope (opaque)', () => {
  it('passes through Project-defined values without interpretation', () => {
    const parsed = worldTimeEnvelopeSchema.parse({
      label: '第一纪元 · 春',
      order: 3,
      value: { day: 7, moon: 'full' },
      schema: 'season',
      custom_extra: true,
    });
    expect(parsed.value).toEqual({ day: 7, moon: 'full' });
    expect(parsed.schema).toBe('season');
    expect(parsed.custom_extra).toBe(true);
  });

  it('accepts empty / minimal envelopes', () => {
    expect(worldTimeEnvelopeSchema.parse({})).toEqual({});
    expect(worldTimeEnvelopeSchema.parse({ value: 'raw-string' }).value).toBe('raw-string');
  });

  it('rejects non-integer order', () => {
    expect(() => worldTimeEnvelopeSchema.parse({ order: 1.5 })).toThrow();
  });
});

describe('H6 TemporalDimension + WorldTimeBinding', () => {
  it('canonicalizes mode aliases without interpreting calendar values', () => {
    expect(worldTimeEnvelopeSchema.parse({ mode: 'exact', label: '童年' }).mode).toBe('point');
    expect(worldTimeEnvelopeSchema.parse({ mode: 'instant', value: { year: 3 } }).mode).toBe(
      'point',
    );
    expect(worldTimeEnvelopeSchema.parse({ mode: 'parallel', dimension_id: 'dream' }).mode).toBe(
      'crossing',
    );
    expect(canonicalizeWorldTimeMode('relative')).toBe('relative');
  });

  it('validates range / relative / crossing envelopes and keeps values opaque', () => {
    const range = worldTimeEnvelopeSchema.parse({
      dimension_id: 'main',
      mode: 'range',
      start: { era: 1 },
      end: { era: 3 },
      confidence: 'approximate',
    });
    expect(range.start).toEqual({ era: 1 });
    expect(range.end).toEqual({ era: 3 });

    expect(
      worldTimeEnvelopeSchema.parse({
        mode: 'relative',
        relation: 'before',
        anchor_item_id: 'item-1',
        label: '闪回',
      }).relation,
    ).toBe('before');

    expect(() => worldTimeEnvelopeSchema.parse({ mode: 'range' })).toThrow();
    expect(() => worldTimeEnvelopeSchema.parse({ mode: 'relative' })).toThrow();
    expect(() => worldTimeEnvelopeSchema.parse({ mode: 'crossing' })).toThrow();
  });

  it('treats empty bindings as follow and does not store follow duplicates', () => {
    expect(isFollowWorldTime({})).toBe(true);
    expect(isFollowWorldTime({ mode: 'follow' })).toBe(true);
    expect(isFollowWorldTime({ label: '第一纪元' })).toBe(false);
    expect(compactWorldTimeBinding({ mode: 'follow' })).toEqual({});
    expect(compactWorldTimeBindings([{ mode: 'follow' }, { label: '秋' }])).toEqual([
      { label: '秋' },
    ]);
    expect(bindingWorldRelation({})).toBe('follow');
    expect(bindingWorldRelation({ mode: 'crossing', dimension_id: 'dream' })).toBe('crossing');
    expect(bindingsWorldRelation([])).toBe('follow');
  });

  it('resolves a default worldline dimension and rejects unknown dimension ids', () => {
    expect(resolveTemporalDimensions([])).toEqual([
      { id: 'main', label: '主世界线', kind: 'worldline' },
    ]);
    const dimensions = temporalDimensionsSchema.parse([
      { id: 'main', label: '主世界线', kind: 'worldline' },
      { id: 'dream', label: '梦境', kind: 'dream' },
    ]);
    expect(
      unknownDimensionIds([{ dimension_id: 'void', mode: 'point', label: 'x' }], dimensions),
    ).toEqual(['void']);
    expect(
      unknownDimensionIds([{ dimension_id: 'dream', mode: 'point', label: 'x' }], dimensions),
    ).toEqual([]);
    expect(() =>
      temporalDimensionsSchema.parse([
        { id: 'main', label: 'A', kind: 'worldline' },
        { id: 'main', label: 'B', kind: 'custom' },
      ]),
    ).toThrow();
  });
});

describe('entityRef schema (ADR-0012 polymorphic ref)', () => {
  it('accepts all supported entity types', () => {
    for (const type of [
      'project',
      'story',
      'asset',
      'scene',
      'world_event',
      'relationship',
    ] as const) {
      expect(entityRefSchema.parse({ type, id: 'x-1' })).toEqual({ type, id: 'x-1' });
    }
  });

  it('rejects unknown type (character is modeled as asset), missing id, and extra keys', () => {
    expect(() => entityRefSchema.parse({ type: 'character', id: 'x' })).toThrow();
    expect(() => entityRefSchema.parse({ type: 'scene' })).toThrow();
    expect(() => entityRefSchema.parse({ type: 'scene', id: 'x', label: 'nope' })).toThrow();
  });
});

describe('relationship schema (ADR-0012)', () => {
  it('parses minimal create payload with directed default', () => {
    const parsed = relationshipCreateSchema.parse({
      kind: 'mentor',
      source: { type: 'asset', id: 'char-1' },
      target: { type: 'asset', id: 'char-2' },
    });
    expect(parsed.direction).toBe('directed');
    expect(parsed.label).toBeUndefined();
    expect(parsed.valid_from).toBeUndefined();
  });

  it('accepts world time validity envelope and undirected direction', () => {
    const parsed = relationshipCreateSchema.parse({
      kind: 'rivalry',
      source: { type: 'asset', id: 'a' },
      target: { type: 'asset', id: 'b' },
      direction: 'undirected',
      valid_from: { label: '第二纪元' },
      valid_until: null,
    });
    expect(parsed.direction).toBe('undirected');
    expect(parsed.valid_from).toEqual({ label: '第二纪元' });
    expect(parsed.valid_until).toBeNull();
  });

  it('rejects missing target, bad entity ref, and unknown keys', () => {
    expect(() =>
      relationshipCreateSchema.parse({ kind: 'k', source: { type: 'scene', id: 's' } }),
    ).toThrow();
    expect(() =>
      relationshipCreateSchema.parse({
        kind: 'k',
        source: { type: 'nope', id: 's' },
        target: { type: 'scene', id: 't' },
      }),
    ).toThrow();
    expect(() =>
      relationshipCreateSchema.parse({
        kind: 'k',
        source: { type: 'scene', id: 's' },
        target: { type: 'scene', id: 't' },
        extra: 1,
      }),
    ).toThrow();
  });

  it('full entity schema defaults state to draft', () => {
    const parsed = relationshipSchema.parse({
      id: 'rel-1',
      project_id: 'project-1',
      kind: 'mentor',
      source: { type: 'asset', id: 'a' },
      target: { type: 'asset', id: 'b' },
      created_at: '2026-08-05T10:00:00.000Z',
      updated_at: '2026-08-05T10:00:00.000Z',
    });
    expect(parsed.state).toBe('draft');
  });
});

describe('timeline schemas (H4+ world line)', () => {
  it('project timeline requires timestamps and defaults name', () => {
    const parsed = projectTimelineSchema.parse({
      id: 'tl-1',
      project_id: 'project-1',
      created_at: '2026-08-05T10:00:00.000Z',
      updated_at: '2026-08-05T10:00:00.000Z',
    });
    expect(parsed.name).toBe('World Line');
  });

  it('track create validates kind enum and defaults order', () => {
    const parsed = timelineTrackCreateSchema.parse({ kind: 'character', title: '主角' });
    expect(parsed.order).toBe(0);
    expect(() => timelineTrackCreateSchema.parse({ kind: 'unknown', title: 'x' })).toThrow();
  });

  it('item create defaults metadata and requires non-negative presentation order', () => {
    const parsed = timelineItemCreateSchema.parse({
      entity_type: 'scene',
      entity_id: 'scene-1',
      presentation_order: 3,
    });
    expect(parsed.metadata).toEqual({});
    expect(parsed.world_time_bindings).toEqual([]);
    expect(parsed.start_offset_ms).toBeUndefined();
    expect(() =>
      timelineItemCreateSchema.parse({
        entity_type: 'scene',
        entity_id: 'scene-1',
        presentation_order: -1,
      }),
    ).toThrow();
    expect(() =>
      timelineItemCreateSchema.parse({
        entity_type: 'bogus',
        entity_id: 'scene-1',
        presentation_order: 0,
      }),
    ).toThrow();
  });
});

describe('creator chat schemas (ADR-0010 revised)', () => {
  it('proposal schema accepts all kinds and optional project_id', () => {
    const kinds = [
      'create_project',
      'create_world_event',
      'create_character',
      'create_location',
      'create_relationship',
      'update_entity',
      'create_scene',
    ] as const;
    for (const kind of kinds) {
      const parsed = proposalSchema.parse({ kind, payload: {} });
      expect(parsed.project_id).toBeUndefined();
    }
    expect(
      proposalSchema.parse({ kind: 'create_character', project_id: 'p-1', payload: { name: 'A' } })
        .project_id,
    ).toBe('p-1');
  });

  it('proposal rejects unknown kind and missing payload', () => {
    expect(() => proposalSchema.parse({ kind: 'delete_everything', payload: {} })).toThrow();
    expect(() => proposalSchema.parse({ kind: 'create_character' })).toThrow();
  });

  it('proposal state covers the four gates', () => {
    for (const state of ['pending', 'accepted', 'rejected', 'applied'] as const) {
      expect(proposalStateSchema.parse(state)).toBe(state);
    }
    expect(() => proposalStateSchema.parse('archived')).toThrow();
  });

  it('thread defaults state to active; message accepts proposal', () => {
    const thread = creatorChatThreadSchema.parse({
      id: 'thread-1',
      created_at: '2026-08-05T10:00:00.000Z',
      updated_at: '2026-08-05T10:00:00.000Z',
    });
    expect(thread.state).toBe('active');
    const message = creatorChatMessageSchema.parse({
      id: 'msg-1',
      thread_id: 'thread-1',
      role: 'assistant',
      content: '提案如下',
      proposal: { kind: 'create_character', payload: { name: 'A' } },
      proposal_state: 'pending',
      created_at: '2026-08-05T10:00:00.000Z',
    });
    expect(message.proposal_state).toBe('pending');
  });
});

describe('HISTORY_ENTITY_TYPES extension (B3)', () => {
  it('includes world_event and relationship', () => {
    expect(HISTORY_ENTITY_TYPES).toContain('world_event');
    expect(HISTORY_ENTITY_TYPES).toContain('relationship');
  });
});

describe('world snapshot serializers', () => {
  const created = new Date('2026-08-05T10:00:00.000Z');
  const updated = new Date('2026-08-05T11:00:00.000Z');

  it('serializes world_event identically from camelCase and snake_case rows', () => {
    const camel = serializeWorldEventSnapshot({
      id: 'we-1',
      projectId: 'project-1',
      anchorStoryId: 'story-1',
      title: '决战前夜',
      description: '集结',
      worldTimeEnvelope: { label: '第一纪元' },
      presentationOrder: 7,
      state: 'draft',
      characterIds: ['char-1'],
      sceneIds: ['scene-1'],
      createdAt: created,
      updatedAt: updated,
      deletedAt: null,
    });
    const snake = serializeWorldEventSnapshot({
      id: 'we-1',
      project_id: 'project-1',
      anchor_story_id: 'story-1',
      title: '决战前夜',
      description: '集结',
      world_time_envelope: { label: '第一纪元' },
      presentation_order: 7,
      state: 'draft',
      character_ids: ['char-1'],
      scene_ids: ['scene-1'],
      created_at: created,
      updated_at: updated,
      deleted_at: null,
    });
    expect(camel.entity_type).toBe('world_event');
    expect(camel.schema_version).toBe(1);
    expect(camel.snapshot).toEqual(snake.snapshot);
  });

  it('serializes relationship identically from camelCase and snake_case rows', () => {
    const camel = serializeRelationshipSnapshot({
      id: 'rel-1',
      projectId: 'project-1',
      kind: 'mentor',
      sourceType: 'character',
      sourceId: 'char-1',
      targetType: 'character',
      targetId: 'char-2',
      direction: 'directed',
      label: '师徒',
      description: null,
      validFrom: { label: '第二纪元' },
      validUntil: null,
      state: 'draft',
      createdAt: created,
      updatedAt: updated,
      deletedAt: null,
    });
    const snake = serializeRelationshipSnapshot({
      id: 'rel-1',
      project_id: 'project-1',
      kind: 'mentor',
      source_type: 'character',
      source_id: 'char-1',
      target_type: 'character',
      target_id: 'char-2',
      direction: 'directed',
      label: '师徒',
      description: null,
      valid_from: { label: '第二纪元' },
      valid_until: null,
      state: 'draft',
      created_at: created,
      updated_at: updated,
      deleted_at: null,
    });
    expect(camel.entity_type).toBe('relationship');
    expect(camel.snapshot).toEqual(snake.snapshot);
  });

  it('serializeHistorySnapshot dispatches world_event and relationship', () => {
    const world = serializeHistorySnapshot('world_event', {
      id: 'we-1',
      projectId: 'project-1',
      title: 'x',
      createdAt: created,
      updatedAt: updated,
    });
    expect(world.entity_type).toBe('world_event');

    const rel = serializeHistorySnapshot('relationship', {
      id: 'rel-1',
      projectId: 'project-1',
      kind: 'k',
      sourceType: 'character',
      sourceId: 'a',
      targetType: 'scene',
      targetId: 'b',
      createdAt: created,
      updatedAt: updated,
    });
    expect(rel.entity_type).toBe('relationship');
    expect(rel.snapshot.source_type).toBe('character');
  });
});

describe('worldview schema (Project 轻量字段)', () => {
  it('parses full payload and trims strings', () => {
    const parsed = worldviewSchema.parse({
      genre: ' 赛博朋克 ',
      premise: ' 近未来 AI 统治下的都市 ',
      rules: [' 禁止生物改造 ', ' 数据即货币 '],
      notes: ' 补充设定 ',
    });
    expect(parsed.genre).toBe('赛博朋克');
    expect(parsed.premise).toBe('近未来 AI 统治下的都市');
    expect(parsed.rules).toEqual(['禁止生物改造', '数据即货币']);
    expect(parsed.notes).toBe('补充设定');
  });

  it('defaults rules to empty array when absent', () => {
    const parsed = worldviewSchema.parse({ genre: '东方玄幻' });
    expect(parsed.rules).toEqual([]);
    expect(parsed.premise).toBeUndefined();
  });

  it('rejects unknown fields (strict)', () => {
    const result = worldviewSchema.safeParse({ genre: '奇幻', extra: 'x' });
    expect(result.success).toBe(false);
  });

  it('parseWorldview normalizes invalid input to empty object', () => {
    expect(parseWorldview(null)).toEqual({ rules: [] });
    expect(parseWorldview('not-an-object')).toEqual({ rules: [] });
  });

  it('mergeWorldview covers non-empty patch fields and keeps base', () => {
    const merged = mergeWorldview(
      { genre: '东方玄幻', premise: '旧设定', rules: ['旧规则'], notes: '旧备注' },
      { genre: ' 仙侠 ', rules: [' 新规则一 ', ' 新规则二 '] },
    );
    expect(merged.genre).toBe('仙侠');
    expect(merged.premise).toBe('旧设定');
    expect(merged.rules).toEqual(['新规则一', '新规则二']);
    expect(merged.notes).toBe('旧备注');
  });

  it('mergeWorldview ignores empty patch fields', () => {
    const merged = mergeWorldview(
      { genre: '东方玄幻', premise: '核心设定', rules: ['规则'] },
      { genre: '', premise: '   ', rules: [], notes: '' },
    );
    expect(merged.genre).toBe('东方玄幻');
    expect(merged.premise).toBe('核心设定');
    expect(merged.rules).toEqual(['规则']);
    expect(merged.notes).toBeUndefined();
  });
});
