'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, session } from '@/lib/api';
import { IconDots, IconGear, IconHelp, IconLogout } from './nav-icons';

export function AccountMenu({
  settingsHref,
  tone = 'light',
}: {
  settingsHref: string;
  tone?: 'light' | 'dark';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSignedIn(Boolean(session.getToken()));
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

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
    setOpen(false);
    router.push('/');
  }

  const light = tone === 'light';
  const name = signedIn ? '已登录' : '本地创作者';

  return (
    <div className="relative" ref={rootRef}>
      {open && (
        <div
          className={`absolute bottom-[calc(100%+8px)] left-0 right-0 overflow-hidden rounded-2xl shadow-lg ${
            light ? 'border border-zinc-200 bg-white' : 'border border-line bg-panel'
          }`}
        >
          <Link
            href={settingsHref}
            className={`flex items-center gap-3 px-3 py-2.5 text-sm ${
              light ? 'text-zinc-700 hover:bg-zinc-50' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
            onClick={() => setOpen(false)}
          >
            <IconGear className="size-4" />
            系统设置
          </Link>
          <Link
            href="/creator-chats"
            className={`flex items-center gap-3 px-3 py-2.5 text-sm ${
              light ? 'text-zinc-700 hover:bg-zinc-50' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
            onClick={() => setOpen(false)}
          >
            <IconHelp className="size-4" />
            帮助与反馈
          </Link>
          {signedIn ? (
            <button
              type="button"
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm ${
                light ? 'text-zinc-700 hover:bg-zinc-50' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
              onClick={() => void logout()}
            >
              <IconLogout className="size-4" />
              退出登录
            </button>
          ) : (
            <Link
              href="/login"
              className={`flex items-center gap-3 px-3 py-2.5 text-sm ${
                light ? 'text-zinc-700 hover:bg-zinc-50' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
              onClick={() => setOpen(false)}
            >
              <IconLogout className="size-4" />
              登录
            </Link>
          )}
        </div>
      )}
      <button
        type="button"
        className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
          open
            ? light
              ? 'bg-white ring-1 ring-[#4d6bfe]'
              : 'bg-zinc-100 ring-1 ring-accent/50'
            : light
              ? 'hover:bg-white/80'
              : 'hover:bg-zinc-100'
        }`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${
            light ? 'bg-[#e8f0fe] text-[#4d6bfe]' : 'bg-zinc-100 text-accent'
          }`}
        >
          Z
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-sm ${light ? 'text-zinc-800' : 'text-zinc-700'}`}
        >
          {name}
        </span>
        <IconDots className={`size-4 ${light ? 'text-zinc-400' : 'text-zinc-500'}`} />
      </button>
    </div>
  );
}
