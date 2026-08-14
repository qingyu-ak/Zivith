'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  filterThreadsByQuery,
  groupThreadsByRecency,
  threadDisplayTitle,
} from '@/lib/chat-history';
import type { CreatorChatThreadDTO } from '@/lib/types';
import { AccountMenu } from '@/components/account-menu';
import { IconPlusCircle, IconSearch, IconSidebar } from '@/components/nav-icons';

export function ChatSidebar({
  threads,
  threadId,
  busy,
  onToggle,
  onNewChat,
}: {
  threads: CreatorChatThreadDTO[];
  threadId?: string;
  busy: boolean;
  onToggle: () => void;
  onNewChat: () => void;
}) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const filtered = filterThreadsByQuery(threads, query);
  const history = groupThreadsByRecency(filtered);

  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  return (
    <aside className="flex h-full w-[268px] shrink-0 flex-col bg-[#f7f8fa]">
      <div className="flex items-center gap-1 px-3 pt-3">
        <Link
          href="/creator-chats"
          className="px-1 text-[17px] font-semibold tracking-tight text-zinc-900"
        >
          ZIVITH
        </Link>
        <span className="flex-1" />
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800"
          aria-label="搜索对话"
          onClick={() => setSearching((value) => !value)}
        >
          <IconSearch className="size-4" />
        </button>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800"
          aria-label="收起侧栏"
          onClick={onToggle}
        >
          <IconSidebar className="size-4" />
        </button>
      </div>

      <div className="px-3 pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={onNewChat}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-medium text-zinc-800 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-zinc-200/80 transition hover:bg-zinc-50 disabled:opacity-40"
        >
          <IconPlusCircle className="size-4 text-zinc-600" />
          开启新对话
        </button>
      </div>

      {searching && (
        <div className="px-3 pt-3">
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索对话"
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-[#4d6bfe]"
          />
        </div>
      )}

      <nav className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="会话列表">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-xs text-zinc-400">
            {threads.length === 0 ? '还没有对话' : '没有匹配的对话'}
          </p>
        ) : (
          history.map((group) => (
            <div key={group.id} className="mb-3">
              <p className="px-3 pb-1 text-xs text-zinc-400">{group.label}</p>
              <ul className="grid gap-0.5">
                {group.threads.map((item) => {
                  const active = item.id === threadId;
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/creator-chats/${item.id}`}
                        className={`block rounded-xl px-3 py-2 text-sm transition ${
                          active
                            ? 'bg-[#e8f0fe] text-zinc-900'
                            : 'text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900'
                        }`}
                      >
                        <p className="truncate">{threadDisplayTitle(item)}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>

      <div className="px-2 pb-3">
        <AccountMenu settingsHref="/projects" tone="light" />
      </div>
    </aside>
  );
}

export function ChatSidebarRail({
  onToggle,
  onNewChat,
}: {
  onToggle: () => void;
  onNewChat: () => void;
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
        aria-label="开启新对话"
        onClick={onNewChat}
      >
        <IconPlusCircle className="size-5" />
      </button>
    </aside>
  );
}
