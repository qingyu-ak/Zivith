import { createHash } from 'node:crypto';
import { normalizeForFingerprint } from '@zivith/domain';

/** 规范化指纹：entityType|entityId|factType|归一化内容 的 sha256。 */
export function computeDedupHash(input: {
  entityType: string | null;
  entityId: string | null;
  factType: string;
  content: string;
}): string {
  const normalized = normalizeForFingerprint(input.content);
  return createHash('sha256')
    .update(`${input.entityType ?? ''}|${input.entityId ?? ''}|${input.factType}|${normalized}`)
    .digest('hex');
}
