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
