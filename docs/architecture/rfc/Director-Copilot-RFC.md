# Director Copilot RFC (Thin)

> Zivith 项目侧栏「导演副驾驶」方向稿
>
> Version: 0.1
>
> Status: Draft — scope lock only; not an implementation spec
>
> Decided: 2026-07-21 (product Q&A)
>
> Related: Design-Philosophy.md, AI-Agent-Collaboration.md, Implementation-Plan.md, Next-Tasks.md

---

## 1. Purpose

Record the product boundary for a **project-scoped Director Copilot** so later work does not drift into a global chatbot or a bypass around the creative hierarchy.

Zivith remains a structured filmmaking OS (Story → Scene → Visual Prep → Shot → Prompt → Video). The Copilot is a **side assistant**, not the primary creation surface.

---

## 2. Decisions (locked)

| Topic | Decision |
|-------|----------|
| Placement | **Project page only**, bound to the current `projectId` |
| Not | No studio-global chat; no standalone “chat home” |
| v1 capability | **Q&A only** — explain project state, hierarchy, and where the workflow is stuck |
| Later capability | **C then D**: propose/execute workflow commands with confirmation; then edit domain objects with confirmation |
| Review gates | Copilot **must not** bypass mandatory gates (e.g. visual-assets, prompt review) |
| Schedule | **Phase 3+**; does **not** block Phase 2.5 provider work |

---

## 3. Positioning

```text
User ↔ Project sidebar Copilot
         │
         ├─ reads Project / Story / Scene / Shot / Workflow state
         ├─ answers questions in Chinese UI terms
         └─ (later) maps intent → Orchestrator / Agents / CRUD
                    with explicit user confirmation
```

- **Is:** project co-pilot / director’s aide  
- **Is not:** end-to-end video chatbot; replacement for Shot Editor or WorkflowPanel  
- Aligns with Design Philosophy: *Zivith is not an AI chatbot*

---

## 4. Capability ramp

### v1 — Answer only (Phase 3+ first slice)

In scope:

- Summarize current project structure (stories, scenes, shots, assets)
- Explain active or latest workflow run status and awaiting review step
- Point users to the right screen (e.g. “去工作流审核提示词”“打开某镜头编辑”)
- Answer “what does this gate mean?” style questions

Out of scope for v1:

- Starting or retrying workflows
- Approving review gates
- Mutating Story / Scene / Shot / Asset fields
- Calling real video/image providers directly

### Later — Command then edit (after v1 proves useful)

1. **Commands (C):** with confirmation, start/retry a workflow stage, adjust automation levels, cancel a run — always through existing Orchestrator APIs; never skip mandatory reviews  
2. **Edits (D):** with confirmation, patch domain objects via existing CRUD; Copilot drafts the change, human confirms

Suggested next-step *advice* inside answers is allowed in v1 (text only). Actually performing those steps is C/D.

---

## 5. Relationship to existing agents

| Component | Role vs Copilot |
|-----------|-----------------|
| Orchestrator | Source of truth for workflow; Copilot may later *request* plans, not replace the DAG |
| Story / Scene / Shot / Prompt / Asset Agents | Stage specialists; Copilot does not absorb their jobs |
| WorkflowPanel | Human review UI remains authoritative for gates |
| Shot Editor | Authoritative for field-level creative edits |

Copilot may use the same LLM provider adapter as other text agents (e.g. DeepSeek after Phase 2.5), but with a **read-mostly** tool surface in v1.

---

## 6. UI sketch (non-binding)

- Collapsible **right sidebar** on the project page  
- Thread scoped to `projectId` (optional: clear thread / new thread)  
- Show “只读问答” badge in v1  
- Deep links into workflow panel or shot routes when relevant  

Exact layout, persistence, and streaming UX are deferred to a full design pass before implementation.

---

## 7. Explicit non-goals

- Global chat across all projects as the default home  
- Auto-approving mandatory review gates from chat  
- Generating final videos solely from a free-form conversation  
- Shipping Copilot before or instead of Phase 2.5 providers  

---

## 8. When to expand this RFC

Before implementation, expand with Q&A on:

- Tool/function list and permissions  
- Context packing (what Project state is injected)  
- Confirmation UX for C/D  
- Audit logging of Copilot-initiated actions  
- Retention of chat transcripts  

Until then, treat this document as a **scope lock**, not a build checklist.

---

## 9. Traceability

| Source | Choice |
|--------|--------|
| Q1 Placement | A — project page only |
| Q2 Capability | A first; later C then D |
| Q3 Gates | A — cannot bypass mandatory gates |
| Q4 Schedule | A — Phase 3+; Phase 2.5 unblocked |
