# Next Tasks

> Engineering backlog for the active implementation track
>
> Status: Active
>
> Synced: 2026-07-28
>
> Priority policy: **Provider stability polish (Track G)** after V0.4 Track F; then Phase 3
>
> Related: [Implementation-Plan.md](Implementation-Plan.md), [Technical-Architecture.md](Technical-Architecture.md), [Entity + State + Timeline + Track](architecture/entity-state-timeline-track.md)

---

## Current baseline

Recently landed (commits through `05d078e`):

- Backend: Mock agents, orchestrator, `MockWorkflowRunner`, generation + shot-prompts + visual-requirements + workflow routes
- Frontend: [`apps/web/components/workflow-panel.tsx`](../apps/web/components/workflow-panel.tsx) on the project page; shot editor prompt approve + mock outputs
- Domain: [`packages/domain/src/workflow.ts`](../packages/domain/src/workflow.ts)

Still stubbed (501): BYOK credentials, provider usage/limits/callbacks — see [`apps/api/src/routes/stubs.ts`](../apps/api/src/routes/stubs.ts). (Workflow SSE and visual-requirement generate are implemented.)

---

## Track A — Stabilize WIP (do first)

Goal: make the Mock Story→Video loop reliable and reviewable without expanding scope into real providers.

| ID | Task | Why | Primary surfaces | Status |
|----|------|-----|------------------|--------|
| A1 | Manual E2E pass of WorkflowPanel gates | Confirm story/scene/visual/shot/prompt/video review paths; capture broken UX | `workflow-panel.tsx`, `workflows.ts`, `mock-runner.ts` | Done 2026-07-22 |
| A2 | Harden review artifact loading | Fail clearly when candidate media / prompt ids missing; avoid silent empty grids | `workflow-panel.tsx`, visual-requirements + shot-prompts APIs | Done 2026-07-21 |
| A3 | Story / scene / shot review content in panel | Today detailed cards exist mainly for visual/prompt/video; earlier gates only show step chips | `workflow-panel.tsx` | Done 2026-07-21 |
| A4 | Automation controls in start form | API accepts per-stage automation; UI hardcodes `assisted` | `workflow-panel.tsx`, `workflows.ts` | Done 2026-07-21 |
| A5 | Shot-page ↔ workflow consistency | Prompt approve / generate / outputs stay in sync after workflow runs | `shots/[shotId]/page.tsx`, `shot-prompts.ts`, `generation.ts` | Done 2026-07-21 |
| A6 | Regression tests for review actions | Cover approve_all / reject / retry_with_feedback and required prompt gate | `apps/api/test/mock-workflow-runner.test.ts`, `workflow.test.ts` | Done 2026-07-21 |
| A7 | Refresh / cancel / re-start UX polish | Avoid stuck busy states; refresh latest run after cancel; confirm re-start semantics | `workflow-panel.tsx`, orchestrator cancel | Done 2026-07-21 |

**Exit criteria for Track A:** one operator can start a brief, walk every review gate, approve required visual assets + prompts, receive mock videos, cancel mid-run, and restart — without console/API surprises.

---

## Track B — Close remaining Phase 2 gaps

Do after Track A exit.

| ID | Task | Notes | Status |
|----|------|-------|--------|
| B1 | Wire BullMQ enqueue + worker for generation jobs | Redis → BullMQ; no Redis → in-memory queue | Done 2026-07-21 |
| B2 | Implement `GET /workflows/:runId/events` SSE | Polling snapshot stream; WorkflowPanel subscribes | Done 2026-07-21 |
| B3 | Call `recoverInterruptedRuns()` on API boot | Invoked from `server.ts` | Done 2026-07-21 |
| B4 | Lightweight generation queue surface | Project-page `GenerationQueuePanel` | Done 2026-07-21 |
| B5 | Pause / resume UX | Deferred — cancel + boot recover is enough for MVP | Deferred |

