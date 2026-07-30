# ADR-0007: Preserve current domain state alongside immutable creative history

- **Status:** Accepted
- **Date:** 2026-07-29
- **Accepted:** 2026-07-30 (Track H scheduled on `feat/track-h-entity-history`)
- **Deciders:** Project owner / architecture maintainer
- **Class:** Standard
- **Reversibility:** Costly

## Context

Zivith stores current creative state in dedicated Project, Story, Scene, Shot, Asset, PromptVersion, Output, and related tables. Selected actions also write `AuditLog`; workflow and generation execution have separate persistence. This supports current reads, but it does not preserve a complete immutable State history or provide a stable foundation for visualizing Entity State across world chronology and work presentation order.

Product design requires:

- persistent Entity identity;
- current State plus immutable State history;
- one creative Timeline led by Presentation Time, with World Time as a variable following dimension;
- semantic Tracks such as Character, Event, Shot, Camera, Prompt, and Model.

This changes provenance and versioning semantics and requires stored-data migration, so an ADR is mandatory. The detailed proposal is [Entity + State + Timeline + Track](../entity-state-timeline-track.md).

## Principles at Stake

- **Serves P1:** generated results can identify the committed Entity revisions that produced them.
- **Serves P2:** dedicated domain entities remain authoritative instead of moving to a generic JSON entity model.
- **Serves P3:** State history and Timeline behavior are programmable operations, not UI-only features.
- **Serves P7:** generation provenance references exact Shot, Prompt, and visual revisions.
- **Serves P8:** world changes and human decisions become durable Project memory.
- **Strains simplicity and storage cost:** participating writes gain immutable history and projection work. Staged rollout and derived Tracks contain the cost.
- **Strains D4 if misunderstood:** a semantic creative Timeline could drift into a nonlinear video editor. Track kinds and explicit non-goals preserve the boundary.

## Decision

We keep dedicated domain tables as the authority for current State and add append-only Entity revisions as the authority for State history. Presentation Time is the Timeline's stable primary axis. World Time follows it by default and uses optional Project-defined bindings for relative, approximate, ranged, or parallel-world time; Zivith does not standardize fictional calendar values. Tracks are semantic lanes within that Timeline.

Committed system facts use the distinct name `ChangeEvent`. Alternative creative versions, if later introduced, use `CreativeBranch`, not Track. This is not Event Sourcing and not a nonlinear video editor.

## Alternatives Considered

### Full Event Sourcing

Events become the only source of truth. This offers replay, but requires rewriting current persistence and projections before users receive Timeline value. It loses because the migration and operational burden are disproportionate.

### Snapshot-only current state

Keep only current rows and approved snapshots. This is simple, but cannot display Character evolution, historical world state, exact generation provenance, or world-time deviations from work order. It loses because those are primary requirements.

### Treat audit events as Timeline

Order `AuditLog` or ChangeEvents and display them directly. This records database change chronology, not world chronology or presentation order. It cannot express flashback, repeated presentation, or planned future state. It loses because it conflates three different times.

### Use Track for creative branches

Model Track as a Git-like branch. Branching is useful, but product Track means Character/Scene/Event/Shot/Camera/Prompt lanes. It loses because shared terminology would make UI, API, and domain contracts ambiguous. The distinct term is `CreativeBranch`.

### Generic Entity table

Move every domain object into a polymorphic JSON table. This simplifies generic history mechanics but weakens domain constraints, ownership, queryability, and migration clarity. It contradicts P2 and loses.

## Trade-off Record

| We gained | We gave up | Horizon |
|-----------|------------|---------|
| Immutable Entity evolution | Lower write-path complexity | Revisit if history writes dominate latency |
| Variable World Time over a stable Presentation axis | Globally sortable standardized world chronology | Revisit only when real projects prove a shared calendar contract is necessary |
| Stable Track semantics | Reusing one term for branches and lanes | Permanent unless product vocabulary changes by superseding ADR |
| Incremental migration preserving current APIs | Immediate universal Timeline editing | Promote each phase only after consistency evidence |
| Derived Camera/Style/Model Tracks | Fully independent editing of every lane | Revisit when a real use case cannot map to existing Entity State |

## Consequences

- Every participating Entity command atomically updates current State, appends EntityRevision, and records ChangeEvent.
- TimelineItem position is separate from Entity State; moving an item cannot silently mutate Entity content.
- Presentation Time is the required Story/content order, not Workflow execution time or database time.
- World Time defaults to following Presentation Time and cannot assume UTC, one calendar, or one scalar dimension.
- The core standardizes only a binding envelope; Project-defined time values remain opaque.
- Track becomes reserved for semantic Timeline lanes.
- CreativeBranch is optional and scheduled after Entity + State and Timeline + Track.
- Existing approval snapshots remain frozen and cannot be rewritten by later Timeline or upstream changes.
- `AuditLog` remains during migration and is retired only after equivalence is verified.
- Runtime table dual-write does not begin until Track H H2+; H1 freezes schemas only. CreativeBranch merge APIs stay deferred (H10).

## Compliance

- APIs and schemas must not use `TimelineEvent` for audit/change facts; use `ChangeEvent`.
- APIs and schemas must not use `CreativeTrack` for a branch; use `CreativeBranch`.
- Every first-release TimelineItem has Presentation Time.
- Missing WorldTime bindings mean `follow`; explicit bindings identify a dimension and relation/mode without requiring standardized values.
- EntityRevision and ChangeEvent are append-only at the database permission boundary.
- Concurrent stale `expected_revision` writes return conflict.
- Generation completion traces to input Entity revision IDs.
- Derived Tracks cannot become a second source of domain truth.
- Timeline and Agent UI cannot bypass existing review or budget authority.
- The acceptance and rollback checks in the detailed architecture document are release gates.
