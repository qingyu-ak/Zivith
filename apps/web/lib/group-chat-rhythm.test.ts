import { describe, expect, it } from 'vitest';
import {
  GROUP_BEAT_MS,
  KEEP_TALKING_CAP,
  canTakeNaturalBeat,
  naturalBeatCap,
  pickNaturalFollowSpeaker,
  takeoverSpeakerIds,
  lastSpokenSpeakerId,
} from './group-chat-rhythm';

describe('group chat rhythm', () => {
  it('lets two people each take a beat after the user speaks', () => {
    expect(naturalBeatCap(2, true)).toBe(2);
    expect(naturalBeatCap(3, true)).toBe(3);
  });

  it('after a named speak, only one other person answers', () => {
    expect(naturalBeatCap(3, false)).toBe(2);
    expect(naturalBeatCap(2, false)).toBe(2);
  });

  it('does not invent a second beat when only one person can talk', () => {
    expect(naturalBeatCap(1, true)).toBe(1);
    expect(naturalBeatCap(0, false)).toBe(1);
  });

  it('hands the next beat to someone who did not just speak', () => {
    expect(
      pickNaturalFollowSpeaker({
        participantIds: ['a', 'b'],
        lastSpeakerId: 'a',
      }),
    ).toBe('b');
  });

  it('skips muted speakers instead of making the last person continue', () => {
    expect(
      pickNaturalFollowSpeaker({
        participantIds: ['a', 'b', 'c'],
        lastSpeakerId: 'a',
        mutedIds: ['b'],
      }),
    ).toBe('c');
  });

  it('stops when nobody else can take the beat', () => {
    expect(
      pickNaturalFollowSpeaker({
        participantIds: ['a', 'b'],
        lastSpeakerId: 'a',
        mutedIds: ['b'],
      }),
    ).toBe(null);
  });

  it('blocks follow-through while group talk is paused, even if a proposal is not pending', () => {
    expect(canTakeNaturalBeat({ talkPaused: true })).toBe(false);
    expect(canTakeNaturalBeat({ talkPaused: false })).toBe(true);
    expect(canTakeNaturalBeat({ talkPaused: false, pendingProposal: true })).toBe(false);
  });

  it('lets them keep talking well past a short scene, enough to run a 30-beat check', () => {
    expect(KEEP_TALKING_CAP).toBeGreaterThanOrEqual(30);
  });

  it('leaves a reading pause after a beat, long enough to finish the last line', () => {
    expect(GROUP_BEAT_MS).toBeGreaterThanOrEqual(3500);
  });

  it('puts the user character first in the takeover roster', () => {
    expect(
      takeoverSpeakerIds({
        userCharacterAssetId: 'me',
        participantIds: ['a', 'b'],
      }),
    ).toEqual(['me', 'a', 'b']);
  });

  it('reads the last spoken id from user or assistant ticks', () => {
    expect(
      lastSpokenSpeakerId([
        { role: 'user', speaker_asset_id: 'me' },
        { role: 'assistant', speaker_asset_id: 'a' },
      ]),
    ).toBe('a');
    expect(lastSpokenSpeakerId([{ role: 'user', speaker_asset_id: 'me' }])).toBe('me');
  });
});
