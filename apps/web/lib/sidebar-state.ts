import { useCallback, useEffect, useState } from 'react';

export const SIDEBAR_KEYS = {
  chat: 'zivith.chatSidebarCollapsed',
  studio: 'zivith.studioSidebarCollapsed',
  worldLeft: 'zivith.worldLeftCollapsed',
  worldRight: 'zivith.worldRightCollapsed',
} as const;

export type SidebarKey = keyof typeof SIDEBAR_KEYS;

export function collapsedFromStorage(value: string | null): boolean {
  return value === '1';
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
      window.dispatchEvent(new Event('zivith-sidebar'));
      return next;
    });
  }, [key]);

  useEffect(() => {
    function sync() {
      const stored = window.localStorage.getItem(SIDEBAR_KEYS[key]);
      if (stored === null) return;
      setCollapsed(collapsedFromStorage(stored));
    }
    window.addEventListener('zivith-sidebar', sync);
    return () => window.removeEventListener('zivith-sidebar', sync);
  }, [key]);

  return [collapsed, toggle] as const;
}
