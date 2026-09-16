'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import {
  compactRelativeTime,
  filterProjectGroups,
  groupProjectsWithThreads,
  partitionThreadsByKind,
  threadDisplayTitle,
  threadKind,
} from '@/lib/chat-history';
import { isDesktopApp, WEB_FOLDER_HINT } from '@/lib/desktop';
import type { CreatorChatKind, CreatorChatThreadDTO, ProjectDTO } from '@/lib/types';
import { AccountMenu } from '@/components/account-menu';
import {
  IconChatPlus,
  IconFolder,
  IconGroup,
  IconPlusCircle,
  IconSearch,
  IconSidebar,
} from '@/components/nav-icons';

type MenuState =
  | { kind: 'project'; id: string; name: string; x: number; y: number }
  | { kind: 'thread'; id: string; name: string; x: number; y: number };

type RenameState = { kind: 'project' | 'thread'; id: string };

export function ChatSidebar({
  threads,
  projects,
  threadId,
  busy,
  pickerOpen,
  settingsHref = '/creator-chats',
  onPickerOpenChange,
  onSelectProject,
  onOpenFolder,
  onCreateWorld,
  onNewInProject,
  onNewRoleplay,
  onNewGroupChat,
  onRenameProject,
  onRenameThread,
  onDeleteThread,
}: {
  threads: CreatorChatThreadDTO[];
  projects: Pick<ProjectDTO, 'id' | 'name' | 'workspace_path'>[];
  threadId?: string;
  busy: boolean;
  pickerOpen: boolean;
  settingsHref?: string;
  onToggle: () => void;
  onPickerOpenChange: (open: boolean) => void;
  onSelectProject: (projectId: string) => void;
  onOpenFolder: () => void;
  onCreateWorld?: () => void;
  onNewInProject: (projectId: string) => void;
  onNewRoleplay?: (projectId: string) => void;
  onNewGroupChat?: (projectId: string) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onRenameThread: (threadId: string, name: string) => void;
  onDeleteThread: (threadId: string, name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<CreatorChatKind>('world');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [rename, setRename] = useState<RenameState | null>(null);
  const syncedThreadId = useRef<string | undefined>(undefined);
  const [desktop, setDesktop] = useState(false);
  const groups = filterProjectGroups(groupProjectsWithThreads(projects, threads), query);

  useEffect(() => {
    setDesktop(isDesktopApp());
  }, []);

  useEffect(() => {
    if (!threadId || threadId === syncedThreadId.current) return;
    const current = threads.find((item) => item.id === threadId);
    if (!current) return;
    syncedThreadId.current = threadId;
    setTab(threadKind(current));
  }, [threadId, threads]);

  useEffect(() => {
    if (!menu) return;
    function close() {
      setMenu(null);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    const timer = window.setTimeout(() => {
      window.addEventListener('click', close);
      window.addEventListener('contextmenu', close);
    }, 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  function openMenu(
    event: MouseEvent,
    next: Omit<MenuState, 'x' | 'y'> & { kind: MenuState['kind'] },
  ) {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      ...next,
      x: Math.min(event.clientX, window.innerWidth - 168),
      y: Math.min(event.clientY, window.innerHeight - 96),
    });
  }

  return (
    <aside className="flex h-full w-[268px] shrink-0 flex-col bg-[#f7f8fa]">
      <div className="px-3 pt-3">
        <button
          type="button"
          disabled={busy || !onCreateWorld}
          onClick={() => {
            onPickerOpenChange(false);
            onCreateWorld?.();
          }}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-medium text-zinc-800 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-zinc-200/80 transition hover:bg-zinc-50 disabled:opacity-40"
        >
          <IconPlusCircle className="size-4 text-zinc-600" />
          新建世界
        </button>
      </div>

      <div
        className="mx-3 mt-3 grid grid-cols-2 gap-0.5 rounded-lg bg-zinc-200/70 p-0.5"
        role="tablist"
        aria-label="对话类型"
      >
        <TabButton
          id="world"
          label="世界"
          count={partitionThreadsByKind(threads).world.length}
          active={tab === 'world'}
          onSelect={setTab}
        />
        <TabButton
          id="roleplay"
          label="角色"
          count={partitionThreadsByKind(threads).roleplay.length}
          active={tab === 'roleplay'}
          onSelect={setTab}
        />
      </div>

      <div className="px-3 pt-3">
        <label className="relative block">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索项目或对话"
            className="h-8 w-full rounded-lg border border-zinc-200 bg-white py-1 pl-8 pr-2 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-[#4d6bfe]"
          />
        </label>
      </div>

      <nav className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="工作区列表">
        <div className="flex items-center gap-0.5 px-2 pb-1 pt-1">
          <p className="min-w-0 flex-1 text-[11px] text-zinc-400">项目</p>
          <button
            type="button"
            disabled={busy}
            className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-200 hover:text-zinc-800 disabled:opacity-40"
            aria-label={desktop ? '选择文件夹' : '用桌面应用打开文件夹'}
            title={desktop ? '选择文件夹' : '用桌面应用打开文件夹'}
            onClick={() => {
              if (desktop) {
                onOpenFolder();
                return;
              }
              onPickerOpenChange(true);
            }}
          >
            <IconPlusCircle className="size-3.5" />
          </button>
        </div>
        {pickerOpen && !desktop ? (
          <div className="mx-1 mb-2 rounded-xl border border-zinc-200 bg-white px-3 py-3">
            <p className="text-xs leading-5 text-zinc-500">{WEB_FOLDER_HINT}</p>
            <button
              type="button"
              className="mt-2 text-xs text-zinc-500"
              onClick={() => onPickerOpenChange(false)}
            >
              关闭
            </button>
          </div>
        ) : null}
        {groups.length === 0 ? (
          <p className="px-3 py-4 text-xs leading-5 text-zinc-400">
            {query.trim()
              ? '没有匹配的项目或对话'
              : desktop
                ? '点「新建世界」从零开始，或点项目旁的加号打开已有文件夹。'
                : '点「新建世界」从零开始。打开已有文件夹需要桌面应用。'}
          </p>
        ) : (
          <ul className="grid gap-1">
            {groups.map((group) => {
              const { world, roleplay } = partitionThreadsByKind(group.threads);
              const tabThreads = tab === 'roleplay' ? roleplay : world;
              const renamingProject = rename?.kind === 'project' && rename.id === group.id;
              return (
                <li key={group.id}>
                  <div className="flex items-center gap-0.5">
                    {renamingProject ? (
                      <div className="min-w-0 flex-1 px-1">
                        <InlineName
                          value={group.label}
                          label="项目名称"
                          onSubmit={(name) => {
                            setRename(null);
                            if (group.id !== '__unbound__') onRenameProject(group.id, name);
                          }}
                          onCancel={() => setRename(null)}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        title={group.workspacePath || '未绑定文件夹'}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-200/70"
                        onClick={() => {
                          if (group.id !== '__unbound__') onSelectProject(group.id);
                        }}
                        onDoubleClick={() => {
                          if (group.id !== '__unbound__')
                            setRename({ kind: 'project', id: group.id });
                        }}
                        onContextMenu={(event) => {
                          if (group.id === '__unbound__') return;
                          openMenu(event, { kind: 'project', id: group.id, name: group.label });
                        }}
                      >
                        <IconFolder className="size-4 shrink-0 text-zinc-500" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-800">
                          {group.label}
                        </span>
                      </button>
                    )}
                    {group.id !== '__unbound__' ? (
                      <div className="flex shrink-0 items-center">
                        <button
                          type="button"
                          disabled={busy}
                          className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-200 hover:text-zinc-800 disabled:opacity-40"
                          aria-label={
                            tab === 'roleplay'
                              ? `在「${group.label}」开始扮演`
                              : `在「${group.label}」新建聊天`
                          }
                          onClick={() => {
                            if (tab === 'roleplay' && onNewRoleplay) onNewRoleplay(group.id);
                            else onNewInProject(group.id);
                          }}
                        >
                          <IconChatPlus className="size-3.5" />
                        </button>
                        {tab === 'roleplay' && onNewGroupChat ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-200 hover:text-zinc-800 disabled:opacity-40"
                            aria-label={`在「${group.label}」开始群聊`}
                            title="开始群聊"
                            onClick={() => onNewGroupChat(group.id)}
                          >
                            <IconGroup className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {tabThreads.length === 0 ? (
                    <div className="py-1 pl-8 pr-2">
                      <p className="text-[12px] text-zinc-400">
                        {tab === 'roleplay' ? '还没有扮演对话' : '暂无对话'}
                      </p>
                      {tab === 'roleplay' && group.id !== '__unbound__' && onNewRoleplay ? (
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          <button
                            type="button"
                            className="text-[12px] text-[#4d6bfe] hover:underline"
                            onClick={() => onNewRoleplay(group.id)}
                          >
                            选择或创建角色开始扮演
                          </button>
                          {onNewGroupChat ? (
                            <button
                              type="button"
                              className="text-[12px] text-[#4d6bfe] hover:underline"
                              onClick={() => onNewGroupChat(group.id)}
                            >
                              开始群聊
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <ul className="grid gap-0.5 pl-6">
                      {tabThreads.map((item) => {
                        const active = item.id === threadId;
                        const renaming = rename?.kind === 'thread' && rename.id === item.id;
                        return (
                          <li key={item.id}>
                            {renaming ? (
                              <div className="px-2 py-1">
                                <InlineName
                                  value={threadDisplayTitle(item)}
                                  label="对话名称"
                                  onSubmit={(name) => {
                                    setRename(null);
                                    onRenameThread(item.id, name);
                                  }}
                                  onCancel={() => setRename(null)}
                                />
                              </div>
                            ) : (
                              <Link
                                href={`/creator-chats/${item.id}`}
                                onContextMenu={(event) =>
                                  openMenu(event, {
                                    kind: 'thread',
                                    id: item.id,
                                    name: threadDisplayTitle(item),
                                  })
                                }
                                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition ${
                                  active
                                    ? 'bg-zinc-200/90 text-zinc-900'
                                    : 'text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900'
                                }`}
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {threadDisplayTitle(item)}
                                  {threadKind(item) === 'roleplay' ? (
                                    <span className="ml-1 text-[10px] text-zinc-400">扮演</span>
                                  ) : null}
                                </span>
                                <span className="shrink-0 text-[11px] text-zinc-400">
                                  {compactRelativeTime(item.updated_at)}
                                </span>
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {menu ? (
        <div
          role="menu"
          className="fixed z-50 min-w-[148px] rounded-lg border border-zinc-200 bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="w-full px-3 py-1.5 text-left text-[13px] text-zinc-700 hover:bg-zinc-100"
            onClick={() => {
              setRename({ kind: menu.kind, id: menu.id });
              setMenu(null);
            }}
          >
            重命名
          </button>
          {menu.kind === 'thread' ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              className="w-full px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-40"
              onClick={() => {
                const current = menu;
                setMenu(null);
                onDeleteThread(current.id, current.name);
              }}
            >
              删除对话
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-zinc-200/80 px-1 pb-3 pt-2">
        <AccountMenu settingsHref={settingsHref} tone="light" />
      </div>
    </aside>
  );
}

function InlineName({
  value,
  label,
  onSubmit,
  onCancel,
}: {
  value: string;
  label: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function finish() {
    if (cancelled.current) return;
    const next = draft.trim();
    if (!next || next === value) onCancel();
    else onSubmit(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelled.current = true;
      onCancel();
    }
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      aria-label={label}
      className="h-7 w-full rounded border border-[#4d6bfe] bg-white px-1 text-[13px] text-zinc-800 outline-none"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={finish}
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    />
  );
}

function TabButton({
  id,
  label,
  count,
  active,
  onSelect,
}: {
  id: CreatorChatKind;
  label: string;
  count: number;
  active: boolean;
  onSelect: (id: CreatorChatKind) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(id)}
      className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
        active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
      }`}
    >
      {label}
      <span className={`ml-1 tabular-nums ${active ? 'text-zinc-500' : 'text-zinc-400'}`}>
        {count}
      </span>
    </button>
  );
}

export function ChatSidebarRail({
  onToggle,
  onCreateWorld,
}: {
  onToggle: () => void;
  onCreateWorld: () => void;
}) {
  return (
    <aside className="flex h-full w-14 shrink-0 flex-col items-center gap-2 bg-[#f7f8fa] py-3">
      <button
        type="button"
        className="grid size-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800"
        aria-label="展开侧栏"
        onClick={onToggle}
      >
        <IconSidebar className="size-4" />
      </button>
      <button
        type="button"
        className="grid size-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800"
        aria-label="新建世界"
        onClick={onCreateWorld}
      >
        <IconPlusCircle className="size-5" />
      </button>
    </aside>
  );
}
