# ADR Guide

> Architecture Decision Records — Governance for Zivith
>
> Version: 1.0
>
> Status: Ratified — companion to the Architecture Constitution
>
> Horizon: 5–10 years
>
> Related: architecture-principles.md (the Constitution), rfc-guide.md

---

## Purpose

An Architecture Decision Record (ADR) is the permanent memory of *why* Zivith is shaped the way it is. Code shows what was decided; only ADRs preserve what was rejected, what was traded away, and what evidence drove the choice.

Over a 5–10 year horizon, every person who made today's decisions will eventually be gone — replaced by new engineers, new AI agents, or their own future selves who have forgotten. ADRs exist so that no one ever has to reverse-engineer intent from implementation, and so that no principle erodes silently through a series of individually reasonable decisions.

This guide is technology-agnostic by design. It governs decisions about boundaries, contracts, and authority — not about libraries.

---

## 1. When an ADR Is Required

The Constitution (§8) classifies decisions by reversibility. That classification is the trigger.

### An ADR is **mandatory** when a decision:

| Trigger | Why it is irreversible |
|---------|------------------------|
| Changes the **domain contract** — entities, hierarchy semantics, inheritance rules, identity, approval states | Users' creative universes are stored against it (P2) |
| Changes the **meaning or lifecycle of stored creative data**, including provenance and versioning semantics | History must never be silently rewritten (§3 of the Constitution) |
| Makes or alters a **public promise** — programmable interface contracts, export formats, compatibility guarantees | Third parties build against promises; retracting one is a betrayal, not a refactor |
| Adds, removes, or redefines an **orchestration primitive** (durable step, interruption, resumption, fan-out, partial recomputation) | Every workflow definition depends on the primitive set (P5) |
| Moves a **review gate's mandatory status** in either direction | Gate placement is policy, but changing it reallocates human authority (P6) and must leave a trail |
| Alters a **capability boundary** — what the system asks of external models, or how volatility is quarantined | The boundary is what keeps the rest of the system long-lived (P4) |
| Touches **governance at the boundary** — identity, permission, budget, or rate semantics | Governance precedes autonomy (§7); weakening it is a safety event |
| **Strains or contradicts any Constitutional principle**, or resolves a conflict between principles | See §5 below |
| **Activates a deferred decision** (Constitution §11, D1–D6) or changes its revisit trigger | Deferral is itself an architectural decision; ending it must be equally deliberate |

### An ADR is **not** required for:

- Reversible, local choices — anything that can be undone by a change confined to one component behind a stable boundary.
- Implementation selection within an already-decided boundary (which library, which algorithm, which storage engine).
- Restating what the Constitution already settles. An ADR that merely re-argues a ratified principle is noise.

**The test:** *if this decision turns out to be wrong in two years, what does undoing it cost?* If the answer is "a contained rewrite," decide quickly and locally. If the answer involves migrating stored data, re-promising third parties, or renegotiating human authority — write the ADR.

Spending ceremony on reversible decisions is as much a failure as skipping ceremony on irreversible ones. When in doubt, ask the test question, not this table.

---

## 2. Relationship to the Architecture Constitution

The hierarchy of authority is strict and one-directional:

```
Architecture Constitution        (what must remain true)
        ↓ constrains
ADRs                             (how the Constitution is applied to a decision)
        ↓ constrain
RFCs and implementation plans    (how a change is designed and executed)
```

Rules of the relationship:

1. **Every ADR must cite the Constitution.** The template's *Principles at Stake* section is not optional. An ADR must name which principles the decision **serves** and which it **strains**. "None strained" is a legitimate answer only if argued, not asserted.
2. **An ADR that silently contradicts the Constitution is void** — this restates the Constitution's own supremacy clause. Discovering such an ADR later means one of the two documents must be formally corrected.
3. **ADRs interpret; they do not amend — except one special class.** A **Constitutional Amendment ADR** is the *only* mechanism by which the Constitution changes (§8: "the constitution amends; it does not drift"). It carries a heavier burden: the evidence that motivated the change, the exhaustion of the reconfiguration ladder (models → workflow definitions → gate policy → domain deepening → amendment), and the full text of the modified principle.
4. **The Constitution wins ties.** When a decision is attractive and a principle forbids it, the default outcome is that the decision loses. The burden of proof is always on the change, never on the principle.
5. **Precedent accumulates downward.** Accepted ADRs bind future ADRs the way the Constitution binds them, until superseded. A new ADR may overturn an old one only explicitly (see Lifecycle, §6).

---

## 3. ADR Standard Template

One file per decision: `docs/architecture/adr/NNNN-short-slug.md`, numbered sequentially, never renumbered, never deleted.

```markdown
# ADR-NNNN: <Decision title — an active sentence, not a topic>

- **Status:** Draft | Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
- **Date:** YYYY-MM-DD (of the status shown)
- **Deciders:** <who holds authority for this decision>
- **Class:** Standard | Constitutional Amendment
- **Reversibility:** Reversible | Costly | Irreversible

## Context

What situation forces a decision now? What evidence exists?
State the forces neutrally — a reader should not be able to guess
the outcome from this section.

## Principles at Stake

- **Serves:** <principle> — <how>
- **Strains:** <principle> — <how, and why this is acceptable> | None (argued)

## Decision

The decision, in one or two declarative sentences. Present tense.
("We treat X as Y." — not "we should consider…")

## Alternatives Considered

For each rejected alternative: what it was, what it offered,
and the specific reason it lost. An ADR with no real alternatives
was not a decision.

## Trade-off Record

| We gained | We gave up | Horizon |
|-----------|------------|---------|
| ...       | ...        | when this trade should be re-examined |

## Consequences

What becomes easier, what becomes harder, what new obligations exist
(migrations owed, docs to update, revisit triggers to register).
Include negative consequences honestly — they are this section's
entire reason to exist.

## Compliance

How will we know this decision is actually being followed?
(A boundary that can be violated invisibly will be.)
```

