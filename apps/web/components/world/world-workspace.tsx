'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useSearchParams } from 'next/navigation';
import { Spinner } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import type { WorldLineItem } from '@/lib/types';
import {
  buildWorldLineModel,
  buildProductionLineModel,
  resolveDisplayDimensions,
  isPrimaryWorldline,
  countEventsBoundToDimension,
  applyWorldLineView,
  asWorldLineViewState,
  defaultWorldLineView,
  type WorldLineViewState,
} from '@/lib/world-line';
import { parseStudioSelect } from '@/lib/creator-chat-nav';
import { createStudioEntity, type TimelineCreatableKind } from '@/lib/studio-entity-create';
import { parseWorldCanvasView } from '@/lib/world-canvas';
import { useCollapsedSidebar } from '@/lib/sidebar-state';
import { characterSpanPatches, locationSpanPatches } from '@/lib/world-track-edit';
import {
  WORKSPACE_LAYOUT_KEYS,
  clampPx,
  inspectorWidthForLayout,
  usePersistedFlag,
  usePersistedPx,
} from '@/lib/workspace-layout';
import { WorldTimeline } from './world-timeline';
import { WorldTimeBar } from './world-time-bar';
import { WorldLineScopeBar } from './world-line-scope-bar';
import { InspectorPanel } from './inspector-panel';
import { CoPilotPanel } from './co-pilot-panel';
import { MemoryPanel } from './memory-panel';
import { NovelImportPanel } from './novel-import-panel';
import { DockSection, ResizeHandle } from './workspace-split';
import { useStudioSelection } from './studio-selection';

const StudioCosmosView = dynamic(
  () => import('@/components/cosmos/studio-cosmos-view').then((mod) => mod.StudioCosmosView),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center bg-black text-zinc-400">
        <Spinner label="正在打开空间…" />
      </div>
    ),
  },
);

