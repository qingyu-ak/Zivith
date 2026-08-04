'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { Button, Select } from '@zivith/ui';
import { api, session, unwrapList } from '@/lib/api';
import type { ProjectDTO } from '@/lib/types';

const navigation: Array<{
  label: string;
  icon: string;
  href?: string;
  suffix?: string;
}> = [
  { label: '创作聊天', href: '/creator-chats', icon: '◉' },
  { label: '项目', href: '/projects', icon: '◇' },
  { label: '故事', suffix: '', icon: '▤' },
  { label: '角色与场景', suffix: '/assets', icon: '◎' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ projectId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectDTO[]>([]);

  useEffect(() => {
    // Creator layer (ADR-0013) needs no auth: creator-chats must stay reachable.
    if (!session.getToken() && !pathname.startsWith('/creator-chats')) {
      router.replace('/login');
      return;
    }
    api<ProjectDTO[] | { data?: ProjectDTO[]; items?: ProjectDTO[] }>('/projects')
      .then((value) => setProjects(unwrapList(value)))
      .catch(() => {
        if (!session.getToken() && !pathname.startsWith('/creator-chats')) {
          router.replace('/login');
        }
      });
  }, [pathname, router]);

  async function logout() {
    const refreshToken = session.getRefreshToken();
    try {
      await api('/auth/logout', {
        method: 'POST',
        body: refreshToken ? { refresh_token: refreshToken } : {},
      });
    } catch {
      // Local session removal must still succeed if the API is unavailable.
    }
    session.clear();
    router.push('/login');
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="border-b border-line bg-ink/95 px-4 py-4 lg:fixed lg:inset-y-0 lg:w-[248px] lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between lg:block">
          <Link href="/projects" className="px-2 text-lg font-bold tracking-tight">
            ZIVITH<span className="text-accent">.</span>
          </Link>
          <Button
            className="lg:hidden"
            variant="ghost"
            onClick={() => {
              void logout();
            }}
          >
            退出
          </Button>
        </div>
        <div className="mt-5">
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
        <nav className="mt-4 flex gap-1 overflow-x-auto lg:grid" aria-label="主导航">
          {navigation.map((item) => {
            const href =
              item.suffix !== undefined && params.projectId
                ? `/projects/${params.projectId}${item.suffix}`
                : (item.href ?? '/projects');
            const active =
              item.href === '/creator-chats'
                ? pathname.startsWith('/creator-chats')
                : item.suffix === '/assets'
                  ? pathname.includes('/assets')
                  : item.label === '项目'
                    ? pathname === '/projects'
                    : Boolean(params.projectId) && !pathname.includes('/assets');
            return (
              <Link
                key={item.label}
                href={href}
                className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? 'bg-white/5 text-white'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-8 hidden border-t border-line pt-4 lg:block">
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-500 hover:text-white"
            onClick={() => {
              void logout();
            }}
          >
            退出登录
          </button>
        </div>
      </aside>
      <main className="min-w-0 lg:col-start-2">{children}</main>
    </div>
  );
}
