import { describe, expect, it } from 'vitest';
import { collectHotwords, isNameLikeHotword } from '../src/contexts/voice/hotwords.js';
import {
  collapseRepeatArtifacts,
  isLikelyUtterance,
  isVoicedFrame,
  shouldKeepTranscript,
} from '../src/contexts/voice/transcript.js';

describe('hotwords', () => {
  it('keeps entity names and ignores alias fragments by never ingesting them', () => {
    expect(collectHotwords([{ name: '诺诺' }, { name: '路明非' }], ['旧城区', '如果路'])).toEqual([
      '诺诺',
      '路明非',
      '旧城区',
      '如果路',
    ]);
  });

  it('rejects particles and overlong titles', () => {
    expect(isNameLikeHotword('诺诺也')).toBe(false);
    expect(isNameLikeHotword('诺诺的房间')).toBe(false);
    expect(isNameLikeHotword('这是一句很长的世界事件标题所以不像专名')).toBe(false);
    expect(isNameLikeHotword('Zivith')).toBe(true);
  });
});

describe('transcript cleanup', () => {
  it('collapses triple CJK repeats without flattening 爸爸', () => {
    expect(collapseRepeatArtifacts('今天天天气不错')).toBe('今天天气不错');
    expect(collapseRepeatArtifacts('爸爸')).toBe('爸爸');
  });

  it('drops latin letter salad and silence', () => {
    expect(isLikelyUtterance('M M M A')).toBe(false);
    expect(isLikelyUtterance('hello')).toBe(true);
    expect(isLikelyUtterance('今天天气')).toBe(true);
    expect(shouldKeepTranscript('听写完成文本', 0)).toBe(false);
    expect(shouldKeepTranscript('听写完成文本', 2)).toBe(true);
  });

  it('treats near-zero PCM as unvoiced', () => {
    expect(isVoicedFrame(new Float32Array(1600))).toBe(false);
    expect(isVoicedFrame(Float32Array.from({ length: 1600 }, () => 0.1))).toBe(true);
  });
});
