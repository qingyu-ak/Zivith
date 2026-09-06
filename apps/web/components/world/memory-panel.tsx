'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { isSparseImportArchive } from '@/lib/character-memory-view';

interface MemoryAtomItem {
  id: string;
  entity_type: string | null;
  entity_id: string | null;
  fact_type: string;
  content: string;
  created_at: string;
}

interface MemoryCoreItem {
  id: string;
  kind: string;
  topic: string;
  content: string;
  version: number;
  source_atom_ids: string[];
  updated_at: string;
}

const CORE_KIND_LABEL: Record<string, string> = {
  persona: '人物',
  scenario: '场景',
  world_rule: '世界规则',
  event_chain: '事件链',
};

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
  focusTopic,
}: {
  projectId: string;
  showTitle?: boolean;
  /** 选中角色名时只看该角色的 L2 档案 */
  focusTopic?: string;
}) {
  const [atoms, setAtoms] = useState<MemoryAtomItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cores, setCores] = useState<MemoryCoreItem[]>([]);
  const [coreFilter, setCoreFilter] = useState('');
  const [expandedCoreId, setExpandedCoreId] = useState<string | null>(null);
  const [editingCoreId, setEditingCoreId] = useState<string | null>(null);
  const [coreDraft, setCoreDraft] = useState('');
  const [coreSource, setCoreSource] = useState<Array<{ id: string; content: string }>>([]);
  const [coreSourceLoading, setCoreSourceLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [atomPage, corePage] = await Promise.all([
        api<{ items?: MemoryAtomItem[]; total?: number }>(
          `/memory/projects/${projectId}/atoms?page=1&page_size=20`,
        ),
        api<{ items?: MemoryCoreItem[] }>(`/memory/projects/${projectId}/cores`),
      ]);
      setAtoms(Array.isArray(atomPage.items) ? atomPage.items : []);
      setTotal(Number(atomPage.total ?? 0));
      setCores(Array.isArray(corePage.items) ? corePage.items : []);
      setError('');
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (focusTopic) setCoreFilter(focusTopic);
  }, [focusTopic]);

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

  const saveCore = async (core: MemoryCoreItem) => {
    const content = coreDraft.trim();
    if (!content) return;
    setBusy(true);
    try {
      await api(`/memory/projects/${projectId}/cores/${core.id}`, {
        method: 'PATCH',
        body: { content },
      });
      setEditingCoreId(null);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const toggleCore = async (core: MemoryCoreItem) => {
    if (expandedCoreId === core.id) {
      setExpandedCoreId(null);
      setCoreSource([]);
      return;
    }
    setExpandedCoreId(core.id);
    setCoreSource([]);
    setCoreSourceLoading(true);
    try {
      const detail = await api<{ source_atoms?: Array<{ id: string; content: string }> }>(
        `/memory/projects/${projectId}/cores/${core.id}`,
      );
      setCoreSource(Array.isArray(detail.source_atoms) ? detail.source_atoms : []);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setCoreSourceLoading(false);
    }
  };

  const topics = Array.from(new Set(cores.map((core) => core.topic)));
  const filteredCores = coreFilter
    ? cores.filter((core) => core.topic === coreFilter)
    : cores;

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
          还没有归档的短事实。全书档案在右侧属性里改；对话沉淀也会出现在这里。
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

      <div className="mt-3 border-t border-line pt-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium text-zinc-600">核心记忆（L2）</h4>
          {topics.length > 1 ? (
            <select
              value={coreFilter}
              onChange={(event) => setCoreFilter(event.target.value)}
              className="max-w-36 rounded border border-line bg-transparent px-1 py-0.5 text-[11px] text-zinc-600"
              title="按实体过滤"
            >
              <option value="">全部实体</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {filteredCores.length === 0 ? (
          <p className="text-xs text-zinc-400">
            {focusTopic
              ? `还没有「${focusTopic}」的全书档案。在右侧属性里点「新建档案」。`
              : '还没有核心记忆。选中角色后，在右侧属性里编辑全书档案。'}
          </p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {filteredCores.map((core) => (
              <li key={core.id} className="text-xs">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleCore(core)}
                    className="min-w-0 flex-1 rounded text-left transition hover:bg-zinc-50"
                    title="展开溯源"
                  >
                    <span className="mr-1.5 inline-flex rounded border border-line px-1 py-0.5 text-[10px] text-zinc-500">
                      {CORE_KIND_LABEL[core.kind] ?? core.kind}
                    </span>
                    <span className="font-medium text-zinc-700">{core.topic}</span>
                    <span className="ml-1 text-[10px] text-zinc-400">v{core.version}</span>
                    {editingCoreId !== core.id ? (
                      <>
                        {isSparseImportArchive(core.content) ? (
                          <p className="mt-0.5 text-[11px] text-amber-800">
                            导入统计，不是剧情记忆。右侧「TA 记得什么」列出亲历事件。
                          </p>
                        ) : null}
                        <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-zinc-600">
                          {core.content}
                        </p>
                      </>
                    ) : null}
                  </button>
                  {editingCoreId !== core.id ? (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] text-[#4d6bfe] hover:underline"
                      onClick={() => {
                        setEditingCoreId(core.id);
                        setCoreDraft(core.content);
                      }}
                    >
                      编辑
                    </button>
                  ) : null}
                </div>
                {editingCoreId === core.id ? (
                  <div className="mt-1 space-y-1">
                    <textarea
                      value={coreDraft}
                      onChange={(event) => setCoreDraft(event.target.value)}
                      rows={6}
                      className="w-full rounded border border-line bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-accent/60"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy || !coreDraft.trim()}
                        className="rounded border border-line px-2 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                        onClick={() => void saveCore(core)}
                      >
                        {busy ? '…' : '保存'}
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-zinc-400"
                        onClick={() => setEditingCoreId(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}
                {expandedCoreId === core.id ? (
                  <div className="mt-1 rounded border border-line bg-zinc-50 px-2 py-1.5">
                    <p className="text-[10px] text-zinc-500">
                      溯源 {core.source_atom_ids.length} 条原子
                    </p>
                    {coreSourceLoading ? (
                      <p className="mt-1 text-[11px] text-zinc-400">加载中…</p>
                    ) : coreSource.length === 0 ? (
                      <p className="mt-1 text-[11px] text-zinc-400">没有可显示的源原子。</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {coreSource.map((atom) => (
                          <li
                            key={atom.id}
                            className="break-words text-[11px] leading-4 text-zinc-600"
                          >
                            · {atom.content}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
