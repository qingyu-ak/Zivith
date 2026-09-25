/// <reference types="vitest/globals" />
import { studioTalkActionView } from './studio-talk-action';

describe('studioTalkActionView', () => {
  it('keeps a failed open-talk as error, not as idle success', () => {
    expect(studioTalkActionView({ busy: false, error: '没能打开这场对话' })).toBe('error');
    expect(studioTalkActionView({ busy: true, error: '' })).toBe('busy');
    expect(studioTalkActionView({ busy: false, error: '' })).toBe('idle');
  });
});
