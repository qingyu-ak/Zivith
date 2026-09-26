export type AppearanceTheme = 'light' | 'dark';

export const APPEARANCE_THEME_KEY = 'zivith.appearanceTheme';

export function asAppearanceTheme(value: unknown): AppearanceTheme {
  return value === 'dark' ? 'dark' : 'light';
}

export function readStoredAppearanceTheme(): AppearanceTheme {
  if (typeof window === 'undefined') return 'light';
  try {
    return asAppearanceTheme(window.localStorage.getItem(APPEARANCE_THEME_KEY));
  } catch {
    return 'light';
  }
}

export function applyAppearanceTheme(theme: AppearanceTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function writeStoredAppearanceTheme(theme: AppearanceTheme): void {
  window.localStorage.setItem(APPEARANCE_THEME_KEY, theme);
  applyAppearanceTheme(theme);
}
