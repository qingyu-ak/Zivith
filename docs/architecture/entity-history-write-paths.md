# Entity history write-path inventory (Track H H1)

> Status: Inventory only — no dual-write wired yet
>
> Synced: 2026-07-30
>
> Branch: `feat/track-h-entity-history`
>
> Related: [entity-state-timeline-track.md](entity-state-timeline-track.md), [ADR-0007](adr/0007-preserve-current-state-with-immutable-creative-history.md)

This document lists current authoritative write surfaces for the H1 first-batch Entities. H2/H3 will attach `EntityRevision` + `ChangeEvent` appends here. **Do not confuse ChangeEvent (system facts) with Presentation Timeline Items** (Scene/Shot order).

## Naming

| Term | Meaning |
|------|---------|
| ChangeEvent | Append-only system facts for audit / SSE / causation |
| Presentation Timeline | Story work order (`Scene.order` + `Shot.order`); H4+ |
| Track | Semantic Timeline lane — not a git branch |
| CreativeBranch | Deferred (H10); not a Timeline Track |
| AuditLog | Legacy before/after log; keep during migration |

## First-batch Entities

### `shot` → `shots`

| Surface | Path |
|---------|------|
| CRUD / reorder / soft-delete / copy | [`apps/api/src/routes/resources.ts`](../../apps/api/src/routes/resources.ts) |
| State transitions | resources + domain `transitionShot` / `unfreezeShot` |
| Workflow prompt apply / video state | [`apps/api/src/contexts/workflow/mock-runner.ts`](../../apps/api/src/contexts/workflow/mock-runner.ts) |
| Scoped recompute | [`apps/api/src/contexts/workflow/scoped-recompute.ts`](../../apps/api/src/contexts/workflow/scoped-recompute.ts) |
| Generation side-effects (`generating` / `review` / `draft`) | [`apps/api/src/contexts/generation/service.ts`](../../apps/api/src/contexts/generation/service.ts) |

### `prompt_version` → `prompt_versions`

| Surface | Path |
|---------|------|
| Workflow prompt upsert | `mock-runner.ts` |
| HTTP create / approve | [`apps/api/src/routes/shot-prompts.ts`](../../apps/api/src/routes/shot-prompts.ts) |
| Clear on scoped recompute | `scoped-recompute.ts` |

### `output` → `outputs`

| Surface | Path |
|---------|------|
| Enqueue / complete / fail / cancel | `contexts/generation/service.ts` |
| Activate / review merge | `mock-runner.ts`, generation routes |

### `appearance_variant` → `asset_appearance_variants`

| Surface | Path |
|---------|------|
| Domain helpers | [`apps/api/src/contexts/visual/appearance-variants.ts`](../../apps/api/src/contexts/visual/appearance-variants.ts) |
| HTTP CRUD / generate / approve | [`apps/api/src/routes/appearance-variants.ts`](../../apps/api/src/routes/appearance-variants.ts) |
| Workflow visual prep | `mock-runner.ts` |

### `visual_requirement` → `visual_asset_requirements`

| Surface | Path |
|---------|------|
| HTTP CRUD / approve / reject | [`apps/api/src/routes/visual-requirements.ts`](../../apps/api/src/routes/visual-requirements.ts) |
| Image generate | [`apps/api/src/contexts/visual/generate-requirement-image.ts`](../../apps/api/src/contexts/visual/generate-requirement-image.ts) |
| Workflow upsert / scoped reset | `mock-runner.ts`, `scoped-recompute.ts` |

## AuditLog

`AuditLog` writes remain during migration (resources / orchestrator). They may later project to ChangeEvent as `legacy.audit_imported` but **must not** become TimelineItems.

## Out of H1

- No Prisma history tables
- No `recordEntityChange`
- No Presentation Timeline / World Time APIs
- No CreativeBranch
