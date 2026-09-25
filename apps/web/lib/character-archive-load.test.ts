/// <reference types="vitest/globals" />
import { characterArchiveLoadView } from './character-archive-load';

describe('characterArchiveLoadView', () => {
  it('treats a failed cores/atoms load as error, not as an empty archive', () => {
    expect(characterArchiveLoadView({ loading: false, loadError: '无法加载这个角色记得的事' })).toBe(
      'error',
    );
    expect(characterArchiveLoadView({ loading: true, loadError: '' })).toBe('loading');
    expect(characterArchiveLoadView({ loading: false, loadError: '' })).toBe('ready');
  });

  it('keeps error while a retry is in flight so the retry control stays on screen', () => {
    expect(characterArchiveLoadView({ loading: true, loadError: '无法加载这个角色记得的事' })).toBe(
      'error',
    );
  });
});
