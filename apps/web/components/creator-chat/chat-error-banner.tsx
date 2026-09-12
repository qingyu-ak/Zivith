'use client';

import { useEffect, useState } from 'react';
import { IconCheck, IconClose, IconCopy, IconRetry } from '@/components/nav-icons';
import { copyTextToClipboard } from '@/lib/message-actions';

/** ZCode 式失败条：文案 + 复制 / 重试 / 关闭。不做空的「反馈问题」。 */
export function ChatErrorBanner({
  message,
  onRetry,
  onDismiss,
  busy = false,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  busy?: boolean;
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

  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
      role="alert"
    >
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{message}</p>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] hover:bg-red-100"
          aria-label={copied ? '已复制' : '复制错误'}
          title={copied ? '已复制' : '复制错误原文'}
          onClick={() => {
            void copyTextToClipboard(message).then((result) => {
              if (result === 'ok') {
                setCopied(true);
                setCopyHint('');
                return;
              }
              setCopied(false);
              setCopyHint(result === 'empty' ? '没有可复制的内容' : '复制失败，请手动选择文本');
            });
          }}
        >
          {copied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
          {copied ? '已复制' : '复制'}
        </button>
        {onRetry ? (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] hover:bg-red-100 disabled:opacity-40"
            aria-label="重试"
            title={busy ? '正在生成' : '用上一条消息再试一次'}
            disabled={busy}
            onClick={onRetry}
          >
            <IconRetry className="size-3.5" />
            重试
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md hover:bg-red-100"
            aria-label="关闭"
            title="关闭"
            onClick={onDismiss}
          >
            <IconClose className="size-3.5" />
          </button>
        ) : null}
        {copyHint ? <span className="px-1 text-[11px]">{copyHint}</span> : null}
      </div>
    </div>
  );
}
