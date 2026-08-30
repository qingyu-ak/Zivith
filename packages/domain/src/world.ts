import { z } from 'zod';

/**
 * Creator layer world model contracts (ADR-0011 / ADR-0012 / ADR-0013).
 *
 * World time is opaque: `worldTimeEnvelope` carries Project-defined values and the
 * core UI never interprets them (abstract, non-uniform world-line scale, ADR-0007).
 * Relationships use polymorphic EntityRef — no physical FK (ADR-0012).
 */

const id = z.string().min(1).max(128);
const nullableString = z.string().trim().max(10_000).nullable().optional();

// ---------------------------------------------------------------------------
// H6 — TemporalDimension + WorldTimeBinding envelope
// Core validates the envelope only; Project-defined calendar values stay opaque.
// ---------------------------------------------------------------------------

export const TEMPORAL_DIMENSION_KINDS = [
  'calendar',
  'worldline',
  'dream',
  'simulation',
  'custom',
] as const;

export type TemporalDimensionKind = (typeof TEMPORAL_DIMENSION_KINDS)[number];

export const WORLD_TIME_MODES = [
  'follow',
  'point',
  'range',
  'relative',
  'crossing',
  'unknown',
] as const;

export type WorldTimeMode = (typeof WORLD_TIME_MODES)[number];

/** Accepted aliases (ADR-0011 `instant`, history stub `exact`/`parallel`). */
const WORLD_TIME_MODE_ALIASES = {
  exact: 'point',
  instant: 'point',
  parallel: 'crossing',
} as const;

export const WORLD_TIME_RELATIONS = ['before', 'after', 'same_as', 'overlaps'] as const;
export type WorldTimeRelationKind = (typeof WORLD_TIME_RELATIONS)[number];

export const WORLD_TIME_CONFIDENCE = ['exact', 'approximate', 'ambiguous'] as const;
export type WorldTimeConfidence = (typeof WORLD_TIME_CONFIDENCE)[number];

export const WORLD_TIME_OVERLAY_RELATIONS = ['follow', 'explicit', 'crossing', 'unknown'] as const;
export type WorldTimeOverlayRelation = (typeof WORLD_TIME_OVERLAY_RELATIONS)[number];

export const DEFAULT_TEMPORAL_DIMENSION_ID = 'main';

export const DEFAULT_TEMPORAL_DIMENSION = {
  id: DEFAULT_TEMPORAL_DIMENSION_ID,
  label: '主世界线',
  kind: 'worldline' as const,
};

export const temporalDimensionSchema = z
  .object({
    id,
    label: z.string().trim().min(1).max(200),
    kind: z.enum(TEMPORAL_DIMENSION_KINDS),
    parent_dimension_id: id.optional(),
    schema: z.unknown().optional(),
  })
  .strict();

export type TemporalDimension = z.infer<typeof temporalDimensionSchema>;

