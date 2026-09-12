import type { ProposalKind } from './types';

/** Agent 写入世界的审批策略。人类权威保留（P6）；粒度可配置。 */
export type AgentWriteMode = 'confirm' | 'semi' | 'plan' | 'full';

export const AGENT_WRITE_MODE_KEY = 'zivith.agentWriteMode';

export const AGENT_WRITE_MODES: AgentWriteMode[] = ['confirm', 'semi', 'plan', 'full'];

export const AGENT_WRITE_MODE_LABEL: Record<AgentWriteMode, string> = {
  confirm: '变更前确认',
  semi: '半自动',
  plan: '计划模式',
  full: '完全访问',
};

/** Agent 窄栏触发器用，完整名称留在下拉里。 */
export const AGENT_WRITE_MODE_SHORT: Record<AgentWriteMode, string> = {
  confirm: '确认',
  semi: '半自动',
  plan: '计划',
  full: '完全访问',
};

export const AGENT_WRITE_MODE_HINT: Record<AgentWriteMode, string> = {
  confirm: '每步写入前先问你',
  semi: '常规设定自动写入，新建世界仍确认',
  plan: '先出计划，写入前再执行',
  full: '自动写入世界；删除项目等高危仍询问',
};

/** 高危：永远询问。当前提案种类不含删除；删除项目走独立确认。 */
export const HIGH_RISK_PROPOSAL_KINDS = new Set<string>(['delete_project', 'delete_entity']);

/** 半自动仍要确认：新建 IP / 世界。世界观与实体更新可自动写。 */
export const IMPORTANT_PROPOSAL_KINDS = new Set<ProposalKind>(['create_project']);

export type WriteDecision = 'ask' | 'auto' | 'plan';

export function asAgentWriteMode(value: unknown): AgentWriteMode {
  return value === 'semi' || value === 'plan' || value === 'full' ? value : 'confirm';
}

export function readStoredWriteMode(): AgentWriteMode {
  if (typeof window === 'undefined') return 'confirm';
  return asAgentWriteMode(window.localStorage.getItem(AGENT_WRITE_MODE_KEY));
}

export function writeStoredWriteMode(mode: AgentWriteMode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AGENT_WRITE_MODE_KEY, mode);
}

export function isHighRiskKind(kind: string): boolean {
  return HIGH_RISK_PROPOSAL_KINDS.has(kind) || kind.startsWith('delete_');
}

export function isImportantKind(kind: string): boolean {
  return IMPORTANT_PROPOSAL_KINDS.has(kind as ProposalKind);
}

export function decideWriteAction(
  mode: AgentWriteMode,
  kinds: ReadonlyArray<string>,
): WriteDecision {
  if (kinds.length === 0) return 'ask';
  if (kinds.some(isHighRiskKind)) return 'ask';
  if (mode === 'plan') return 'plan';
  if (mode === 'confirm') return 'ask';
  if (mode === 'full') return 'auto';
  if (kinds.some(isImportantKind)) return 'ask';
  return 'auto';
}
