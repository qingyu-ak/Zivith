# ADR-0006: Story segments are ordered Scene groupings inside a Story

- **Status:** Accepted
- **Date:** 2026-07-23
- **Deciders:** Project owner (AK)
- **Class:** Standard
- **Reversibility:** Costly (adds a stored domain entity; removal would require data migration)

## Context

Creators experience today's Story stage as one monolithic block: the Story Agent emits a single story artifact, the story review gate approves it wholesale, and downstream Scene decomposition happens in one pass. Users have explicitly asked for chapter/act-wise drafting and review (「像小说一章一章、剧本一段一段那样推进」).

[Looser-Creative-Flow-RFC](../rfc/Looser-Creative-Flow-RFC.md) Slice C deferred this exact question to a domain ADR: is an act/chapter a new hierarchy node, a Story field structure, or Scene grouping metadata?

New evidence arrived via the [waoowaoo architecture review](../review/Zivith-Architecture-Review-Based-on-waoowaoo.md): that project's Episode→Clip segmentation demonstrates that segmentation units earn their keep by **driving production in slices** (draft → storyboard → voice per segment), not by modeling literary structure. It also shows the cost of making segments top-level: waoowaoo has no Story entity at all, so Episode had to absorb story responsibilities.

Forces in tension: Constitution §3 (deepen, don't widen — no new top-level concepts), RFC Slice C rule (no fake UI segments without a persisted entity), P2 (domain is a stored contract — users' data lives against it), and Simple by Default (ungrouped small stories must stay valid).

## Principles at Stake

- **Serves:** §3 deepen-don't-widen — segmentation deepens Story instead of adding a Project-level Chapter concept.
- **Serves:** P5/P6 — segments give partial recomputation and review a finer, stable unit to address.
- **Serves:** P1 — per-segment draft text is stored intent; downstream artifacts stay regenerable from it.
- **Strains:** Simple by Default — one more entity in the mental model. Acceptable because segments are optional: a Story with zero segments behaves exactly as today.

## Decision

We introduce **StorySegment**: a child entity of Story that is an **ordered grouping of Scenes**. A segment carries its own identity, order, title, synopsis/draft text, and approval state. A Scene remains owned by its Story (`story_id` unchanged) and gains an **optional** `segment_id` grouping reference. StorySegment is not a Project-level entity, not a document/file model, and does not change the Project → Story → Scene → Shot spine.

## Alternatives Considered

1. **Top-level Chapter node between Story and Scene** (Scene re-parents to Chapter). Offers the cleanest-looking hierarchy. Rejected: it widens the domain contract (§3), forces an irreversible re-parenting migration of every stored Scene, and the waoowaoo evidence shows top-level segments only make sense when no Story entity exists.
2. **JSON acts/beats structure inside the Story row.** Cheapest to ship. Rejected: segments would have no stable identity, so review gates, scoped recompute, and provenance (P7) could not reference them — violating "identity is permanent, content is versioned."
3. **Scene metadata label** (a `segment: string` tag on Scene). Rejected: labels cannot carry per-segment draft text or approval state, which is precisely what chapter-wise drafting/review requires; it would be the "fake UI segments" the RFC forbids.

## Trade-off Record

| We gained | We gave up | Horizon |
|-----------|------------|---------|
| Finer generation/review units with stable identity; additive (non-breaking) migration | Story-stage simplicity: one more entity, one more ordering to maintain | Re-examine if segments start needing their own assets or inheritance overrides — that would signal they want to be a true hierarchy node (new ADR) |
| Ungrouped stories stay valid (optionality preserved) | A single canonical reading order now has two sources (scene order + segment order) that must be kept consistent | Re-examine when `.ziv` export (D1) is specified — segment serialization becomes a public promise then |

## Consequences

- `packages/domain` gains StorySegment types/schemas; `packages/database` gains an **additive** migration (`story_segments` table + nullable `scenes.segment_id`). No existing rows change meaning.
- Story Agent may emit segmented drafts; the story review gate may iterate per segment. This is gate *policy* within the existing story gate, not a new mandatory gate class (no further ADR needed for that).
- Scene ordering within a segment must remain consistent with story-level scene order; domain tests owed.
- Docs owed: Core-Domain-Model.md (hierarchy note), Looser-Creative-Flow-RFC Slice C (unblocked), Next-Tasks Track E3, V0.4-Modification-Plan W3.
- Negative: two-level ordering invites off-by-one/reorder bugs; segment deletion must detach (not delete) its Scenes.

## Compliance

- PR review: no UI may render chapter/segment affordances that are not backed by persisted StorySegment rows (RFC Slice C rule).
- Segment operations exist as API/Orchestrator operations first (P3); WorkflowPanel consumes them.
- Domain test suite covers: optional grouping (null `segment_id`), segment reorder, segment delete detaches Scenes, per-segment approval state transitions.
