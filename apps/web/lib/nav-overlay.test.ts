/// <reference types="vitest/globals" />
import { describe, expect, it } from 'vitest';
import { navigationHistoryFor } from './navigation-history';
import { isNavOverlay, resolveOverlayReturn } from './nav-overlay';
import { captureSettingsReturn, clearSettingsReturn } from './settings-return';

describe('isNavOverlay', () => {
  it('treats settings, help, and auth as overlays', () => {
    expect(isNavOverlay('/projects/p1/settings')).toBe(true);
    expect(isNavOverlay('/projects/p1/settings?section=models')).toBe(true);
    expect(isNavOverlay('/help')).toBe(true);
    expect(isNavOverlay('/help#feedback')).toBe(true);
    expect(isNavOverlay('/login')).toBe(true);
    expect(isNavOverlay('/register')).toBe(true);
    expect(isNavOverlay('/creator-chats/t1')).toBe(false);
    expect(isNavOverlay('/projects/p1/world')).toBe(false);
  });
});

describe('resolveOverlayReturn', () => {
  it('from Chat into settings, returns the original Chat thread', () => {
    const history = navigationHistoryFor();
    history.reset();
    clearSettingsReturn();
    history.push('/creator-chats/t1');
    history.push('/projects/p1/settings');
    expect(resolveOverlayReturn('/projects/p1/world')).toBe('/creator-chats/t1');
  });

  it('from Chat into help, returns the original Chat thread', () => {
    const history = navigationHistoryFor();
    history.reset();
    clearSettingsReturn();
    history.push('/creator-chats/t1');
    history.push('/help');
    expect(resolveOverlayReturn('/projects')).toBe('/creator-chats/t1');
  });

  it('from Chat into login, returns the original Chat thread', () => {
    const history = navigationHistoryFor();
    history.reset();
    clearSettingsReturn();
    history.push('/creator-chats/t1');
    history.push('/login');
    expect(resolveOverlayReturn('/projects')).toBe('/creator-chats/t1');
  });

  it('login then register still returns past both auth pages', () => {
    const history = navigationHistoryFor();
    history.reset();
    clearSettingsReturn();
    history.push('/projects/p1/world');
    history.push('/login');
    history.push('/register');
    expect(resolveOverlayReturn('/projects')).toBe('/projects/p1/world');
  });

  it('falls back to captured origin when the stack has only the overlay', () => {
    const history = navigationHistoryFor();
    history.reset();
    clearSettingsReturn();
    captureSettingsReturn('/creator-chats/t1');
    history.push('/help');
    expect(resolveOverlayReturn('/projects')).toBe('/creator-chats/t1');
  });
});
