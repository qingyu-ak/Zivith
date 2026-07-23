# Looser Creative Flow RFC (Thin)

> Zivith「更松创作流」方向稿 — partial recompute, asset-first visuals, optional story segmentation
>
> Version: 0.2
>
> Status: Accepted (2026-07-23) — scope lock + capability ramp; not an implementation checklist
>
> Opened: 2026-07-22 (product direction); 0.2 update 2026-07-23 — Slice C domain ADR accepted ([ADR-0006](../adr/0006-story-segments-are-ordered-scene-groupings.md)); implementation scheduled via [V0.4-Modification-Plan.md](../../V0.4-Modification-Plan.md) (Slice A = W4, Slice B asset side = W2, Slice C = W3)
>
> Related: architecture-principles.md (P5, P6), AI-Agent-Collaboration.md §4–5, Asset-Model.md, Design-Philosophy.md, Next-Tasks.md, Director-Copilot-RFC.md

---

## 1. Purpose

Record how Zivith moves from today’s **single linear Story→Video run** (MVP guided path) toward a **looser, still hierarchical** creative loop — without becoming a node canvas, a chapter-file editor, or a gate-bypass chat.

Creators today can finish a full mock/real pipeline, but feel the flow is “绑死”: story arrives as one block; visuals exist mainly inside the workflow gate; scene/shot work cannot be locally re-run without cancel+restart. That friction is real; the architecture already names the cure (workflow-as-data, partial recomputation) but the product surface has not landed it yet.

---

## 2. Problem statement (user world)

A creator who has approved earlier gates cannot:

1. **Re-run only one Scene / Shot / visual requirement** after a local edit without restarting the whole run.
2. **Grow Character/Location key art in the asset library** independently of an active Story→Video run, then reuse those images at Visual Prep.
3. **Iterate story in smaller narrative units** (e.g. by act / scene beat) instead of one monolithic Story Agent output.

Cost: abandoned runs, duplicated briefs, approving placeholder visuals just to unblock the DAG, and loss of trust that “Shot is the core / assets persist.”

---

## 3. Vision alignment

Advances **alternating operators** (human directs at finer grain) and **compounding universes** (assets and approved visuals accumulate outside a single run). Regeneration superiority improves when partial recompute is first-class. This is not substrate work.

---

## 4. Constitutional check

| Principle | Effect |
|-----------|--------|
| **P5** Workflow is data; primitives include fan-out and **partial recomputation** | **Serves** — this RFC is the product face of those primitives |
| **P6** Human authority is architectural; gate placement is policy | **Serves** — finer loops must keep review capability; mandatory gates (visual-assets, prompt) stay unless a separate ADR moves them |
| **P1** Intent is asset; outputs disposable | **Serves** — local regen regenerates outputs from intent |
| **P3** Headless core | **Serves** — every new action is an API/Orchestrator operation first |
| **§3 deepen, don’t widen** | **Constraint** — prefer deepening Story/Scene/Shot/Asset + Orchestrator; no new top-level “Chapter file” product unless ADR proves hierarchy insufficient |
| **D3** No node canvas as primary UX | **Must not violate** — guided hierarchy + panels remain default |
| **Never list / Copilot** | Advisory surfaces must not bypass gates (same rule as Director Copilot) |

**Strains:** richer recompute UX can tax *Simple by Default*. Mitigation: keep the linear Story→Video start form as the default; looser actions appear on existing entities (Scene, Shot, Asset) and current-gate retry — not a second home screen.

---

## 5. Decisions (locked for v0.1)

| Topic | Decision |
|-------|----------|
| Default path | Keep **guided linear Story→Video** as the simple default start |
| Not the primary UX | **No** node-graph canvas; **no** free-form “chapter document” as the workspace |
| Engine direction | Implement **partial recomputation** against existing Orchestrator + domain IDs |
| Gate policy | Mandatory **visual-assets** and **prompt** reviews remain; finer loops still stop at those gates when applicable |
| Time-travel | **Arbitrary reopen of any past gate** stays **out of scope** (same as Next-Tasks D4) — use current-gate reject/retry, entity unfreeze, cancel+restart, or scoped recompute |
| Story segmentation | **ADR resolved (2026-07-23):** [ADR-0006](../adr/0006-story-segments-are-ordered-scene-groupings.md) — segments are ordered Scene groupings inside Story (`StorySegment`), not a top-level Chapter; UI segments must be backed by persisted entities |
| Schedule | Does **not** block finishing Phase 2.5 C7/C8; Slice A may start in parallel after this RFC is accepted |

