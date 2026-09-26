/// <reference types="vitest/globals" />
import { describe, expect, it } from 'vitest';
import { asAppearanceTheme } from './appearance-theme';

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
