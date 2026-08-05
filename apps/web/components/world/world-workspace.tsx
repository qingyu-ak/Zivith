'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Badge, Spinner } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import type { WorldResourcesDTO, WorldSelection } from '@/lib/types';
import { buildWorldLineModel } from '@/lib/world-line';
import { EntityExplorer } from './entity-explorer';
import { WorldTimeline } from './world-timeline';
import { InspectorPanel } from './inspector-panel';

export function WorldWorkspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const [resources, setResources] = useState<WorldResourcesDTO | null>(null);
  const [selection, setSelection] = useState<WorldSelection>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const value = await api<WorldResourcesDTO>(`/world/projects/${projectId}/resources`);
      setResources(value);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const model = useMemo(
    () => (resources ? buildWorldLineModel(resources) : null),
    [resources],
  );

  const entityCount = resources
    ? resources.entities.characters.length +
      resources.entities.locations.length +
      resources.entities.scenes.length +
      resources.entities.world_events.length
    : 0;

  if (loading) {
    return (
      <div className="grid h-screen place-items-center">
        <Spinner label="正在加载世界线…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid h-screen place-items-center">
        <div className="max-w-md text-center">
          <p className="rounded-lg bg-red-500/10 p-4 text-sm text-red-300" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg border border-line px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
            onClick={() => {
              void load();
            }}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!resources || !model) {
    return (
      <div className="grid h-screen place-items-center">
        <div className="max-w-md text-center">
          <p className="text-zinc-400">无法加载世界数据。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-white">{resources.project.name}</h1>
            <Badge tone="neutral">v1 只读</Badge>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {entityCount} 个实体 · {model.relationships.length} 条关系
          </p>
        </div>
        <Link
          href="/creator-chats"
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-white/5 hover:text-white"
        >
          ← 回到创作聊天
        </Link>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)_320px]">
        {/* 左栏：实体 Explorer */}
        <aside className="min-h-0 border-r border-line">
          <EntityExplorer
            resources={resources}
            selection={selection}
            onSelect={setSelection}
          />
        </aside>

        {/* 中栏：世界线 + 副驾驶 */}
        <section className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 p-3">
            {model.tracks.every((track) => track.items.length === 0) ? (
              <div className="grid h-full place-items-center">
                <div className="max-w-sm text-center">
                  <p className="text-zinc-400">这个世界还没有任何世界线条目。</p>
                  <Link
                    href="/creator-chats"
                    className="mt-3 inline-block text-sm text-accent hover:underline"
                  >
                    去创作聊天引导创建角色、场景与事件 →
                  </Link>
                </div>
              </div>
            ) : (
              <WorldTimeline
                model={model}
                selection={selection}
                onSelect={setSelection}
              />
            )}
          </div>
          {/* 副驾驶 Agent 面板（v1 占位） */}
          <div className="shrink-0 border-t border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-accent/80" aria-hidden />
              <h3 className="text-sm font-medium text-zinc-200">副驾驶</h3>
              <span className="text-xs text-zinc-600">coming soon</span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-zinc-500">
              世界线副驾驶 Agent 将在这里与创作者协作：发现冲突、建议补充设定、定位时间线缺口。v1 为只读视图。
            </p>
          </div>
        </section>

        {/* 右栏：Inspector */}
        <aside className="min-h-0 border-l border-line">
          <InspectorPanel resources={resources} selection={selection} />
        </aside>
      </div>
    </div>
  );
}
