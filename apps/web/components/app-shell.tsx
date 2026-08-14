'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { Select } from '@zivith/ui';
import { api, unwrapList } from '@/lib/api';
import { useCollapsedSidebar } from '@/lib/sidebar-state';
import type { ProjectDTO } from '@/lib/types';
import { AccountMenu } from '@/components/account-menu';
import { IconSidebar } from '@/components/nav-icons';

const navigation: Array<{
  label: string;
  icon: string;
  href?: string;
  suffix?: string;
}> = [
  { label: '创作聊天', href: '/creator-chats', icon: '◉' },
  { label: '项目', href: '/projects', icon: '◇' },
  { label: '世界线', suffix: '/world', icon: '▚' },
  { label: '故事', suffix: '', icon: '▤' },
  { label: '角色与场景', suffix: '/assets', icon: '◎' },
  { label: '制作', suffix: '/production', icon: '⚙' },
  { label: '设置', suffix: '/settings', icon: '☰' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ projectId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, toggleCollapsed] = useCollapsedSidebar('studio');
  const [projects, setProjects] = useState<ProjectDTO[]>([]);

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

  const settingsHref = params.projectId ? `/projects/${params.projectId}/settings` : '/projects';

  function itemHref(item: (typeof navigation)[number]) {
    return item.suffix !== undefined && params.projectId
      ? `/projects/${params.projectId}${item.suffix}`
      : (item.href ?? '/projects');
  }

  function itemActive(item: (typeof navigation)[number]) {
    if (item.href === '/creator-chats') return pathname.startsWith('/creator-chats');
    if (item.suffix === '/assets') return pathname.includes('/assets');
    if (item.suffix === '/world') return pathname.includes('/world');
    if (item.suffix === '/production') return pathname.includes('/production');
    if (item.suffix === '/settings') return pathname.includes('/settings');
    if (item.label === '项目') return pathname === '/projects';
    return (
      Boolean(params.projectId) &&
      !pathname.includes('/assets') &&
      !pathname.includes('/world') &&
      !pathname.includes('/production') &&
      !pathname.includes('/settings')
    );
  }

  return (
    <div className="flex min-h-screen">
      {collapsed ? (
        <aside className="sticky top-0 flex h-dvh w-14 shrink-0 flex-col items-center border-r border-line bg-[#f7f8fa] py-3">
          <button
            type="button"
            className="grid size-9 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="展开侧栏"
            onClick={toggleCollapsed}
          >
            <IconSidebar className="size-4" />
          </button>
          <nav className="mt-3 grid gap-1" aria-label="主导航">
            {navigation.map((item) => {
              const href = itemHref(item);
              const active = itemActive(item);
              return (
                <Link
                  key={item.label}
                  href={href}
                  title={item.label}
                  className={`grid size-9 place-items-center rounded-lg text-sm transition ${
                    active
                      ? 'bg-[#e8f0fe] text-zinc-900'
                      : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  <span className="sr-only">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
      ) : (
        <aside className="sticky top-0 flex h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-[#f7f8fa] px-3 py-3">
          <div className="flex items-center gap-1 px-1">
            <Link href="/projects" className="px-1 text-lg font-bold tracking-tight">
              ZIVITH<span className="text-accent">.</span>
            </Link>
            <span className="flex-1" />
            <button
              type="button"
              className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="收起侧栏"
              onClick={toggleCollapsed}
            >
              <IconSidebar className="size-4" />
            </button>
          </div>
          <div className="mt-4 px-1">
            <label className="sr-only" htmlFor="project-switcher">
              切换项目
            </label>
            <Select
              id="project-switcher"
              value={params.projectId ?? ''}
              onChange={(event) =>
                router.push(event.target.value ? `/projects/${event.target.value}` : '/projects')
              }
            >
              <option value="">全部项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </div>
          <nav className="mt-3 min-h-0 flex-1 overflow-y-auto" aria-label="主导航">
            {navigation.map((item) => {
              const href = itemHref(item);
              const active = itemActive(item);
              return (
                <Link
                  key={item.label}
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                    active
                      ? 'bg-[#e8f0fe] text-zinc-900'
                      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="px-1 pb-1">
            <AccountMenu settingsHref={settingsHref} tone="light" />
          </div>
        </aside>
      )}
      <main className="min-w-0 flex-1 bg-white">{children}</main>
    </div>
  );
}
