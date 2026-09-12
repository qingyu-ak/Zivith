/// <reference types="vitest/globals" />
import { captureSettingsReturn, clearSettingsReturn, readSettingsReturn } from './settings-return';

describe('settings return', () => {
  beforeEach(() => {
    clearSettingsReturn();
  });

  it('remembers the page that opened settings', () => {
    captureSettingsReturn('/creator-chats/t1');
    expect(readSettingsReturn()).toBe('/creator-chats/t1');
    captureSettingsReturn('/projects/p1/world?line=production');
    expect(readSettingsReturn()).toBe('/projects/p1/world?line=production');
  });

  it('does not replace the origin with a settings URL', () => {
    captureSettingsReturn('/creator-chats/t1');
    captureSettingsReturn('/projects/p1/settings');
    captureSettingsReturn('/projects/p1/settings?section=models');
    expect(readSettingsReturn()).toBe('/creator-chats/t1');
  });
});
