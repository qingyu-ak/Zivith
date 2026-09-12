import { describe, expect, it } from 'vitest';
import {
  appendUniqueById,
  canReuseLastUser,
  errorRetryContent,
  lastUserContent,
  retryTargetForMessage,
  type ChatTurnMessage,
} from './message-actions';

function turn(id: string, role: 'user' | 'assistant' | 'system', content: string): ChatTurnMessage {
  return { id, role, content };
}

describe('lastUserContent', () => {
  it('returns the latest non-empty user turn', () => {
    expect(lastUserContent([])).toBeNull();
    expect(
      lastUserContent([
        turn('s', 'system', 'hi'),
        turn('u1', 'user', '你好'),
        turn('a1', 'assistant', '嗯'),
        turn('u2', 'user', '再问'),
      ]),
    ).toBe('再问');
  });
});

describe('retryTargetForMessage', () => {
  const thread = [
    turn('u1', 'user', '你好'),
    turn('a1', 'assistant', '你好，旅人'),
    turn('u2', 'user', '继续'),
    turn('a2', 'assistant', '好'),
  ];

  it('retries the latest assistant from the preceding user message', () => {
    expect(retryTargetForMessage(thread, 'a2')).toEqual({ ok: true, content: '继续' });
  });

  it('retries the latest user message as-is', () => {
    expect(retryTargetForMessage(thread, 'u2')).toEqual({ ok: true, content: '继续' });
  });

  it('blocks older turns so the transcript stays linear', () => {
    expect(retryTargetForMessage(thread, 'a1')).toEqual({ ok: false, blocked: 'not-latest' });
    expect(retryTargetForMessage(thread, 'u1')).toEqual({ ok: false, blocked: 'not-latest' });
  });

  it('allows retrying a trailing user turn with no assistant yet', () => {
    expect(retryTargetForMessage([turn('u1', 'user', '你好')], 'u1')).toEqual({
      ok: true,
      content: '你好',
    });
  });

  it('returns null for system or unknown ids', () => {
    expect(retryTargetForMessage([turn('s1', 'system', 'x'), ...thread], 's1')).toBeNull();
    expect(retryTargetForMessage(thread, 'missing')).toBeNull();
  });

  it('blocks empty user content', () => {
    expect(retryTargetForMessage([turn('u1', 'user', '   ')], 'u1')).toEqual({
      ok: false,
      blocked: 'empty',
    });
    expect(
      retryTargetForMessage([turn('u1', 'user', '   '), turn('a1', 'assistant', '嗯')], 'a1'),
    ).toEqual({ ok: false, blocked: 'empty' });
  });
});

describe('errorRetryContent', () => {
  it('prefers the just-sent draft over older user turns', () => {
    expect(errorRetryContent('  新问题  ', [turn('u1', 'user', '旧问题')])).toBe('新问题');
    expect(errorRetryContent('', [turn('u1', 'user', '旧问题')])).toBe('旧问题');
    expect(errorRetryContent('   ', [])).toBeNull();
  });
});

describe('canReuseLastUser', () => {
  it('reuses a trailing unpaired user with the same text', () => {
    expect(canReuseLastUser(turn('u1', 'user', '你好'), '你好', true)).toBe(true);
    expect(canReuseLastUser(turn('a1', 'assistant', '嗯'), '你好', true)).toBe(false);
    expect(canReuseLastUser(turn('u1', 'user', '你好'), '你好', false)).toBe(false);
  });
});

describe('appendUniqueById', () => {
  it('does not duplicate an already rendered message', () => {
    const first = turn('u1', 'user', '你好');
    expect(appendUniqueById([first], first)).toEqual([first]);
    expect(appendUniqueById([first], turn('a1', 'assistant', '嗯'))).toHaveLength(2);
  });
});
