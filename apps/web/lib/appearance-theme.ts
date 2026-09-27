export type AppearanceTheme = 'light' | 'dark';

export const APPEARANCE_THEME_KEY = 'zivith.appearanceTheme';

/** 桌面窗口标题栏。颜色与 `globals.css` 的 --z-bg / --z-chrome 对齐。 */
export const WINDOW_CHROME = {
  light: { backgroundColor: '#e8eaee', overlayColor: '#e2e4e8', symbolColor: '#52525b' },
  dark: { backgroundColor: '#18181b', overlayColor: '#161618', symbolColor: '#a1a1aa' },
} as const;

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

export function syncDesktopAppearanceTheme(theme: AppearanceTheme): void {
  if (typeof window === 'undefined') return;
  const desktop = window.zivithDesktop;
  if (typeof desktop?.setAppearanceTheme !== 'function') return;
  void desktop.setAppearanceTheme(theme);
}

export function applyAppearanceTheme(theme: AppearanceTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  syncDesktopAppearanceTheme(theme);
}

export function writeStoredAppearanceTheme(theme: AppearanceTheme): void {
  window.localStorage.setItem(APPEARANCE_THEME_KEY, theme);
  applyAppearanceTheme(theme);
}
