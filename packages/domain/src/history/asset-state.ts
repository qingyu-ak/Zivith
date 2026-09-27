/**
 * World-asset (character / location) State over Presentation Time.
 * EntityRevision is history, not a second Timeline (ADR-0007).
 */

export interface AssetRevisionLike {
  revision: number;
  change_kind?: string;
  changeKind?: string;
  snapshot?: unknown;
  as_of_presentation_order?: number | null;
}

function snapshotRecord(snapshot: unknown): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  return snapshot as Record<string, unknown>;
}

/** Presentation order this revision starts applying at; null = unbound. */
export function assetRevisionAsOfOrder(revision: AssetRevisionLike): number | null {
  if (typeof revision.as_of_presentation_order === 'number') {
    return Number.isFinite(revision.as_of_presentation_order)
      ? revision.as_of_presentation_order
      : null;
  }
  const snapshot = snapshotRecord(revision.snapshot);
  const value = snapshot?.as_of_presentation_order;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

/**
 * Card at world time T.
 * - `presentationOrder === null` (全书读完): latest revision
 * - unbound revision 1 is the origin state (applies from the beginning)
 * - later unbound revisions do not rewrite the past (they are current-card saves)
 * - bound revisions apply from their as_of order onward until a later bound revision
 */
export function pickAssetRevisionAtOrder<T extends AssetRevisionLike>(
  revisions: readonly T[],
  presentationOrder: number | null,
): T | null {
  if (revisions.length === 0) return null;
  const sorted = [...revisions].sort((left, right) => left.revision - right.revision);
  if (presentationOrder === null) return sorted[sorted.length - 1] ?? null;

  let chosen: T | null = null;
  let chosenAsOf = Number.NEGATIVE_INFINITY;
  for (const revision of sorted) {
    const asOf = assetRevisionAsOfOrder(revision);
    if (asOf === null) {
      if (revision.revision === 1 && chosen === null) chosen = revision;
      continue;
    }
    if (asOf <= presentationOrder && asOf >= chosenAsOf) {
      chosen = revision;
      chosenAsOf = asOf;
    }
  }
  return chosen;
}