export const temporalDimensionsSchema = z
  .array(temporalDimensionSchema)
  .max(32)
  .superRefine((dimensions, ctx) => {
    const seen = new Set<string>();
    for (let index = 0; index < dimensions.length; index += 1) {
      const dimension = dimensions[index];
      if (!dimension) continue;
      if (seen.has(dimension.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate temporal dimension id: ${dimension.id}`,
          path: [index, 'id'],
        });
      }
      seen.add(dimension.id);
    }
  });

const worldTimeModeInputSchema = z.enum([...WORLD_TIME_MODES, 'exact', 'instant', 'parallel']);

export function canonicalizeWorldTimeMode(mode: string): WorldTimeMode {
  const aliased = WORLD_TIME_MODE_ALIASES[mode as keyof typeof WORLD_TIME_MODE_ALIASES];
  if (aliased) return aliased;
  if ((WORLD_TIME_MODES as readonly string[]).includes(mode)) return mode as WorldTimeMode;
  return 'unknown';
}

/** Opaque World Time binding envelope (H6). Empty `{}` means follow Presentation Time. */
export const worldTimeEnvelopeSchema = z
  .object({
    dimension_id: id.optional(),
    mode: worldTimeModeInputSchema.optional(),
    value: z.unknown().optional(),
    start: z.unknown().optional(),
    end: z.unknown().optional(),
    anchor_item_id: id.optional(),
    relation: z.enum(WORLD_TIME_RELATIONS).optional(),
    /** Human-readable display name, e.g. "第一纪元 · 春" */
    label: nullableString,
    confidence: z.enum(WORLD_TIME_CONFIDENCE).optional(),
    /** Optional presentation hint. NOT a real time conversion. */
    order: z.number().int().nullable().optional(),
    /** Optional renderer / type hint (legacy + Project-defined). */
    schema: z.unknown().optional(),
  })
  .passthrough()
  .superRefine((envelope, ctx) => {
    const mode = envelope.mode ? canonicalizeWorldTimeMode(envelope.mode) : undefined;
    if (mode === 'range' && envelope.start == null && envelope.end == null && !envelope.label) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'range binding requires start, end, or label',
        path: ['start'],
      });
    }
    if (mode === 'relative' && !envelope.relation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'relative binding requires relation',
        path: ['relation'],
      });
    }
    if (mode === 'crossing' && !envelope.dimension_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'crossing binding requires dimension_id',
        path: ['dimension_id'],
      });
    }
  })
  .transform((envelope) => {
    if (!envelope.mode) return envelope;
    const mode = canonicalizeWorldTimeMode(envelope.mode);
    if (mode === envelope.mode) return envelope;
    return { ...envelope, mode };
  });

export type WorldTimeEnvelope = z.infer<typeof worldTimeEnvelopeSchema>;
export type WorldTimeBinding = WorldTimeEnvelope;

export const worldTimeBindingsSchema = z.array(worldTimeEnvelopeSchema).max(16);

export function resolveTemporalDimensions(stored: unknown): TemporalDimension[] {
  const parsed = z.array(temporalDimensionSchema).safeParse(stored ?? []);
  const list = parsed.success ? parsed.data : [];
  return list.length > 0 ? list : [{ ...DEFAULT_TEMPORAL_DIMENSION }];
}

function hasExplicitWorldTimePayload(envelope: WorldTimeEnvelope): boolean {
  return Boolean(
    (typeof envelope.label === 'string' && envelope.label.trim()) ||
    envelope.value != null ||
    envelope.start != null ||
    envelope.end != null ||
    envelope.relation ||
    envelope.anchor_item_id,
  );
}

/** Empty / follow envelopes are not stored; they mean "follow Presentation Time". */
export function isFollowWorldTime(envelope: unknown): boolean {
  if (envelope == null) return true;
  const parsed = worldTimeEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) return false;
  const mode = parsed.data.mode ? canonicalizeWorldTimeMode(parsed.data.mode) : undefined;
  if (mode && mode !== 'follow') return false;
  return !hasExplicitWorldTimePayload(parsed.data);
}

export function bindingWorldRelation(envelope: unknown): WorldTimeOverlayRelation {
  if (isFollowWorldTime(envelope)) return 'follow';
  const parsed = worldTimeEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) return 'unknown';
  const mode = parsed.data.mode ? canonicalizeWorldTimeMode(parsed.data.mode) : undefined;
  if (mode === 'crossing') return 'crossing';
  if (mode === 'unknown') return 'unknown';
  return 'explicit';
}

export function bindingsWorldRelation(bindings: unknown): WorldTimeOverlayRelation {
  const parsed = worldTimeBindingsSchema.safeParse(bindings ?? []);
  const list = parsed.success ? parsed.data : [];
  if (list.length === 0) return 'follow';
  const relations = list.map((binding) => bindingWorldRelation(binding));
  if (relations.some((relation) => relation === 'crossing')) return 'crossing';
  if (relations.every((relation) => relation === 'follow')) return 'follow';
  if (relations.every((relation) => relation === 'unknown' || relation === 'follow')) {
    return relations.some((relation) => relation === 'unknown') ? 'unknown' : 'follow';
  }
  return 'explicit';
}

export function compactWorldTimeBinding(envelope: unknown): WorldTimeEnvelope {
  if (isFollowWorldTime(envelope)) return {};
  const parsed = worldTimeEnvelopeSchema.parse(envelope ?? {});
  const mode = parsed.mode ? canonicalizeWorldTimeMode(parsed.mode) : undefined;
  const compact: WorldTimeEnvelope = { ...parsed };
  if (mode) compact.mode = mode;
  return compact;
}

export function compactWorldTimeBindings(bindings: unknown): WorldTimeEnvelope[] {
  const parsed = worldTimeBindingsSchema.parse(bindings ?? []);
  return parsed
    .map((binding) => compactWorldTimeBinding(binding))
    .filter((binding) => !isFollowWorldTime(binding));
}

export function parseWorldTimeBindings(value: unknown): WorldTimeEnvelope[] {
  const parsed = worldTimeBindingsSchema.safeParse(value ?? []);
  if (!parsed.success) return [];
  return parsed.data.filter((binding) => !isFollowWorldTime(binding));
}

export function unknownDimensionIds(
  bindings: WorldTimeEnvelope[],
  dimensions: TemporalDimension[],
): string[] {
  const known = new Set(resolveTemporalDimensions(dimensions).map((dimension) => dimension.id));
  const missing = new Set<string>();
  for (const binding of bindings) {
    if (!binding.dimension_id) continue;
    if (isFollowWorldTime(binding)) continue;
    if (!known.has(binding.dimension_id)) missing.add(binding.dimension_id);
  }
  return [...missing];
}

/** Polymorphic world entity reference — no physical FK (ADR-0012). */
export const entityRefSchema = z
  .object({
    type: z.enum(['project', 'story', 'asset', 'scene', 'world_event', 'relationship']),
    id,
  })
  .strict();

export type WorldEntityRef = z.infer<typeof entityRefSchema>;

// ---------------------------------------------------------------------------
// Worldview — Project 轻量结构化世界观字段（Creator Chat 自动提炼并落库）
// ---------------------------------------------------------------------------

export const worldviewSchema = z
  .object({
    /** 题材，如「东方玄幻」「赛博朋克」 */
    genre: z.string().trim().max(200).optional(),
    /** 核心设定 / 一句话世界观 */
    premise: z.string().trim().max(10_000).optional(),
    /** 世界规则 / 力量体系（整组替换语义） */
    rules: z.array(z.string().trim().max(2_000)).max(64).default([]),
    /** 补充说明 */
    notes: z.string().trim().max(20_000).optional(),
  })
  .strict();

export type Worldview = z.infer<typeof worldviewSchema>;

/** 规范化任意 world/view 输入为合法 Worldview（失败则返回空对象）。 */
export function parseWorldview(value: unknown): Worldview {
  const parsed = worldviewSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { rules: [] };
}

/** 浅合并：patch 非空字段覆盖 current；rules 为整组替换。返回规范化对象。 */
export function mergeWorldview(current: unknown, patch: unknown): Worldview {
  const base = parseWorldview(current);
  if (patch === null || patch === undefined || typeof patch !== 'object') return base;
  const patchRecord = patch as Record<string, unknown>;
  const next: Worldview = { ...base };
  if (typeof patchRecord.genre === 'string' && patchRecord.genre.trim()) {
    next.genre = patchRecord.genre.trim();
  }
  if (typeof patchRecord.premise === 'string' && patchRecord.premise.trim()) {
    next.premise = patchRecord.premise.trim();
  }
  if (Array.isArray(patchRecord.rules) && patchRecord.rules.length > 0) {
    next.rules = patchRecord.rules
      .filter((rule): rule is string => typeof rule === 'string' && rule.trim().length > 0)
      .map((rule) => rule.trim())
      .slice(0, 64);
  }
  if (typeof patchRecord.notes === 'string' && patchRecord.notes.trim()) {
    next.notes = patchRecord.notes.trim();
  }
  return parseWorldview(next);
}

export const approvalStateSchema = z.enum(['draft', 'review', 'approved']);

// ---------------------------------------------------------------------------
// WorldEvent (ADR-0011)
// ---------------------------------------------------------------------------

export const worldEventCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(20_000).nullable().optional(),
    world_time_envelope: worldTimeEnvelopeSchema.default({}),
    anchor_story_id: id.nullable().optional(),
    presentation_order: z.number().int().min(0).nullable().optional(),
    character_ids: z.array(id).max(256).default([]),
    scene_ids: z.array(id).max(256).default([]),
  })
  .strict();

export type WorldEventCreate = z.infer<typeof worldEventCreateSchema>;

export const worldEventPatchSchema = worldEventCreateSchema.partial().strict();

export type WorldEventPatch = z.infer<typeof worldEventPatchSchema>;

export const worldEventSchema = worldEventCreateSchema
  .extend({
    id,
    project_id: id,
    state: approvalStateSchema.default('draft'),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    deleted_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export type WorldEvent = z.infer<typeof worldEventSchema>;

// ---------------------------------------------------------------------------
// Relationship (ADR-0012)
// ---------------------------------------------------------------------------

export const relationshipCreateSchema = z
  .object({
    kind: z.string().trim().min(1).max(100),
    source: entityRefSchema,
    target: entityRefSchema,
    direction: z.enum(['directed', 'undirected']).default('directed'),
    label: nullableString,
    description: z.string().trim().max(20_000).nullable().optional(),
    valid_from: worldTimeEnvelopeSchema.nullable().optional(),
    valid_until: worldTimeEnvelopeSchema.nullable().optional(),
  })
  .strict();

export type RelationshipCreate = z.infer<typeof relationshipCreateSchema>;

export const relationshipPatchSchema = relationshipCreateSchema.partial().strict();

export type RelationshipPatch = z.infer<typeof relationshipPatchSchema>;

export const relationshipSchema = relationshipCreateSchema
  .extend({
    id,
    project_id: id,
    state: approvalStateSchema.default('draft'),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    deleted_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export type Relationship = z.infer<typeof relationshipSchema>;

// ---------------------------------------------------------------------------
// Presentation Timeline (world line) — H4+ / Track K
// ---------------------------------------------------------------------------

export const projectTimelineSchema = z
  .object({
    id,
    project_id: id,
    name: z.string().trim().min(1).max(200).default('World Line'),
    description: nullableString,
    temporal_dimensions: temporalDimensionsSchema.default([]),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    deleted_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export type ProjectTimeline = z.infer<typeof projectTimelineSchema>;

export const projectTimelinePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: nullableString,
    temporal_dimensions: temporalDimensionsSchema.optional(),
  })
  .strict();

export type ProjectTimelinePatch = z.infer<typeof projectTimelinePatchSchema>;

export const timelineTrackCreateSchema = z
  .object({
    kind: z.enum(['character', 'scene', 'world_event', 'organization']),
    title: z.string().trim().min(1).max(200),
    order: z.number().int().min(0).default(0),
  })
  .strict();

export type TimelineTrackCreate = z.infer<typeof timelineTrackCreateSchema>;

export const timelineTrackSchema = timelineTrackCreateSchema
  .extend({
    id,
    timeline_id: id,
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    deleted_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export type TimelineTrack = z.infer<typeof timelineTrackSchema>;

export const timelineItemCreateSchema = z
  .object({
    entity_type: z.enum(['character', 'scene', 'world_event', 'shot', 'organization']),
    entity_id: id,
    presentation_order: z.number().int().min(0),
    start_offset_ms: z.number().int().min(0).nullable().optional(),
    duration_ms: z.number().int().min(0).nullable().optional(),
    world_time_bindings: worldTimeBindingsSchema.default([]),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();

export type TimelineItemCreate = z.infer<typeof timelineItemCreateSchema>;

export const timelineItemSchema = timelineItemCreateSchema
  .extend({
    id,
    track_id: id,
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    deleted_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export type TimelineItem = z.infer<typeof timelineItemSchema>;

export interface TimelineBundle {
  timeline: ProjectTimeline;
  tracks: Array<TimelineTrack & { items: TimelineItem[] }>;
}

// ---------------------------------------------------------------------------
// Creator Chat (ADR-0010 revised / ADR-0013) — local single user, no userId
// ---------------------------------------------------------------------------

/** Proposal — the only way the agent writes to the world (ADR-0010 fence). */
export const proposalSchema = z
  .object({
    kind: z.enum([
      'create_project',
      'create_world_event',
      'create_character',
      'create_location',
      'create_relationship',
      'update_entity',
      'create_scene',
    ]),
    /** Null until the "create world" proposal is confirmed. */
    project_id: id.nullable().optional(),
    payload: z.record(z.unknown()),
  })
  .strict();

export type Proposal = z.infer<typeof proposalSchema>;

export const proposalStateSchema = z.enum(['pending', 'accepted', 'rejected', 'applied']);

export type ProposalState = z.infer<typeof proposalStateSchema>;

export const creatorChatMessageSchema = z
  .object({
    id,
    thread_id: id,
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(100_000),
    proposal: proposalSchema.nullable().optional(),
    proposal_key: z.string().max(256).nullable().optional(),
    proposal_state: proposalStateSchema.nullable().optional(),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();

export type CreatorChatMessage = z.infer<typeof creatorChatMessageSchema>;

export const creatorChatThreadSchema = z
  .object({
    id,
    project_id: id.nullable().optional(),
    title: z.string().trim().max(200).nullable().optional(),
    state: z.enum(['active', 'archived']).default('active'),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();

export type CreatorChatThread = z.infer<typeof creatorChatThreadSchema>;
