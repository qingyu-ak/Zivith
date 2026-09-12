'use client';

import { CHAT_FOCUS_LABEL, type ChatFocus } from '@/lib/creator-chat-nav';

/** Chat / Studio 共用的 @ 实体候选列表。 */
export function MentionMenu({
  items,
  activeIndex,
  onPick,
  emptyHint,
  id = 'mention-list',
}: {
  items: ChatFocus[];
  activeIndex: number;
  onPick: (item: ChatFocus) => void;
  emptyHint?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className="absolute bottom-full left-1 right-1 z-20 mb-1 max-h-56 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
      role="listbox"
      aria-label="引用实体"
    >
      {items.length === 0 ? (
        <p className="px-3 py-2 text-sm text-zinc-400">{emptyHint ?? '没有匹配的实体'}</p>
      ) : (
        items.map((item, index) => (
          <button
            key={`${item.kind}:${item.id}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
              index === activeIndex ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(item)}
          >
            <span className="shrink-0 text-[11px] text-zinc-400">
              {CHAT_FOCUS_LABEL[item.kind] ?? item.kind}
            </span>
            <span className="min-w-0 truncate">{item.name}</span>
          </button>
        ))
      )}
    </div>
  );
}
