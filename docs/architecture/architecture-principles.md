# Zivith Architecture Principles

> The Architectural Constitution of Zivith
>
> Version: 1.0
>
> Status: Ratified — living document, amendable only by explicit ADR
>
> Horizon: 5–10 years
>
> Related: Design-Philosophy.md, Core-Domain-Model.md, Technical-Architecture.md, AI-Agent-Collaboration.md

---

## About This Document

This is not an implementation document. It names no framework, no database, no queue, no programming language, and no AI model — deliberately. Everything it omits is expected to be replaced several times within its horizon. Everything it states is expected to survive those replacements.

Every future ADR, RFC, and implementation plan must be able to answer one question: **which principle in this document does your decision serve, and which does it strain?** A decision that strains a principle is not forbidden — but it must say so explicitly and argue its case. A decision that quietly contradicts this document is void.

Where earlier architecture reviews produced recommendations that conflict with each other, this document does not preserve both. Each conflict is resolved here, once, with reasoning. These resolutions are marked **Resolved Tension** throughout.

---

## 1. Vision

Zivith is an AI-native creative operating system for filmmaking.

"Operating system" is not a marketing metaphor. It is an architectural commitment with three pillars, and this entire constitution is an elaboration of them:

| Pillar | OS analogue | Zivith commitment |
|--------|-------------|-------------------|
| **State** | File system | A persistent, semantic, exportable model of creative intent — the creative universe |
| **Interface** | System calls | A programmable core that humans and machines invoke as equals |
| **Scheduling** | Process model | Workflows as declarative, interruptible, resumable processes with human authority built into the engine |

An AI video generator turns a prompt into a file. An operating system manages state, exposes interfaces, and schedules work — so that *other* things, including things not yet invented, can run on top of it.

The vision holds regardless of AI progress because it is not a bet on any model's capability. It is a bet on three invariants:

1. **Creative IP compounds.** Characters, worlds, and aesthetic decisions accumulate value over years; individual outputs do not.
2. **Callers diversify.** The clients of a creative system — human interfaces, autonomous agents, other products — multiply and change shape faster than the system itself.
3. **The pipeline will deform.** Every improvement in AI capability changes where humans need to intervene and how many steps creation requires. The only certainty about today's pipeline is that its shape is temporary.

---

## 2. Core Architectural Principles

These eight principles are load-bearing. Everything else in this document derives from them.

### P1 — Creative intent is the asset; outputs are disposable

The source of truth is always the structured description of intent (the Shot, the Scene, the Character), never the generated artifact. Any output must be regenerable from its intent, and any output that cannot be traced to its intent is a defect.

*Why it holds:* models improve; outputs age; intent does not. A Shot described in 2026 can be regenerated in 2031 by a model that did not exist when it was written — and the result will be better. This principle converts every model improvement into an automatic upgrade of the entire accumulated catalogue.

### P2 — The domain model is a contract, not a schema

The creative hierarchy and its semantics (ownership, inheritance, traceability, approval states) constitute a versioned contract. It evolves only through explicit, compatible, documented migration. No component — including the persistence layer that happens to store it — owns it.

*Why it holds:* every implementation detail around the model will be rewritten; the model is what users have entrusted their creative universes to. Breaking it silently is the one failure the product cannot recover from.

### P3 — The core is headless; every surface is a client

Every capability exists first as a durable, idempotent, programmable operation. The human interface is client number one — privileged in design attention, unprivileged in capability. Nothing may be possible only through the UI.

*Why it holds:* the ratio of machine-initiated to human-initiated work will only increase. A system whose capabilities live in its UI cannot participate in that future without a rewrite.

### P4 — Volatility is quarantined behind capability boundaries

External AI models are peripherals. The system addresses them by capability (write, depict, animate, voice) through stable boundaries, never by vendor. No provider concept may appear in the domain. Adding, replacing, or losing a provider must never require a domain change.

*Why it holds:* the model landscape has the shortest half-life of anything the system touches. Quarantining it is what makes the rest of the system long-lived.

### P5 — Workflow is data; orchestration is an engine; gates are primitives

