'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { entityStagesLoadView } from '@/lib/entity-stages-load';
import { boundEventTitle, stageCaption, stageExcerpt } from '@/lib/entity-revisions';
import type {
  EntityRevisionDTO,
  EntityRevisionListDTO,
  WorldEventDTO,
  WorldSelection,
} from '@/lib/types';

export function EntityStages({
  projectId,
  entityType,
  entityId,
  events,
  onSelect,
}: {
  projectId: string;
  entityType: 'character' | 'location';
  entityId: string;
  events: WorldEventDTO[];
  onSelect?: (selection: Exclude<WorldSelection, null>) => void;
}) {
  const [revisions, setRevisions] = useState<EntityRevisionDTO[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const loadView = entityStagesLoadView({
    loading,
    error,
    revisionCount: revisions.length,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api<EntityRevisionListDTO>(
      `/world/projects/${projectId}/entities/${entityType}/${entityId}/revisions`,
    )
      .then((value) => {
        if (!cancelled) setRevisions(value.revisions ?? []);
      })
      .catch((reason) => {
        if (!cancelled) setError(errorMessage(reason) || '无法加载阶段状态');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, entityType, entityId, reloadToken]);

  if (loadView === 'loading') {
    return (
      <div className="border-t border-line px-4 py-3">
        <p className="text-xs font-semibold tracking-wider text-zinc-500">阶段状态</p>
        <p className="mt-1 text-xs text-zinc-400">正在读取修订…</p>
      </div>
    );
  }
  if (loadView === 'error') {
    return (
      <div className="border-t border-line px-4 py-3 space-y-2">
        <p className="text-xs font-semibold tracking-wider text-zinc-500">阶段状态</p>
        <p className="text-xs text-red-600" role="alert">
          {error || '无法加载阶段状态'}
        </p>
        <button
          type="button"
          disabled={loading}
          className="rounded-md border border-line px-2 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50"
          onClick={() => setReloadToken((current) => current + 1)}
        >
          {loading ? '正在加载…' : '重试'}
        </button>
      </div>
    );
  }
  if (loadView === 'empty') return null;

  return (
    <div className="border-t border-line px-4 py-3">
      <p className="text-xs font-semibold tracking-wider text-zinc-500">阶段状态</p>
      <p className="mt-1 text-[11px] leading-5 text-zinc-500">
        沿世界线的卡，不是第二条时间线。保存时可锚定到事件；扮演按锚点读当时的卡。
      </p>
      <ol className="mt-2 grid gap-2">
        {revisions.map((revision) => {
          const bound = boundEventTitle(revision, events);
          const excerpt = stageExcerpt(revision);
          return (
            <li
              key={revision.id}
              className="rounded-md border border-line bg-[var(--z-wash)] px-2.5 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-zinc-800">{stageCaption(revision)}</span>
                <span className="shrink-0 text-[11px] text-zinc-400">r{revision.revision}</span>
              </div>
              {bound ? (
                <button
                  type="button"
                  className="mt-0.5 text-left text-[11px] text-[#4d6bfe] hover:underline"
                  onClick={() =>
                    revision.as_of_world_event_id
                      ? onSelect?.({ kind: 'world_event', id: revision.as_of_world_event_id })
                      : undefined
                  }
                >
                  始于「{bound}」
                </button>
              ) : (
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {revision.revision === 1 ? '起源状态' : '未锚定（只更新当前卡）'}
                </p>
              )}
              {excerpt ? (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-600">{excerpt}</p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
