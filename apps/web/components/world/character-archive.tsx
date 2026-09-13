'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { WorldResourcesDTO, WorldSelection } from '@/lib/types';
import {
  eventsExperiencedBy,
  isSparseImportArchive,
  relationshipsForCharacter,
  worldEventSummary,
  worldEventTitle,
} from '@/lib/character-memory-view';

interface MemoryCoreItem {
  id: string;
  kind: string;
  topic: string;
  content: string;
  version: number;
}

interface MemoryAtomItem {
  id: string;
  content: string;
  fact_type: string;
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

const EXPERIENCE_PREVIEW = 12;

/** 选中角色后列出 TA 实际记得什么：亲历事件、关系、事实、档案正文。 */
export function CharacterArchive({
  projectId,
  characterId,
  characterName,
  resources,
  onSelect,
}: {
  projectId: string;
  characterId: string;
  characterName: string;
  resources: WorldResourcesDTO;
  onSelect?: (selection: Exclude<WorldSelection, null>) => void;
}) {
  const [core, setCore] = useState<MemoryCoreItem | null>(null);
  const [atoms, setAtoms] = useState<MemoryAtomItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingAtomId, setEditingAtomId] = useState<string | 'new' | null>(null);
  const [atomDraft, setAtomDraft] = useState('');
  const [atomFactType, setAtomFactType] = useState('trait');

