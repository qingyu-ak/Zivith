'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Spinner } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import type { ApplyProposalResultDTO, ProposalKind } from '@/lib/types';

const KIND_LABEL: Record<ProposalKind, string> = {
  create_project: '创建 IP 项目',
  create_world_event: '记录世界事件',
  create_character: '新增角色',
  create_location: '新增地点',
  create_scene: '新增场景',
  create_relationship: '建立关系',
  update_entity: '更新设定',
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
  return (
    pick(payload, 'name') ??
    pick(payload, 'title') ??
    pick(payload, 'label') ??
    '未命名实体'
  );
}

function proposalSummary(kind: ProposalKind, payload: Record<string, unknown>): string {
  const name = entityName(payload);
  switch (kind) {
    case 'create_project':
      return `将创建 IP 项目「${name}」`;
    case 'create_character':
      return `将新增角色「${name}」`;
    case 'create_location':
      return `将新增地点「${name}」`;
    case 'create_scene':
      return `将新增场景「${name}」`;
    case 'create_world_event':
      return `将记录世界事件「${name}」`;
    case 'create_relationship':
      return `将建立关系「${name}」`;
    case 'update_entity':
      return `将更新设定「${name}」`;
    default:
      return `将应用提案「${name}」`;
  }
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
  const [error, setError] = useState('');
  const [results, setResults] = useState<ApplyProposalResultDTO[]>([]);

  const descriptions = useMemo(
    () =>
      proposals
        .map((proposal) => pick(proposal.payload, 'description') ?? pick(proposal.payload, 'logline'))
        .filter((value): value is string => Boolean(value)),
    [proposals],
  );

  async function apply() {
    setBusy(true);
    setError('');
    try {
      const value = await api<{ applied: ApplyProposalResultDTO[] }>(
        `/world/creator-chats/${threadId}/proposals/${messageId}/apply`,
        { method: 'POST', body: {} },
      );
      setResults(value.applied);
      onApplied?.(value.applied);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const done = results.length > 0 || Boolean(applied);
  const createdProject = results.find((result) => result.entity_type === 'project');

  return (
    <div className="mt-3 rounded-xl border border-accent/25 bg-accent/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={done ? 'success' : 'warning'}>世界构建提案</Badge>
          {done && <Badge tone="success">已应用</Badge>}
        </div>
        <span className="text-xs text-zinc-500">共 {proposals.length} 项</span>
      </div>

      <ul className="mt-3 grid gap-2">
        {proposals.map((proposal, index) => (
          <li
            key={`${proposal.kind}-${index}`}
            className="rounded-lg border border-line bg-ink/60 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{KIND_LABEL[proposal.kind] ?? proposal.kind}</Badge>
              <span className="text-sm font-medium text-white">
                {proposalSummary(proposal.kind, proposal.payload)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {descriptions.length > 0 && (
        <div className="mt-3 grid gap-1.5">
          {descriptions.map((description, index) => (
            <p key={index} className="text-sm leading-6 text-zinc-400">
              {description}
            </p>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 p-2.5 text-xs text-red-300" role="alert">
          {error}
        </p>
      )}

      {!done && (
        <div className="mt-4 flex items-center gap-3">
          <Button disabled={busy} onClick={() => void apply()}>
            {busy ? <Spinner label="应用中…" /> : '确认并应用到世界'}
          </Button>
          <span className="text-xs text-zinc-500">确认后写入草稿，可在 Studio 中审批</span>
        </div>
      )}

      {done && results.length > 0 && (
        <ul className="mt-4 grid gap-1.5">
          {results.map((result) => (
            <li key={result.entity_id} className="text-xs text-zinc-400">
              已写入：{result.title}（{result.entity_type}）
            </li>
          ))}
        </ul>
      )}

      {createdProject && (
        <div className="mt-4">
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-lime-300"
            href={`/projects/${createdProject.project_id}`}
          >
            进入项目工作区
          </Link>
        </div>
      )}
    </div>
  );
}
