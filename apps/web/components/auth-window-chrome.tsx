'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { readLastLocation } from '@/lib/last-location';
import { navigationHistoryFor } from '@/lib/navigation-history';
import { resolveOverlayReturn } from '@/lib/nav-overlay';
import { DesktopWindowControls } from './desktop-window-controls';
import { IconArrowLeft } from './nav-icons';

/**
 * 登录 / 注册不走 Studio 顶栏：顶栏放 logo 与窗口按钮，
 * 「返回」在顶栏下方，回到进入前的 Chat 或 Studio。
 */
export function AuthWindowChrome() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    navigationHistoryFor().push(pathname);
  }, [pathname]);

  function leaveAuth() {
    router.push(resolveOverlayReturn(readLastLocation() ?? '/projects'));
  }

  return (
    <>
      <header
        className="sticky top-0 z-40 flex h-11 w-full shrink-0 items-center gap-1.5 border-b border-line bg-[var(--z-chrome)] pl-2 select-none [-webkit-app-region:drag]"
        style={{
          paddingLeft: 'max(0.5rem, env(titlebar-area-x, 0.5rem))',
          height: 'env(titlebar-area-height, 2.75rem)',
        }}
      >
        <img
          src="/brand/icon.png"
          alt="Zivith"
          width={20}
          height={20}
          draggable={false}
          title="Zivith"
          className="mx-1 size-4 shrink-0 rounded [-webkit-app-region:no-drag]"
        />
        <span className="text-sm font-semibold tracking-tight text-[var(--z-fg)]">
          ZIVITH<span className="text-accent">.</span>
        </span>
        <span className="flex-1" />
        <DesktopWindowControls />
      </header>
      <div className="shrink-0 px-2 py-1.5">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm text-[var(--z-fg-subtle)] transition hover:bg-zinc-200/80 hover:text-[var(--z-fg)] dark:hover:bg-white/10"
          onClick={leaveAuth}
        >
          <IconArrowLeft className="size-4" />
          返回
        </button>
      </div>
    </>
  );
}
