'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { Badge, Button, EmptyState, Spinner, Textarea } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import type {
  CreatorChatMessageDTO,
  CreatorChatThreadDTO,
  ProposalKind,
} from '@/lib/types';
import { ProposalCard, type ChatProposal } from './proposal-card';

const PROPOSAL_KINDS: ProposalKind[] = [
  'create_project',
  'create_world_event',
  'create_character',
  'create_location',
  'create_scene',
  'create_relationship',
  'update_entity',
];

function parseProposals(message: CreatorChatMessageDTO): {
  proposals: ChatProposal[];
  applied: boolean;
} {
  if (!message.proposal) return { proposals: [], applied: false };
  const rawList = Array.isArray(message.proposal) ? message.proposal : [message.proposal];
  const proposals: ChatProposal[] = [];
  for (const raw of rawList) {
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const kind = record.kind;
    const payload = record.payload;
    if (
      typeof kind !== 'string' ||
      !PROPOSAL_KINDS.includes(kind as ProposalKind) ||
      typeof payload !== 'object' ||
      payload === null
    ) {
      continue;
    }
    proposals.push({ kind: kind as ProposalKind, payload: payload as Record<string, unknown> });
  }
  return { proposals, applied: message.proposal_state === 'applied' };
}

export function ChatPanel({ threadId }: { threadId: string }) {
  const [thread, setThread] = useState<CreatorChatThreadDTO | null>(null);
  const [messages, setMessages] = useState<CreatorChatMessageDTO[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const value = await api<{
        thread: CreatorChatThreadDTO;
        messages: CreatorChatMessageDTO[];
      }>(`/world/creator-chats/${threadId}`);
      setThread(value.thread);
      setMessages(value.messages);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setError('');
    setSending(true);
    setInput('');
    try {
      const value = await api<{
        user_message: CreatorChatMessageDTO;
        assistant_message: CreatorChatMessageDTO | null;
      }>(`/world/creator-chats/${threadId}/messages`, {
        method: 'POST',
        body: { role: 'user', content },
      });
      setMessages((current) => [
        ...current,
        value.user_message,
        ...(value.assistant_message ? [value.assistant_message] : []),
      ]);
    } catch (reason) {
      setError(errorMessage(reason));
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  function handleApplied() {
    void load();
  }

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner label="正在加载对话…" />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <EmptyState
          title="对话不存在"
          description={error || '这个对话可能已被删除。'}
          action={
            <Link className="text-sm text-accent hover:underline" href="/creator-chats">
              返回对话列表
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <Link
          href="/creator-chats"
          className="text-sm text-zinc-400 transition hover:text-white"
        >
          ← 对话列表
        </Link>
        <h1 className="text-base font-semibold text-white">{thread.title ?? '新世界对话'}</h1>
        {thread.project_name ? (
          <Badge tone="success">{thread.project_name}</Badge>
        ) : (
          <Badge>尚未关联项目</Badge>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.length === 0 && (
            <EmptyState
              title="开始构建你的世界"
              description="告诉世界构建者你的创意：题材、主角、想要的世界观。它会不断向你提问，并把确认的设定整理成提案。"
            />
          )}
          {messages.map((message) => {
            const { proposals, applied } = parseProposals(message);
            if (message.role === 'system') {
              return (
                <p
                  key={message.id}
                  className="mx-auto rounded-full bg-white/5 px-4 py-1.5 text-center text-xs text-zinc-400"
                >
                  {message.content}
                </p>
              );
            }
            if (message.role === 'user') {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-4 py-3 text-sm leading-6 text-ink">
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              );
            }
            return (
              <div key={message.id} className="flex justify-start">
                <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-line bg-panel px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                    {message.content}
                  </p>
                  {proposals.length > 0 && (
                    <ProposalCard
                      threadId={threadId}
                      messageId={message.id}
                      proposals={proposals}
                      applied={applied}
                      onApplied={handleApplied}
                    />
                  )}
                </div>
              </div>
            );
          })}
          {sending && (
            <div className="flex items-center gap-2 pl-1 text-sm text-zinc-400">
              <Spinner label="世界构建者正在思考…" />
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-line bg-ink/80 px-5 py-4">
        <form
          className="mx-auto flex max-w-3xl flex-col gap-3"
          onSubmit={(event) => void send(event)}
        >
          {error && (
            <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300" role="alert">
              {error}
            </p>
          )}
          <Textarea
            className="min-h-24 resize-none"
            placeholder="描述你的世界设定，例如：我想做一个赛博朋克题材，主角是失忆的赏金猎人……"
            value={input}
            disabled={sending}
            onChange={(event) => setInput(event.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button type="submit" disabled={sending || input.trim().length === 0}>
              {sending ? '发送中…' : '发送'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
