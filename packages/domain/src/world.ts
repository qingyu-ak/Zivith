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

/** Opaque world time envelope — Project-defined, never interpreted by the core UI. */
export const worldTimeEnvelopeSchema = z
  .object({
    /** Human-readable display name, e.g. "第一纪元 · 春" */
    label: nullableString,
    /** Optional presentation hint. NOT a real time conversion. */
    order: z.number().int().nullable().optional(),
    /** Opaque Project-defined payload. */
    value: z.unknown().optional(),
    /** Optional renderer / type hint. */
    schema: z.unknown().optional(),
  })
  .passthrough();

export type WorldTimeEnvelope = z.infer<typeof worldTimeEnvelopeSchema>;

/** Polymorphic world entity reference — no physical FK (ADR-0012). */
export const entityRefSchema = z
  .object({
    type: z.enum(['project', 'story', 'asset', 'scene', 'world_event', 'relationship']),
    id,
  })
  .strict();

export type WorldEntityRef = z.infer<typeof entityRefSchema>;

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
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    deleted_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export type ProjectTimeline = z.infer<typeof projectTimelineSchema>;

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
