'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api, errorMessage, unwrapList } from '@/lib/api';
import type { ProjectDTO } from '@/lib/types';
import {
  chatHrefForStudio,
  resolveThreadForProject,
  settingsHrefFor,
  studioHrefForEntity,
} from '@/lib/creator-chat-nav';
import { createStudioEntity, type StudioCreateKind } from '@/lib/studio-entity-create';
import { WORKSPACE_LAYOUT_KEYS, usePersistedFlag } from '@/lib/workspace-layout';
import { IconAgent, IconPanelRight } from '@/components/nav-icons';
import { TopBar } from '@/components/top-bar';
import { StudioMenuBar } from '@/components/studio-menu-bar';
import { StudioAgentPanel } from '@/components/studio-agent-panel';
import { parseWorldCanvasView, worldCanvasHref } from '@/lib/world-canvas';
import { useCollapsedSidebar } from '@/lib/sidebar-state';
import { isDesktopApp, pickWorkspaceDirectory } from '@/lib/desktop';
import { persistLastLocation } from '@/lib/last-location';
import { EntityExplorer } from './world/entity-explorer';
import { StudioSelectionProvider, useStudioSelection } from './world/studio-selection';

/**
 * Studio 壳：顶栏（logo / 收起 / 分栈历史 / 项目切换 / 制作 / 设置 / Chat）
 * + 左侧唯一的 Explorer 树（S2，无活动栏）。深链路由（/assets、/stories 等）保留。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const params = useParams<{ projectId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const [explorerCollapsed, toggleExplorer] = useCollapsedSidebar('studio');
  const [rightCollapsed, toggleRight] = useCollapsedSidebar('worldRight');
  // Agent 侧栏（类 Cursor）：壳级右侧面板，记住开合状态。
  const [agentOpen, toggleAgentOpen] = usePersistedFlag(
    WORKSPACE_LAYOUT_KEYS.agentPanelOpen,
    false,
  );

  const projectId = typeof params.projectId === 'string' ? params.projectId : undefined;

  useEffect(() => {
    persistLastLocation(pathname);
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith('/creator-chats')) return;
    api<ProjectDTO[] | { data?: ProjectDTO[]; items?: ProjectDTO[] }>('/projects')
      .then((value) => setProjects(unwrapList(value)))
      .catch(() => {
        setProjects([]);
      });
  }, [pathname]);

  useEffect(() => {
    setChatThreadId(null);
  }, [projectId]);

  /** Studio 顶栏「Chat」：有项目解析（必要时创建）世界构建线程；没有项目回对话首页。 */
  async function openChat() {
    if (!projectId) {
      router.push(chatHrefForStudio(null));
      return;
    }
    if (chatThreadId) {
      router.push(chatHrefForStudio(chatThreadId));
      return;
    }
    setChatBusy(true);
    try {
      const threadId = await resolveThreadForProject(projectId);
      setChatThreadId(threadId);
      router.push(chatHrefForStudio(threadId));
    } catch {
      router.push(chatHrefForStudio(null));
    } finally {
      setChatBusy(false);
    }
  }

  const settingsHref = settingsHrefFor(
    projectId,
    projects.map((project) => project.id),
  );
  const productionHref = projectId ? `/projects/${projectId}/production` : '/projects';
  const showExplorer =
    Boolean(projectId) && !pathname.includes('/settings') && !pathname.includes('/help');

  // Chat 是独立浅色壳，不套 Studio 顶栏和 Explorer。
  if (pathname.startsWith('/creator-chats')) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        surface="studio"
        onToggleSidebar={() => toggleExplorer()}
        menus={
          <StudioMenuBar
            projectId={projectId}
            settingsHref={settingsHref}
            productionHref={productionHref}
            explorerCollapsed={explorerCollapsed}
            onToggleExplorer={() => toggleExplorer()}
            onOpenChat={() => void openChat()}
          />
        }
        middle={projectId ? <ProjectSwitcher projects={projects} currentId={projectId} /> : null}
        right={
          projectId ? (
            <>
              <button
                type="button"
                title="Agent 面板"
                aria-label="Agent 面板"
                aria-pressed={agentOpen}
                onClick={() => toggleAgentOpen()}
                className={`grid size-8 place-items-center rounded-lg transition ${
                  agentOpen
                    ? 'bg-zinc-200/80 text-zinc-900'
                    : 'text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-900'
                }`}
              >
                <IconAgent className="size-4" />
              </button>
              <StudioModeCluster
                projectId={projectId}
                pathname={pathname}
                productionHref={productionHref}
                chatBusy={chatBusy}
                onOpenChat={() => void openChat()}
                onWorld={pathname.includes('/world')}
                rightCollapsed={rightCollapsed}
                onToggleRight={toggleRight}
              />
            </>
          ) : null
        }
      />
      <div className="flex min-h-[calc(100dvh-2.75rem)] flex-1">
        <StudioSelectionProvider key={projectId ?? 'no-project'} projectId={projectId ?? ''}>
          {showExplorer && !explorerCollapsed && (
            <aside className="sticky top-11 h-[calc(100dvh-2.75rem)] w-[268px] shrink-0 overflow-y-auto border-r border-line bg-[#f7f8fa]">
              {projectId ? (
                <ExplorerTree projectId={projectId} pathname={pathname} />
              ) : (
                <ExplorerEmptyState />
              )}
            </aside>
          )}
          <main className="min-w-0 flex-1 bg-white">{children}</main>
          {agentOpen && projectId ? (
            <aside className="sticky top-11 h-[calc(100dvh-2.75rem)] w-[380px] shrink-0 overflow-hidden border-l border-line bg-white">
              <StudioAgentPanel projectId={projectId} />
            </aside>
          ) : null}
        </StudioSelectionProvider>
      </div>
    </div>
  );
}

