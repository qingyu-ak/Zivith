# RFC Guide

> Request for Comments — Change Governance for Zivith
>
> Version: 1.0
>
> Status: Ratified — companion to the Architecture Constitution
>
> Horizon: 5–10 years
>
> Related: architecture-principles.md (the Constitution), adr-guide.md

---

## Purpose

An RFC is how a significant change earns the right to be built. Where an ADR records a *decision* (usually one page, one question, one answer), an RFC designs a *change*: the problem, the proposal, the risks, the migration, and the definition of done.

The two artifacts divide the work:

| | RFC | ADR |
|---|-----|-----|
| Answers | "Should we build this, and how?" | "Which way did we decide, and why?" |
| Shape | A design under discussion | A decision, recorded |
| Lifetime | Active until implemented or rejected, then archival | Binding until superseded |
| Relationship | One RFC may **spawn several ADRs** for the irreversible decisions it contains | An ADR may exist without any RFC |

The precedent for house style is the Director Copilot RFC: it locked scope, named explicit non-goals, recorded its Q&A traceability, and deliberately deferred everything it did not need to decide. That discipline — *deciding little, but firmly* — is what this guide generalizes.

---

## 1. When to Create an RFC

### An RFC is required when a change:

- **Crosses context boundaries** — it touches more than one bounded area of the system, so no single owner can evaluate it alone.
- **Adds a new user-facing capability with architectural surface** — a new entity in the creative hierarchy, a new stage in a workflow, a new kind of client at the boundary.
- **Touches a deferred decision** (Constitution §11, D1–D6) — activating, reshaping, or re-deferring one. The deferral registry is a fence; opening a gate in it is always deliberate.
- **Requires a migration** — any change whose rollout involves transforming stored creative data, workflow definitions, or contracts already in use.
- **Spends more than trivial effort** — as a heuristic, anything one person cannot design, build, and validate inside a short iteration deserves written scrutiny before the spend.
- **Changes who or what holds authority** — new automation defaults, new gate placements, new classes of caller.

### An RFC is not required for:

- Work that implements an already-accepted RFC or ADR.
- Reversible improvements inside one context behind stable boundaries.
- Restoring conformance with the Constitution (that is not a proposal; it is a repair).

When a change needs no RFC but contains one irreversible decision, skip the RFC and write the ADR directly.

---

## 2. Feature Proposal Process

Every RFC begins as a proposal with five mandatory parts. A proposal missing any of them is returned, not reviewed.

**1. Problem statement — in the user's world, not the system's.**
What can a creator (human or agent) not do today, and what does it cost them? A problem stated as "we lack component X" is a solution in disguise; restate it until it names a person and a frustration.

**2. Vision alignment.**
One paragraph placing the proposal against the North Star ladder (Constitution §10): which measure does it advance — regeneration superiority, compounding universes, alternating operators, or the assumed substrate? A proposal that advances none of them may still be worthwhile (defensive work, debt repayment) but must say so honestly rather than borrow the vision's authority.

**3. Constitutional check.**
The same *Principles at Stake* analysis an ADR requires: which principles the proposal serves, which it strains, and whether it approaches anything in the Never list (§9) or the deferral registry (§11). This check happens at proposal time, *before* design effort is spent — the cheapest moment to discover that a proposal is unconstitutional.

**4. Scope lock and non-goals.**
The non-goals section is mandatory and is read first by reviewers. Scope creep does not arrive by decision; it arrives by omission. Following the Director Copilot precedent: state what the feature *is not*, what it *must not bypass*, and which adjacent capabilities are explicitly out of scope even though readers will assume them.

**5. Capability ramp (if applicable).**
If the feature will grow in stages, define the stages now — what the first slice does, what evidence promotes it to the next slice. A ramp defined up front prevents each stage from silently expanding into the next.

---

## 3. Technical Design Review Process

```
Draft ──▶ Review ──▶ Revision ──▶ Decision ──▶ (spawned ADRs) ──▶ Implementation
             ▲            │
             └────────────┘  (bounded iterations)
```

**Roles.** Every RFC has one **author** (accountable for the document), named **reviewers** (accountable for the dimensions they review), and one **decider** — the person who owns the affected boundary. Review is advice; decision is singular. An RFC with a committee for a decider has no decider.

**The review window is bounded.** Reviews that never conclude are a governance failure worse than a wrong decision, because they cannot be superseded — there is nothing on record. If the window closes without convergence, the decider decides with the objections attached.

**What reviewers examine, in priority order:**

1. **Boundary impact** — which contracts change, which stay stable, and whether the change strengthens or erodes the quarantine of volatility (P4). A design that requires two boundaries to know each other's internals is redesigned before any other feedback matters.
2. **Reversibility distribution** — which parts of the design are reversible experiments and which are one-way doors. Good designs concentrate their irreversibility into a few small, explicit decisions (which then become ADRs) and keep everything else swappable.
3. **Authority and gates** — whether human review capability survives everywhere the Constitution guarantees it (P6), and whether any new caller class arrives with governance already attached (§7: governance precedes autonomy).
4. **Provenance and accounting** — whether every new act of generation the feature introduces remains a recorded, priced, reproducible transaction (P7).
5. **Simplicity of the default path** — whether a newcomer's experience got heavier. Powerful-when-needed must not tax simple-by-default.

