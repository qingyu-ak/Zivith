'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppearanceTheme } from '@/lib/use-appearance-theme';
import { IconMoon, IconPhone, IconSun } from './nav-icons';

const buttonClass =
  'grid size-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-200/80 hover:text-zinc-800 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-100';

/** Chat 侧栏账户条：连接手机端入口 + 浅色/深色切换。 */
export function TitleBarTools() {
  const [theme, setTheme] = useAppearanceTheme();
  const dark = theme === 'dark';
  const [phoneOpen, setPhoneOpen] = useState(false);
  const phoneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!phoneOpen) return;
    function onPointer(event: MouseEvent) {
      if (!phoneRef.current?.contains(event.target as Node)) setPhoneOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setPhoneOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [phoneOpen]);

  return (
    <div className="flex shrink-0 items-center">
      <div className="relative" ref={phoneRef}>
        <button
          type="button"
          title="连接手机端"
          aria-label="连接手机端"
          aria-expanded={phoneOpen}
          aria-haspopup="dialog"
          className={`${buttonClass} ${
            phoneOpen ? 'bg-zinc-200/80 text-zinc-900 dark:bg-white/10 dark:text-zinc-100' : ''
          }`}
          onClick={() => setPhoneOpen((open) => !open)}
        >
          <IconPhone className="size-4" />
        </button>
        {phoneOpen ? (
          <div
            role="dialog"
            aria-labelledby="connect-phone-title"
            className="absolute bottom-[calc(100%+8px)] right-0 z-20 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          >
            <p
              id="connect-phone-title"
              className="px-3 pt-3 text-sm font-medium text-zinc-800 dark:text-zinc-100"
            >
              连接手机端
            </p>
            <p className="px-3 pb-3 pt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              手机端尚未接入。之后可以在这里把桌面端和手机上的 Zivith 连起来。
            </p>
            <button
              type="button"
              className="w-full border-t border-zinc-200 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-white/5"
              onClick={() => setPhoneOpen(false)}
            >
              关闭
            </button>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        title={dark ? '切换为浅色' : '切换为深色'}
        aria-label={dark ? '切换为浅色' : '切换为深色'}
        aria-pressed={dark}
        className={buttonClass}
        onClick={() => setTheme(dark ? 'light' : 'dark')}
      >
        {dark ? <IconMoon className="size-4" /> : <IconSun className="size-4" />}
      </button>
    </div>
  );
}
