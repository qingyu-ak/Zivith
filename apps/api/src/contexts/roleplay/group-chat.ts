const MAX_GROUP_SIZE = 3;

export function parseParticipantIds(value: unknown, fallbackCharacterId: string): string[] {
  const fromJson = Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
    : [];
  if (fromJson.length >= 2) return fromJson.slice(0, MAX_GROUP_SIZE);
  return fallbackCharacterId ? [fallbackCharacterId] : [];
}

export function isGroupChat(participantIds: string[]): boolean {
  return participantIds.length >= 2;
}

export function sameParticipantSet(left: string[], right: string[]): boolean {
  return [...left].sort().join('\0') === [...right].sort().join('\0');
}

export function normalizeGroupParticipants(ids: string[]): string[] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  return unique.slice(0, MAX_GROUP_SIZE);
}

export function groupChatTitle(names: string[]): string {
  const label = names.filter(Boolean).join('、') || '群聊';
  return `群聊 · ${label}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function pickNextSpeaker(input: {
  participantIds: string[];
  namesById: Record<string, string>;
  userText: string;
  lastSpeakerId: string | null;
  mutedIds?: string[];
}): string {
  const muted = new Set(input.mutedIds ?? []);
  const available = input.participantIds.filter((id) => !muted.has(id));
  const pool = available.length > 0 ? available : input.participantIds;
  const text = input.userText.trim();
  if (text) {
    for (const id of pool) {
      const name = input.namesById[id]?.trim();
      if (!name || name.length < 1) continue;
      const mentioned = text.includes(`@${name}`) || new RegExp(escapeRegExp(name)).test(text);
      if (mentioned) return id;
    }
  }
  const notLast = input.lastSpeakerId ? pool.filter((id) => id !== input.lastSpeakerId) : pool;
  return notLast[0] ?? pool[0] ?? input.participantIds[0] ?? '';
}

export function lastAssistantSpeakerId(
  messages: Array<{ role: string; speakerAssetId?: string | null }>,
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const row = messages[index];
    if (row?.role === 'assistant' && row.speakerAssetId) return row.speakerAssetId;
  }
  return null;
}
