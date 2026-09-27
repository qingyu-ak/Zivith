'use client';

import { useEffect, useState } from 'react';

const iconClass = 'size-2.5';

function IconMinimize() {
  return (
    <svg viewBox="0 0 10 10" className={iconClass} aria-hidden>
      <path d="M1 5h8" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function IconMaximize() {
  return (
    <svg viewBox="0 0 10 10" className={iconClass} aria-hidden>
      <rect x="1.4" y="1.4" width="7.2" height="7.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function IconRestore() {
  return (
    <svg viewBox="0 0 10 10" className={iconClass} aria-hidden>
      <path d="M2.4 3.2h4.4v4.4H2.4z" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d="M3.6 2.2h4.4v4.4" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 10 10" className={iconClass} aria-hidden>
      <path d="M2 2l6 6M8 2L2 8" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

const controlClass =
  'grid h-11 w-11 shrink-0 place-items-center text-zinc-500 transition hover:bg-zinc-200/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100 [-webkit-app-region:no-drag]';

export function DesktopWindowControls() {
  const [visible, setVisible] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const desktop = window.zivithDesktop;
    if (!desktop?.hasWindowControls) return;
    setVisible(true);
    void desktop.isWindowMaximized?.().then((value) => setMaximized(Boolean(value)));
    return desktop.onWindowMaximized?.((value) => setMaximized(value));
  }, []);

  if (!visible) return null;

  const desktop = window.zivithDesktop;

  return (
    <div className="flex h-11 shrink-0 self-stretch [-webkit-app-region:no-drag]">
      <button
        type="button"
        title="最小化"
        aria-label="最小化"
        className={controlClass}
        onClick={() => void desktop?.minimizeWindow?.()}
      >
        <IconMinimize />
      </button>
      <button
        type="button"
        title={maximized ? '还原' : '最大化'}
        aria-label={maximized ? '还原' : '最大化'}
        className={controlClass}
        onClick={() => void desktop?.toggleMaximizeWindow?.()}
      >
        {maximized ? <IconRestore /> : <IconMaximize />}
      </button>
      <button
        type="button"
        title="关闭"
        aria-label="关闭"
        className={`${controlClass} hover:bg-[#e81123] hover:text-white dark:hover:bg-[#e81123] dark:hover:text-white`}
        onClick={() => void desktop?.closeWindow?.()}
      >
        <IconClose />
      </button>
    </div>
  );
}