**Exit criteria for Track B:** Phase 2 checkboxes in Implementation Plan move from partial to done for queue UI, SSE, and recovery.

---

## Track C — Phase 2.5 First Provider Integration

Do after Track B (or explicitly re-prioritize).

| ID | Task | Status |
|----|------|--------|
| C1 | `DeepSeekAdapter` structured output for Story/Scene/Shot/Prompt agents | Done |
| C2 | SiliconFlow image adapter + visual prep wiring | Done |
| C3 | SiliconFlow video adapter + generation path | Done |
| C4 | SiliconFlow audio / dialogue TTS + Media | Done |
| C5 | Provider catalog + runtime selection API/UI (keep multi-vendor choice) | Done |
| C6 | Contract tests (mock fetch) | Done |
| C7 | Per-project BYOK credential store (replace stubs) | Later |
| C8 | Usage/cost records | Done 2026-07-23 (first-pass `usage_records`; freeze/limits later) |

**Provider set (2026-07-21 decision):** DeepSeek for text; SiliconFlow for image / video / audio. Mock remains the no-key fallback.

---

## Track D — Workflow revisit & Visual Prep depth

Do after Track C core (or in parallel with polish).

| ID | Task | Status |
|----|------|--------|
| D1 | Click completed/current workflow steps for **read-only** artifact revisit | Done 2026-07-21 |
| D2 | Visual Prep: LLM trait drafts on Character/Location + per-requirement generation prompts | Done 2026-07-21 |
| D3 | `POST .../visual-requirements/:rid/generate` (edit prompt → regenerate image) | Done 2026-07-21 |
| D4 | Arbitrary step time-travel rollback / reopen any passed gate | **Not planned** — never a first-class doc item; use current-gate `reject`/`retry`, entity unfreeze, or cancel+restart |

**Product note:** Docs never listed “click completed steps to edit history” or full timeline rollback. Track D adds **read-only revisit** only. Visual Prep aligns toward「特征/生图提示词 → 可审 → 出图」using story + approved scenes (not a Chapter file model).

---

## Track E — Looser Creative Flow (RFC)

Source of truth: [Looser-Creative-Flow-RFC.md](architecture/rfc/Looser-Creative-Flow-RFC.md) (Accepted 0.2).

Default linear Story→Video **stays**. No node canvas; no gate time-travel (D4).

| ID | Task | Notes | Status |
|----|------|-------|--------|
| E0 | Accept / revise Looser Creative Flow RFC | Scope lock + ramp (A→B→C) | Done 2026-07-23 (Accepted 0.2) |
| E1 | Slice A: scoped Scene/Shot/visual recompute via Orchestrator | Implemented as [V0.4 plan](V0.4-Modification-Plan.md) **W4** | Done 2026-07-23 |
| E2 | Slice B: asset-library image generate + Visual Prep reuse | Asset side = V0.4 **W2** (appearance variants + asset-page generate) | Done 2026-07-23 (W2); W1 injects anchors |
| E3 | Slice C: story segments (ordered Scene groupings) | Domain ADR done: [ADR-0006](architecture/adr/0006-story-segments-are-ordered-scene-groupings.md); implemented as V0.4 **W3** | Done 2026-07-23 |

**Exit criteria for Track E Slice A:** operator can recompute one Scene’s visual prep (or one Shot prompt/video) without cancel+restart; linear newcomer path still works.

---

## Track F — V0.4 Modification Plan (completed first pass)

Source of truth: [V0.4-Modification-Plan.md](V0.4-Modification-Plan.md) (from the [waoowaoo architecture review](architecture/review/Zivith-Architecture-Review-Based-on-waoowaoo.md) A1–A7 + ADR-0006). Each row is one independently mergeable workstream with acceptance criteria in the plan.

