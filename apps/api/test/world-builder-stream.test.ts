import { describe, expect, it } from 'vitest';
import {
  WorldBuilderAgent,
  chunkReply,
  mockWorldBuilderResponse,
  streamReplyChunks,
} from '../src/contexts/world-builder/world-builder-agent.js';
import { formatSseEvent, parseSseBuffer } from '../src/lib/sse.js';
import type { LLMAdapter } from '../src/ports/llm.js';

const mockLlm = {
  provider: 'mock',
  supportedModels: [],
  complete: () => {
    throw new Error('unused');
  },
  completeStructured: () => {
    throw new Error('unused');
  },
} as unknown as LLMAdapter;

describe('creator chat SSE helpers', () => {
  it('round-trips an SSE frame', () => {
    const encoded = formatSseEvent('delta', { text: '你好' });
    const { frames, rest } = parseSseBuffer(encoded);
    expect(rest).toBe('');
    expect(frames).toEqual([{ event: 'delta', data: { text: '你好' } }]);
  });

  it('keeps a partial trailing frame in the buffer', () => {
    const { frames, rest } = parseSseBuffer('event: delta\ndata: {"text":"安"');
    expect(frames).toEqual([]);
    expect(rest).toContain('event: delta');
  });
});

describe('world builder reply streaming', () => {
  it('splits CJK text into character chunks that concatenate to the original', () => {
    expect(chunkReply('安娜苏的父亲', 4)).toEqual(['安娜苏的', '父亲']);
    expect(chunkReply('安娜苏的父亲', 4).join('')).toBe('安娜苏的父亲');
    expect(chunkReply('')).toEqual([]);
  });

  it('emits every chunk then returns the full mock response', async () => {
    const agent = new WorldBuilderAgent(mockLlm);
    const input = {
      text: '我想创造一个东方玄幻世界',
      history: [{ role: 'user' as const, content: '我想创造一个东方玄幻世界' }],
      world: null,
      stage: 'bootstrap' as const,
    };
    const expected = mockWorldBuilderResponse(input);
    const deltas: string[] = [];
    const streamed = await agent.respondStream(input, (chunk) => {
      deltas.push(chunk);
    });

    expect(deltas.join('')).toBe(expected.reply);
    expect(streamed.reply).toBe(expected.reply);
    expect(streamed.proposals[0]?.kind).toBe('create_project');
  });

  it('streamReplyChunks respects delayMs=0 and custom size', async () => {
    const seen: string[] = [];
    await streamReplyChunks('abcdef', (chunk) => {
      seen.push(chunk);
    }, { chunkSize: 2, delayMs: 0 });
    expect(seen).toEqual(['ab', 'cd', 'ef']);
  });
});
