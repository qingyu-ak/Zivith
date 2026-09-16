'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import type { ApplyProposalResultDTO } from '@/lib/types';
import {
  describeProposal,
  handledProposalState,
  proposalBarLabel,
  type ChatProposal,
  type EntityNameLookup,
} from '@/lib/chat-proposals';

export type { ChatProposal };

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
  pendingHint,
  doneHint,
  entityNames,
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
  /** 未确认时显示在卡片顶部的说明（例如扮演线程的「每步确认」）。 */
  pendingHint?: string;
  /** 写入成功后显示的说明（例如时间锚点提示）。 */
  doneHint?: string;
  /** id → 名称，让「谁和谁」「参与角色」显示成人名而不是 uuid。 */
  entityNames?: EntityNameLookup;
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

  const described = useMemo(
    () => proposals.map((proposal) => describeProposal(proposal, entityNames)),
    [proposals, entityNames],
  );
  const headline = useMemo(
    () => proposalBarLabel(proposals.length, described[0]?.headline),
    [proposals.length, described],
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
  const showDetails = open || (!done && !skippedProposal && proposals.length === 1);

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
      {plan && !done && !skippedProposal ? (
        <p className="pb-1 text-[11px] text-zinc-500">计划不会自动写入。确认后再落到世界。</p>
      ) : null}
      {pendingHint && !done && !skippedProposal ? (
        <p className="pb-1 text-[11px] text-zinc-500">{pendingHint}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p
          className="min-w-0 flex-1 truncate text-[13px] text-zinc-700"
          title={described.map((item) => item.headline).join(' · ')}
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
        {skippedProposal && !done && <Badge>已拒绝 · 世界未改变</Badge>}
        <button
          type="button"
          className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700"
          onClick={() => setOpen((value) => !value)}
        >
          {showDetails ? '收起' : '查看'}
        </button>
      </div>

      {showDetails && (
        <ul className="mt-2 grid gap-2 border-t border-zinc-200 pt-2 text-xs leading-5 text-zinc-600">
          {described.map((item, index) => (
            <li key={`${proposals[index]?.kind ?? 'p'}-${index}`}>
              {proposals.length > 1 ? (
                <p className="font-medium text-zinc-700">{item.headline}</p>
              ) : null}
              {item.details.map((line, lineIndex) => (
                <p key={lineIndex} className="whitespace-pre-wrap">
                  {line}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-2 text-xs text-red-500" role="alert">
          <p>没能写入世界：{error}</p>
          <p className="text-zinc-500">对白已保留。可以重试确认；拒绝则世界不变。</p>
        </div>
      )}

      {skipped.length > 0 && (
        <p className="mt-2 text-xs text-amber-700" role="status">
          已跳过重复的创建项目提案。
        </p>
      )}

      {done && doneHint ? (
        <p className="mt-2 text-xs text-zinc-500" role="status">
          {doneHint}
        </p>
      ) : null}

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
