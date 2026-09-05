export type AgentEffortLevel = 'fast' | 'balanced' | 'deep';

export const AGENT_EFFORT_POLICY_VERSION = 'chat-v1';

export interface AgentEffortLimits {
  max_agents: number;
  max_tool_calls: number;
  max_context_tokens: number;
  max_revision_passes: number;
}

export interface AgentEffortSchedule {
  keep_recent_messages: number;
  history_turns: number;
  max_output_tokens: number;
  retrieve_top_k: number;
  scan_conflicts: boolean;
  max_proposals: number;
}

export interface EffectiveAgentEffort {
  requested_level: AgentEffortLevel;
  effective_level: AgentEffortLevel;
  policy_version: string;
  limits: AgentEffortLimits;
  schedule: AgentEffortSchedule;
}

const SCHEDULE: Record<AgentEffortLevel, AgentEffortSchedule & AgentEffortLimits> = {
  fast: {
    max_agents: 1,
    max_tool_calls: 2,
    max_context_tokens: 8_000,
    max_revision_passes: 0,
    keep_recent_messages: 4,
    history_turns: 8,
    max_output_tokens: 800,
    retrieve_top_k: 4,
    scan_conflicts: false,
    max_proposals: 1,
  },
  balanced: {
    max_agents: 1,
    max_tool_calls: 6,
    max_context_tokens: 24_000,
    max_revision_passes: 1,
    keep_recent_messages: 8,
    history_turns: 24,
    max_output_tokens: 2_000,
    retrieve_top_k: 8,
    scan_conflicts: true,
    max_proposals: 2,
  },
  deep: {
    max_agents: 1,
    max_tool_calls: 12,
    max_context_tokens: 40_000,
    max_revision_passes: 2,
    keep_recent_messages: 16,
    history_turns: 48,
    max_output_tokens: 3_000,
    retrieve_top_k: 16,
    scan_conflicts: true,
    max_proposals: 3,
  },
};

export function asAgentEffortLevel(value: unknown): AgentEffortLevel {
  if (value === 'fast' || value === 'deep' || value === 'balanced') return value;
  if (typeof value === 'object' && value !== null && 'level' in value) {
    const level = (value as { level?: unknown }).level;
    if (level === 'fast' || level === 'deep' || level === 'balanced') return level;
  }
  return 'balanced';
}

export function resolveAgentEffort(requested?: unknown): EffectiveAgentEffort {
  const level = asAgentEffortLevel(requested);
  const row = SCHEDULE[level];
  return {
    requested_level: level,
    effective_level: level,
    policy_version: AGENT_EFFORT_POLICY_VERSION,
    limits: {
      max_agents: row.max_agents,
      max_tool_calls: row.max_tool_calls,
      max_context_tokens: row.max_context_tokens,
      max_revision_passes: row.max_revision_passes,
    },
    schedule: {
      keep_recent_messages: row.keep_recent_messages,
      history_turns: row.history_turns,
      max_output_tokens: row.max_output_tokens,
      retrieve_top_k: row.retrieve_top_k,
      scan_conflicts: row.scan_conflicts,
      max_proposals: row.max_proposals,
    },
  };
}

export function effortDto(effort: EffectiveAgentEffort) {
  return {
    requested_level: effort.requested_level,
    effective_level: effort.effective_level,
    policy_version: effort.policy_version,
    limits: effort.limits,
  };
}
