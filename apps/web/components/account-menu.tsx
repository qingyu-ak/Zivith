'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, session } from '@/lib/api';
import { captureSettingsReturn } from '@/lib/settings-return';
import { TitleBarTools } from './title-bar-tools';
import { IconGear, IconHelp, IconLogout } from './nav-icons';

const itemClass =
  'flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--z-fg-muted)] hover:bg-[var(--z-wash)] hover:text-[var(--z-fg)]';

export function AccountMenu({ settingsHref }: { settingsHref: string }) {
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

  const name = signedIn ? '已登录' : '本地创作者';

  return (
    <div className="flex items-center gap-0.5">
      <div className="relative min-w-0 flex-1" ref={rootRef}>
        {open && (
          <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 overflow-hidden rounded-2xl border border-line bg-panel shadow-lg">
            <Link
              href={settingsHref}
              className={itemClass}
              onClick={() => {
                captureSettingsReturn();
                setOpen(false);
              }}
            >
              <IconGear className="size-4" />
              系统设置
            </Link>
            <Link
              href="/help"
              className={itemClass}
              onClick={() => {
                captureSettingsReturn();
                setOpen(false);
              }}
            >
              <IconHelp className="size-4" />
              帮助与反馈
            </Link>
            {signedIn ? (
              <button
                type="button"
                className={`w-full text-left ${itemClass}`}
                onClick={() => void logout()}
              >
                <IconLogout className="size-4" />
                退出登录
              </button>
            ) : (
              <Link
                href="/login"
                className={itemClass}
                onClick={() => {
                  captureSettingsReturn();
                  setOpen(false);
                }}
              >
                <IconLogout className="size-4" />
                登录
              </Link>
            )}
          </div>
        )}
        <button
          type="button"
          className={`flex min-w-0 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
            open ? 'bg-[var(--z-wash)] ring-1 ring-[#4d6bfe]' : 'hover:bg-[var(--z-wash)]'
          }`}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--z-wash-2)] text-[11px] font-semibold text-[var(--z-fg)]">
            我
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-[var(--z-fg)]">{name}</span>
        </button>
      </div>
      <TitleBarTools />
    </div>
  );
}
