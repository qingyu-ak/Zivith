# Agent Effort Control RFC

> Zivith Agent 工作深度控制
>
> Version: 0.1
>
> Status: Draft — policy contract; not an implementation checklist
>
> Opened: 2026-07-29
>
> Related: [AI Creative IDE RFC](AI-Creative-IDE-RFC.md), [Director Copilot RFC](Director-Copilot-RFC.md), [AI Agent Collaboration](../../AI-Agent-Collaboration.md)

---

## 1. Problem statement

Creators need different trade-offs at different moments. A quick naming suggestion should not pay the latency and cost of a cross-world consistency review; a major story revision should not receive the shallow treatment of a quick answer. Today, callers choose workflows and automation levels, but cannot communicate desired reasoning depth through one stable product control.

## 2. Vision alignment

Effort Control strengthens human-defined control over AI scheduling. It makes cost, latency, and creative depth explicit while preserving the same Entity contracts, review authority, and provenance.

## 3. Constitutional check

| Principle | Effect |
|---|---|
| P3 headless core | Effort is an API policy, not a chat-only toggle |
| P4 volatility quarantined | Levels describe behavior/budget, never provider or model IDs |
| P5 workflows as data | Orchestrator interprets effort into bounded execution strategy |
| P6 human authority | Effort cannot move or bypass review gates |
| P7 recorded/priced | Effective policy and spend are persisted |
| P8 memory compounds | Deep consistency findings can become reviewed Project knowledge |

**Strain:** effort abstraction may promise quality it cannot guarantee. Labels therefore describe resource policy and checks, not outcome quality.

## 4. Scope lock

### Controls

- Agent fan-out ceiling;
- context budget;
- tool/skill call budget;
- consistency-check scope;
- critique/revision passes;
- latency and spend guardrails.

### Does not control

- user permissions;
- mandatory review gates;
- whether a domain transition is valid;
- provider/model identity in the domain;
- permission to spend beyond Project limits;
- permission to mutate without confirmation.

## 5. Levels

| Level | Intended use | Policy shape |
|---|---|---|
| `fast` | local answer or small edit | one primary Agent, narrow context, no broad cross-Track scan |
| `balanced` | default creative work | relevant Entity neighborhood, standard tools, targeted consistency checks |
| `deep` | major creative decision | broader Project context, bounded parallel specialists, critique pass, cross-Track consistency |

The server returns both requested and effective policy. Budget, capability, or admin limits may downgrade execution, but the UI must disclose the downgrade.

```ts
interface AgentEffortRequest {
  level: 'fast' | 'balanced' | 'deep';
  max_cost?: number;
  max_latency_ms?: number;
}

interface EffectiveAgentEffort {
  requested_level: AgentEffortRequest['level'];
  effective_level: AgentEffortRequest['level'];
  policy_version: string;
  limits: {
    max_agents: number;
    max_tool_calls: number;
    max_context_tokens: number;
    max_revision_passes: number;
  };
  downgrade_reason?: string;
}
```

Exact numeric defaults belong to versioned configuration, not this RFC.

## 6. Execution contract

1. Client submits effort with an Agent command.
2. Server intersects requested level with Project budget, user authority, workflow policy, and available capabilities.
3. Effective policy is persisted before execution.
4. Orchestrator schedules within hard ceilings.
5. Each generation/tool call remains attributed and metered.
6. Result records requested/effective level, checks performed, truncation, and spend.

Effort is advisory downward and bounded upward: the runtime may do less when limits require, but may not silently exceed ceilings.

## 7. UI behavior

- Composer control: Fast / Balanced / Deep.
- Balanced is default unless Project policy says otherwise.
- Show estimated relative latency/cost before run.
- Deep displays which additional checks will run.
- Downgrade or partial completion is visible in the result.
- Remember preference per Project/user, but show the effective level per command.
- Do not imply “Deep = correct” or “Fast = low quality.”

## 8. Relationship to automation

Effort and automation are orthogonal:

- automation controls where the system pauses for human authority;
- effort controls resources within an allowed Agent execution;
- a Deep run still stops at mandatory gates;
- full_auto does not grant unlimited Deep spend;
- retry preserves or explicitly changes effort and receives a new command correlation.

## 9. Risk assessment

| Category | Risk | Mitigation / owner |
|---|---|---|
| Domain contract | effort leaks into creative State | store as execution provenance only; domain owner |
| Stored data | policy changes make old runs unclear | persist `policy_version`; orchestration owner |
| Promise | users interpret levels as quality guarantees | policy-focused copy; product owner |
| Authority | Deep fan-out acts beyond confirmation | same command/gate boundary; security owner |
| Economic | fan-out multiplies spend | hard Project/user ceilings and preflight estimate |
| Lock-in | levels map to vendor tiers | capability-based scheduler only |
| Complexity | agents choose inconsistent strategies | versioned policy tests and observability |

## 10. Migration

1. Add optional `effort` to Agent command envelopes; absent means Balanced.
2. Persist requested/effective policy in WorkflowStepAttempt/usage metadata.
3. Initially map all levels to existing single-Agent execution while collecting metrics.
4. Enable Fast narrowing, then Deep checks behind feature flags.
5. Roll back by mapping every request to Balanced; historical provenance remains readable.

## 11. Acceptance criteria

- Fast/Balanced/Deep are available through API and UI.
- Effective policy is deterministic for a policy version and visible to users.
- No level bypasses permissions, review gates, state machines, or spend limits.
- Provider/model names do not appear in domain effort contracts.
- Every paid call remains metered and correlated.
- Downgrades, truncation, and partial checks are disclosed.
- Deep cross-Track checks consume Entity State/Timeline through normal read APIs.
- Rollback to Balanced-only requires no creative-data migration.
