'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { WorldEventDTO, WorldResourcesDTO, WorldSelection } from '@/lib/types';
import {
  characterIdsWithout,
  compactMemoryLine,
  eventsExperiencedBy,
  isSparseImportArchive,
  relationshipsForCharacter,
  worldEventSummary,
  worldEventTitle,
  type CharacterRelationView,
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

/** 选中角色后列出 TA 实际记得什么：亲历事件、关系、事实、档案正文。均可改，扮演会读改过的版本。 */
export function CharacterArchive({
  projectId,
  characterId,
  characterName,
  resources,
  onSelect,
  onUpdated,
  compact = false,
  asOfPresentationOrder,
  worldTimeLabel,
  reloadToken,
}: {
  projectId: string;
  characterId: string;
  characterName: string;
  resources: WorldResourcesDTO;
  onSelect?: (selection: Exclude<WorldSelection, null>) => void;
  onUpdated?: () => void;
  compact?: boolean;
  /** When set, only events at or before this world-time order are “remembered”. */
  asOfPresentationOrder?: number;
  /** Current play anchor label, e.g. 全书读完 or an event title. */
  worldTimeLabel?: string;
  /** 扮演新消息落库后刷新重要聊天，不必先收起再打开。 */
  reloadToken?: string;
}) {
  const [core, setCore] = useState<MemoryCoreItem | null>(null);
  const [atoms, setAtoms] = useState<MemoryAtomItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  // 'new' 表示正在新建（尚无 atom id）。
  const [editingAtomId, setEditingAtomId] = useState<string | null>(null);
  const [atomDraft, setAtomDraft] = useState('');
  const [atomFactType, setAtomFactType] = useState('trait');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [relKind, setRelKind] = useState('');
  const [relName, setRelName] = useState('');
  const [relDescription, setRelDescription] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(true);
  const [coreOpen, setCoreOpen] = useState(!compact);

  const experiences = eventsExperiencedBy(resources, characterId, asOfPresentationOrder);
  const relations = relationshipsForCharacter(resources, characterId);
  const sparseArchive = Boolean(core && isSparseImportArchive(core.content));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [coresPage, atomsPage] = await Promise.all([
        api<{ items?: MemoryCoreItem[] }>(`/memory/projects/${projectId}/cores`),
        api<{ items?: MemoryAtomItem[] }>(
          `/memory/projects/${projectId}/atoms?entity_type=character&entity_id=${encodeURIComponent(characterId)}&page=1&page_size=50`,
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
    setEditingEventId(null);
    setEditingRelId(null);
    setArchiveOpen(true);
    setCoreOpen(!compact);
  }, [load, compact, reloadToken]);

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

  async function saveEvent(event: WorldEventDTO) {
    const title = eventTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/world/world-events/${event.id}`, {
        method: 'PATCH',
        body: { title, description: eventDescription.trim() || null },
      });
      setEditingEventId(null);
      onUpdated?.();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function forgetEvent(event: WorldEventDTO) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/world/world-events/${event.id}`, {
        method: 'PATCH',
        body: { character_ids: characterIdsWithout(event, characterId) },
      });
      setEditingEventId(null);
      onUpdated?.();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveRelation(item: CharacterRelationView) {
    const kind = relKind.trim();
    if (!kind || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/world/relationships/${item.id}`, {
        method: 'PATCH',
        body: {
          kind,
          label: relName.trim() || null,
          description: relDescription.trim() || null,
        },
      });
      setEditingRelId(null);
      onUpdated?.();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function forgetRelation(item: CharacterRelationView) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/world/relationships/${item.id}`, { method: 'DELETE' });
      setEditingRelId(null);
      onUpdated?.();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`min-w-0 ${compact ? 'px-3 py-2' : 'border-t border-line px-4 py-3'}`}>
      <FoldHeader
        title="TA 记得什么"
        open={archiveOpen}
        onToggle={() => setArchiveOpen((value) => !value)}
        heading
      />
      {archiveOpen ? (
        <p className="mt-1 text-[11px] leading-5 text-zinc-500">
          {worldTimeLabel
            ? `这是「${characterName}」在「${worldTimeLabel}」记得的世界经历，以及精简后的重要聊天。全文在这次对话记录里；问还记得时会先查目录再答。换时间锚点后列表会变。世界事件要确认才进时间线。`
            : '扮演会读这些记忆。每条都能改或忘掉；和上面角色卡冲突时以角色卡为准。'}
        </p>
      ) : (
        <p className="mt-1 text-[11px] leading-5 text-zinc-400">
          亲历 {experiences.length} · 认识谁 {relations.length} · 重要聊天 {atoms.length}
        </p>
      )}
      {error ? (
        <p
          className="mt-2 break-words rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs leading-5 text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {archiveOpen ? (
        <>
          <MemoryGroup
            key={`${characterId}-exp`}
            title={`亲历 · ${experiences.length} 件`}
            empty={
              experiences.length === 0
                ? asOfPresentationOrder !== undefined
                  ? '在这个时间点，还没有把这个角色绑到已经发生的事件。导入的「出场章数」不算记得剧情。'
                  : '时间线上还没有把这个角色绑到事件。导入的「出场章数」不算记得剧情。'
                : null
            }
            defaultOpen={experiences.length <= 6}
          >
            {experiences.map((event) => {
              const summary = worldEventSummary(event);
              if (editingEventId === event.id) {
                return (
                  <li key={event.id} className="px-3 py-2.5">
                    <div className="space-y-1.5">
                      <input
                        value={eventTitle}
                        onChange={(change) => setEventTitle(change.target.value)}
                        placeholder="标题"
                        className="w-full rounded-md border border-line bg-white px-2 py-1 text-xs text-zinc-800 outline-none focus:border-accent/60"
                      />
                      <textarea
                        value={eventDescription}
                        onChange={(change) => setEventDescription(change.target.value)}
                        rows={3}
                        placeholder="TA 记得这件事的经过"
                        className="w-full rounded-md border border-line bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none focus:border-accent/60"
                      />
                      <MemorySaveCancel
                        busy={busy}
                        canSave={Boolean(eventTitle.trim())}
                        onSave={() => void saveEvent(event)}
                        onCancel={() => setEditingEventId(null)}
                      />
                    </div>
                  </li>
                );
              }
              return (
                <li key={event.id} className="px-3 py-2.5">
                  <button
                    type="button"
                    className="block w-full min-w-0 rounded text-left hover:bg-zinc-50"
                    onClick={() => onSelect?.({ kind: 'world_event', id: event.id })}
                  >
                    <span className="block text-xs font-medium text-zinc-800">
                      {worldEventTitle(event)}
                    </span>
                    {summary ? (
                      <span
                        className={`mt-1 block text-[11px] leading-5 text-zinc-500 ${compact ? 'line-clamp-1' : 'line-clamp-3'}`}
                      >
                        {summary}
                      </span>
                    ) : null}
                  </button>
                  <MemoryActions
                    busy={busy}
                    forgetTitle="从 TA 的记忆拿掉，事件仍留在时间线"
                    onEdit={() => {
                      setEditingEventId(event.id);
                      setEventTitle(worldEventTitle(event));
                      setEventDescription(summary);
                    }}
                    onForget={() => void forgetEvent(event)}
                  />
                </li>
              );
            })}
          </MemoryGroup>

          <MemoryGroup
            key={`${characterId}-rel`}
            title={`认识谁 · ${relations.length}`}
            empty={relations.length === 0 ? '还没有关系。' : null}
            defaultOpen={relations.length <= 6}
          >
            {relations.map((item) =>
              editingRelId === item.id ? (
                <li key={item.id} className="px-3 py-2.5">
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-zinc-500">与「{item.otherName}」</p>
                    <input
                      value={relKind}
                      onChange={(change) => setRelKind(change.target.value)}
                      placeholder="类型，如师徒"
                      className="w-full rounded-md border border-line bg-white px-2 py-1 text-xs outline-none focus:border-accent/60"
                    />
                    <input
                      value={relName}
                      onChange={(change) => setRelName(change.target.value)}
                      placeholder="显示名（可选）"
                      className="w-full rounded-md border border-line bg-white px-2 py-1 text-xs outline-none focus:border-accent/60"
                    />
                    <textarea
                      value={relDescription}
                      onChange={(change) => setRelDescription(change.target.value)}
                      rows={2}
                      placeholder="TA 怎么看待这段关系"
                      className="w-full rounded-md border border-line bg-white px-2 py-1.5 text-xs outline-none focus:border-accent/60"
                    />
                    <MemorySaveCancel
                      busy={busy}
                      canSave={Boolean(relKind.trim())}
                      onSave={() => void saveRelation(item)}
                      onCancel={() => setEditingRelId(null)}
                    />
                  </div>
                </li>
              ) : (
                <li key={item.id} className="px-3 py-2.5">
                  <button
                    type="button"
                    className="block w-full min-w-0 rounded text-left text-xs text-zinc-700 hover:bg-zinc-50"
                    onClick={() => onSelect?.({ kind: 'relationship', id: item.id })}
                  >
                    {item.label}
                  </button>
                  <MemoryActions
                    busy={busy}
                    forgetTitle="从 TA 记得的关系里删掉"
                    onEdit={() => {
                      setEditingRelId(item.id);
                      setRelKind(item.kind);
                      setRelName(item.name);
                      setRelDescription(item.description);
                    }}
                    onForget={() => void forgetRelation(item)}
                  />
                </li>
              ),
            )}
          </MemoryGroup>

          <MemoryGroup
            key={`${characterId}-atoms`}
            title={`重要聊天 · ${atoms.length}`}
            empty={null}
            defaultOpen
          >
            {!loading && atoms.length === 0 && editingAtomId !== 'new' ? (
              <li className="px-3 py-2.5 text-[11px] leading-5 text-zinc-400">
                还没有精简过的重要聊天。全文在这次对话记录里；聊到重要的事会出现在这里。
              </li>
            ) : null}
            {atoms.map((atom) => (
              <li key={atom.id} className="px-3 py-2.5 text-xs">
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
                  <>
                    <p className="min-w-0 break-words text-zinc-600" title={atom.content}>
                      <span className="mr-1 text-[10px] text-zinc-400">
                        {FACT_LABEL[atom.fact_type] ?? atom.fact_type}
                      </span>
                      {compactMemoryLine(atom.content)}
                    </p>
                    <MemoryActions
                      busy={busy}
                      forgetLabel="忘掉"
                      forgetTitle="删除这条事实"
                      onEdit={() => {
                        setEditingAtomId(atom.id);
                        setAtomDraft(atom.content);
                        setAtomFactType(atom.fact_type);
                      }}
                      onForget={() => void removeAtom(atom.id)}
                    />
                  </>
                )}
              </li>
            ))}
            {editingAtomId === 'new' ? (
              <li className="px-3 py-2.5">
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
              <li className="px-3 py-2">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-md border border-dashed border-line px-2 py-1 text-[11px] text-zinc-500 hover:border-accent/40 hover:text-accent disabled:opacity-50"
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

          <div className="mt-4 min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <FoldHeader
                  title="档案正文"
                  open={coreOpen}
                  onToggle={() => setCoreOpen((value) => !value)}
                />
              </div>
              {coreOpen && !editing ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(core?.content ?? `姓名：${characterName}\n`);
                    setEditing(true);
                    setCoreOpen(true);
                  }}
                  className="shrink-0 rounded-md border border-line px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100"
                >
                  {core ? '编辑档案' : '新建档案'}
                </button>
              ) : null}
            </div>
            {coreOpen ? (
              loading ? (
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
                    <p className="mb-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-5 text-amber-900">
                      这只是导入统计（出场次数），不是剧情记忆。点「编辑档案」改成 TA
                      真正记得的事；上面的亲历事件仍会进扮演。
                    </p>
                  ) : null}
                  <pre className="whitespace-pre-wrap break-words rounded-lg border border-line bg-zinc-50 px-3 py-2.5 text-xs leading-5 text-zinc-700">
                    {core.content}
                  </pre>
                </>
              ) : (
                <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-xs text-zinc-400">
                  还没有档案正文。亲历事件仍会进入扮演。
                </p>
              )
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function FoldHeader({
  title,
  open,
  onToggle,
  heading = false,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  heading?: boolean;
}) {
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center justify-between gap-2 text-left"
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="flex min-w-0 items-center gap-1">
        <span
          aria-hidden
          className={`inline-block w-3 text-[10px] text-zinc-400 ${open ? '' : '-rotate-90'}`}
        >
          ▼
        </span>
        {heading ? (
          <span className="text-xs font-semibold tracking-wider text-zinc-500">{title}</span>
        ) : (
          <span className="text-[11px] font-medium text-zinc-500">{title}</span>
        )}
      </span>
      <span className="shrink-0 text-[10px] text-zinc-400">{open ? '收起' : '展开'}</span>
    </button>
  );
}

function MemoryGroup({
  title,
  empty,
  defaultOpen = true,
  children,
}: {
  title: string;
  empty: string | null;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-4 min-w-0">
      <FoldHeader title={title} open={open} onToggle={() => setOpen((value) => !value)} />
      {open ? (
        empty ? (
          <p className="mt-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-[11px] leading-5 text-zinc-400">
            {empty}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100 overflow-hidden rounded-lg border border-line bg-white">
            {children}
          </ul>
        )
      ) : null}
    </div>
  );
}

function MemoryActions({
  busy,
  forgetLabel = '忘掉',
  forgetTitle,
  onEdit,
  onForget,
}: {
  busy: boolean;
  forgetLabel?: string;
  forgetTitle: string;
  onEdit: () => void;
  onForget: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <button
        type="button"
        disabled={busy}
        className="rounded-md border border-line bg-white px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        onClick={onEdit}
      >
        编辑
      </button>
      <button
        type="button"
        disabled={busy}
        title={forgetTitle}
        className="rounded-md px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        onClick={onForget}
      >
        {forgetLabel}
      </button>
    </div>
  );
}

function MemorySaveCancel({
  busy,
  canSave,
  onSave,
  onCancel,
}: {
  busy: boolean;
  canSave: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={busy || !canSave}
        className="rounded-md border border-accent/60 bg-accent/10 px-2 py-0.5 text-[11px] text-accent disabled:opacity-50"
        onClick={onSave}
      >
        {busy ? '…' : '保存'}
      </button>
      <button type="button" className="text-[11px] text-zinc-400" onClick={onCancel}>
        取消
      </button>
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
