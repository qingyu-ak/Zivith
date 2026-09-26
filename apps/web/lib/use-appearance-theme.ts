'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  APPEARANCE_THEME_KEY,
  applyAppearanceTheme,
  asAppearanceTheme,
  readStoredAppearanceTheme,
  writeStoredAppearanceTheme,
  type AppearanceTheme,
} from './appearance-theme';

export function useAppearanceTheme(): [AppearanceTheme, (next: AppearanceTheme) => void] {
  const [theme, setTheme] = useState<AppearanceTheme>('light');

  useEffect(() => {
    const current = readStoredAppearanceTheme();
    setTheme(current);
    applyAppearanceTheme(current);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_THEME_KEY) return;
      const next = asAppearanceTheme(event.newValue);
      setTheme(next);
      applyAppearanceTheme(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((next: AppearanceTheme) => {
    setTheme(next);
    writeStoredAppearanceTheme(next);
  }, []);

  return [theme, update];
}
