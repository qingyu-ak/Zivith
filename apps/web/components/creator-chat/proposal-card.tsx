'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import type { ApplyProposalResultDTO, ProposalKind } from '@/lib/types';
import { handledProposalState, proposalBarLabel, type ChatProposal } from '@/lib/chat-proposals';

export type { ChatProposal };

const KIND_LABEL: Record<ProposalKind, string> = {
  create_project: '项目',
  create_world_event: '事件',
  create_character: '角色',
  create_location: '地点',
  create_scene: '场景',
  create_relationship: '关系',
  update_entity: '更新',
};

function pick(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function entityName(payload: Record<string, unknown>): string {
  const fields = payload.fields;
  const fromFields =
    typeof fields === 'object' && fields !== null
      ? (pick(fields as Record<string, unknown>, 'name') ??
        pick(fields as Record<string, unknown>, 'title'))
      : null;
  return (
    pick(payload, 'name') ??
    pick(payload, 'title') ??
    pick(payload, 'label') ??
    fromFields ??
    '未命名'
  );
}

function lineFor(kind: ProposalKind, payload: Record<string, unknown>): string {
  return `${KIND_LABEL[kind] ?? kind}「${entityName(payload)}」`;
}

export function ProposalCard({
  threadId,
  messageId,
  proposals,
  applied,
  rejected,
  executeLabel,
  plan = false,
  studioLink = true,
  applying = false,
  onApplied,
  onRejected,
}: {
  threadId: string;
  messageId: string;
  proposals: ChatProposal[];
  applied?: boolean;
  rejected?: boolean;
  executeLabel?: string;
  plan?: boolean;
  studioLink?: boolean;
  applying?: boolean;
  onApplied?: (results: ApplyProposalResultDTO[]) => void;
  onRejected?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<ApplyProposalResultDTO[]>([]);
  const [skipped, setSkipped] = useState<Array<{ kind: string; reason: string }>>([]);
  const [dismissed, setDismissed] = useState(Boolean(rejected));
  const [localApplied, setLocalApplied] = useState(false);

  const details = useMemo(
    () => proposals.map((proposal) => lineFor(proposal.kind, proposal.payload)),
    [proposals],
  );
  const headline = useMemo(
    () => proposalBarLabel(proposals.length, details[0]),
    [proposals.length, details],
  );
  const applyLabel = executeLabel ?? (proposals.length > 1 ? '确认全部' : '确认');

  async function apply() {
    setBusy(true);
    setError('');
    try {
      const value = await api<{
        applied: ApplyProposalResultDTO[];
        skipped?: Array<{ kind: string; reason: string }>;
      }>(`/world/creator-chats/${threadId}/proposals/${messageId}/apply`, {
        method: 'POST',
        body: {},
      });
      setResults(value.applied);
      setSkipped(value.skipped ?? []);
      setLocalApplied(true);
      onApplied?.(value.applied);
    } catch (reason) {
      const handled = handledProposalState(reason);
      if (handled === 'applied') {
        setLocalApplied(true);
        onApplied?.([]);
        return;
      }
      if (handled === 'rejected') {
        setDismissed(true);
        onRejected?.();
        return;
      }
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setError('');
    try {
      await api(`/world/creator-chats/${threadId}/proposals/${messageId}/reject`, {
        method: 'POST',
        body: {},
      });
      setDismissed(true);
      onRejected?.();
    } catch (reason) {
      const handled = handledProposalState(reason);
      if (handled === 'applied') {
        setLocalApplied(true);
        onApplied?.([]);
        return;
      }
      if (handled === 'rejected') {
        setDismissed(true);
        onRejected?.();
        return;
      }
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const done = results.length > 0 || Boolean(applied) || localApplied;
  const skippedProposal = dismissed || Boolean(rejected);
  const studioId = results[0]?.project_id;
  const locked = busy || applying;

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
      {plan && !done && !skippedProposal ? (
        <p className="pb-1 text-[11px] text-zinc-500">计划不会自动写入。确认后再落到世界。</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p
          className="min-w-0 flex-1 truncate text-[13px] text-zinc-700"
          title={details.join(' · ')}
        >
          <span className="mr-1 text-zinc-400">&gt;</span>
          {headline}
        </p>
        {!done && !skippedProposal && locked ? (
          <span className="h-7 shrink-0 px-1 text-xs text-zinc-500">正在写入…</span>
        ) : null}
        {!done && !skippedProposal && !locked && (
          <>
            <button
              type="button"
              className="h-7 shrink-0 rounded-full bg-[#4d6bfe] px-2.5 text-xs font-medium text-white disabled:opacity-50"
              disabled={locked}
              onClick={() => void apply()}
            >
              {applyLabel}
            </button>
            <button
              type="button"
              className="h-7 shrink-0 rounded-full px-2 text-xs font-medium text-zinc-500 hover:bg-zinc-200 disabled:opacity-50"
              disabled={locked}
              onClick={() => void reject()}
            >
              拒绝
            </button>
          </>
        )}
        {done && <Badge tone="success">已写入</Badge>}
        {skippedProposal && !done && <Badge>已拒绝</Badge>}
        <button
          type="button"
          className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? '收起' : '查看'}
        </button>
      </div>

      {open && (
        <ul className="mt-2 grid gap-1 border-t border-zinc-200 pt-2 text-xs leading-5 text-zinc-500">
          {proposals.map((proposal, index) => (
            <li key={`${proposal.kind}-${index}`}>
              {lineFor(proposal.kind, proposal.payload)}
              {pick(proposal.payload, 'description')
                ? ` · ${pick(proposal.payload, 'description')}`
                : ''}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-500" role="alert">
          {error}
        </p>
      )}

      {skipped.length > 0 && (
        <p className="mt-2 text-xs text-amber-700" role="status">
          已跳过重复的创建项目提案。
        </p>
      )}

      {done && studioLink && studioId && (
        <Link
          href={`/projects/${studioId}/world`}
          className="mt-2 inline-block text-xs text-[#4d6bfe] hover:underline"
        >
          在 Studio 查看 →
        </Link>
      )}
    </div>
  );
}
