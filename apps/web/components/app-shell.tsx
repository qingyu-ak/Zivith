'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { api, unwrapList } from '@/lib/api';
import type { ProjectDTO } from '@/lib/types';
import { settingsHrefFor } from '@/lib/creator-chat-nav';
import { IconGear } from '@/components/nav-icons';
import { TopBar } from '@/components/top-bar';

type NavItem = {
  label: string;
  icon: string;
  href?: string;
  suffix?: string;
};

const primaryNav: NavItem[] = [
  { label: '对话', href: '/creator-chats', icon: '◉' },
  { label: '项目', href: '/projects', icon: '◇' },
  { label: '世界', suffix: '/world', icon: '▚' },
  { label: '实体', suffix: '/assets', icon: '◎' },
  { label: '故事', suffix: '', icon: '▤' },
  { label: '制作', suffix: '/production', icon: '⚙' },
];

const settingsItem: NavItem = { label: '设置', suffix: '/settings', icon: '' };

function navClass(active: boolean) {
  return `grid size-9 place-items-center rounded-lg text-sm transition ${
    active ? 'bg-[#e8f0fe] text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
  }`;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ projectId?: string }>();
  const pathname = usePathname();
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  // Studio 没有第二侧栏：顶栏收起按钮作用于活动栏本身。
  const [activityCollapsed, setActivityCollapsed] = useState(false);

  useEffect(() => {
    if (pathname.startsWith('/creator-chats')) return;
    api<ProjectDTO[] | { data?: ProjectDTO[]; items?: ProjectDTO[] }>('/projects')
      .then((value) => setProjects(unwrapList(value)))
      .catch(() => {
        setProjects([]);
      });
  }, [pathname]);

  if (pathname.startsWith('/creator-chats')) {
    return <>{children}</>;
  }

  const projectId = typeof params.projectId === 'string' ? params.projectId : undefined;

  function itemHref(item: NavItem) {
    if (item.label === '对话') {
      return projectId ? `/projects/${projectId}/chat` : '/creator-chats';
    }
    if (item.label === '设置') {
      return settingsHrefFor(projectId, projects.map((project) => project.id));
    }
    return item.suffix !== undefined && projectId
      ? `/projects/${projectId}${item.suffix}`
      : (item.href ?? '/projects');
  }

  function itemActive(item: NavItem) {
    if (item.href === '/creator-chats') return pathname.startsWith('/creator-chats');
    if (item.suffix === '/assets') return pathname.includes('/assets');
    if (item.suffix === '/world') return pathname.includes('/world');
    if (item.suffix === '/production') return pathname.includes('/production');
    if (item.suffix === '/settings') return pathname.includes('/settings');
    if (item.label === '项目') return pathname === '/projects';
    return (
      Boolean(projectId) &&
      !pathname.includes('/assets') &&
      !pathname.includes('/world') &&
      !pathname.includes('/production') &&
      !pathname.includes('/settings')
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar onToggleSidebar={() => setActivityCollapsed((value) => !value)} />
      <div className="flex min-h-[calc(100dvh-2.75rem)]">
        {!activityCollapsed && (
          <aside className="sticky top-11 flex h-[calc(100dvh-2.75rem)] w-14 shrink-0 flex-col items-center border-r border-line bg-[#f7f8fa] py-3">
            <ProjectSwitcher projects={projects} currentId={projectId} />
            <nav className="mt-3 flex min-h-0 flex-1 flex-col" aria-label="主导航">
              <div className="grid gap-1">
                {primaryNav.map((item) => {
                  const href = itemHref(item);
                  const active = itemActive(item);
                  return (
                    <Link
                      key={item.label}
                      href={href}
                      title={item.label}
                      aria-current={active ? 'page' : undefined}
                      className={navClass(active)}
                    >
                      <span aria-hidden>{item.icon}</span>
                      <span className="sr-only">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
              <div className="flex-1" />
              <Link
                href={itemHref(settingsItem)}
                title="设置"
                aria-current={itemActive(settingsItem) ? 'page' : undefined}
                className={navClass(itemActive(settingsItem))}
              >
                <IconGear className="size-4" aria-hidden />
                <span className="sr-only">设置</span>
              </Link>
            </nav>
          </aside>
        )}
        <main className="min-w-0 flex-1 bg-white">{children}</main>
      </div>
    </div>
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
        className={navClass(open)}
        title={current ? `当前项目：${current.name}` : '切换项目'}
        aria-label="切换项目"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden className="text-xs font-semibold">
          {current?.name.slice(0, 1) ?? '◇'}
        </span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label="项目"
          className="absolute left-full top-0 z-50 ml-2 max-h-[min(24rem,calc(100dvh-2rem))] w-56 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
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
