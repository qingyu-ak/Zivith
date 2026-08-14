'use client';

import { Badge } from '@zivith/ui';
import type { WorldConflictDTO, WorldSelection } from '@/lib/types';
import { firstConflictSelection } from '@/lib/world-conflicts';

export function WorldConflictList({
  conflicts,
  onSelect,
  hint = true,
}: {
  conflicts: WorldConflictDTO[];
  onSelect?: (selection: NonNullable<WorldSelection>) => void;
  hint?: boolean;
}) {
  if (conflicts.length === 0) return null;

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-600">设定冲突</p>
        <Badge tone="warning">{conflicts.length}</Badge>
      </div>
      <ul className="mt-1.5 grid gap-1">
        {conflicts.map((conflict) => {
          const selection = firstConflictSelection(conflict);
          if (onSelect && selection) {
            return (
              <li key={conflict.id}>
                <button
                  type="button"
                  onClick={() => onSelect(selection)}
                  className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-left text-xs leading-5 text-amber-800 transition hover:border-amber-500/40"
                >
                  <span>{conflict.summary}</span>
                  {conflict.evidence && conflict.evidence.length > 0 ? (
                    <span className="mt-0.5 block text-[11px] text-amber-700/80">
                      点此打开，改描述里的 {conflict.evidence.map((item) => `「${item}」`).join(' / ')}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          }
          return (
            <li
              key={conflict.id}
              className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-xs leading-5 text-amber-800"
            >
              {conflict.summary}
            </li>
          );
        })}
      </ul>
      {hint ? (
        <p className="mt-1 text-[11px] leading-4 text-zinc-600">
          点一条冲突，右侧会打开对应实体。改描述里互相打架的句子后保存；系统不会自动改。
        </p>
      ) : (
        <p className="mt-1 text-[11px] leading-4 text-zinc-600">只报告，不会自动修改。请确认要保留哪一则后再改档案。</p>
      )}
    </div>
  );
}