The shape of the creative process — which stages exist, in what order, with what parallelism, with which review gates — is declarative data, interpreted by an orchestration engine whose primitives are: durable steps, interruption, resumption, fan-out, and partial recomputation. Pipelines are instances, not code.

*Why it holds:* see invariant 3. When stages merge because a model can do in one step what took three, the response must be editing a definition, not rewriting a system.

### P6 — Human authority is architectural; its granularity is policy

The *capability* for human review, override, and veto at any point in any workflow is a permanent architectural guarantee. *Where* review is mandatory, and how much automation a given creator accepts, is configurable policy that will legitimately shift as AI reliability improves.

**Resolved Tension.** Earlier documents simultaneously promise a `full_auto` automation level and declare certain review gates permanently unbypassable. Both cannot be absolute. Resolution: the architecture guarantees that any gate *can* exist everywhere and that gate placement is policy — including the policy that some gates are mandatory today. Mandatory gates are product decisions, revisitable by ADR as evidence accumulates; the *machinery* of human authority is constitutional and not revisitable. We refuse to hard-code today's gate positions into the architecture for the same reason we refuse to hard-code today's pipeline: both encode a snapshot of 2026 model reliability.

### P7 — Every generation is a recorded, priced, reproducible transaction

Each act of generation carries full provenance (what intent, what configuration, what model class, who approved) and full accounting (what it cost, against whose budget). No anonymous generation exists.

*Why it holds:* three independent forces converge on this requirement — reproducibility (P1 is impossible without it), economics (autonomous agents with spending power require metering *before* they exist, not after the first incident), and society (disclosure and provenance obligations for AI-generated media will only tighten).

### P8 — Memory compounds

The system must know more about a creative universe after a year of use than after a day. Review decisions, recurring corrections, and stylistic preferences are signals to be captured into project knowledge — not exhaust to be discarded after a single retry.

*Why it holds:* this is the difference between a creative partner and a creative tool, and it is the one advantage that cannot be replicated by a competitor with a better model, because the memory belongs to the user's history, not to the technology.

---

## 3. Domain Model Philosophy

**The hierarchy is semantic, not organizational.** Project → Story → Scene → Shot is not a folder tree. Each level carries meaning: the Project is a creative universe, the Scene is a continuity of place and mood, the Shot is the smallest unit of directorial intent. Features that treat the hierarchy as mere nesting misunderstand the model.

**Inheritance expresses intent, not convenience.** A field left unset means "defer to my context" — a genuine creative statement, resolved at read time against the current state of ancestors. This is why upstream edits propagate: the child never copied the value, it referenced the context. Any mechanism that flattens inheritance into copied values severs this and is prohibited.

**Identity is permanent; content is versioned.** A Shot keeps its identity across arbitrarily many revisions and regenerations. History accretes; it is never rewritten. Deletion is an end-state annotation, not an erasure — a creative universe with holes in its memory cannot be trusted with a decade of work.

**The model grows by deepening, not widening.** New capability should be expressed through the existing hierarchy and asset semantics wherever possible. Every new top-level concept must justify why it cannot be an enrichment of an existing one. A domain model that adds a concept per feature will not survive ten years; one that deepens per feature will.

**The assembly of shots into a watchable whole is domain, not tooling.** A film is more than the set of its generated shots. The composition of outputs into a deliverable cut belongs *inside* the domain model — it is creative intent like everything else, with the same identity, versioning, and provenance rules. (Its scope at V1 is deliberately minimal; see §11.)

---

## 4. Creative Asset Philosophy

**Assets belong to the universe, not the production.** Characters, locations, styles, and knowledge are owned by the Project and survive every Story, Scene, and Shot that references them. An asset's value is measured across years of reuse, not within a single video.

**Two kinds of persistence: nouns and experience.** Persisting the nouns (a character's design, a location's description) is necessary but insufficient. The *experience* accumulated around them — what was approved, what was rejected and why, which stylistic corrections recur — must also persist and flow back into future generation (P8). An asset that never learns from its usage is a record; an asset that does is a collaborator.

**Provenance is part of the asset.** Every asset and output carries its chain of origin: what produced it, from what inputs, under whose approval. This chain is inseparable from the asset itself.