Keep ADRs short — one to three pages. Length is usually a symptom of an undecided decision or several decisions bundled into one record. Split bundles.

---

## 4. How to Record Architectural Trade-offs

Trade-offs are the substance of architecture; everything else is drawing boxes. The rules:

1. **Name what was sacrificed, in the sacrificed party's own terms.** "We chose consistency over availability" is honest. "We chose the best of both worlds" is a sign the trade-off was not understood. If an ADR contains no sacrifice, either the decision was trivial (no ADR needed) or the analysis is incomplete.
2. **Attach a horizon to every trade.** Trades are made against a context — model reliability, team size, user count — that will change. Each row of the trade-off table names the condition under which the trade should be re-examined ("when agent-initiated traffic exceeds human traffic," "when the export format has external consumers"). This converts trade-offs from permanent dogma into monitored positions.
3. **Distinguish the three currencies.** Most Zivith trades exchange between: **optionality** (keeping futures open), **simplicity** (less to build and hold in one's head), and **capability** (what users get now). Naming which currency was spent prevents the most common self-deception — buying capability with optionality while believing it was bought with simplicity.
4. **The Constitution's own Resolved Tensions are the house style.** Each of them (automation vs. mandatory gates; open format vs. premature publication; workflow-as-data vs. no node canvas; assembly layer vs. no editor) states both sides at full strength, then rules. Imitate that structure: a trade-off recorded with one side strawmanned will not survive the first person who held the strawmanned view.

---

## 5. Handling Decisions That Conflict with Existing Principles

A proposed decision will eventually collide with the Constitution. The procedure is a ladder — stop at the first rung that resolves the conflict:

**Rung 1 — Re-examine the diagnosis.** Most "principle conflicts" are misdiagnosed layer conflicts. Apply the Constitution's reconfiguration ladder (§8): can the need be met by swapping behind a capability boundary, reshaping a workflow definition, or shifting gate *policy*? A conflict that dissolves under reframing was never a conflict. (Precedent: "workflow-as-data vs. no node canvas" dissolved entirely once engine and UI were separated by layer.)

**Rung 2 — Reject the decision.** The default. The principle stood a longer test than the proposal has. Record the rejection as a short ADR anyway if the proposal is likely to recur — a documented "no, and here is why" prevents the same debate annually.

**Rung 3 — Constrain the decision.** Sometimes the decision can proceed inside a fence that protects the principle: time-boxed, scoped to an experiment, or barred from touching stored data and public promises. The ADR must then state the fence and the tripwire that tears the experiment down.

**Rung 4 — Amend the Constitution.** If the principle itself is wrong — the world changed, the evidence is strong, rungs 1–3 are exhausted — write a Constitutional Amendment ADR. Never preserve both a principle and a decision that contradicts it: an architecture that contains its own contradictions delegates the real decision to whoever implements last.

What is **never** acceptable: proceeding while the conflict stands unresolved, or resolving it implicitly in code. The Constitution's rule is explicit — practice diverging from principle means one of them is wrong, and the divergence itself must be adjudicated, not normalized.

---

## 6. ADR Lifecycle

```
Draft ──▶ Proposed ──▶ Accepted ──▶ Superseded by ADR-XXXX
                │                └─▶ Deprecated
                └─▶ Rejected (retained)
```

| Status | Meaning | Rules |
|--------|---------|-------|
| **Draft** | Being written; not yet under review | May change freely |
| **Proposed** | Under review by the deciders | Review window is bounded; silence is not consent — a Proposed ADR that nobody decides is escalated, not merged |
| **Accepted** | In force; binds future work | **Immutable** except for status changes and an append-only addendum section. To change the decision, write a new ADR |
| **Rejected** | Considered and declined | Retained forever; rejections are precedent too |
| **Superseded** | Replaced by a newer ADR | Both records carry cross-links; the old ADR is history, not error |
| **Deprecated** | No longer applies (context vanished) and nothing replaced it | Requires a dated note explaining what changed |

Lifecycle rules that make the system durable:

1. **Append-only memory.** Accepted ADRs are never edited into agreement with the present. If reality diverged, the divergence is documented in a superseding record. A decision log that can be rewritten is not a log.
2. **Every ADR names its revisit triggers** (from the trade-off horizons, §4). A periodic architecture review walks the accepted set and checks triggers — this is how the organization notices that a trade's context has expired *before* it fails in production.
3. **Superseding is honorable.** An ADR overturned by better evidence did its job: it made the original reasoning cheap to re-examine. The failure mode to fear is not superseded ADRs; it is decisions with no record to supersede.
4. **Constitutional Amendment ADRs additionally update the Constitution's text** in the same change, so the two documents can never disagree for longer than one commit.
