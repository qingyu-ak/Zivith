import { createHash } from 'node:crypto';

/** Fields ignored when hashing business snapshots (non-semantic / volatile). */
export const HASH_IGNORED_FIELDS = new Set([
  'updated_at',
  'updatedAt',
]);

export function toCanonicalValue(value: unknown, forHash = false): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => toCanonicalValue(item, forHash));
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      if (forHash && HASH_IGNORED_FIELDS.has(key)) continue;
      const next = toCanonicalValue(record[key], forHash);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }
  return value;
}

/** Deterministic JSON string with sorted object keys. */
export function canonicalizeJson(value: unknown, options?: { forHash?: boolean }): string {
  return JSON.stringify(toCanonicalValue(value, options?.forHash === true));
}

export function snapshotHash(value: unknown): string {
  const body = canonicalizeJson(value, { forHash: true });
  return createHash('sha256').update(body, 'utf8').digest('hex');
}
