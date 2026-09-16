/** Character cognition at a world-time anchor — not Agent working memory. */

export type MemorySourceKind = 'manual' | 'roleplay' | 'other';

export function resolveAtomSourceKind(
  threadId: string | null | undefined,
  roleplayThreadIds: ReadonlySet<string>,
): MemorySourceKind {
  if (!threadId) return 'manual';
  if (roleplayThreadIds.has(threadId)) return 'roleplay';
  return 'other';
}

/**
 * Whether a character fact belongs in this play turn.
 * Manual (Studio / 调整记忆) facts apply at every anchor.
 * Roleplay-sourced facts follow the source thread's world time.
 * World Builder / unknown threads never enter character cognition.
 */
export function characterAtomVisibleAtAnchor(input: {
  sourceKind: MemorySourceKind;
  /** Source roleplay thread's presentation order; null = 全书读完. */
  sourceAnchorOrder: number | null;
  /** Current play anchor; null = 全书读完. */
  currentAnchorOrder: number | null;
}): boolean {
  if (input.sourceKind === 'other') return false;
  if (input.sourceKind === 'manual') return true;
  if (input.currentAnchorOrder === null) return true;
  if (input.sourceAnchorOrder === null) return false;
  return input.sourceAnchorOrder <= input.currentAnchorOrder;
}

export type RoleplayThreadTime = {
  anchoredWorldEventId: string | null;
  characterAssetId: string;
};

export function pickCharacterAtomsForAnchor<T extends { threadId: string | null }>(
  atoms: T[],
  roleplayByThreadId: ReadonlyMap<string, { anchoredWorldEventId: string | null }>,
  eventOrderById: ReadonlyMap<string, number | null>,
  currentAnchorOrder: number | null,
): T[] {
  const roleplayThreadIds = new Set(roleplayByThreadId.keys());
  return atoms.filter((atom) => {
    const sourceKind = resolveAtomSourceKind(atom.threadId, roleplayThreadIds);
    let sourceAnchorOrder: number | null = null;
    if (sourceKind === 'roleplay' && atom.threadId) {
      const thread = roleplayByThreadId.get(atom.threadId);
      const eventId = thread?.anchoredWorldEventId ?? null;
      if (eventId) {
        sourceAnchorOrder = eventOrderById.has(eventId)
          ? (eventOrderById.get(eventId) ?? null)
          : null;
      }
    }
    return characterAtomVisibleAtAnchor({
      sourceKind,
      sourceAnchorOrder,
      currentAnchorOrder,
    });
  });
}

/** 日志是全文。检索先查目录，再打开该角色、该时间点的重要聊天。 */
export function filterRetrievedChatCatalog<
  T extends { source: string; id: string; entity_id: string | null },
>(input: {
  items: T[];
  atoms: Array<{
    id: string;
    threadId: string | null;
    entityType: string | null;
    entityId: string | null;
  }>;
  characterAssetId: string;
  currentAnchorOrder: number | null;
  roleplayByThreadId: ReadonlyMap<string, RoleplayThreadTime>;
  eventOrderById: ReadonlyMap<string, number | null>;
}): T[] {
  const atomsById = new Map(input.atoms.map((atom) => [atom.id, atom]));
  const visibleIds = new Set(
    pickCharacterAtomsForAnchor(
      input.atoms,
      input.roleplayByThreadId,
      input.eventOrderById,
      input.currentAnchorOrder,
    ).map((atom) => atom.id),
  );
  return input.items.filter((item) => {
    if (item.source !== 'atom') return false;
    const atom = atomsById.get(item.id);
    if (!atom || !visibleIds.has(atom.id)) return false;
    if (!atom.threadId) {
      return atom.entityId === input.characterAssetId || !atom.entityId;
    }
    const thread = input.roleplayByThreadId.get(atom.threadId);
    return thread?.characterAssetId === input.characterAssetId;
  });
}
