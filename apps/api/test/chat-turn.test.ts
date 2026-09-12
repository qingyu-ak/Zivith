import { describe, expect, it } from 'vitest';
import { canReuseLastUser, isOpenProposalState } from '../src/lib/chat-turn.js';

describe('canReuseLastUser', () => {
  it('reuses a trailing user turn with the same text', () => {
    expect(canReuseLastUser({ role: 'user', content: '  你好  ' }, '你好', true)).toBe(true);
  });

  it('creates a new turn after an assistant reply or different text', () => {
    expect(canReuseLastUser({ role: 'assistant', content: '嗯' }, '你好', true)).toBe(false);
    expect(canReuseLastUser({ role: 'user', content: '旧的' }, '你好', true)).toBe(false);
    expect(canReuseLastUser({ role: 'user', content: '你好' }, '你好', false)).toBe(false);
    expect(canReuseLastUser(null, '你好', true)).toBe(false);
  });
});

describe('isOpenProposalState', () => {
  it('treats pending and unset as open', () => {
    expect(isOpenProposalState('pending')).toBe(true);
    expect(isOpenProposalState(null)).toBe(true);
    expect(isOpenProposalState('applied')).toBe(false);
    expect(isOpenProposalState('rejected')).toBe(false);
  });
});