**Silence is not approval.** Each named reviewer either approves, objects with reasons, or explicitly abstains. Unreviewed dimensions are listed in the decision record as accepted blind spots.

---

## 4. Risk Assessment

Every RFC carries a risk table. Zivith's risk categories are fixed — they mirror what the Constitution declares unrecoverable — so that no RFC can quietly omit the category it scores worst on:

| Category | The question | Constitutional anchor |
|----------|--------------|----------------------|
| **Domain contract risk** | Could this force a breaking change to the creative hierarchy's semantics later? | P2 |
| **Stored-data risk** | Could a creator's existing universe be corrupted, orphaned, or silently reinterpreted? | §3, §8 (compatibility debts) |
| **Promise risk** | Does this create a public promise (interface, format, behavior) we may need to retract? | §4, D1 |
| **Authority risk** | Could automation act beyond what a human approved, or a gate be bypassed in an edge path? | P6, §6 |
| **Economic risk** | Could this spend money without bound, or without attribution? | P7, §7 |
| **Lock-in risk** | Does this make any single external provider load-bearing, or make leaving Zivith harder? | P4, §9 |
| **Complexity risk** | Does this add a concept the domain must carry forever? | §3 (grow by deepening) |

For each relevant category: **likelihood × impact × detectability**, plus a mitigation. Detectability matters as much as impact — a risk that manifests silently (a gate bypassed with no trace, a budget exceeded with no alarm) is scored one level worse than the same risk with an alarm attached.

Two rules of honesty:

- **A risk without an owner is not mitigated.** Every mitigation names who would act and what tripwire triggers them.
- **"Unlikely" requires an argument.** The phrase is banned unless followed by "because."

---

## 5. Migration Plan

Required whenever the change touches anything already stored, promised, or in flight. The Constitution's rule is absolute: *compatibility debts are repaid, never defaulted* — if a capability must die, its data must have somewhere to go.

A migration plan answers five questions:

1. **Forward path.** How does every existing artifact — creative data, workflow definitions, in-progress runs, exported archives — arrive in the new world? "Users recreate it" is not a path; it is a default on the debt.
2. **In-flight work.** Long-running workflows may be *paused at a gate for weeks* by design (§5: interruption is a healthy state). The migration must define what happens to work that is mid-interruption when the change lands — resumed under old semantics, translated, or explicitly parked with the owner notified.
3. **Rollback.** If the change is withdrawn after partial rollout, what happens to artifacts created under the new semantics? A migration with no rollback story is an irreversible decision and must be flagged as such in the spawned ADR.
4. **Coexistence window.** Old and new semantics will overlap during rollout. State how long, what runs in both worlds, and what ends the window. Indefinite coexistence is a decision to maintain two systems forever — if that is intended, say so and price it.
5. **External consumers.** Anything that crossed the boundary — exports taken, API contracts used, handoff links shared — is owed either continuity or a documented, dated deprecation with a destination.

---

## 6. Acceptance Criteria

An RFC is not accepted when its design is admired; it is accepted when its finish line is defined. Acceptance criteria are written *before* implementation begins and have three layers:

**1. Problem criteria — did the frustration go away?**
Restated from the problem statement in verifiable form: the creator (or agent) who could not do X can now do X, observable in the system's own records. Criteria phrased about the system ("the module exists") instead of the user are returned for rewriting.

**2. Constitutional criteria — is the system still itself?**
A fixed checklist, inherited by every RFC:

- Every new artifact is traceable to its intent, and regenerable from it (P1).
- No capability was introduced that exists only in one client surface (P3).
- No provider concept leaked past a capability boundary (P4).
- Human review capability exists at every new step; mandatory gates were not moved without their own ADR (P6).
- Every new generation path is metered, budgeted, and attributed (P7).
- Whatever the feature learned from users is captured, not discarded (P8).
- Export still contains everything, including artifacts this feature created (§4).

**3. Governance criteria — is the paper trail complete?**

- Irreversible decisions inside the RFC are recorded as ADRs, cross-linked.
- The deferral registry (§11) is updated if the RFC touched it.
- Migration debts are either repaid or scheduled with owners.
- Revisit triggers from the risk table are registered where the periodic architecture review will find them.

An RFC whose implementation meets layers 1 and 3 but fails layer 2 is not "done with caveats." It is not done — layer 2 is the definition of the product.

---

## Closing Rule

Process is a servant. If this guide ever makes a right decision impossible — rather than making wrong decisions visible — the guide is the defect, and amending it follows the same path as everything else: a Constitutional-class ADR, with the evidence attached.
