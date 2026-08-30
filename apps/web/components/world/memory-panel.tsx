'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';

interface MemoryAtomItem {
  id: string;
  entity_type: string | null;
  entity_id: string | null;
  fact_type: string;
  content: string;
  created_at: string;
}

const FACT_LABEL: Record<string, string> = {
  trait: '性格',
  desire: '目标',
  event: '事件',
  relation: '关系',
  rule: '规则',
  preference: '偏好',
  constraint: '约束',
  episodic: '事实',
};

export function MemoryPanel({
  projectId,
  showTitle = true,
}: {
  projectId: string;
  showTitle?: boolean;
}) {
  const [atoms, setAtoms] = useState<MemoryAtomItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const value = await api<{ items?: MemoryAtomItem[]; total?: number }>(
        `/memory/projects/${projectId}/atoms?page=1&page_size=20`,
      );
      setAtoms(Array.isArray(value.items) ? value.items : []);
      setTotal(Number(value.total ?? 0));
      setError('');
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (atomId: string) => {
    setBusy(true);
    try {
      await api(`/memory/atoms/${atomId}`, { method: 'DELETE' });
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const rebuild = async () => {
    setBusy(true);
    try {
      await api('/memory/rebuild', { method: 'POST', body: { project_id: projectId } });
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={showTitle ? 'rounded-lg border border-line bg-white/70 p-3' : 'px-3 pb-1'}>
      <div className={`mb-2 flex items-center ${showTitle ? 'justify-between' : 'justify-end'}`}>
        {showTitle ? (
          <h3 className="text-sm font-medium text-zinc-700">长期记忆（L1 原子）</h3>
        ) : null}
        <button
          type="button"
          onClick={() => void rebuild()}
          disabled={busy}
          className="rounded border border-line px-2 py-0.5 text-xs text-zinc-500 hover:border-accent/60 hover:text-accent disabled:opacity-50"
        >
          重建向量
        </button>
      </div>
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
      {atoms.length === 0 ? (
        <p className="text-xs text-zinc-400">
          还没有归档的记忆。在 Creator Chat 中聊设定即可沉淀。
        </p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto">
          {atoms.map((atom) => (
            <li key={atom.id} className="flex items-start justify-between gap-2 text-xs">
              <div className="min-w-0">
                <span className="mr-1.5 inline-flex rounded border border-line px-1 py-0.5 text-[10px] text-zinc-500">
                  {FACT_LABEL[atom.fact_type] ?? atom.fact_type}
                </span>
                <span className="break-words text-zinc-700">{atom.content}</span>
              </div>
              <button
                type="button"
                onClick={() => void remove(atom.id)}
                disabled={busy}
                className="shrink-0 text-zinc-400 hover:text-red-500 disabled:opacity-50"
                title="删除该记忆"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {total > atoms.length && (
        <p className="mt-1.5 text-[10px] text-zinc-400">共 {total} 条，仅显示最近 20 条</p>
      )}
    </section>
  );
}
