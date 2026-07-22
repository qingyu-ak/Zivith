import type { ProjectId, UserId, WorkflowRunId } from './ids.js';

export type AgentId =
  | 'story'
  | 'scene'
  | 'visual_prep'
  | 'shot'
  | 'prompt'
  | 'generation'
  | 'review'
  | 'asset'
  | 'orchestrator';

export type AutomationLevel = 'full_manual' | 'assisted' | 'semi_auto' | 'full_auto';

export interface AgentWarning {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export type ValidationResult =
  { valid: true; issues: [] } | { valid: false; issues: ValidationIssue[] };

export interface CostEstimate {
  model: string;
  estimated_tokens: number;
  estimated_cost_usd?: number;
}

export interface AgentMetadata {
  agent_id: AgentId;
  model_used: string;
  tokens_used: number;
  duration_ms: number;
  timestamp: string;
}

export interface AgentResult<T> {
  status: 'success' | 'partial' | 'failed';
  data?: T;
  warnings: AgentWarning[];
  metadata: AgentMetadata;
}

export interface AgentContext {
  project_id: ProjectId;
  user_id: UserId;
  workflow_run_id: WorkflowRunId;
  previous_results: ReadonlyMap<AgentId, AgentResult<unknown>>;
  automation_level: AutomationLevel;
}

export interface Agent<I, O> {
  readonly id: AgentId;
  readonly name: string;
  execute(input: I, context: AgentContext): Promise<AgentResult<O>>;
  validate(input: I, context: AgentContext): ValidationResult;
  estimate(input: I, context: AgentContext): CostEstimate;
}

export const validAgentInput = (): ValidationResult => ({ valid: true, issues: [] });
