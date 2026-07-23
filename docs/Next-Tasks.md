# Next Tasks

> Engineering backlog for the active implementation track
>
> Status: Active
>
> Synced: 2026-07-23
>
> Priority policy: **V0.4 plan first** — Tracks A–D are closed or later-scoped; active work follows [V0.4-Modification-Plan.md](V0.4-Modification-Plan.md) (W2 → W1 → W3 → W4 → W5 → W6 → W7)
>
> Related: [Implementation-Plan.md](Implementation-Plan.md), [Technical-Architecture.md](Technical-Architecture.md)

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
| C8 | Usage/cost records | Later |

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
| E1 | Slice A: scoped Scene/Shot/visual recompute via Orchestrator | Implemented as [V0.4 plan](V0.4-Modification-Plan.md) **W4** | Open — via Track F |
| E2 | Slice B: asset-library image generate + Visual Prep reuse | Asset side = V0.4 **W2** (appearance variants + asset-page generate) | Done 2026-07-23 (W2); W1 injects anchors |
| E3 | Slice C: story segments (ordered Scene groupings) | Domain ADR done: [ADR-0006](architecture/adr/0006-story-segments-are-ordered-scene-groupings.md); implemented as V0.4 **W3** | Open — via Track F |

**Exit criteria for Track E Slice A:** operator can recompute one Scene’s visual prep (or one Shot prompt/video) without cancel+restart; linear newcomer path still works.

---

## Track F — V0.4 Modification Plan (active)

Source of truth: [V0.4-Modification-Plan.md](V0.4-Modification-Plan.md) (from the [waoowaoo architecture review](architecture/review/Zivith-Architecture-Review-Based-on-waoowaoo.md) A1–A7 + ADR-0006). Each row is one independently mergeable workstream with acceptance criteria in the plan.

| ID | Workstream | Source | Priority | Status |
|----|------------|--------|----------|--------|
| F1 | W2 Character appearance variants (`asset_appearance_variants`) | Review A1 / RFC Slice B | P0 | Done 2026-07-23 |
| F2 | W1 Reference-image injection pipeline (ports + adapters + prompt contract) | Review A2 — biggest consistency gap | P0 | Done 2026-07-23 |
| F3 | W3 StorySegment: segmented story draft + per-segment review + Scene grouping | ADR-0006 / RFC Slice C | P1 | Open |
| F4 | W4 Scoped recompute APIs + `workflow_step_attempts` persistence | RFC Slice A / Review A3 | P1 | Open |
| F5 | W5 Candidate sets (count>1 generate + pick + no `previous*` fields) | Review A5 | P2 | Open |
| F6 | W6 Externalized versioned agent prompts (`{knowledge_context}` slot) | Review A7 | P2 | Open |
| F7 | W7 Usage records (first pass of C8; freeze/limits second pass) | Review A6 / C8 | P3 | Open |

**Exit criteria for Track F:** V0.4 plan §10 definition of done — all W1–W6 acceptance items pass, W7 first pass lands, linear newcomer path regression-free, docs synced.

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

---

## How to update this file

When a task ships:

1. Mark the row done or delete it
2. Sync matching checkboxes in [Implementation-Plan.md](Implementation-Plan.md)
3. Refresh the status table in [README.md](README.md) if phase % changes
