/// <reference types="vitest/globals" />
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WINDOW_CHROME } from './appearance-theme';

const require = createRequire(import.meta.url);
const chrome = require('../../desktop/src/window-chrome.cjs') as {
  chromeForTheme: (theme: unknown) => { backgroundColor: string };
  readAppearanceTheme: (userData: string) => 'light' | 'dark';
  writeAppearanceTheme: (userData: string, theme: unknown) => 'light' | 'dark';
  applyWindowAppearance: (
    win: {
      isDestroyed?: () => boolean;
      setBackgroundColor?: (color: string) => void;
    },
    theme: unknown,
  ) => void;
};

describe('desktop window chrome', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses the same dark canvas as the web background token', () => {
    expect(chrome.chromeForTheme('dark').backgroundColor).toBe(WINDOW_CHROME.dark.backgroundColor);
  });

  it('uses the same light canvas as the web background token', () => {
    expect(chrome.chromeForTheme('light').backgroundColor).toBe(
      WINDOW_CHROME.light.backgroundColor,
    );
  });

  it('remembers the last theme in userData', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zivith-chrome-'));
    dirs.push(dir);
    expect(chrome.readAppearanceTheme(dir)).toBe('light');
    expect(chrome.writeAppearanceTheme(dir, 'dark')).toBe('dark');
    expect(chrome.readAppearanceTheme(dir)).toBe('dark');
  });

  it('recolors the window background without a native overlay', () => {
    const win = {
      isDestroyed: () => false,
      setBackgroundColor: vi.fn(),
    };
    chrome.applyWindowAppearance(win, 'dark');
    expect(win.setBackgroundColor).toHaveBeenCalledWith(WINDOW_CHROME.dark.backgroundColor);
  });
});
