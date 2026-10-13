export function stampAppliedEntityIds(
  raw: unknown,
  results: Array<{ kind: string; entity_id: string; entity_type: string }>,
): unknown[] {
  const list: unknown[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const queue = [...results];
  return list.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const record = item as Record<string, unknown>;
    const kind = typeof record.kind === 'string' ? record.kind : '';
    const matchIndex = queue.findIndex((result) => result.kind === kind);
    if (matchIndex < 0) return item;
    const match = queue.splice(matchIndex, 1)[0];
    if (!match) return item;
    const payload =
      record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
        ? { ...(record.payload as Record<string, unknown>) }
        : {};
    payload.applied_entity_id = match.entity_id;
    payload.applied_entity_type = match.entity_type;
    return { ...record, payload };
  });
}

export function appliedEntitiesFromProposal(raw: unknown): Array<{
  kind: string;
  entityId: string;
  entityType: string;
  title: string;
}> {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: Array<{ kind: string; entityId: string; entityType: string; title: string }> = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const payload =
      record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
        ? (record.payload as Record<string, unknown>)
        : {};
    const entityId = typeof payload.applied_entity_id === 'string' ? payload.applied_entity_id : '';
    if (!entityId) continue;
    const title =
      (typeof payload.title === 'string' && payload.title) ||
      (typeof payload.name === 'string' && payload.name) ||
      entityId;
    out.push({
      kind: typeof record.kind === 'string' ? record.kind : '',
      entityId,
      entityType:
        typeof payload.applied_entity_type === 'string' ? payload.applied_entity_type : '',
      title,
    });
  }
  return out;
}

/** Chat/roleplay may cut on a spoken line. Agent stays on the user tick. */
export function canRollbackToMessage(input: { role: string; isRoleplay: boolean }): boolean {
  if (input.role === 'user') return true;
  return input.isRoleplay && input.role === 'assistant';
}

export function rollbackCut(input: {
  messages: Array<{ id: string; role: string }>;
  targetMessageId: string;
  mode: 'withdraw' | 'keep';
}): { headMessageId: string | null; suppressIds: string[] } {
  const index = input.messages.findIndex((item) => item.id === input.targetMessageId);
  if (index < 0) return { headMessageId: null, suppressIds: [] };
  const keepEnd = input.mode === 'withdraw' ? index - 1 : index;
  const headMessageId = keepEnd >= 0 ? (input.messages[keepEnd]?.id ?? null) : null;
  const suppressIds = input.messages.slice(Math.max(keepEnd + 1, 0)).map((item) => item.id);
  return { headMessageId, suppressIds };
}

export function wasStudioEdited(createdAt: Date, updatedAt: Date, now = new Date()): boolean {
  const delta = updatedAt.getTime() - createdAt.getTime();
  return delta > 2_000 && updatedAt.getTime() <= now.getTime();
}
