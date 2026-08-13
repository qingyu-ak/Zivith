'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Badge, Spinner } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import type { WorldResourcesDTO, WorldSelection } from '@/lib/types';
import { buildWorldLineModel, buildProductionLineModel } from '@/lib/world-line';
import { EntityExplorer } from './entity-explorer';
import { WorldTimeline } from './world-timeline';
import { InspectorPanel } from './inspector-panel';
import { CoPilotPanel } from './co-pilot-panel';

export function WorldWorkspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const [resources, setResources] = useState<WorldResourcesDTO | null>(null);
  const [selection, setSelection] = useState<WorldSelection>(null);
  const [view, setView] = useState<'world' | 'production'>('world');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function switchView(next: 'world' | 'production') {
    setView(next);
    setSelection(null);
  }

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

  const worldModel = useMemo(
    () => (resources ? buildWorldLineModel(resources) : null),
    [resources],
  );
  const productionModel = useMemo(
    () => (resources ? buildProductionLineModel(resources) : null),
    [resources],
  );
  const model = view === 'world' ? worldModel : productionModel;

  const entityCount = resources
    ? resources.entities.characters.length +
      resources.entities.locations.length +
      resources.entities.scenes.length +
      resources.entities.world_events.length
    : 0;

  const sortedStories = resources
    ? [...resources.entities.stories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];

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
            <Badge tone="neutral">v1</Badge>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {view === 'world'
              ? `${entityCount} 个实体 · ${model.relationships.length} 条关系${
                  (resources.conflicts ?? []).length > 0
                    ? ` · ${resources.conflicts?.length} 处冲突`
                    : ''
                }`
              : `${resources.entities.stories.length} 个故事 · ${resources.entities.scenes.length} 个场景 · ${(resources.entities.shots ?? []).length} 个镜头`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-white/5 p-0.5" role="tablist" aria-label="视图切换">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'world'}
              onClick={() => switchView('world')}
              className={`rounded-md px-3 py-1 text-xs transition ${
                view === 'world' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              世界
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'production'}
              onClick={() => switchView('production')}
              className={`rounded-md px-3 py-1 text-xs transition ${
                view === 'production' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              制作
            </button>
          </div>
          <Link
            href="/creator-chats"
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-white/5 hover:text-white"
          >
            ← 回到创作聊天
          </Link>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)_320px]">
        {/* 左栏：世界视图 = 实体 Explorer；制作视图 = 故事列表 */}
        {view === 'production' ? (
          <aside className="min-h-0 overflow-y-auto border-r border-line">
            <div className="border-b border-line px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-600">故事</p>
            </div>
            {sortedStories.length === 0 ? (
              <p className="px-4 py-4 text-sm text-zinc-600">还没有故事</p>
            ) : (
              <ul className="p-2">
                {sortedStories.map((story) => {
                  const active = selection?.kind === 'story' && selection.id === story.id;
                  return (
                    <li key={story.id}>
                      <button
                        type="button"
                        onClick={() => setSelection({ kind: 'story', id: story.id })}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition ${
                          active
                            ? 'bg-white/5 text-white'
                            : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span className="truncate text-sm font-medium">{story.title}</span>
                        <span className="shrink-0 text-xs text-zinc-600">
                          {story.scene_count ?? 0} 场景
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        ) : (
          <aside className="min-h-0 border-r border-line">
            <EntityExplorer
              resources={resources}
              selection={selection}
              onSelect={setSelection}
            />
          </aside>
        )}

        {/* 中栏：时间线（世界 / 制作）+ 世界视图副驾驶 */}
        <section className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 p-3">
            {model.tracks.every((track) => track.items.length === 0) ? (
              <div className="grid h-full place-items-center">
                <div className="max-w-sm text-center">
                  <p className="text-zinc-400">
                    {view === 'world'
                      ? '这个世界还没有任何世界线条目。'
                      : '还没有故事与场景，先沿 Presentation 顺序创建制作内容。'}
                  </p>
                  <Link
                    href="/creator-chats"
                    className="mt-3 inline-block text-sm text-accent hover:underline"
                  >
                    {view === 'world'
                      ? '去创作聊天引导创建角色、场景与事件 →'
                      : '去创作聊天创建故事与场景 →'}
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
          {/* 副驾驶 Agent 面板（v1 只读世界状态摘要，仅世界视图） */}
          {view === 'world' && (
            <CoPilotPanel resources={resources} onSelect={setSelection} />
          )}
        </section>

        {/* 右栏：Inspector */}
        <aside className="min-h-0 border-l border-line">
            <InspectorPanel
            resources={resources}
            selection={selection}
            onUpdated={() => void load()}
          />
        </aside>
      </div>
    </div>
  );
}
