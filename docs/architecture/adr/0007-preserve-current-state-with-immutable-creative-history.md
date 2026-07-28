# ADR-0007: Preserve current domain state alongside immutable creative history

- **Status:** Proposed
- **Date:** 2026-07-28
- **Deciders:** Project owner / architecture maintainer
- **Class:** Standard
- **Reversibility:** Costly

## Context

Zivith stores current creative state in dedicated Project, Story, Scene, Shot, Asset, PromptVersion, Output, and related tables. Selected actions also write `AuditLog`; workflow and generation execution have separate persistence. This supports current reads and generation, but it does not provide one reliable model for immutable Entity revisions, Project-wide committed history, optimistic concurrency, or explicit alternative creative directions.

The decision changes provenance and versioning semantics and will require stored-data migration, so an ADR is mandatory. The detailed proposal is [Entity + State + Timeline + Track](../entity-state-timeline-track.md).

## Principles at Stake

- **Serves P1 — Creative intent is the asset:** each generated result can identify the committed creative revisions that produced it.
- **Serves P2 — The domain model is a contract:** history extends dedicated domain entities instead of replacing them with a generic JSON entity model.
- **Serves P3 — The core is headless:** revision, timeline, compare, and merge behavior are programmable API operations.
- **Serves P7 — Every generation is recorded and reproducible:** generation facts carry correlation and input revision identity.
- **Serves P8 — Memory compounds:** committed decisions and corrections remain queryable Project memory.
- **Strains simplicity and storage cost:** every participating write gains revision/event work and history is retained. The staged rollout, payload limits, and per-Entity feature flags contain this cost.

## Decision

We keep dedicated domain tables as the authority for current `main` state and add append-only Entity revisions and Timeline events as the authority for history. Project-scoped CreativeTracks may hold alternative Entity heads and may change `main` only through an explicit, conflict-checked merge.

This is not Event Sourcing. Workflow steps, queue attempts, and future video/audio editing tracks retain separate semantics.

## Alternatives Considered

### Full Event Sourcing

Events become the only source of truth and current state is rebuilt through projections. It offers complete replay, but requires rewriting current persistence, projection recovery, and every read/write path before users receive value. It loses because the migration and operational burden are disproportionate to current product scale.

### Snapshot-only version tables

Store occasional versions without a committed-fact timeline or correlation model. This is simpler, but cannot reliably answer causation, idempotent retry, generation provenance, or Project-wide history questions. It loses because those are primary requirements.

### Expand `AuditLog`

Treat current before/after logs as the history system. Existing coverage is incomplete, payload semantics are unconstrained, and the model lacks Track heads, parent revisions, schema versions, stable Project sequence, and merge lineage. It loses because retrofitting all of those would effectively create the proposed model under a misleading name.

### Generic Entity table

Move every domain object into one polymorphic JSON table. This simplifies generic history mechanics but weakens domain constraints, ownership, queryability, and migration clarity. It contradicts P2 and loses.

## Trade-off Record

| We gained | We gave up | Horizon |
|-----------|------------|---------|
| Queryable immutable creative history | Lower write-path complexity | Revisit if dual-write operations dominate latency or failure rate |
| Safe optimistic concurrency and explicit branch merge | Last-write-wins convenience | Revisit only with evidence that conflict UX blocks ordinary single-user work |
| Incremental migration preserving current APIs | Immediate universal branching | Expand Entity coverage only after pilot consistency criteria pass |
| Stable domain-specific current tables | Replay-from-events capability | Revisit only if multiple independent projections become a proven requirement |

## Consequences

- Every participating command must update current `main` state, revision, Track head, and Timeline facts in one transaction.
- Branch writes do not mutate current domain tables; merge into `main` is explicit and conflict checked.
- Canonical snapshot schemas, event schemas, optimistic revision checks, and idempotency keys become public implementation contracts.
- Existing approval snapshots remain authoritative freeze records and cannot be rewritten by later Track or upstream changes.
- `AuditLog` remains during migration and can be retired only after coverage, retention, permission, and backfill equivalence.
- PostgreSQL storage, indexes, retention, consistency checks, and migration tooling become ongoing operational costs.
- Runtime implementation does not begin merely because this ADR is Proposed; acceptance and explicit backlog scheduling are required.

## Compliance

- The runtime may not expose CreativeTrack merge before this ADR is Accepted.
- No branch write may update a dedicated current-state table.
- Every `main` dual write must be atomic and verified by business-row/head snapshot hashes.
- Timeline events and Entity revisions are append-only at the database permission boundary.
- Concurrent stale `expected_revision` writes return conflict instead of overwriting.
- Generation completion can be traced to its input Entity revision IDs.
- The acceptance and rollback checks in the detailed architecture document are required release gates.
