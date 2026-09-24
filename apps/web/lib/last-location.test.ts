/// <reference types="vitest/globals" />
import { parseRestorablePath } from './last-location';

describe('parseRestorablePath', () => {
  it('keeps chat home, a thread, and studio world/chat', () => {
    expect(parseRestorablePath('/creator-chats')).toBe('/creator-chats');
    expect(parseRestorablePath('/creator-chats/7efb1748-3840-447d-b8f8-2b20550afec7')).toBe(
      '/creator-chats/7efb1748-3840-447d-b8f8-2b20550afec7',
    );
    expect(parseRestorablePath('/projects/22afd996-d076-4b15-a6bc-b856e6dfa962/world')).toBe(
      '/projects/22afd996-d076-4b15-a6bc-b856e6dfa962/world',
    );
    expect(parseRestorablePath('/projects/22afd996-d076-4b15-a6bc-b856e6dfa962/chat')).toBe(
      '/projects/22afd996-d076-4b15-a6bc-b856e6dfa962/chat',
    );
  });

  it('accepts a same-app URL and drops query/hash', () => {
    expect(
      parseRestorablePath(
        'http://127.0.0.1:3100/creator-chats/7efb1748-3840-447d-b8f8-2b20550afec7?x=1#y',
      ),
    ).toBe('/creator-chats/7efb1748-3840-447d-b8f8-2b20550afec7');
  });

  it('drops login, new-world wizard, settings, production, and non-http URLs', () => {
    expect(parseRestorablePath('/login')).toBeNull();
    expect(parseRestorablePath('/register')).toBeNull();
    expect(parseRestorablePath('/projects/new')).toBeNull();
    expect(parseRestorablePath('/projects/22afd996-d076-4b15-a6bc-b856e6dfa962/settings')).toBeNull();
    expect(parseRestorablePath('/projects/22afd996-d076-4b15-a6bc-b856e6dfa962/production')).toBeNull();
    expect(parseRestorablePath('javascript:alert(1)')).toBeNull();
    expect(parseRestorablePath('https://evil.example/creator-chats')).toBeNull();
  });
});