| ID | Workstream | Source | Priority | Status |
|----|------------|--------|----------|--------|
| F1 | W2 Character appearance variants (`asset_appearance_variants`) | Review A1 / RFC Slice B | P0 | Done 2026-07-23 |
| F2 | W1 Reference-image injection pipeline (ports + adapters + prompt contract) | Review A2 — biggest consistency gap | P0 | Done 2026-07-23 |
| F3 | W3 StorySegment: segmented story draft + per-segment review + Scene grouping | ADR-0006 / RFC Slice C | P1 | Done 2026-07-23 |
| F4 | W4 Scoped recompute APIs + `workflow_step_attempts` persistence | RFC Slice A / Review A3 | P1 | Done 2026-07-23 |
| F5 | W5 Candidate sets (count>1 generate + pick + no `previous*` fields) | Review A5 | P2 | Done 2026-07-23 |
| F6 | W6 Externalized versioned agent prompts (`{knowledge_context}` slot) | Review A7 | P2 | Done 2026-07-23 |
| F7 | W7 Usage records (first pass of C8; freeze/limits second pass) | Review A6 / C8 | P3 | Done 2026-07-23 |

**Exit criteria for Track F:** V0.4 plan §10 definition of done — all W1–W6 acceptance items pass, W7 first pass lands, linear newcomer path regression-free, docs synced.

---

## Track G — Real-provider stability polish (active)

Goal: make SiliconFlow / DeepSeek generation reliable for daily operator use before Phase 3 productionizing.

| ID | Task | Notes | Status |
|----|------|-------|--------|
| G1 | Canonicalize SiliconFlow model IDs (image + video) | Case-sensitive API; Qwen / Wan2.2 | Done 2026-07-24 |
| G2 | Sequential video enqueue + worker concurrency default 1 | Avoid provider burst / 429 | Done 2026-07-24 |
| G3 | I2V prefers character keyframe over location | `orderVisualMediaIdsForVideo` | Done 2026-07-24 |
| G4 | Block approving failed placeholder media | Visual + appearance approve | Done 2026-07-24 |
| G5 | UI: rerun controls inside per-card prompt areas | WorkflowPanel | Done 2026-07-24 |
| G6 | Character **turnaround** sheet (single 2×2 image) + candidate delete | Replaces four separate front/side/back/face gens; legacy keys kept | Done 2026-07-24; UX polish 2026-07-28 |
| G7 | Manual E2E: Story→Video with real SiliconFlow keys | Operator checklist after API restart | Pending |
| G8 | Per-scene review (like story segments) | Scene.state + WorkflowPanel | Done 2026-07-24 |
| G9 | Prompt-draft visual prep + deferred keyframe/video gen | Sheets/prompts drafted; operator generates one-by-one | Done 2026-07-24 |
| G10 | Prompt constructPositive dedupe | Action/Environment duplication | Done 2026-07-24 |
| G11 | Four model slots: T2I / I2I / T2V / I2V | Env + Provider panel; pick by refs | Done 2026-07-24 |
| G12 | Face close-up enforced in sheet prompt template | 2×2 + dedicated face panel; auto-append clause | Done 2026-07-24 |
| G13 | Asset list → detail page (no side panel) | `/projects/:pid/assets/:assetId` | Done 2026-07-24 |
| G14 | Resolve `cover_image` / `reference_images` to Media URLs | Fix broken list covers (bare media IDs) | Done 2026-07-24 |
| G15 | Location design sheet draft + generate APIs/UI | `POST …/location-sheet/*` | Done 2026-07-24 |
| G16 | I2I → T2I fallback on SiliconFlow 4xx/5xx (50507) | Scene keyframes with sheet refs | Done 2026-07-24 |
| G17 | Docs sync (Asset-Model, Next-Tasks, Tech Arch, agents) | This pass | Done 2026-07-28 |

**Exit criteria for Track G:** real image + video succeed with documented model IDs; failed placeholders cannot pass review; unit tests for model canonicalize + I2V media order green; character/location sheets generate and show as list covers.

**Operator checklist (G7):**