---

## 6. Capability ramp

```text
Slice A  Partial recompute (Scene / Shot / visual requirement)
    ↓ evidence: operators re-run one unit without cancel+restart
Slice B  Asset-library image generate + approve → Visual Prep reuse
    ↓ evidence: key art created with no active story-to-video run
Slice C  Story segmentation (acts / beats) — only after domain ADR
```

### Slice A — Partial recompute (first build)

**In scope:**

- From an existing Story / Scene / Shot / `VisualAssetRequirement`, request **scoped** agent+generation work through Orchestrator APIs
- Mark downstream **non-approved** artifacts stale per [AI-Agent-Collaboration.md §4.1](../../AI-Agent-Collaboration.md); require re-approval where gates already apply
- UI entry points on entity pages / WorkflowPanel current gate (“重跑本场景视觉准备”“重跑本镜头提示词/视频”) — Chinese copy
- Provenance: each recompute is a recorded generation/workflow transaction (P7)

**Out of scope for Slice A:**

- Reopening completed gates as editable history (D4)
- Parallel multi-run editing of the same Shot without conflict rules
- Story act/beat model

**Promotion evidence → Slice B:** at least one operator completes “edit one Scene field → recompute visuals → approve → continue” without cancel+restart, with tests covering stale marking.

### Slice B — Asset-first visuals

**In scope:**

- Asset Agent / asset library: generate Character/Location reference images **outside** Story→Video
- Approved Media written to Asset `reference_images[]`; Visual Prep **prefers reuse** when Scene bindings allow ([Asset-Model.md](../../Asset-Model.md))
- Same image providers/adapters as Phase 2.5; no provider concepts in domain (P4)

**Out of scope for Slice B:** full Prop/Style/Knowledge taxonomy UI (Phase 4); global cross-project asset library

**Promotion evidence → Slice C:** creator can produce approved key art with zero workflow run, then start Story→Video and see reuse recommendations.

### Slice C — Story segmentation

**ADR question answered** by [ADR-0006](../adr/0006-story-segments-are-ordered-scene-groupings.md) (Accepted 2026-07-23): an act/chapter is a **StorySegment — an ordered grouping of Scenes inside a Story**, carrying its own draft text and approval state; not a new hierarchy node, not a document file. Scene ownership (`story_id`) is unchanged; `segment_id` is an optional grouping reference.

Implementation is scheduled as [V0.4-Modification-Plan.md](../../V0.4-Modification-Plan.md) **W3**: segmented Story Agent output, per-segment story review within the existing story gate, Scene Agent expansion per approved segment.

Standing rule remains: **no** UI segments without persisted StorySegment rows.

---

## 7. Positioning

```text
Default:  Brief → linear WorkflowPanel gates (unchanged simple path)

Loose:    Project hierarchy entities
            ├─ Asset library  →  depict / approve key art (Slice B)
            ├─ Scene / Shot   →  scoped recompute (Slice A)
            └─ Story          →  segmented draft (Slice C, after ADR)
                    │
                    └─ all paths still hit Orchestrator + review gates
```

- **Is:** finer-grained direction on the existing hierarchy  
- **Is not:** second product; chatbot; node IDE; bypass of visual-assets / prompt gates  

---

## 8. Relationship to existing systems

| Component | Role |
|-----------|------|
| `WorkflowOrchestrator` / workflow-as-data | Gains scoped recompute plans; remains SoT for runs |
| `MockWorkflowRunner` / agents | Stage specialists invoked for a **subset** of entities |
| Asset Agent + Asset CRUD | Primary surface for Slice B |
| WorkflowPanel | Remains gate UI; gains “scoped retry” affordances, not a canvas |
| Shot Editor | Remains field-level SoT; triggers Shot-scoped regen |
| Director Copilot | May later *explain* or *propose* scoped recompute (C); never auto-approve |

