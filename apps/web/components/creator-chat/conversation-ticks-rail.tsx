'use client';

import { tickPreview } from '@/lib/conversation-ticks';

export function ConversationTicksRail({
  ticks,
  onPick,
  userLabel = '你',
  assistantLabel = '角色',
}: {
  ticks: Array<{ id: string; role: string; content: string; speaker_name?: string | null }>;
  onPick: (messageId: string) => void;
  userLabel?: string;
  assistantLabel?: string;
}) {
  if (ticks.length === 0) return null;
  return (
    <aside
      className="pointer-events-none flex max-h-full w-44 flex-col items-end gap-px overflow-y-auto py-1"
      aria-label="对话刻度"
    >
      {ticks.map((tick) => {
        const preview = tickPreview(tick, { user: userLabel, assistant: assistantLabel });
        const isUser = tick.role === 'user';
        return (
          <button
            key={tick.id}
            type="button"
            aria-label={`回退到${preview.speaker}：${preview.snippet || '这句'}`}
            title={`${preview.speaker}：${preview.snippet}`}
            className={`pointer-events-auto group z-0 flex h-1.5 w-3 shrink-0 items-center overflow-hidden rounded-sm text-left transition-all hover:z-20 hover:h-auto hover:min-h-7 hover:w-44 hover:px-1.5 hover:py-1 hover:shadow-sm ${
              isUser ? 'bg-zinc-400 hover:bg-zinc-100' : 'bg-[#4d6bfe]/55 hover:bg-[#eef2ff]'
            }`}
            onClick={() => onPick(tick.id)}
          >
            <span className="hidden min-w-0 truncate text-[10px] leading-4 text-zinc-700 group-hover:block">
              <span className="font-medium">{preview.speaker}</span>
              {preview.snippet ? ` ${preview.snippet}` : ''}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
