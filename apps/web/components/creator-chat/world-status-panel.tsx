'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Spinner } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import type { WorldResourcesDTO, WorldStage } from '@/lib/types';
import { WorldConflictList } from '@/components/world/conflict-list';

const STAGE_META: Record<WorldStage, { label: string; tone: 'neutral' | 'warning' | 'success' }> = {
  bootstrap: { label: '萌芽期', tone: 'neutral' },
  growing: { label: '成长期', tone: 'warning' },
  mature: { label: '成熟期', tone: 'success' },
};

/**
 * 世界状态摘要现由 Studio 副驾驶承担（H9 / 世界线工作区）。
 * Creator Chat 改为简洁对话面，不再挂载本面板。
 */
export function WorldStatusPanel({ projectId }: { projectId: string | null }) {
  const [resources, setResources] = useState<WorldResourcesDTO | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) {
      setResources(null);
      setLoading(false);
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    api<WorldResourcesDTO>(`/world/projects/${projectId}/resources`)
      .then((value) => {
        if (!cancelled) setResources(value);
      })
      .catch((reason) => {
        if (!cancelled) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="px-4 py-5">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-600">世界状态</p>
        <p className="mt-3 rounded-xl border border-dashed border-line p-4 text-sm leading-6 text-zinc-500">
          这个对话还没有关联项目。让世界构建者创建世界后，这里会实时展示世界阶段、世界观与实体全景。
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pt-4">
        <span className="size-2 rounded-full bg-accent/80" aria-hidden />
        <h3 className="text-sm font-medium text-zinc-200">世界状态</h3>
        {loading && <Spinner label="" />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading && !resources ? (
          <p className="py-8 text-center text-sm text-zinc-500">正在加载世界状态…</p>
        ) : error ? (
          <p className="rounded-lg bg-red-500/10 p-3 text-xs leading-5 text-red-300" role="alert">
            {error}
          </p>
        ) : resources ? (
          <WorldStatusContent resources={resources} />
        ) : null}
      </div>
    </div>
  );
}

function WorldStatusContent({ resources }: { resources: WorldResourcesDTO }) {
  const worldview = resources.project.worldview ?? { rules: [] };
  const entities = resources.entities;
  const stageMeta = STAGE_META[resources.stage] ?? STAGE_META.bootstrap;
  const counts = [
    { label: '角色', value: entities.characters.length },
    { label: '地点', value: entities.locations.length },
    { label: '场景', value: entities.scenes.length },
    { label: '事件', value: entities.world_events.length },
    { label: '关系', value: entities.relationships.length },
  ];
  const hasWorldview =
    Boolean(worldview.genre?.trim()) ||
    Boolean(worldview.premise?.trim()) ||
    (worldview.rules ?? []).length > 0 ||
    Boolean(worldview.notes?.trim());
  const recent = [
    ...entities.characters.map((c) => ({ type: '角色', name: c.name, id: c.id })),
    ...entities.locations.map((l) => ({ type: '地点', name: l.name, id: l.id })),
    ...entities.world_events.map((e) => ({ type: '事件', name: e.title, id: e.id })),
  ].slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{resources.project.name}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{resources.project.id.slice(0, 8)}</p>
        </div>
        <Badge tone={stageMeta.tone}>{stageMeta.label}</Badge>
      </div>

      <WorldConflictList conflicts={resources.conflicts ?? []} hint={false} />

      <div className="grid grid-cols-5 gap-1.5">
        {counts.map((item) => (
          <div key={item.label} className="rounded-lg bg-white/5 px-1 py-1.5 text-center">
            <div className="text-sm font-semibold text-white">{item.value}</div>
            <div className="text-[10px] text-zinc-500">{item.label}</div>
          </div>
        ))}
      </div>

      {hasWorldview && (
        <div className="space-y-1.5 text-xs leading-5 text-zinc-400">
          {worldview.genre && (
            <p>
              <span className="text-zinc-600">题材：</span>
              {worldview.genre}
            </p>
          )}
          {worldview.premise && (
            <p>
              <span className="text-zinc-600">核心设定：</span>
              {worldview.premise}
            </p>
          )}
          {(worldview.rules ?? []).length > 0 && (
            <p>
              <span className="text-zinc-600">世界规则：</span>
              {(worldview.rules ?? []).join(' · ')}
            </p>
          )}
          {worldview.notes && (
            <p>
              <span className="text-zinc-600">补充：</span>
              {worldview.notes}
            </p>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-600">最近实体</p>
          <ul className="mt-1.5 grid gap-1">
            {recent.map((item) => (
              <li
                key={`${item.type}-${item.id}`}
                className="flex items-center gap-2 rounded-lg border border-line bg-white/5 px-2.5 py-1.5"
              >
                <span className="text-xs text-zinc-500">{item.type}</span>
                <span className="truncate text-sm text-zinc-200">{item.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href={`/projects/${resources.project.id}/world`}
        className="block rounded-lg border border-line bg-panel px-3 py-2 text-center text-sm font-medium text-zinc-200 transition hover:border-accent/40 hover:text-white"
      >
        进入 Studio →
      </Link>
    </div>
  );
}
