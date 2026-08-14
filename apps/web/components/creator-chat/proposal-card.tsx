'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import type { ApplyProposalResultDTO, ProposalKind } from '@/lib/types';

const KIND_LABEL: Record<ProposalKind, string> = {
  create_project: '项目',
  create_world_event: '事件',
  create_character: '角色',
  create_location: '地点',
  create_scene: '场景',
  create_relationship: '关系',
  update_entity: '更新',
};

export interface ChatProposal {
  kind: ProposalKind;
  payload: Record<string, unknown>;
}

function pick(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function entityName(payload: Record<string, unknown>): string {
  const fields = payload.fields;
  const fromFields =
    typeof fields === 'object' && fields !== null
      ? pick(fields as Record<string, unknown>, 'name') ??
        pick(fields as Record<string, unknown>, 'title')
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
  onApplied,
}: {
  threadId: string;
  messageId: string;
  proposals: ChatProposal[];
  applied?: boolean;
  onApplied?: (results: ApplyProposalResultDTO[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<ApplyProposalResultDTO[]>([]);
  const [skipped, setSkipped] = useState<Array<{ kind: string; reason: string }>>([]);

  const summary = useMemo(
    () => proposals.map((proposal) => lineFor(proposal.kind, proposal.payload)).join(' · '),
    [proposals],
  );

  async function apply() {
    setBusy(true);
    setError('');
    try {
      const value = await api<{
        applied: ApplyProposalResultDTO[];
        skipped?: Array<{ kind: string; reason: string }>;
      }>(
        `/world/creator-chats/${threadId}/proposals/${messageId}/apply`,
        { method: 'POST', body: {} },
      );
      setResults(value.applied);
      setSkipped(value.skipped ?? []);
      onApplied?.(value.applied);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const done = results.length > 0 || Boolean(applied);
  const studioId = results[0]?.project_id;

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm text-zinc-700">{summary}</p>
        {!done && (
          <button
            type="button"
            className="min-h-8 rounded-full bg-[#4d6bfe] px-3 text-xs font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void apply()}
          >
            {busy ? '写入…' : '确认'}
          </button>
        )}
        {done && <Badge tone="success">已写入</Badge>}
        <button
          type="button"
          className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? '收起' : '详情'}
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
        <p className="mt-2 text-xs text-amber-300" role="status">
          已跳过重复的创建项目提案。
        </p>
      )}

      {done && studioId && (
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
