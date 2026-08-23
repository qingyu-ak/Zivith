'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge, Spinner } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import type { WorldResourcesDTO, WorldSelection } from '@/lib/types';
import { buildWorldLineModel, buildProductionLineModel, resolveDisplayDimensions, isPrimaryWorldline, countEventsBoundToDimension } from '@/lib/world-line';
import { useCollapsedSidebar } from '@/lib/sidebar-state';
import { IconPanelLeft, IconPanelRight } from '@/components/nav-icons';
import { EntityExplorer } from './entity-explorer';
import { WorldTimeline } from './world-timeline';
import { WorldTimeBar } from './world-time-bar';
import { InspectorPanel } from './inspector-panel';
import { CoPilotPanel } from './co-pilot-panel';
import { MemoryPanel } from './memory-panel';
import { NovelImportPanel } from './novel-import-panel';
import { ContinueInChatButton } from './continue-in-chat';

export function WorldWorkspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const [resources, setResources] = useState<WorldResourcesDTO | null>(null);
  const [selection, setSelection] = useState<WorldSelection>(null);
  const [view, setView] = useState<'world' | 'production'>('world');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [leftCollapsed, toggleLeft] = useCollapsedSidebar('worldLeft');
  const [rightCollapsed, toggleRight] = useCollapsedSidebar('worldRight');

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

  const dimensions = resources ? resolveDisplayDimensions(resources) : [];
  const focusedDimension =
    selection?.kind === 'dimension'
      ? (dimensions.find((dimension) => dimension.id === selection.id) ?? null)
      : null;
  const boundEventCount = focusedDimension
    ? countEventsBoundToDimension(resources?.entities.world_events ?? [], focusedDimension.id)
    : 0;
  const dimensionCaption = (focusedDimension ? [focusedDimension] : dimensions)
    .map((dimension) => dimension.label)
    .join(' / ');

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
          <p className="rounded-lg bg-red-500/10 p-4 text-sm text-red-600" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg border border-line px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
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
            <h1 className="text-lg font-semibold text-zinc-900">{resources.project.name}</h1>
            <Badge tone="neutral">v1</Badge>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {view === 'world'
              ? `${focusedDimension ? `叠层「${dimensionCaption}」` : `世界时间「${dimensionCaption}」`} · 呈现顺序主轴 · ${entityCount} 个实体 · ${model.relationships.length} 条关系${
                  (resources.conflicts ?? []).length > 0
                    ? ` · ${resources.conflicts?.length} 处冲突`
                    : ''
                }`
              : `${resources.entities.stories.length} 个故事 · ${resources.entities.scenes.length} 个场景 · ${(resources.entities.shots ?? []).length} 个镜头 · 派生机位/风格/提示词/模型轨`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`grid size-8 place-items-center rounded-lg border border-line transition ${
              leftCollapsed ? 'text-zinc-400 hover:text-zinc-700' : 'bg-white text-zinc-800'
            }`}
            aria-label={leftCollapsed ? '展开左侧栏' : '收起左侧栏'}
            aria-pressed={!leftCollapsed}
            onClick={toggleLeft}
          >
            <IconPanelLeft className="size-4" />
          </button>
          <button
            type="button"
            className={`grid size-8 place-items-center rounded-lg border border-line transition ${
              rightCollapsed ? 'text-zinc-400 hover:text-zinc-700' : 'bg-white text-zinc-800'
            }`}
            aria-label={rightCollapsed ? '展开右侧栏' : '收起右侧栏'}
            aria-pressed={!rightCollapsed}
            onClick={toggleRight}
          >
            <IconPanelRight className="size-4" />
          </button>
          <div
            className="flex rounded-lg border border-line bg-zinc-100 p-0.5"
            role="tablist"
            aria-label="视图切换"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'world'}
              onClick={() => switchView('world')}
              className={`rounded-md px-3 py-1 text-xs transition ${
                view === 'world'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
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
                view === 'production'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              制作
            </button>
          </div>
          <ContinueInChatButton
            projectId={resources.project.id}
            label="← 回到创作聊天"
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
          />
        </div>
      </header>

      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `${leftCollapsed ? '0px' : '248px'} minmax(0,1fr) ${rightCollapsed ? '0px' : '320px'}`,
        }}
      >
        {/* 左栏：世界视图 = 实体 Explorer；制作视图 = 故事列表 */}
        {view === 'production' ? (
          <aside
            className={`min-h-0 overflow-hidden border-r border-line ${leftCollapsed ? 'pointer-events-none' : 'overflow-y-auto'}`}
          >
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
                            ? 'bg-zinc-100 text-zinc-900'
                            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
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
          <aside
            className={`min-h-0 overflow-hidden border-r border-line ${leftCollapsed ? 'pointer-events-none' : ''}`}
          >
            <EntityExplorer resources={resources} selection={selection} onSelect={setSelection} />
          </aside>
        )}

        {/* 中栏：时间线（世界 / 制作）+ 世界视图副驾驶 */}
        <section className="flex min-h-0 flex-col">
          {view === 'world' ? (
            <>
              <WorldTimeBar
                resources={resources}
                selectedDimensionId={focusedDimension?.id ?? null}
                onSelectDimension={(dimension) =>
                  setSelection({ kind: 'dimension', id: dimension.id })
                }
                onUpdated={() => void load()}
              />
              {focusedDimension ? (
                <div className="shrink-0 border-b border-violet-200 bg-violet-50 px-4 py-2 text-xs leading-5 text-violet-950">
                  {isPrimaryWorldline(focusedDimension) ? (
                    <>
                      正在查看「{focusedDimension.label}」。这是默认世界时间，角色和地点跟随呈现顺序，不会另建一条时间轴。
                    </>
                  ) : boundEventCount === 0 ? (
                    <>
                      正在查看「{focusedDimension.label}」叠层。还没有事件绑到这个维度，所以中间格子仍是同一批角色和地点——主轴不会变成历法或梦境。
                    </>
                  ) : (
                    <>
                      正在查看「{focusedDimension.label}」叠层，已有 {boundEventCount} 个事件绑在此维度；其他维度的事件会淡显。
                    </>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <div className="shrink-0 border-b border-line bg-zinc-50 px-4 py-2 text-xs leading-5 text-zinc-600">
              机位 / 风格 / 提示词 / 模型是从镜头当前状态投影的只读轨，不另存 TimelineItem。
            </div>
          )}
          <div className="min-h-0 flex-1 p-3">
            {view === 'production' || !model.tracks.every((track) => track.items.length === 0) ? (
              <WorldTimeline
                model={model}
                selection={selection}
                onSelect={setSelection}
                focusedDimensionId={focusedDimension?.id ?? null}
                focusedDimensionLabel={focusedDimension?.label ?? null}
                focusedIsPrimary={focusedDimension ? isPrimaryWorldline(focusedDimension) : true}
              />
            ) : (
              <div className="grid h-full place-items-center">
                <div className="max-w-sm text-center">
                  <p className="text-zinc-400">这个世界还没有任何世界线条目。</p>
                  <ContinueInChatButton
                    projectId={resources.project.id}
                    label="去创作聊天引导创建角色、场景与事件 →"
                    className="mt-3 inline-block text-sm text-accent hover:underline disabled:opacity-50"
                  />
                </div>
              </div>
            )}
          </div>
          {/* 副驾驶 Agent 面板（v1 只读世界状态摘要，仅世界视图） */}
          {view === 'world' && <CoPilotPanel resources={resources} onSelect={setSelection} />}
          {/* M1 记忆面板：L1 原子列表 + 重建向量 */}
          <MemoryPanel projectId={projectId} />
          {/* M2 小说导入：上传 → 提炼世界层 + 角色卡 */}
          <NovelImportPanel projectId={projectId} onImported={() => void load()} />
        </section>

        {/* 右栏：Inspector */}
        <aside
          className={`min-h-0 overflow-hidden border-l border-line ${rightCollapsed ? 'pointer-events-none' : ''}`}
        >
          <InspectorPanel
            resources={resources}
            selection={selection}
            view={view}
            onSelect={setSelection}
            onUpdated={() => void load()}
          />
        </aside>
      </div>
    </div>
  );
}
