/** SSE memory_ops → 对话里「想了一下」展开后的一行摘要。 */

export function formatMemoryOps(ops: Record<string, unknown>): string {
  const added = Number(ops.added ?? 0);
  const updated = Number(ops.updated ?? 0);
  const noop = Number(ops.noop ?? 0);
  const conflicts = Array.isArray(ops.conflicts) ? ops.conflicts.length : 0;
  const parts = [`归档 ${added}`];
  if (updated > 0) parts.push(`合并 ${updated}`);
  if (noop > 0) parts.push(`重复 ${noop}`);
  if (conflicts > 0) {
    const first = Array.isArray(ops.conflicts) ? ops.conflicts[0] : null;
    const record =
      first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
    const hint =
      (typeof record?.content === 'string' && record.content.trim()) ||
      (typeof record?.existing_content === 'string' && record.existing_content.trim()) ||
      '';
    parts.push(
      hint ? `冲突 ${conflicts}（待确认：${hint.slice(0, 24)}）` : `冲突 ${conflicts}（待确认）`,
    );
  }
  return `记忆：${parts.join(' · ')}`;
}
