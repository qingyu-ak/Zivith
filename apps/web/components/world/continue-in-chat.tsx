'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage } from '@/lib/api';
import {
  chatPathForThread,
  resolveThreadForProject,
  writePendingFocus,
  type ChatFocus,
} from '@/lib/creator-chat-nav';

export function ContinueInChatButton({
  projectId,
  focus,
  label,
  className,
}: {
  projectId: string;
  focus?: ChatFocus | null;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function openChat() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const threadId = await resolveThreadForProject(projectId);
      if (focus) {
        writePendingFocus({
          ...focus,
          thread_id: threadId,
          project_id: projectId,
          auto_send: true,
        });
      }
      router.push(chatPathForThread(threadId, focus));
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" disabled={busy} onClick={() => void openChat()} className={className}>
        {busy ? '正在打开对话…' : label}
      </button>
      {error ? (
        <span className="mt-1 max-w-[14rem] text-right text-[11px] text-red-500" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
