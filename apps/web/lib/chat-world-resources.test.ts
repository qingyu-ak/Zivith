/// <reference types="vitest/globals" />
import { chatWorldResourcesView } from './chat-world-resources';

describe('chatWorldResourcesView', () => {
  it('treats a failed world load as error, not as a missing memory entry', () => {
    expect(
      chatWorldResourcesView({ error: '无法加载这个世界的角色与记忆', hasResources: false }),
    ).toBe('error');
    expect(chatWorldResourcesView({ error: '', hasResources: true })).toBe('ready');
    expect(chatWorldResourcesView({ error: '', hasResources: false })).toBe('missing');
  });
});
