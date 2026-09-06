'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge, Spinner } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import type { WorldLineItem, WorldResourcesDTO } from '@/lib/types';
import {
  buildWorldLineModel,
  buildProductionLineModel,
  resolveDisplayDimensions,
  isPrimaryWorldline,
  countEventsBoundToDimension,
} from '@/lib/world-line';
import { useCollapsedSidebar } from '@/lib/sidebar-state';
import {
  WORKSPACE_LAYOUT_KEYS,
  clampPx,
  usePersistedFlag,
  usePersistedPx,
} from '@/lib/workspace-layout';
import { IconPanelRight } from '@/components/nav-icons';
import { WorldTimeline } from './world-timeline';
import { WorldTimeBar } from './world-time-bar';
import { InspectorPanel } from './inspector-panel';
import { CoPilotPanel } from './co-pilot-panel';
import { MemoryPanel } from './memory-panel';
import { NovelImportPanel } from './novel-import-panel';
import { ContinueInChatButton } from './continue-in-chat';
import { DockSection, ResizeHandle } from './workspace-split';
import { useStudioSelection } from './studio-selection';

export function WorldWorkspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const [resources, setResources] = useState<WorldResourcesDTO | null>(null);
  // 选中态在 Studio 壳级（AppShell 的 StudioSelectionProvider）：Explorer 树与时间线/Inspector 共用。
  const { selection, setSelection } = useStudioSelection();
  const [view, setView] = useState<'world' | 'production'>('world');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clipNotice, setClipNotice] = useState('');
  const [rightCollapsed, toggleRight] = useCollapsedSidebar('worldRight');
  const [rightWidth, setRightWidth] = usePersistedPx(
    WORKSPACE_LAYOUT_KEYS.rightWidth,
    320,
    240,
    560,
  );
  const [dockHeight, setDockHeight] = usePersistedPx(
    WORKSPACE_LAYOUT_KEYS.dockHeight,
    160,
    40,
    720,
  );
  const [copilotOpen, toggleCopilot] = usePersistedFlag(WORKSPACE_LAYOUT_KEYS.dockCopilot, true);
  const [memoryOpen, toggleMemory] = usePersistedFlag(WORKSPACE_LAYOUT_KEYS.dockMemory, false);
  const [importOpen, toggleImport] = usePersistedFlag(WORKSPACE_LAYOUT_KEYS.dockImport, false);
  const centerRef = useRef<HTMLElement | null>(null);

  function switchView(next: 'world' | 'production') {
    setView(next);
    setSelection(
      next === 'world' && resources
        ? { kind: 'project', id: resources.project.id }
        : null,
    );
  }

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setError('');
    }
    try {
      const value = await api<WorldResourcesDTO>(`/world/projects/${projectId}/resources`);
      setResources(value);
    } catch (reason) {
      if (options?.silent) throw reason;
      setError(errorMessage(reason));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [projectId]);

  async function commitClip(item: WorldLineItem, start: number, end: number) {
    setClipNotice('');
    try {
      if (item.entityType === 'world_event') {
        await api(`/world/world-events/${item.id}`, {
          method: 'PATCH',
          body: { presentation_order: Math.max(1, Math.round((start + end) / 2)) },
        });
      } else if (item.entityType === 'scene') {
        await api(`/scenes/${item.id}`, {
          method: 'PATCH',
          body: { order: Math.max(1, Math.round(start)) },
        });
      } else {
        return;
      }
      await load({ silent: true });
    } catch (reason) {
      setClipNotice(errorMessage(reason));
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!resources || resources.project.id !== projectId) return;
    if (view !== 'world') return;
    setSelection((current) => current ?? { kind: 'project', id: resources.project.id });
  }, [resources, projectId, view]);

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

  if (loading) {
    return (
      <div className="grid h-[calc(100dvh-2.75rem)] place-items-center">
        <Spinner label="正在加载世界线…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid h-[calc(100dvh-2.75rem)] place-items-center">
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
      <div className="grid h-[calc(100dvh-2.75rem)] place-items-center">
        <div className="max-w-md text-center">
          <p className="text-zinc-400">无法加载世界数据。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-2.75rem)] flex-col">
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
          {clipNotice ? (
            <p className="mt-1 text-xs text-red-600" role="alert">
              轨道未能保存：{clipNotice}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
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
              创作线
            </button>
          </div>
          <ContinueInChatButton
            projectId={resources.project.id}
            label="← 回到创作聊天"
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 实体树在 Studio 壳（AppShell）左侧；这里只保留时间线/创作线与右侧面板 */}

        {/* 中栏：时间线 + 可拖拽的下方面板 */}
        <section ref={centerRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
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
                      正在查看「{focusedDimension.label}
                      」。这是默认世界时间，角色和地点跟随呈现顺序，不会另建一条时间轴。
                    </>
                  ) : boundEventCount === 0 ? (
                    <>
                      正在查看「{focusedDimension.label}
                      」叠层。还没有事件绑到这个维度，所以中间格子仍是同一批角色和地点——主轴不会变成历法或梦境。
                    </>
                  ) : (
                    <>
                      正在查看「{focusedDimension.label}」叠层，已有 {boundEventCount}{' '}
                      个事件绑在此维度；其他维度的事件会淡显。
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
                onClipCommit={commitClip}
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
          <ResizeHandle
            orientation="horizontal"
            label="调整时间线高度"
            onDrag={(delta) => {
              const host = centerRef.current;
              const max = host ? Math.max(40, host.clientHeight - 220) : 720;
              setDockHeight((height) => clampPx(height - delta, 40, max));
            }}
          />
          <div className="min-h-0 shrink-0 overflow-y-auto" style={{ height: dockHeight }}>
            {view === 'world' && (
              <DockSection title="副驾驶" open={copilotOpen} onToggle={toggleCopilot}>
                <CoPilotPanel resources={resources} onSelect={setSelection} showTitle={false} />
              </DockSection>
            )}
            <DockSection title="长期记忆" open={memoryOpen} onToggle={toggleMemory}>
              <MemoryPanel projectId={projectId} showTitle={false} />
            </DockSection>
            <DockSection title="导入小说" open={importOpen} onToggle={toggleImport}>
              <NovelImportPanel
                projectId={projectId}
                onImported={() => void load()}
                showTitle={false}
              />
            </DockSection>
          </div>
        </section>

        {!rightCollapsed && (
          <ResizeHandle
            orientation="vertical"
            label="调整右侧栏宽度"
            onDrag={(delta) => setRightWidth((width) => width - delta)}
          />
        )}

        {/* 右栏：Inspector */}
        <aside
          className={`min-h-0 overflow-hidden border-l border-line ${rightCollapsed ? 'pointer-events-none' : ''}`}
          style={{ width: rightCollapsed ? 0 : rightWidth }}
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