/** 树点选：更新壳级选中态；不在 /world 时先跳过去，时间线/Inspector 跟随选中。 */
function ExplorerTree({ projectId, pathname }: { projectId: string; pathname: string }) {
  const router = useRouter();
  const { selection, setSelection, resources, threads, loading, error, reload, requestEdit } =
    useStudioSelection();
  const [creatingKind, setCreatingKind] = useState<StudioCreateKind | null>(null);
  const [createError, setCreateError] = useState('');
  const [rightCollapsed, toggleRight] = useCollapsedSidebar('worldRight');
  const worldPath = `/projects/${projectId}/world`;
  const onNewChat = useCallback(() => {
    void resolveThreadForProject(projectId)
      .then((threadId) => router.push(chatHrefForStudio(threadId)))
      .catch(() => router.push(chatHrefForStudio(null)));
  }, [projectId, router]);

  async function handleCreate(
    kind: StudioCreateKind,
    extras?: Parameters<typeof createStudioEntity>[3],
  ) {
    if (!resources || creatingKind) return;
    setCreatingKind(kind);
    setCreateError('');
    try {
      const next = await createStudioEntity(projectId, resources, kind, extras);
      await reload({ silent: true });
      setSelection(next);
      requestEdit(next);
      if (rightCollapsed) toggleRight();
      if (!pathname.startsWith(worldPath)) {
        router.push(studioHrefForEntity(projectId, next));
      }
    } catch (reason) {
      setCreateError(errorMessage(reason));
    } finally {
      setCreatingKind(null);
    }
  }

  if (!resources) {
    return (
      <p
        className={`px-4 py-4 text-xs ${error ? 'text-red-600' : 'text-zinc-500'}`}
        role={error ? 'alert' : undefined}
      >
        {error || (loading ? '正在加载项目树…' : '无法加载项目树')}
      </p>
    );
  }

  return (
    <EntityExplorer
      resources={resources}
      selection={selection}
      onSelect={(next) => {
        setSelection(next);
        if (!pathname.startsWith(worldPath)) router.push(studioHrefForEntity(projectId, next));
      }}
      threads={threads}
      onNewChat={onNewChat}
      creatingKind={creatingKind}
      createError={createError}
      onCreate={handleCreate}
    />
  );
}

function ExplorerEmptyState() {
  const [desktop, setDesktop] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDesktop(isDesktopApp());
  }, []);

  return (
    <div className="grid gap-2 px-4 py-6 text-sm text-zinc-600">
      <p className="text-xs text-zinc-400">还没有打开的项目。</p>
      {desktop ? (
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-left text-xs text-zinc-700 hover:border-accent/60 hover:text-accent disabled:opacity-50"
          onClick={() => {
            setBusy(true);
            void pickWorkspaceDirectory().finally(() => setBusy(false));
          }}
        >
          打开文件夹
        </button>
      ) : null}
      <Link
        href="/projects"
        className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-zinc-700 hover:border-accent/60 hover:text-accent"
      >
        去选项目
      </Link>
    </div>
  );
}