  const experiences = eventsExperiencedBy(resources, characterId);
  const relations = relationshipsForCharacter(resources, characterId);
  const sparseArchive = Boolean(core && isSparseImportArchive(core.content));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [coresPage, atomsPage] = await Promise.all([
        api<{ items?: MemoryCoreItem[] }>(`/memory/projects/${projectId}/cores`),
        api<{ items?: MemoryAtomItem[] }>(
          `/memory/projects/${projectId}/atoms?entity_type=character&entity_id=${encodeURIComponent(characterId)}&page=1&page_size=20`,
        ),
      ]);
      const matched =
        (coresPage.items ?? []).find(
          (item) => item.kind === 'persona' && item.topic === characterName,
        ) ?? null;
      setCore(matched);
      setDraft(matched?.content ?? '');
      setAtoms(Array.isArray(atomsPage.items) ? atomsPage.items : []);
      setError('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [projectId, characterId, characterName]);

  useEffect(() => {
    void load();
    setEditing(false);
    setEditingAtomId(null);
  }, [load]);

  async function save() {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = core
        ? await api<MemoryCoreItem>(`/memory/projects/${projectId}/cores/${core.id}`, {
            method: 'PATCH',
            body: { content },
          })
        : await api<MemoryCoreItem>(`/memory/projects/${projectId}/cores`, {
            method: 'POST',
            body: { kind: 'persona', topic: characterName, content },
          });
      setCore(saved);
      setDraft(saved.content);
      setEditing(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveAtom() {
    const content = atomDraft.trim();
    if (!content || busy) return;
    setBusy(true);
    setError('');
    try {
      if (editingAtomId === 'new') {
        await api<MemoryAtomItem>(`/memory/projects/${projectId}/atoms`, {
          method: 'POST',
          body: {
            entity_type: 'character',
            entity_id: characterId,
            fact_type: atomFactType,
            content,
          },
        });
      } else if (editingAtomId) {
        await api<MemoryAtomItem>(`/memory/atoms/${editingAtomId}`, {
          method: 'PATCH',
          body: { content },
        });
      }
      setEditingAtomId(null);
      setAtomDraft('');
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function removeAtom(atomId: string) {
    setBusy(true);
    try {
      await api(`/memory/atoms/${atomId}`, { method: 'DELETE' });
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-line px-4 py-3">
      <h3 className="text-xs font-semibold tracking-wider text-zinc-500">TA 记得什么</h3>
      <p className="mt-1 text-[11px] leading-5 text-zinc-500">
        扮演「全书读完」时读这些：亲历事件、关系、补充事实，再加上档案正文。和上面角色卡冲突时以角色卡为准。
      </p>
      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}

      <MemoryGroup
        title={`亲历 · ${experiences.length} 件`}
        empty={
          experiences.length === 0
            ? '时间线上还没有把这个角色绑到事件。导入的「出场章数」不算记得剧情。'
            : null
        }
      >
        {experiences.slice(0, EXPERIENCE_PREVIEW).map((event) => {
          const summary = worldEventSummary(event);
          return (
            <li key={event.id}>
              <button
                type="button"
                className="w-full rounded px-0.5 text-left hover:bg-zinc-50"
                onClick={() => onSelect?.({ kind: 'world_event', id: event.id })}
              >
                <span className="text-xs text-zinc-800">{worldEventTitle(event)}</span>
                {summary ? (
                  <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-zinc-500">
                    {summary}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
        {experiences.length > EXPERIENCE_PREVIEW ? (
          <li className="text-[11px] text-zinc-400">
            还有 {experiences.length - EXPERIENCE_PREVIEW} 件，在中间时间线上看。
          </li>
        ) : null}
      </MemoryGroup>

      <MemoryGroup
        title={`认识谁 · ${relations.length}`}
        empty={relations.length === 0 ? '还没有关系。' : null}
      >
        {relations.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="w-full rounded px-0.5 text-left text-xs text-zinc-700 hover:bg-zinc-50"
              onClick={() => onSelect?.({ kind: 'relationship', id: item.id })}
            >
              {item.label}
            </button>
          </li>
        ))}
      </MemoryGroup>

      <MemoryGroup title={`补充事实 · ${atoms.length}`} empty={null}>
        {!loading && atoms.length === 0 && editingAtomId !== 'new' ? (
          <li className="text-[11px] leading-5 text-zinc-400">
            还没有短事实。导入的出场统计不是剧情；点「添加事实」写一条 TA 记得的事。
          </li>
        ) : null}
        {atoms.map((atom) => (
          <li key={atom.id} className="text-xs">
            {editingAtomId === atom.id ? (
              <AtomDraft
                factType={atom.fact_type}
                draft={atomDraft}
                busy={busy}
                allowFactType={false}
                onDraft={setAtomDraft}
                onFactType={setAtomFactType}
                onSave={() => void saveAtom()}
                onCancel={() => {
                  setEditingAtomId(null);
                  setAtomDraft('');
                }}
              />
            ) : (
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words text-zinc-600">
                  <span className="mr-1 text-[10px] text-zinc-400">
                    {FACT_LABEL[atom.fact_type] ?? atom.fact_type}
                  </span>
                  {atom.content}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-[11px] text-[#4d6bfe] hover:underline disabled:opacity-50"
                    onClick={() => {
                      setEditingAtomId(atom.id);
                      setAtomDraft(atom.content);
                      setAtomFactType(atom.fact_type);
                    }}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    title="删除这条事实"
                    className="text-zinc-400 hover:text-red-500 disabled:opacity-50"
                    onClick={() => void removeAtom(atom.id)}
                  >
                    ✕
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
        {editingAtomId === 'new' ? (
          <li>
            <AtomDraft
              factType={atomFactType}
              draft={atomDraft}
              busy={busy}
              allowFactType
              onDraft={setAtomDraft}
              onFactType={setAtomFactType}
              onSave={() => void saveAtom()}
              onCancel={() => {
                setEditingAtomId(null);
                setAtomDraft('');
              }}
            />
          </li>
        ) : (
          <li>
            <button
              type="button"
              disabled={busy}
              className="text-[11px] text-accent hover:underline disabled:opacity-50"
              onClick={() => {
                setEditingAtomId('new');
                setAtomDraft('');
                setAtomFactType('trait');
              }}
            >
              添加事实
            </button>
          </li>
        )}
      </MemoryGroup>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-zinc-500">档案正文</p>
          {!editing ? (
            <button
              type="button"
              onClick={() => {
                setDraft(core?.content ?? `姓名：${characterName}\n`);
                setEditing(true);
              }}
              className="rounded-md border border-line px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100"
            >
              {core ? '编辑档案' : '新建档案'}
            </button>
          ) : null}
        </div>
        {loading ? (
          <p className="text-xs text-zinc-400">正在加载档案…</p>
        ) : editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={8}
              placeholder={`姓名：${characterName}\n背景：\n亲历：`}
              className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-accent/60"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy || !draft.trim()}
                onClick={() => void save()}
                className="rounded-md border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
              >
                {busy ? '保存中…' : '保存档案'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setDraft(core?.content ?? '');
                }}
                className="rounded-md border border-line px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
              >
                取消
              </button>
            </div>
          </div>
        ) : core ? (
          <>
            {sparseArchive ? (
              <p className="mb-1.5 text-[11px] leading-5 text-amber-800">
                这只是导入统计（出场次数），不是剧情记忆。点「编辑档案」改成 TA
                真正记得的事；上面的亲历事件仍会进扮演。
              </p>
            ) : null}
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-line bg-zinc-50 px-2.5 py-2 text-xs leading-5 text-zinc-700">
              {core.content}
            </pre>
          </>
        ) : (
          <p className="text-xs text-zinc-400">还没有档案正文。亲历事件仍会进入扮演。</p>
        )}
      </div>
    </section>
  );
}

function MemoryGroup({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string | null;
  children: ReactNode;
}) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-[11px] font-medium text-zinc-500">{title}</p>
      {empty ? (
        <p className="text-[11px] leading-5 text-zinc-400">{empty}</p>
      ) : (
        <ul className="space-y-1">{children}</ul>
      )}
    </div>
  );
}

const FACT_TYPE_OPTIONS = [
  { value: 'trait', label: '性格' },
  { value: 'desire', label: '目标' },
  { value: 'event', label: '事件' },
  { value: 'relation', label: '关系' },
  { value: 'rule', label: '规则' },
  { value: 'preference', label: '偏好' },
  { value: 'constraint', label: '约束' },
  { value: 'episodic', label: '事实' },
];

function AtomDraft({
  factType,
  draft,
  busy,
  allowFactType,
  onDraft,
  onFactType,
  onSave,
  onCancel,
}: {
  factType: string;
  draft: string;
  busy: boolean;
  allowFactType: boolean;
  onDraft: (value: string) => void;
  onFactType: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-1.5">
      {allowFactType ? (
        <select
          value={factType}
          onChange={(event) => onFactType(event.target.value)}
          className="rounded-md border border-line bg-white px-2 py-1 text-[11px] text-zinc-600"
        >
          {FACT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      <textarea
        value={draft}
        onChange={(event) => onDraft(event.target.value)}
        rows={3}
        className="w-full rounded-md border border-line bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none focus:border-accent/60"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !draft.trim()}
          className="rounded-md border border-accent/60 bg-accent/10 px-2 py-0.5 text-[11px] text-accent disabled:opacity-50"
          onClick={onSave}
        >
          {busy ? '…' : '保存'}
        </button>
        <button type="button" className="text-[11px] text-zinc-400" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