**Assets must be able to leave.** Everything a creator builds must be exportable in a complete and usable form. This is a trust position, not a feature: creators will only deposit decade-scale IP in a system that demonstrably cannot hold it hostage. Lock-in through data captivity is prohibited as a retention strategy; retention must be earned by the system's compounding value (P8), not by exit costs.

**Resolved Tension.** One review recommendation urged treating the domain model as a *public, open format* immediately (trust through openness); the deferral analysis warned against publishing a format before the model stabilizes. Resolution: the **export guarantee is constitutional and immediate** — creators can always take everything out, from V1 onward. The **public format specification is deferred** — publishing a format is a compatibility promise to third parties, and making that promise while the domain model is still learning what it needs to be would either freeze the model prematurely or betray early adopters of the format. Openness of exit now; openness of specification when the model has earned stability (§11).

---

## 5. Workflow Philosophy

**Assume the pipeline is wrong.** Today's stages and gate positions encode today's model limitations. The architecture must make the pipeline cheap to reshape: stages defined as data, interpreted by an engine, versioned like everything else. When a future model collapses three stages into one, the correct system change is a new workflow definition — nothing else.

**Interruption is a first-class outcome.** A workflow step that pauses for human judgment is not an error path or an edge case; it is one of the two normal outcomes of any step. The engine treats waiting — for hours or weeks — as a healthy persistent state, indistinguishable in robustness from running.

**Parallelism follows structure.** Independent creative units (scenes within a story, shots within a scene) are independent work. The domain hierarchy *is* the dependency graph; the engine derives parallelism from it rather than declaring it ad hoc.

**Change propagates; recomputation is scoped.** When upstream intent changes, the system must know exactly what downstream work is invalidated and re-derive only that — never everything, never nothing. Approved work is protected from silent invalidation. This scoped-recomputation mechanic is what makes "Everything is Editable" true at scale; without it, editability decays into "editable until the project gets big."

**Workflows compound like assets.** A proven workflow configuration is itself creative capital — nameable, reusable, and eventually shareable. This follows automatically from workflow-as-data and requires no additional machinery to be architecturally possible.

**Resolved Tension.** "Workflow is data" gestures toward node-graph tools, while the product philosophy mandates *Simple by Default* and rejects a node canvas as the primary experience. These do not conflict once separated by layer: workflow-as-data is an **engine commitment**, invisible to most users, whose default surface remains the guided creative hierarchy. A graph *visualization* may someday exist as an advanced, secondary view (§11) — but the declarative engine is justified entirely by reshapeability and reuse, not by any UI. We would build it even if no user ever saw a graph.

---

## 6. Human–AI Collaboration Philosophy

**AI proposes; humans decide.** This is the permanent division of authority. AI may draft every artifact in the system; only human approval transitions an artifact into a state that downstream work depends on. As automation levels rise, approval may become batched, sampled, or exception-based — but the authority relation never inverts.

**Automation is a dial, not a mode.** Creators set their own point on the spectrum from reviewing everything to reviewing nothing, per stage and per project. The architecture's obligation is to make every point on that dial safe: full manual must not be punishing, and full auto must not be unaccountable (P7 makes even unattended work fully auditable and budget-bounded).

**Disagreement is data.** Every human correction — a rejected candidate, an edited prompt, a recurring note — is the most valuable training signal the system will ever receive about this creative universe. Capturing it into durable project knowledge (P8) is an architectural duty. A system that asks for the same correction twice has failed this section.

**Transparency over magic.** Creators can always see what was generated, from what inputs, and why. No stage of the system may be a black box whose output must be accepted on faith — this applies equally to external models and to Zivith's own orchestration decisions.

**Advisory surfaces never acquire authority.** Conversational assistants may explain, navigate, and propose. They act only through the same gated operations as every other client, with explicit confirmation, and may never bypass a review gate. The creative hierarchy is the workspace; conversation is at most a companion to it.

---

## 7. Headless & API Philosophy

**Two doors, one house.** Humans and machine agents enter through different doors — an interface designed for judgment and craft, an API designed for autonomy and scale — into the *same* rooms: identical capabilities, identical state, identical gates and accounting. Neither door is an afterthought of the other.