1. Restart API after `.env` / domain rebuild (`pnpm --filter @zivith/domain build` if sheet constants changed)
2. Provider panel: confirm T2I=`Qwen/Qwen-Image`, I2I=`Qwen/Qwen-Image-Edit` (or Kolors), T2V/I2V Wan2.2
3. Visual Prep → asset detail: draft + generate character turnaround → list cover visible
4. Location detail: draft + generate location sheet → list cover visible
5. Workflow visual review: generate character/location keyframes one-by-one; I2I may fall back to T2I
6. Approve visuals → shots → video with http(s) refs for I2V

---

## Track H — Entity history foundation (planned; design complete)

Goal: add queryable creative history and safe project-scoped alternative directions without replacing current domain tables or adopting full Event Sourcing. Source: [Entity + State + Timeline + Track](architecture/entity-state-timeline-track.md).

| ID | Task | Notes | Status |
|----|------|-------|--------|
| H0 | Architecture, domain, API, and migration contract | Includes failure, rollback, and two E2E examples | Done 2026-07-28 |
| H1 | Canonical Entity snapshot/event schemas | Start with Shot/PromptVersion/Output and AppearanceVariant/VisualRequirement | Planned |
| H2 | History tables, Project `main` Track, and baseline backfill | No runtime read-path switch | Planned |
| H3 | Shadow write then transactional dual write | Per-Entity feature flags and hash consistency checks | Planned |
| H4 | Read-only Timeline/revision APIs + optimistic concurrency | Cursor pagination, idempotency, 409 conflicts | Planned |
| H5 | AppearanceVariant/Shot CreativeTrack pilot | Compare and explicit merge to `main`; stale propagation required | Planned |

**Exit criteria for Track H:** all acceptance conditions in the architecture document pass; branch writes cannot mutate `main`; merge conflict and rollback tests are green; existing resource APIs remain compatible during migration.

---

## Suggested work order

```text
A1 → A2 → A5 → A3 → A4 → A6 → A7
              ↓
         Track A exit
              ↓
         B1 → B2 → B3 → B4 → (B5?)
              ↓
         Track B exit → Phase 2 closed
              ↓
         C1…C6 (Phase 2.5 core) → C7/C8 later
              ↓
         D1…D3 (revisit + visual depth) — D4 not planned
              ↓
         E0 RFC accepted (2026-07-23) + ADR-0006
              ↓
         Track F (V0.4 plan): F1 W2 → F2 W1 → F3 W3 → F4 W4 → F5 W5 → F6 W6 → F7 W7
              ↓
         Track G (provider stability polish) → then Phase 3
              ↓
         Track H implementation only after explicit scheduling; H0 design is complete
```

---

## Out of scope until later

- Full Asset taxonomy (Prop / Style / Knowledge) — Phase 4
- Production rate limits / Review Agent polish — Phase 3
- Staging cloud deploy — Phase 0 leftover, not blocking Track A
- Director Copilot sidebar — see [Director-Copilot-RFC.md](architecture/rfc/Director-Copilot-RFC.md); Phase 3+, v1 Q&A only
- Renaming historical design docs beyond the 2026-07-21 archive pass
- **Arbitrary workflow step time-travel rollback** — not documented as a deliverable; see Track D4
- **Node-based workflow canvas as primary UX** — Constitution D3; see Looser Creative Flow RFC non-goals
- **Story segment UI without persisted `StorySegment` rows** — ADR-0006 compliance rule (the ADR itself is resolved)
- **Top-level Chapter entity / cross-project global asset library / lip-sync / timeline editor** — V0.4 plan §9 explicit non-goals
- **Video/audio nonlinear timeline editor remains out of scope.** The proposed Project Timeline is an append-only creative-history view and is not an NLE timeline.

---

## How to update this file

When a task ships:

1. Mark the row done or delete it
2. Sync matching checkboxes in [Implementation-Plan.md](Implementation-Plan.md)
3. Refresh the status table in [README.md](README.md) if phase % changes
