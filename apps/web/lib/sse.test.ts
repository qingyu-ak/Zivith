/// <reference types="vitest/globals" />
import { chunkText, parseSseBuffer } from './sse';

describe('parseSseBuffer', () => {
  it('parses multiple frames and leaves a partial tail', () => {
    const { frames, rest } = parseSseBuffer(
      'event: user\ndata: {"ok":true}\n\nevent: delta\ndata: {"text":"安"}\n\nevent: done\ndata: {',
    );
    expect(frames).toEqual([
      { event: 'user', data: { ok: true } },
      { event: 'delta', data: { text: '安' } },
    ]);
    expect(rest).toBe('event: done\ndata: {');
  });

  it('chunks CJK text', () => {
    expect(chunkText('安娜苏的父亲', 4)).toEqual(['安娜苏的', '父亲']);
  });
});