function StudioModeCluster({
  projectId,
  pathname,
  productionHref,
  chatBusy,
  onOpenChat,
  onWorld,
  rightCollapsed,
  onToggleRight,
}: {
  projectId: string;
  pathname: string;
  productionHref: string;
  chatBusy: boolean;
  onOpenChat: () => void;
  onWorld: boolean;
  rightCollapsed: boolean;
  onToggleRight: () => void;
}) {
  const searchParams = useSearchParams();
  const canvas = parseWorldCanvasView(searchParams);
  const worldHref = worldCanvasHref(projectId, 'world', searchParams);
  const creationHref = worldCanvasHref(projectId, 'production', searchParams);
  const spaceHref = worldCanvasHref(projectId, 'space', searchParams);

  return (
    <div className="flex items-center gap-1">
      <div
        className="flex rounded-lg border border-line bg-zinc-100 p-0.5"
        role="tablist"
        aria-label="画布视图"
      >
        <Link
          href={worldHref}
          role="tab"
          aria-selected={onWorld && canvas === 'world'}
          className={`rounded-md px-2.5 py-0.5 text-xs transition ${
            onWorld && canvas === 'world'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          世界
        </Link>
        <Link
          href={creationHref}
          role="tab"
          aria-selected={onWorld && canvas === 'production'}
          className={`rounded-md px-2.5 py-0.5 text-xs transition ${
            onWorld && canvas === 'production'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          创作线
        </Link>
        <Link
          href={spaceHref}
          role="tab"
          aria-selected={onWorld && canvas === 'space'}
          className={`rounded-md px-2.5 py-0.5 text-xs transition ${
            onWorld && canvas === 'space'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          空间
        </Link>
      </div>
      <TopBarLink href={productionHref} label="制作" active={pathname.includes('/production')} />
      <button
        type="button"
        title="Chat"
        aria-label="Chat"
        disabled={chatBusy}
        onClick={onOpenChat}
        className="rounded-lg px-2 py-1 text-xs transition hover:bg-zinc-200/80 hover:text-zinc-900 disabled:opacity-50"
      >
        Chat
      </button>
      {onWorld ? (
        <button
          type="button"
          title={rightCollapsed ? '展开右侧栏' : '收起右侧栏'}
          aria-label={rightCollapsed ? '展开右侧栏' : '收起右侧栏'}
          aria-pressed={!rightCollapsed}
          onClick={onToggleRight}
          className={`grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-200/80 hover:text-zinc-800 ${
            rightCollapsed ? '' : 'bg-zinc-200/80 text-zinc-800'
          }`}
        >
          <IconPanelRight className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function TopBarLink({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`rounded-lg px-2 py-1 text-xs transition ${
        active
          ? 'bg-zinc-200/80 text-zinc-900'
          : 'text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900'
      }`}
    >
      {icon ?? label}
    </Link>
  );
}

function ProjectSwitcher({ projects, currentId }: { projects: ProjectDTO[]; currentId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = projects.find((project) => project.id === currentId);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openProject(id: string) {
    setOpen(false);
    router.push(`/projects/${id}/world`);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="flex h-8 max-w-[12rem] items-center gap-1.5 rounded-lg px-2 text-xs text-zinc-600 transition hover:bg-zinc-200/80 hover:text-zinc-900"
        title={current ? `当前项目：${current.name}` : '切换项目'}
        aria-label="切换项目"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          aria-hidden
          className="grid size-5 shrink-0 rotate-45 place-items-center rounded-[4px] border border-zinc-400 text-[9px] leading-none text-zinc-600"
        >
          <span className="-rotate-45">{current?.name.slice(0, 1) ?? '◇'}</span>
        </span>
        <span className="truncate">{current?.name ?? '切换项目'}</span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label="项目"
          className="absolute left-0 top-full z-50 mt-1 max-h-[min(24rem,calc(100dvh-4rem))] w-56 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
        >
          {projects.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-500">暂无项目</p>
          ) : (
            <ul>
              {projects.map((project) => {
                const active = project.id === currentId;
                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`flex w-full px-3 py-2 text-left text-sm ${
                        active ? 'bg-[#e8f0fe] text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'
                      }`}
                      onClick={() => openProject(project.id)}
                    >
                      <span className="truncate">{project.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
