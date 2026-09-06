'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { api, errorMessage, unwrapList } from '@/lib/api';
import type { CreatorChatThreadDTO, ProjectDTO, WorldResourcesDTO } from '@/lib/types';
import {
  chatHrefForStudio,
  normalizeThread,
  resolveThreadForProject,
  settingsHrefFor,
} from '@/lib/creator-chat-nav';
import { IconGear } from '@/components/nav-icons';
import { TopBar } from '@/components/top-bar';
import { useCollapsedSidebar } from '@/lib/sidebar-state';
import { isDesktopApp, pickWorkspaceDirectory } from '@/lib/desktop';
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
  const [resources, setResources] = useState<WorldResourcesDTO | null>(null);
  const [threads, setThreads] = useState<CreatorChatThreadDTO[]>([]);
  const [explorerError, setExplorerError] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const [explorerCollapsed, toggleExplorer] = useCollapsedSidebar('studio');

  const projectId = typeof params.projectId === 'string' ? params.projectId : undefined;

  useEffect(() => {
    if (pathname.startsWith('/creator-chats')) return;
    api<ProjectDTO[] | { data?: ProjectDTO[]; items?: ProjectDTO[] }>('/projects')
      .then((value) => setProjects(unwrapList(value)))
      .catch(() => {
        setProjects([]);
      });
  }, [pathname]);

  useEffect(() => {
    setResources(null);
    setThreads([]);
    setChatThreadId(null);
    setExplorerError('');
    if (!projectId) return;
    let cancelled = false;
    Promise.all([
      api<WorldResourcesDTO>(`/world/projects/${projectId}/resources`),
      api<unknown[] | { data?: unknown[]; items?: unknown[] }>(
        `/world/projects/${projectId}/creator-chats`,
      ).catch(() => []),
    ])
      .then(([value, listed]) => {
        if (cancelled) return;
        setResources(value);
        setThreads(
          unwrapList(listed)
            .map(normalizeThread)
            .filter((thread): thread is CreatorChatThreadDTO => Boolean(thread?.id)),
        );
      })
      .catch((reason) => {
        if (!cancelled) setExplorerError(errorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
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

  const settingsHref = settingsHrefFor(projectId, projects.map((project) => project.id));
  const productionHref = projectId ? `/projects/${projectId}/production` : '/projects';

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        surface="studio"
        onToggleSidebar={() => toggleExplorer()}
        middle={projectId ? <ProjectSwitcher projects={projects} currentId={projectId} /> : null}
        right={
          <>
            <TopBarLink href={productionHref} label="制作" active={pathname.includes('/production')} />
            <TopBarLink
              href={settingsHref}
              label="设置"
              active={pathname.includes('/settings')}
              icon={<IconGear className="size-4" aria-hidden />}
            />
            <button
              type="button"
              title="回到创作聊天"
              aria-label="Chat"
              disabled={chatBusy}
              onClick={() => void openChat()}
              className="rounded-lg px-2 py-1 text-xs text-zinc-600 transition hover:bg-zinc-200/80 hover:text-zinc-900 disabled:opacity-50"
            >
              Chat
            </button>
          </>
        }
      />
      <div className="flex min-h-[calc(100dvh-2.75rem)] flex-1">
        <StudioSelectionProvider key={projectId ?? 'no-project'} projectId={projectId ?? ''}>
          {!explorerCollapsed && (
            <aside className="sticky top-11 h-[calc(100dvh-2.75rem)] w-[268px] shrink-0 overflow-y-auto border-r border-line bg-[#f7f8fa]">
              {projectId && resources ? (
                <ExplorerTree projectId={projectId} pathname={pathname} resources={resources} threads={threads} />
              ) : projectId ? (
                <p className="px-4 py-4 text-xs text-red-600" role="alert">
                  {explorerError || '正在加载项目树…'}
                </p>
              ) : (
                <ExplorerEmptyState />
              )}
            </aside>
          )}
          <main className="min-w-0 flex-1 bg-white">{children}</main>
        </StudioSelectionProvider>
      </div>
    </div>
  );
}

/** 树点选：更新壳级选中态；不在 /world 时先跳过去，时间线/Inspector 跟随选中。 */
function ExplorerTree({
  projectId,
  pathname,
  resources,
  threads,
}: {
  projectId: string;
  pathname: string;
  resources: WorldResourcesDTO;
  threads: CreatorChatThreadDTO[];
}) {
  const router = useRouter();
  const { selection, setSelection } = useStudioSelection();
  const worldPath = `/projects/${projectId}/world`;
  const onNewChat = useCallback(() => {
    void resolveThreadForProject(projectId)
      .then((threadId) => router.push(chatHrefForStudio(threadId)))
      .catch(() => router.push(chatHrefForStudio(null)));
  }, [projectId, router]);

  return (
    <EntityExplorer
      resources={resources}
      selection={selection}
      onSelect={(next) => {
        setSelection(next);
        if (pathname !== worldPath) router.push(worldPath);
      }}
      threads={threads}
      onNewChat={onNewChat}
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
        active ? 'bg-zinc-200/80 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900'
      }`}
    >
      {icon ?? label}
    </Link>
  );
}

function ProjectSwitcher({
  projects,
  currentId,
}: {
  projects: ProjectDTO[];
  currentId?: string;
}) {
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
