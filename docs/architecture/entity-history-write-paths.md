# 实体历史写入路径清单（Track H H1）

> Status: H3 dual-write helpers landed; flags default **off**
>
> Synced: 2026-07-30
>
> Branch: `feat/track-h-entity-history`
>
> Related: [entity-state-timeline-track.md](entity-state-timeline-track.md), [ADR-0007](adr/0007-preserve-current-state-with-immutable-creative-history.md)

本文档列出 H1 首批 Entity 的当前权威写入面。**H2** 增加 `entity_revisions` / `change_events` / `project_sequences` 以及幂等基线回填（`pnpm --filter @zivith/api history:backfill-baselines`）。**H3** 增加带 per-Entity `off|shadow|dual` 标志（默认 off）的 `recordEntityChange` / `maybeRecordEntityChange`。**勿混淆 ChangeEvent（系统事实）与 Presentation Timeline Items**（Scene/Shot 顺序）。

## 命名

| Term | Meaning |
|------|---------|
| ChangeEvent | 仅追加的系统事实，用于审计 / SSE / 因果 |
| Presentation Timeline | Story 工作顺序（`Scene.order` + `Shot.order`）；H4+ |
| Track | 语义 Timeline 泳道——不是 git branch |
| CreativeBranch | 延期（H10）；不是 Timeline Track |
| AuditLog | 迁移前遗留的 before/after 日志；迁移期间保留 |

## 首批 Entity

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

迁移期间 `AuditLog` 写入仍保留（resources / orchestrator）。日后可能投影为 ChangeEvent `legacy.audit_imported`，但**不得**变为 TimelineItems。

## H2 基线回填

| Item | Location |
|------|----------|
| Schema | `packages/database/prisma/schema.prisma` → `EntityRevision`, `ChangeEvent`, `ProjectSequence` |
| Migration | `packages/database/prisma/migrations/20260730090000_entity_history_h2/` |
| Allocator | [`apps/api/src/contexts/history/project-sequence.ts`](../../apps/api/src/contexts/history/project-sequence.ts) |
| Backfill | [`apps/api/src/contexts/history/baseline-backfill.ts`](../../apps/api/src/contexts/history/baseline-backfill.ts) |
| CLI | `pnpm --filter @zivith/api history:backfill-baselines` (`--dry-run`, `--project <uuid>`) |

基线为每个缺失 Entity 创建 `revision=1` + `entity.created` ChangeEvent。软删除的 Shot / AppearanceVariant / VisualRequirement 行被跳过。重跑安全（幂等）。

## H3 双写标志（默认 off）

| Mode | Behavior |
|------|----------|
| `off` (default) | 实时路径无历史写入 |
| `shadow` | 业务写入后尽力追加；失败记日志，请求仍成功 |
| `dual` | 等待历史追加；`409 REVISION_CONFLICT` / `IDEMPOTENCY_KEY_REUSED` 向上传播 |

Env: `HISTORY_WRITE_DEFAULT`, `HISTORY_ENTITY_SHOT`, `HISTORY_ENTITY_PROMPT_VERSION`, `HISTORY_ENTITY_OUTPUT`, `HISTORY_ENTITY_APPEARANCE_VARIANT`, `HISTORY_ENTITY_VISUAL_REQUIREMENT`.

已接线调用点（标志启用前为 no-op）：Shot create/patch、PromptVersion create/approve、Output complete/fail、AppearanceVariant approve、VisualRequirement approve。

## H3 范围外（仍属后续）

- 无 Presentation Timeline / World Time API（H4+）
- 无 CreativeBranch（H10）
- 并非每条写入路径都已接线（workflow mock-runner 批量路径留待后续）
