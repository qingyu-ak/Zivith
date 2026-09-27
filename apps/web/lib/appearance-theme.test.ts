/// <reference types="vitest/globals" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WINDOW_CHROME,
  asAppearanceTheme,
  syncDesktopAppearanceTheme,
} from './appearance-theme';

describe('asAppearanceTheme', () => {
  it('only treats dark as dark', () => {
    expect(asAppearanceTheme('dark')).toBe('dark');
  });

  it('falls back to light for empty or unknown values', () => {
    expect(asAppearanceTheme(null)).toBe('light');
    expect(asAppearanceTheme('')).toBe('light');
    expect(asAppearanceTheme('system')).toBe('light');
  });
});

describe('WINDOW_CHROME', () => {
  it('matches the dark canvas and chrome tokens', () => {
    expect(WINDOW_CHROME.dark.backgroundColor).toBe('#18181b');
    expect(WINDOW_CHROME.dark.overlayColor).toBe('#161618');
  });

  it('keeps light chrome off pure white', () => {
    expect(WINDOW_CHROME.light.backgroundColor).toBe('#e8eaee');
    expect(WINDOW_CHROME.light.overlayColor).toBe('#e2e4e8');
  });
});

describe('syncDesktopAppearanceTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the desktop shell to recolor the title bar', () => {
    const setAppearanceTheme = vi.fn().mockResolvedValue('dark');
    vi.stubGlobal('window', { zivithDesktop: { setAppearanceTheme } });
    syncDesktopAppearanceTheme('dark');
    expect(setAppearanceTheme).toHaveBeenCalledWith('dark');
  });

  it('does nothing in the browser', () => {
    vi.stubGlobal('window', {});
    expect(() => syncDesktopAppearanceTheme('dark')).not.toThrow();
  });
});
