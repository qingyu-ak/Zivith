/** Conversation ticks: withdraw / rollback preview (matches server rollbackCut). */

export type TickMode = 'keep' | 'withdraw';

export interface TickMessage {
  id: string;
  role: string;
  content: string;
  speaker_name?: string | null;
  proposal_state?: string | null;
  proposal?: unknown;
}

export function userTicks<T extends { role: string }>(messages: T[]): T[] {
  return messages.filter((item) => item.role === 'user');
}

/** Chat / roleplay ticks: every spoken line. Agent stays on userTicks. */
export function dialogueTicks<T extends { role: string }>(messages: T[]): T[] {
  return messages.filter((item) => item.role === 'user' || item.role === 'assistant');
}

export function tickPreview(
  tick: { role: string; content: string; speaker_name?: string | null },
  labels?: { user?: string; assistant?: string },
): { speaker: string; snippet: string } {
  const speaker =
    tick.speaker_name?.trim() ||
    (tick.role === 'user' ? (labels?.user ?? '你') : (labels?.assistant ?? '角色'));
  const snippet = tick.content.replace(/\s+/g, ' ').trim().slice(0, 36);
  return { speaker, snippet };
}

export function rollbackSlice<T extends { id: string }>(
  messages: T[],
  targetId: string,
  mode: TickMode,
): { keep: T[]; drop: T[] } {
  const index = messages.findIndex((item) => item.id === targetId);
  if (index < 0) return { keep: messages, drop: [] };
  const keepEnd = mode === 'withdraw' ? index - 1 : index;
  return {
    keep: keepEnd >= 0 ? messages.slice(0, keepEnd + 1) : [],
    drop: messages.slice(Math.max(keepEnd + 1, 0)),
  };
}

function proposalList(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) {
    return raw.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
    );
  }
  if (raw && typeof raw === 'object') return [raw as Record<string, unknown>];
  return [];
}

export function appliedTitlesFromMessages(messages: TickMessage[]): string[] {
  const titles: string[] = [];
  for (const message of messages) {
    if (message.proposal_state !== 'applied') continue;
    for (const item of proposalList(message.proposal)) {
      const payload =
        item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
          ? (item.payload as Record<string, unknown>)
          : {};
      const title =
        (typeof payload.title === 'string' && payload.title) ||
        (typeof payload.name === 'string' && payload.name) ||
        null;
      if (title) titles.push(title);
    }
  }
  return titles;
}

export function rollbackPreview(drop: TickMessage[]): {
  dialogueCount: number;
  pendingCount: number;
  appliedTitles: string[];
} {
  return {
    dialogueCount: drop.length,
    pendingCount: drop.filter((item) => item.proposal_state === 'pending').length,
    appliedTitles: appliedTitlesFromMessages(drop),
  };
}
