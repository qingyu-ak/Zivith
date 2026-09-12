/// <reference types="vitest/globals" />
import { WEB_CHAT_NEEDS_WORLD, WEB_CHAT_NEEDS_WORLD_EMPTY, WEB_FOLDER_HINT } from './desktop';

describe('desktop user copy', () => {
  it('never mentions pnpm desktop in browser-facing folder/chat hints', () => {
    expect(WEB_FOLDER_HINT).not.toMatch(/pnpm/i);
    expect(WEB_CHAT_NEEDS_WORLD).not.toMatch(/pnpm/i);
    expect(WEB_CHAT_NEEDS_WORLD_EMPTY).not.toMatch(/pnpm/i);
    expect(WEB_FOLDER_HINT).toContain('桌面应用');
  });
});
