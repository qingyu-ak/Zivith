# AI Creative IDE RFC

> Zivith Entity-first 创作工作区
>
> Version: 0.1
>
> Status: Draft — product layout and capability ramp; not an implementation checklist
>
> Opened: 2026-07-29
>
> Related: [Entity + State + Timeline + Track](../entity-state-timeline-track.md), [Director Copilot RFC](Director-Copilot-RFC.md), [ADR-0007](../adr/0007-preserve-current-state-with-immutable-creative-history.md)

---

## 1. Problem statement

Creators currently move among Project, Story, Asset, Workflow, and Shot pages. They cannot inspect a world Entity, see how its State changes across world chronology, relate that chronology to the order shown in a Story, and ask an AI director about the same selected context without manually reconstructing it.

The cost is fragmented context: Entity consistency lives in the creator's memory, Timeline reasoning is reduced to list order, and Agent conversations lack a stable visual focus.

## 2. Vision alignment

The workspace advances compounding creative universes and alternating human/AI operators. It makes persistent Entity State the center of creation while retaining structured Story → Scene → Shot semantics and headless commands.

## 3. Constitutional check

| Principle | Effect |
|---|---|
| P1 intent is the asset | Serves: Inspector and Timeline expose structured intent before outputs |
| P2 domain is contract | Serves: UI reads dedicated Entity/State contracts |
| P3 headless core | Constraint: every edit and Timeline move must exist as API command |
| P6 human authority | Serves: AI suggestions require confirmation; review gates remain |
| P8 memory compounds | Serves: State history and Timeline become visible working memory |
| D3 no primary node canvas | Complies: Timeline and hierarchy, not workflow graph |
| D4 no full NLE | Constraint: semantic Tracks do not become frame-level editing/effects |

**Strain:** a four-pane IDE can tax Simple by Default. The default workspace therefore opens a focused Entity/Story view; advanced Tracks and console remain collapsible.

## 4. Scope lock

### Is

- Project-scoped AI creative IDE;
- Entity Explorer, Presentation-led Timeline with optional World Time overlays, Director Console, Entity Inspector;
- synchronized selection across panes;
- API-backed Entity State and Timeline editing;
- Chinese-first UI with keyboard and pointer access.

### Is not

- a node workflow canvas;
- a nonlinear video editor;
- a global chatbot home;
- a replacement for Story → Scene → Shot hierarchy;
- an authority bypass for AI edits or approvals;
- a reason to remove current focused routes before replacement parity.

## 5. Layout

```text
┌──────────────┬───────────────────────────────┬────────────────┐
│ Project      │ Timeline                     │ Entity         │
│ Explorer     │ Presentation + World Overlay  │ Inspector      │
│              ├───────────────────────────────┤                │
│              │ Director Console / Agent Chat │                │
└──────────────┴───────────────────────────────┴────────────────┘
```

### Project Explorer

- Project → Story → Scene → Shot hierarchy;
- Character, Location, Object, Event, Organization collections;
- search, filter, stale/review badges;
- selection changes Inspector and highlights Timeline Items.

### Timeline

- Presentation order is the stable axis; World Time follows unless an explicit binding is shown;
- Project-defined world dimensions can be switched or overlaid without normalization;
- semantic Track groups;
- virtualized rendering;
- explicit distinction between fixed revision and follow-current Item;
- moving Item submits Timeline command only.

### Director Console

- bound to Project and current selection;
- explains State/history/consistency;
- later proposes commands with diff and confirmation;
- effort selector defined by [Agent Effort Control RFC](Agent-Effort-Control-RFC.md).

### Entity Inspector

- current State and state-family badges;
- revision history;
- references and affected downstream artifacts;
- editable fields through domain-specific forms;
- compare current/fixed revision.

## 6. Capability ramp

### Slice A — Read-only synchronized workspace

- Explorer + Inspector;
- read-only Presentation Timeline from existing Scene/Shot order;
- Scene, Character, and Shot Tracks only;
- no required World Time input; absent bindings follow Presentation order;
- selection and deep links;
- existing editors remain mutation surfaces.

Promotion evidence: a creator can answer “this Shot uses which Character State and where does it occur in both times?” without leaving the workspace.

### Slice B — Structured Entity and Timeline commands

- Inspector edits through existing/new APIs;
- explicit TimelineItem place/move/remove;
- optimistic conflicts and diff UI;
- undo means compensating command, not history deletion.

Promotion evidence: edits and moves survive refresh, preserve history, and cannot bypass review.

### Slice C — Director Console

- read-only Q&A first;
- suggested changes with visible diff;
- confirmed commands later;
- no hidden mutation.

Promotion evidence: users accept/reject suggestions with complete attribution and no gate bypass.

### Slice D — Consistency overlays

- contradictions across Entity State, Presentation order, and variable World Time bindings;
- impact preview before applying a State change;
- no automatic silent repair.

## 7. Interaction rules

- One global selection model: `{entity_ref, revision?, timeline_item_id?}`.
- URL must encode stable workspace scope and selection where practical.
- Timeline drag shows both axes before commit.
- Fixed revision Items display a lock/history marker.
- AI-proposed changes display affected Entity, fields, stale propagation, and estimated generation spend.
- Destructive actions require domain-specific confirmation, not generic chat confirmation.

## 8. Risk assessment

| Category | Risk | Mitigation / owner |
|---|---|---|
| Domain contract | UI may invent fields not represented in Entity State | Schema-driven Inspector; domain owner review |
| Stored data | drag/edit could partially persist | atomic commands + expected revision; API owner |
| Promise | workspace URLs and Track behavior may become public | keep Draft and version APIs; product owner |
| Authority | Console could mutate without clear consent | read-only first, visible diff, explicit confirmation |
| Economic | Deep effort may trigger expensive work | budget preview and Agent Effort policy |
| Lock-in | model-specific UI may leak | Model Track read-only provenance projection |
| Complexity | four panes overwhelm newcomers | collapsible panes, focused defaults, Slice A usability test |

## 9. Migration

1. Add workspace route without removing existing routes.
2. Reuse existing Project/Story/Shot/Asset reads.
3. Gate Timeline panes on Entity State/Timeline API readiness.
4. Keep current editors as fallbacks through Slice B.
5. Roll back by hiding workspace entry; no Entity or Timeline data is deleted.

## 10. Acceptance criteria

- Creator can navigate Entity and hierarchy from one workspace.
- Presentation Time is visibly primary; explicit World Time deviations and active dimensions are unambiguous.
- Fictional calendar values remain opaque to the core UI unless a Project dimension renderer is available.
- Track semantics match the architecture document.
- Timeline movement never silently changes Entity State.
- No capability exists only in UI; mutations call durable APIs.
- Director Console cannot bypass permissions, review gates, or budgets.
- Existing focused editor routes continue to work during migration.
- Keyboard navigation, focus order, resize, and collapse behavior pass accessibility review.