Docs already describe partial regen and Asset Agent outside the main pipeline; this RFC makes that the **scheduled product track**, not aspirational text.

---

## 9. Explicit non-goals

- Node-based workflow canvas as primary (or rushed secondary) experience — Constitution **D3**
- Arbitrary step time-travel / reopen any passed gate as first-class — Next-Tasks **D4**
- Replacing Project → Story → Scene → Shot with a novel/script document model
- Auto-approving mandatory gates from any assistant
- Collapsing Visual Prep away without an ADR on gate policy
- Blocking Phase 2.5 BYOK/usage (C7/C8) on this work

---

## 10. Risks (fixed categories)

| Category | Assessment | Mitigation / owner |
|----------|------------|--------------------|
| Domain contract | Slice C could tempt a new top-level entity | Slice C blocked on ADR; deepen Story first — author + domain reviewer |
| Stored-data | Scoped recompute might orphan Media or leave stale approvals | Explicit stale/pending states; never silent reinterpret — API owner |
| Promise | “Recompute” API shapes may churn | Keep behind Orchestrator; version run `input`/`state` — engine owner |
| Authority | Scoped path might skip visual-assets / prompt | Hard rule: same gates when regenerating those artifacts — product decider |
| Economic | Fan-out recompute can multiply spend | Meter each job (P7); confirm before batch regen — generation owner |
| Lock-in | None expected if adapters stay behind ports | P4 review on PRs |
| Complexity | Two mental models (linear vs loose) | Default remains linear start; loose actions contextual — UX reviewer |

---

## 11. Migration plan

1. **Forward:** Existing `story_to_video` runs keep current semantics; new scoped APIs are additive.
2. **In-flight:** Runs paused at a gate continue under old runner behavior until completed/cancelled; scoped recompute targets **entities**, not rewriting mid-gate history.
3. **Rollback:** Disable scoped UI/flags; linear panel remains; no forced data rewrite.
4. **Coexistence:** Linear default + scoped actions indefinitely is intended (not two engines forever — one engine, two entry styles).
5. **External consumers:** No public `.ziv` format change (D1 untouched).

---

## 12. Acceptance criteria

### Problem criteria

- [ ] Creator can recompute **one Scene’s visual prep** (or one Shot’s prompt/video) without cancelling the parent story-to-video philosophy (Slice A).
- [ ] Creator can generate and approve Character/Location key art from the asset library with **no** active Story→Video run (Slice B).
- [ ] Linear brief→gates path still works for a newcomer in one sitting (Simple by Default).

### Constitutional criteria

- [ ] P1–P4, P6–P8 checklist from rfc-guide §6 layer 2 holds for each slice.
- [ ] D3 not violated (no primary node canvas).
- [ ] D4 not contradicted (no arbitrary gate time-travel).

### Governance criteria

- [x] Slice C ADR written before any act/beat UI — [ADR-0006](../adr/0006-story-segments-are-ordered-scene-groupings.md), Accepted 2026-07-23.
- [ ] Next-Tasks Track E updated per slice; Implementation-Plan checkboxes synced.
- [ ] Irreversible gate-policy changes spawn ADRs.

---

## 13. Traceability (product Q&A)

| Question | Choice |
|----------|--------|
| Keep linear default? | **Yes** |
| First slice? | **A — partial recompute** |
| Asset-library out-of-band depict? | **Yes — Slice B** |
| Story act/beat now? | **Yes — ADR-0006 accepted; ordered Scene groupings inside Story (V0.4 W3)** |
| Node canvas / time-travel gates? | **No** |

---

## 14. When to expand this RFC

Before or during Slice A implementation, expand with:

- Exact Orchestrator API shapes for scoped plans  
- Stale-propagation matrix (tests)  
- Conflict rules if two recomputes hit the same Shot  
- UI copy and placement on Scene / Shot / Asset pages  

Until acceptance of Slice A scope, treat this document as a **scope lock**, not a build ticket dump.
