/** 群聊接话节奏：他们自己聊，但不会连着抢话。 */

/** Pause after a spoken beat is on screen, before the next speaker starts. First reply to the user is not delayed. */
export const GROUP_BEAT_MS = 3500;
/** 点「让他们一直说」后，互聊上限；要再聊就再点一次。暂停交流 / 插话会立刻停。 */
export const KEEP_TALKING_CAP = 40;

export function naturalBeatCap(unmutedCount: number, fromUser: boolean): number {
  if (unmutedCount <= 1) return 1;
  if (fromUser) return Math.min(3, unmutedCount);
  return 2;
}

export function canTakeNaturalBeat(input: {
  talkPaused: boolean;
  pendingProposal?: boolean;
}): boolean {
  return !input.talkPaused && !input.pendingProposal;
}

export function pickNaturalFollowSpeaker(input: {
  participantIds: string[];
  lastSpeakerId: string | null;
  mutedIds?: string[];
}): string | null {
  const muted = new Set(input.mutedIds ?? []);
  const available = input.participantIds.filter((id) => id && !muted.has(id));
  const pool = available.length > 0 ? available : input.participantIds.filter(Boolean);
  const next = input.lastSpeakerId ? pool.filter((id) => id !== input.lastSpeakerId) : pool;
  return next[0] ?? null;
}

/** Speakers while AI is ghostwriting the user's character: that character plus the AI roster. */
export function takeoverSpeakerIds(input: {
  userCharacterAssetId: string | null | undefined;
  participantIds: string[];
}): string[] {
  const roster = input.participantIds.filter(Boolean);
  const userId = input.userCharacterAssetId?.trim();
  if (!userId) return roster;
  return [userId, ...roster.filter((id) => id !== userId)];
}

export function lastSpokenSpeakerId(
  messages: Array<{ role?: string; speaker_asset_id?: string | null }>,
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const id = messages[index]?.speaker_asset_id;
    if (id) return id;
  }
  return null;
}
