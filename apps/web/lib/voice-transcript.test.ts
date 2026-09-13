import { describe, expect, it } from 'vitest';
import { insertDictatedText, shouldInsertTranscript } from './voice-transcript';

describe('shouldInsertTranscript', () => {
  it('rejects mic noise salad and keeps real phrases', () => {
    expect(shouldInsertTranscript('M M M A')).toBe(false);
    expect(shouldInsertTranscript('MM我')).toBe(false);
    expect(shouldInsertTranscript('今天天气不错')).toBe(true);
    expect(shouldInsertTranscript('hello')).toBe(true);
  });
});

describe('insertDictatedText', () => {
  it('collapses repeat artifacts and skips junk', () => {
    expect(insertDictatedText('', 0, '今天天天气不错')).toEqual({
      value: '今天天气不错',
      cursor: 6,
    });
    expect(insertDictatedText('已有', 2, 'M M M A')).toEqual({ value: '已有', cursor: 2 });
  });
});
