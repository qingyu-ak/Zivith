'use client';

import { useEffect, useState } from 'react';
import { IconCheck, IconCopy, IconRetry } from '@/components/nav-icons';
import { copyTextToClipboard, RETRY_BLOCKED_HINT, type RetryBlocked } from '@/lib/message-actions';

/**
 * Cursor / ZCode 式消息操作：悬停或聚焦时出现。
 * 复制始终可点；重试只挂在最近一轮，避免对话分叉。
 */
export function MessageActions({
  copyText,
  retry,
  retryBlocked,
  busy = false,
  align = 'start',
  onWithdraw,
}: {
  copyText: string;
  retry?: () => void;
  retryBlocked?: RetryBlocked | null;
  busy?: boolean;
  align?: 'start' | 'end';
  onWithdraw?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyHint, setCopyHint] = useState('');

  useEffect(() => {
    if (!copied && !copyHint) return;
    const timer = window.setTimeout(() => {
      setCopied(false);
      setCopyHint('');
    }, 1_600);
    return () => window.clearTimeout(timer);
  }, [copied, copyHint]);

  async function copy() {
    const result = await copyTextToClipboard(copyText);
    if (result === 'ok') {
      setCopied(true);
      setCopyHint('');
      return;
    }
    setCopied(false);
    setCopyHint(result === 'empty' ? '没有可复制的内容' : '复制失败，请手动选择文本');
  }

  const retryTitle = busy
    ? '正在生成'
    : retryBlocked
      ? RETRY_BLOCKED_HINT[retryBlocked]
      : '用同一条用户消息再生成一轮';
  const canRetry = Boolean(retry) && !busy && !retryBlocked;

  return (
    <div
      className={`mt-1 flex items-center gap-0.5 opacity-100 transition-opacity [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:pointer-events-auto [@media(hover:hover)]:group-focus-within:opacity-100 ${
        align === 'end' ? 'justify-end' : 'justify-start'
      }`}
    >
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        aria-label={copied ? '已复制' : '复制'}
        title={copyHint || (copied ? '已复制' : '复制这条消息')}
        onClick={() => void copy()}
      >
        {copied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
        {copied ? '已复制' : '复制'}
      </button>
      {retry ? (
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="重试"
          title={retryTitle}
          disabled={!canRetry}
          onClick={() => {
            if (!canRetry) return;
            retry();
          }}
        >
          <IconRetry className="size-3.5" />
          重试
        </button>
      ) : null}
      {onWithdraw ? (
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="撤回"
          title="当作你没发过这一句"
          disabled={busy}
          onClick={onWithdraw}
        >
          撤回
        </button>
      ) : null}
      {copyHint ? <span className="px-1 text-[11px] text-red-500">{copyHint}</span> : null}
    </div>
  );
}