**The deliverable is a resumable project, never a file.** When an agent creates through Zivith, it hands back a living project a human can open, judge, and continue — and vice versa: work a human pauses, an agent can resume. This handoff loop is the practical meaning of "operating system": humans and machines as alternating operators of shared, persistent state.

**Operations are durable and idempotent.** Any invocation may be retried, replayed, or resumed without duplicating effects. Long-running work is observable in progress and survives the disconnection of whoever started it. These are preconditions for machine callers, and they discipline the human experience too.

**Governance precedes autonomy.** Identity, permission, budget, and rate constraints are enforced at the boundary *before* any autonomous caller is admitted — in that order, always. An ungoverned programmable entry to systems that spend money is not an open platform; it is an incident.

**Machine-initiated work meets a higher bar, not a lower one.** Agent traffic arrives without human judgment attached, so it must carry *more* explicit intent, budget, and accountability than a human click — never less.

---

## 8. Evolution Principles

**Absorb capability jumps by reconfiguration first.** When AI takes a leap, the ordered response is: (1) swap models behind capability boundaries (P4); (2) reshape workflow definitions (P5); (3) shift gate policy (P6); (4) deepen the domain model (§3); and only then (5) amend this constitution. A jump that seems to demand step 5 before steps 1–4 have been exhausted has been misdiagnosed.

**Strangle; do not rewrite.** Subsystems are replaced incrementally behind stable boundaries while the system keeps running. A proposal to rewrite the whole is a confession that boundaries have already failed — fix the boundaries.

**Classify decisions by reversibility.** Reversible decisions should be made quickly, locally, and without ceremony. Irreversible decisions — anything touching the domain contract, stored creative data, or public promises — require an ADR that cites this document. Spending ceremony on reversible decisions is as much an error as skipping it on irreversible ones.

**Compatibility debts are repaid, never defaulted.** Every versioned artifact — domain schema, workflow definitions, exported data — is migrated forward with a documented path. If a capability must die, its data must have somewhere to go. Silent breakage of anything a creator stored is the unforgivable failure mode.

**The constitution amends; it does not drift.** This document changes only by explicit, argued amendment recorded as an ADR. If practice diverges from principle, one of them is wrong — and the divergence itself must be surfaced and adjudicated, not normalized.

---

## 9. What Zivith Will Never Become

These are permanent negatives. Each one is a real gravitational pull that adjacent products have succumbed to; naming them is how we resist.

1. **A prompt-to-video generator.** The interaction "type a sentence, receive a film, discard, retry" is the black box Zivith exists to replace. However good models become, collapsing the creative process into a single opaque hop is abandonment of the vision, not achievement of it.

2. **A chatbot.** Conversation may assist creation; it will never *be* the creation surface. A chat log is the weakest possible representation of a creative universe — unstructured, unversionable, unshareable, unreviewable.

3. **A node-graph tool.** Exposing raw computational plumbing as the primary creative surface trades the semantic hierarchy — Zivith's moat — for the home turf of engine-style tools, and taxes every beginner with an expert's mental model.

4. **A data prison.** Retention through export friction, proprietary captivity, or deletion resistance is prohibited in perpetuity (§4). Zivith keeps users by compounding value, or it deserves to lose them.

5. **A vendor's front-end.** No single AI provider — however dominant — may ever be load-bearing for the domain, the workflow engine, or the stored creative record. The day Zivith cannot survive a provider's disappearance is the day it has stopped being an operating system.

6. **An autonomous creator.** Zivith automates execution, never authorship. A system that publishes creative work no human has judged has inverted P6, whatever its settings claim.

---

## 10. Long-Term North Star

**Zivith aspires to be the layer that AI-native storytelling assumes** — the way production assumes a file system: the place where creative universes live, where human and machine collaborators meet as governed equals, and where the passage of time makes work more valuable instead of obsolete.

The measures of progress toward that star, in ascending order of ambition:

1. **Regeneration superiority** — work described years ago renders better today, automatically, because intent outlived the models that first served it (P1, P4).
2. **Compounding universes** — long-lived projects visibly outperform fresh ones, because memory compounds (P8) and assets accrue (§4).
3. **Alternating operators** — substantial real work is started by machines and finished by humans, or the reverse, through the resumable-project loop (§7).
4. **An assumed substrate** — third parties build products, agents, and businesses *on* Zivith's programmable core and interchange format without asking permission, the way software assumes an OS.

When a strategic choice is unclear, prefer the option that moves toward the highest of these that is currently within reach.

---

## 11. Architecture Decisions Deferred Until V1/V2

Deferral is an architectural act, not an omission. Each direction below is recognized as **correct** — aligned with this constitution and expected to happen — and is postponed deliberately, because building it before its preconditions exist would create premature complexity, premature promises, or both. For each: what is deferred, why deferring is safe, and what triggers the revisit.

### D1 — Do not publish the `.ziv` project format yet

Keep the domain schema internal, versioned, and migration-disciplined; publish nothing as a specification. The export guarantee (§4) is **not** deferred — creators can always leave with everything. What is deferred is the *promise to third parties* that the format is stable, because a published format freezes exactly the thing that most needs freedom to evolve right now: the domain model itself.
**Revisit when:** the domain contract has survived multiple releases without breaking migration, and external parties are consuming exports seriously enough to want a specification.

### D2 — Do not build a plugin ecosystem or marketplace yet

Extensibility is the fourth North Star measure, and it is strictly downstream of stable extension points: a data-defined workflow engine, a settled domain contract, and governance at the boundary. A plugin API published before those stabilize becomes a compatibility millstone — every internal improvement breaks someone's plugin, and the ecosystem meant to accelerate the platform instead vetoes its evolution.
**Revisit when:** workflow-as-data has been in production long enough that its shapes have stopped churning, and D1 has been resolved.

### D3 — Do not make a node-based workflow canvas the primary user experience — and do not rush it as a secondary one

The primary-surface question is settled permanently in §9. Even as a secondary "advanced view," a graph UI is deferred: it is expensive, it serves the smallest user segment, and the engine it would visualize (P5) must exist and stabilize first. The declarative engine is justified without any canvas; the canvas, if it ever comes, is a rendering of the engine — never the reverse.
**Revisit when:** workflow definitions are user-visible data and advanced users demonstrably outgrow the configuration surfaces built for them.

### D4 — Do not build a full nonlinear video editor

The constitution requires assembly to live in the domain (§3): a Cut — an ordered arrangement of shot outputs with elementary transitions and sound — so that "a film" is a real, versioned, exportable entity from V1. What is deferred is everything an editor's craft demands beyond that: multi-track timelines, frame-accurate trimming, effects, grading. That is a decade-deep product in itself, adjacent to Zivith's actual differentiation, and — through export (§4) — already served by dedicated tools that creators trust.
**Revisit when:** creators routinely export cuts only to perform trivial adjustments elsewhere — evidence that a slightly deeper native assembly would retain the whole loop.

### D5 — Delay enterprise-only capabilities until the core is mature

Organizational hierarchies, single sign-on, compliance certification, fine-grained administrative policy, on-premise deployment: all legitimate, all eventually necessary, all premature. Enterprise machinery hardens whatever structures exist when it arrives; installed too early, it fossilizes a domain model and permission system that still need to move. The constitution already reserves the load-bearing hooks — identity, membership, audit, and boundary governance (P7, §7) — so nothing built now blocks the enterprise later.
**Revisit when:** the domain contract and governance boundary are stable, and real organizations (not hypothetical ones) are blocked from adopting.

### D6 — Do not build real-time multi-user co-editing yet

The collaboration model that matters first is *asynchronous*: gated review, alternating human/agent operation, durable handoff (§7). Live cursors and concurrent editing are a different and costly discipline (conflict resolution, presence, latency) that presumes the asynchronous loop is already excellent. Sequencing them backwards produces a system that is simultaneously fragile and shallow.
**Revisit when:** asynchronous collaboration is demonstrably strong and teams report the review loop itself — not generation — as their bottleneck.

---

*Ratified 2026-07-22. Amendments require an ADR citing the principles they modify and the evidence that motivated the change.*
