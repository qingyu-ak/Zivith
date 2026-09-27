import { describe, expect, it } from 'vitest';
import {
  groupChatTitle,
  isGroupChat,
  lastAssistantSpeakerId,
  parseParticipantIds,
  pickNextSpeaker,
  sameParticipantSet,
} from '../src/contexts/roleplay/group-chat.js';

describe('group chat helpers', () => {
  it('treats empty json as a 1:1 thread', () => {
    expect(parseParticipantIds([], 'c1')).toEqual(['c1']);
    expect(isGroupChat(['c1'])).toBe(false);
    expect(isGroupChat(['c1', 'c2'])).toBe(true);
  });

  it('caps a group at three speakers', () => {
    expect(parseParticipantIds(['a', 'b', 'c', 'd'], 'a')).toEqual(['a', 'b', 'c']);
  });

  it('picks a named character from the user line', () => {
    expect(
      pickNextSpeaker({
        participantIds: ['c1', 'c2'],
        namesById: { c1: '林夕', c2: '陈默' },
        userText: '陈默，你刚才说什么？',
        lastSpeakerId: 'c1',
      }),
    ).toBe('c2');
  });

  it('does not let the same speaker continue after the user unless named', () => {
    expect(
      pickNextSpeaker({
        participantIds: ['c1', 'c2'],
        namesById: { c1: '林夕', c2: '陈默' },
        userText: '你们继续。',
        lastSpeakerId: 'c1',
      }),
    ).toBe('c2');
  });

  it('skips muted speakers unless they are the only ones left', () => {
    expect(
      pickNextSpeaker({
        participantIds: ['c1', 'c2'],
        namesById: { c1: '林夕', c2: '陈默' },
        userText: '继续',
        lastSpeakerId: null,
        mutedIds: ['c1'],
      }),
    ).toBe('c2');
  });

  it('titles a group from names', () => {
    expect(groupChatTitle(['林夕', '陈默'])).toBe('群聊 · 林夕、陈默');
    expect(sameParticipantSet(['b', 'a'], ['a', 'b'])).toBe(true);
  });

  it('reads the last assistant speaker', () => {
    expect(
      lastAssistantSpeakerId([
        { role: 'user' },
        { role: 'assistant', speakerAssetId: 'c1' },
        { role: 'assistant', speakerAssetId: 'c2' },
      ]),
    ).toBe('c2');
  });
});
