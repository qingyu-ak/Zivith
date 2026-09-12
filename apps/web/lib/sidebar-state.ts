import { useCallback, useEffect, useState } from 'react';

export const SIDEBAR_KEYS = {
  chat: 'zivith.chatSidebarCollapsed',
  studio: 'zivith.studioSidebarCollapsed',
  worldLeft: 'zivith.worldLeftCollapsed',
  worldRight: 'zivith.worldRightCollapsed',
} as const;

export type SidebarKey = keyof typeof SIDEBAR_KEYS;

export const SIDEBAR_EVENT = 'zivith-sidebar';

export function collapsedFromStorage(value: string | null): boolean {
  return value === '1';
}

/** 不要在 setState updater 里同步 dispatch：React 重放 updater 时会在渲染期更新兄弟组件。 */
function notifySidebarListeners() {
  queueMicrotask(() => window.dispatchEvent(new Event(SIDEBAR_EVENT)));
}

export function useCollapsedSidebar(key: SidebarKey, defaultCollapsed = false) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_KEYS[key]);
    if (stored === null) {
      setCollapsed(defaultCollapsed || window.innerWidth < 1024);
      return;
    }
    setCollapsed(collapsedFromStorage(stored));
  }, [defaultCollapsed, key]);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_KEYS[key], next ? '1' : '0');
      return next;
    });
    notifySidebarListeners();
  }, [key]);

  useEffect(() => {
    function sync() {
      const stored = window.localStorage.getItem(SIDEBAR_KEYS[key]);
      if (stored === null) return;
      setCollapsed(collapsedFromStorage(stored));
    }
    window.addEventListener(SIDEBAR_EVENT, sync);
    return () => window.removeEventListener(SIDEBAR_EVENT, sync);
  }, [key]);

  return [collapsed, toggle] as const;
}