export function WorldWorkspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const canvas = parseWorldCanvasView(searchParams);
  const view = canvas === 'production' ? 'production' : 'world';
  const { selection, setSelection, resources, loading, error, reload, requestEdit } =
    useStudioSelection();
  const [clipNotice, setClipNotice] = useState('');
  const [creatingKind, setCreatingKind] = useState<TimelineCreatableKind | null>(null);
  const [rightCollapsed, toggleRight] = useCollapsedSidebar('worldRight');
  const [agentOpen] = usePersistedFlag(WORKSPACE_LAYOUT_KEYS.agentPanelOpen, false);
  const expandedForSelect = useRef(false);
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
  const [lineView, setLineView] = useState<WorldLineViewState | null>(null);
  const centerRef = useRef<HTMLElement | null>(null);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      await reload(options);
    },
    [reload],
  );

  function revealInspector() {
    if (rightCollapsed) toggleRight();
  }

  async function createFromTimeline(kind: TimelineCreatableKind) {
    if (!resources || creatingKind) return;
    setCreatingKind(kind);
    setClipNotice('');
    try {
      const next = await createStudioEntity(
        resources.project.id,
        resources,
        kind,
        kind === 'character' ? { name: '未命名角色' } : undefined,
      );
      await load({ silent: true });
      setSelection(next);
      requestEdit(next);
      revealInspector();
    } catch (reason) {
      setClipNotice(errorMessage(reason));
    } finally {
      setCreatingKind(null);
    }
  }

  function editFromTimeline(item: WorldLineItem) {
    const kind = item.entityType;
    if (
      kind !== 'character' &&
      kind !== 'location' &&
      kind !== 'scene' &&
      kind !== 'world_event'
    ) {
      return;
    }
    const next = { kind, id: item.id };
    setSelection(next);
    requestEdit(next);
    revealInspector();
  }

  useEffect(() => {
    if (!parseStudioSelect(searchParams) || expandedForSelect.current || !rightCollapsed) return;
    expandedForSelect.current = true;
    toggleRight();
  }, [searchParams, rightCollapsed, toggleRight]);

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
      } else if (item.entityType === 'character') {
        const events = resources?.entities.world_events ?? [];
        if (events.length === 0) {
          setClipNotice('还没有世界事件。先建事件，再把角色块拖到事件所在的区间，才会写入出场。');
          return;
        }
        const patches = characterSpanPatches(events, item.id, start, end);
        if (patches.length === 0) {
          return;
        }
        await Promise.all(
          patches.map((patch) =>
            api(`/world/world-events/${patch.id}`, {
              method: 'PATCH',
              body: { character_ids: patch.character_ids },
            }),
          ),
        );
      } else if (item.entityType === 'location') {
        const scenes = resources?.entities.scenes ?? [];
        if (scenes.length === 0) {
          setClipNotice('还没有场景。先建场景，再把地点块拖到场景所在的区间，才会写入地点。');
          return;
        }
        const patches = locationSpanPatches(scenes, item.id, start, end);
        if (patches.length === 0) {
          return;
        }
        await Promise.all(
          patches.map((patch) =>
            api(`/scenes/${patch.id}`, {
              method: 'PATCH',
              body: { location_id: patch.location_id },
            }),
          ),
        );
      } else {
        return;
      }
      await load({ silent: true });
    } catch (reason) {
      setClipNotice(errorMessage(reason));
    }
  }

  const worldModel = useMemo(
    () => (resources ? buildWorldLineModel(resources) : null),
    [resources],
  );
  const productionModel = useMemo(
    () => (resources ? buildProductionLineModel(resources) : null),
    [resources],
  );

  useEffect(() => {
    if (!worldModel || !resources) return;
    const key = `zivith.worldLineView.${resources.project.id}`;
    let stored: unknown = null;
    try {
      stored = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    } catch {
      stored = null;
    }
    setLineView(
      asWorldLineViewState(stored, worldModel.scaleDomain, resources.entities.characters.length),
    );
  }, [worldModel, resources]);

  function updateLineView(next: WorldLineViewState) {
    setLineView(next);
    if (!resources) return;
    window.localStorage.setItem(
      `zivith.worldLineView.${resources.project.id}`,
      JSON.stringify(next),
    );
  }

  const filteredWorldModel = useMemo(() => {
    if (!worldModel || !resources) return null;
    const view =
      lineView ??
      defaultWorldLineView(worldModel.scaleDomain, resources.entities.characters.length);
    return applyWorldLineView(worldModel, resources, view);
  }, [worldModel, resources, lineView]);
  const model = view === 'world' ? filteredWorldModel : productionModel;

  const dimensions = resources ? resolveDisplayDimensions(resources) : [];
  const focusedDimension =
    selection?.kind === 'dimension'
      ? (dimensions.find((dimension) => dimension.id === selection.id) ?? null)
      : null;
  const boundEventCount = focusedDimension
    ? countEventsBoundToDimension(resources?.entities.world_events ?? [], focusedDimension.id)
    : 0;

  if (loading) {
    return (
      <div className="grid h-[calc(100dvh-2.75rem)] place-items-center">
        <Spinner label={canvas === 'space' ? '正在打开空间…' : '正在加载世界线…'} />
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

  if (!resources || (canvas !== 'space' && !model)) {
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
      {clipNotice ? (
        <p
          className="shrink-0 border-b border-red-200 bg-red-50 px-5 py-1.5 text-xs text-red-600"
          role="alert"
        >
          轨道未能保存：{clipNotice}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* 实体树在 Studio 壳（AppShell）左侧；这里只保留时间线/创作线与右侧面板 */}

        {/* 中栏：空间浏览器 / 时间线 + 可拖拽的下方面板 */}
        <section ref={centerRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {canvas === 'space' ? (
            <div className="min-h-0 flex-1">
              <StudioCosmosView
                resources={resources}
                selection={selection}
                onSelect={setSelection}
              />
            </div>
          ) : (
            <>
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
                  <WorldLineScopeBar
                    view={
                      lineView ??
                      defaultWorldLineView(
                        worldModel?.scaleDomain ?? { min: 0, max: 1 },
                        resources.entities.characters.length,
                      )
                    }
                    domain={worldModel?.scaleDomain ?? { min: 0, max: 1 }}
                    characterCount={resources.entities.characters.length}
                    sceneCount={resources.entities.scenes.length}
                    onChange={updateLineView}
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
              <div className="min-h-0 flex-1 overflow-hidden">
                {model &&
                (view === 'production' ||
                  !model.tracks.every((track) => track.items.length === 0)) ? (
                  <WorldTimeline
                    model={model}
                    selection={selection}
                    onSelect={setSelection}
                    focusedDimensionId={focusedDimension?.id ?? null}
                    focusedDimensionLabel={focusedDimension?.label ?? null}
                    focusedIsPrimary={
                      focusedDimension ? isPrimaryWorldline(focusedDimension) : true
                    }
                    onClipCommit={commitClip}
                    onCreateTrack={view === 'world' ? createFromTimeline : undefined}
                    onEditItem={view === 'world' ? editFromTimeline : undefined}
                    creatingKind={creatingKind}
                  />
                ) : worldModel && !worldModel.tracks.every((track) => track.items.length === 0) ? (
                  <div className="grid h-full place-items-center">
                    <div className="max-w-sm text-center">
                      <p className="text-zinc-400">这一段没有可显示的条目。</p>
                      <p className="mt-3 text-sm text-zinc-500">
                        放宽章范围，或改回「全部」角色/场景。
                      </p>
                      <button
                        type="button"
                        className="mt-4 rounded-lg border border-line px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
                        onClick={() =>
                          updateLineView(
                            defaultWorldLineView(
                              worldModel.scaleDomain,
                              resources.entities.characters.length,
                            ),
                          )
                        }
                      >
                        回到总览
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid h-full place-items-center">
                    <div className="max-w-sm text-center">
                      <p className="text-zinc-400">这个世界还没有任何世界线条目。</p>
                      <p className="mt-3 text-sm text-zinc-500">
                        时间线角色/地点/场景/事件轨点「+」添加，双击片段在右侧编辑；不可以在时间线上删块或当剪辑软件拖块。
                      </p>
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
              <div className="min-h-0 shrink-0 overflow-x-hidden overflow-y-auto" style={{ height: dockHeight }}>
                {view === 'world' && (
                  <DockSection title="副驾驶" open={copilotOpen} onToggle={toggleCopilot}>
                    <CoPilotPanel resources={resources} onSelect={setSelection} showTitle={false} />
                  </DockSection>
                )}
                <DockSection title="世界笔记" open={memoryOpen} onToggle={toggleMemory}>
                  <MemoryPanel
                    projectId={projectId}
                    showTitle={false}
                    focusTopic={
                      selection?.kind === 'character'
                        ? resources.entities.characters.find((item) => item.id === selection.id)
                            ?.name
                        : undefined
                    }
                  />
                </DockSection>
                <DockSection title="导入小说" open={importOpen} onToggle={toggleImport}>
                  <NovelImportPanel
                    projectId={projectId}
                    onImported={() => void load()}
                    showTitle={false}
                  />
                </DockSection>
              </div>
            </>
          )}
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
          className={`relative z-10 min-h-0 shrink-0 overflow-hidden border-l border-line bg-white ${rightCollapsed ? 'pointer-events-none' : ''}`}
          style={{
            width: rightCollapsed ? 0 : inspectorWidthForLayout(rightWidth, agentOpen),
          }}
        >
          <InspectorPanel
            resources={resources}
            selection={selection}
            view={canvas === 'space' ? 'space' : view}
            onSelect={setSelection}
            onUpdated={() => void load()}
          />
        </aside>
      </div>
    </div>
  );
}
