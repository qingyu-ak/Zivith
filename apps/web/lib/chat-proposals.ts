import type { ProposalKind } from './types';

/**
 * 提案消息解析（Creator Chat 与 Studio Agent 面板共用）。
 * assistant 消息的 proposal 字段可能是单对象或多对象数组；只接受已知 kind。
 */

export const PROPOSAL_KINDS: ProposalKind[] = [
  'create_project',
  'create_world_event',
  'create_character',
  'create_location',
  'create_scene',
  'create_relationship',
  'update_entity',
];

export interface ChatProposal {
  kind: ProposalKind;
  payload: Record<string, unknown>;
}

export interface ParsedProposals {
  proposals: ChatProposal[];
  applied: boolean;
  rejected: boolean;
}

export function parseProposals(message: {
  proposal?: unknown;
  proposal_state?: unknown;
}): ParsedProposals {
  if (!message.proposal) return { proposals: [], applied: false, rejected: false };
  const rawList = Array.isArray(message.proposal) ? message.proposal : [message.proposal];
  const proposals: ChatProposal[] = [];
  for (const raw of rawList) {
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const kind = record.kind;
    const payload = record.payload;
    if (
      typeof kind !== 'string' ||
      !PROPOSAL_KINDS.includes(kind as ProposalKind) ||
      typeof payload !== 'object' ||
      payload === null
    ) {
      continue;
    }
    proposals.push({ kind: kind as ProposalKind, payload: payload as Record<string, unknown> });
  }
  return {
    proposals,
    applied: message.proposal_state === 'applied',
    rejected: message.proposal_state === 'rejected',
  };
}

/** 一轮提案收成一行时的条目标题。单项优先用实体名，多项收成「N 项变更」。 */
export function proposalBarLabel(count: number, singleLine?: string): string {
  if (count <= 0) return '';
  if (count === 1 && singleLine?.trim()) return singleLine.trim();
  return `${count} 项变更`;
}

export function isUnconfirmedProposal(message: {
  proposal?: unknown;
  proposal_state?: unknown;
}): boolean {
  const parsed = parseProposals(message);
  return parsed.proposals.length > 0 && !parsed.applied && !parsed.rejected;
}

export function unconfirmedProposalCount(
  threadId: string,
  threads: Array<{ id: string; pending_proposal_count?: number }>,
  currentThreadId: string | null,
  currentMessages: Array<{ proposal?: unknown; proposal_state?: unknown }>,
): number {
  if (threadId === currentThreadId) {
    return currentMessages.filter(isUnconfirmedProposal).length;
  }
  return threads.find((thread) => thread.id === threadId)?.pending_proposal_count ?? 0;
}

function nestedError(
  error: unknown,
): { code?: string; details?: unknown; message?: string } | null {
  if (typeof error !== 'object' || error === null) return null;
  const record = error as { details?: unknown; message?: string };
  const payload = 'details' in record ? record.details : error;
  if (typeof payload !== 'object' || payload === null) return null;
  const wrapped = payload as { error?: { code?: unknown; details?: unknown; message?: unknown } };
  if (typeof wrapped.error !== 'object' || wrapped.error === null) {
    const direct = payload as { code?: unknown; details?: unknown };
    return {
      code: typeof direct.code === 'string' ? direct.code : undefined,
      details: direct.details,
    };
  }
  return {
    code: typeof wrapped.error.code === 'string' ? wrapped.error.code : undefined,
    details: wrapped.error.details,
    message: typeof wrapped.error.message === 'string' ? wrapped.error.message : undefined,
  };
}

/** 自动写入与手点确认撞车时，409 表示对面已经处理完，应对齐卡片而不是报错。 */
export function handledProposalState(error: unknown): 'applied' | 'rejected' | null {
  const nested = nestedError(error);
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : NaN;
  const message = nested?.message ?? (error instanceof Error ? error.message : '');
  const isHandled =
    nested?.code === 'PROPOSAL_ALREADY_HANDLED' ||
    (status === 409 && message.includes('提案已处理'));
  if (!isHandled) return null;
  const details = nested?.details;
  if (typeof details === 'object' && details !== null) {
    const state = (details as { proposal_state?: unknown }).proposal_state;
    if (state === 'rejected') return 'rejected';
    if (state === 'applied') return 'applied';
  }
  return 'applied';
}
