/** 群聊接话节奏：他们自己聊，但不会连着抢话。 */

export const GROUP_BEAT_MS = 1100;
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
