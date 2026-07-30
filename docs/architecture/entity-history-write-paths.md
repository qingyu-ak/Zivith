# Entity history write-path inventory (Track H H1)

> Status: H3 dual-write helpers landed; flags default **off**
>
> Synced: 2026-07-30
>
> Branch: `feat/track-h-entity-history`
>
> Related: [entity-state-timeline-track.md](entity-state-timeline-track.md), [ADR-0007](adr/0007-preserve-current-state-with-immutable-creative-history.md)

This document lists current authoritative write surfaces for the H1 first-batch Entities. **H2** adds `entity_revisions` / `change_events` / `project_sequences` and an idempotent baseline backfill (`pnpm --filter @zivith/api history:backfill-baselines`). **H3** adds `recordEntityChange` / `maybeRecordEntityChange` with per-Entity `off|shadow|dual` flags (default off). **Do not confuse ChangeEvent (system facts) with Presentation Timeline Items** (Scene/Shot order).

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

## H2 baseline backfill

| Item | Location |
|------|----------|
| Schema | `packages/database/prisma/schema.prisma` → `EntityRevision`, `ChangeEvent`, `ProjectSequence` |
| Migration | `packages/database/prisma/migrations/20260730090000_entity_history_h2/` |
| Allocator | [`apps/api/src/contexts/history/project-sequence.ts`](../../apps/api/src/contexts/history/project-sequence.ts) |
| Backfill | [`apps/api/src/contexts/history/baseline-backfill.ts`](../../apps/api/src/contexts/history/baseline-backfill.ts) |
| CLI | `pnpm --filter @zivith/api history:backfill-baselines` (`--dry-run`, `--project <uuid>`) |

Baseline creates `revision=1` + `entity.created` ChangeEvent per missing Entity. Soft-deleted Shot / AppearanceVariant / VisualRequirement rows are skipped. Re-running is safe (idempotent).

## H3 dual-write flags (default off)

| Mode | Behavior |
|------|----------|
| `off` (default) | No history writes on live paths |
| `shadow` | Best-effort append after business write; failures logged, request still succeeds |
| `dual` | Await history append; `409 REVISION_CONFLICT` / `IDEMPOTENCY_KEY_REUSED` propagate |

Env: `HISTORY_WRITE_DEFAULT`, `HISTORY_ENTITY_SHOT`, `HISTORY_ENTITY_PROMPT_VERSION`, `HISTORY_ENTITY_OUTPUT`, `HISTORY_ENTITY_APPEARANCE_VARIANT`, `HISTORY_ENTITY_VISUAL_REQUIREMENT`.

Wired call sites (no-op until flags enabled): Shot create/patch, PromptVersion create/approve, Output complete/fail, AppearanceVariant approve, VisualRequirement approve.

## Out of H3 (still later)

- No Presentation Timeline / World Time APIs (H4+)
- No CreativeBranch (H10)
- Not every write path is wired yet (workflow mock-runner bulk paths remain for later)
