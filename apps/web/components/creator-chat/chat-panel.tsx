'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, Spinner, Textarea } from '@zivith/ui';
import { api, errorMessage, sendCreatorChatTurn } from '@/lib/api';
import {
  PENDING_CHAT_TURN_KEY,
  groupThreadsByRecency,
  relativeTime,
} from '@/lib/chat-history';
import type { CreatorChatMessageDTO, CreatorChatThreadDTO, ProposalKind } from '@/lib/types';
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

const STARTERS = [
  '我想创造一个东方玄幻世界',
  '先介绍一下主角',
  '帮我检查设定冲突',
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asChatMessage(value: unknown): CreatorChatMessageDTO | null {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.id !== 'string' || typeof record.role !== 'string' || typeof record.content !== 'string') {
    return null;
  }
  return record as unknown as CreatorChatMessageDTO;
}

export function ChatPanel({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const [thread, setThread] = useState<CreatorChatThreadDTO | null>(null);
  const [messages, setMessages] = useState<CreatorChatMessageDTO[]>([]);
  const [threads, setThreads] = useState<CreatorChatThreadDTO[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(Boolean(threadId));
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const pendingConsumed = useRef(false);

  const load = useCallback(async () => {
    if (!threadId) {
      setThread(null);
      setMessages([]);
      setLoading(false);
      return;
    }
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
    api<CreatorChatThreadDTO[]>('/world/creator-chats')
      .then(setThreads)
      .catch(() => setThreads([]));
  }, [threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamText, sending]);

  const sendingRef = useRef(false);

  const sendContent = useCallback(
    async (content: string) => {
      if (!threadId || sendingRef.current) return;
      sendingRef.current = true;
      setError('');
      setSending(true);
      setStreamText('');
      let acceptedUser = false;
      try {
        let sawError = '';
        await sendCreatorChatTurn(threadId, content, (event, data) => {
          const record = asRecord(data);
          if (event === 'user') {
            const userMessage = asChatMessage(record?.user_message);
            if (userMessage) {
              acceptedUser = true;
              setMessages((current) => [...current, userMessage]);
            }
            return;
          }
          if (event === 'delta' && typeof record?.text === 'string') {
            setStreamText((current) => current + record.text);
            return;
          }
          if (event === 'done') {
            const assistantMessage = asChatMessage(record?.assistant_message);
            if (assistantMessage) {
              setMessages((current) => [...current, assistantMessage]);
            }
            setStreamText('');
            return;
          }
          if (event === 'error') {
            sawError =
              typeof record?.message === 'string' ? record.message : '世界构建者回复失败';
          }
        });
        if (sawError) throw new Error(sawError);
        setThreads((current) => {
          const target = current.find((item) => item.id === threadId);
          if (!target) return current;
          return [
            { ...target, updated_at: new Date().toISOString() },
            ...current.filter((item) => item.id !== threadId),
          ];
        });
      } catch (reason) {
        setError(errorMessage(reason));
        if (!acceptedUser) setInput(content);
        setStreamText('');
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [threadId],
  );

  useEffect(() => {
    if (!threadId || loading || pendingConsumed.current) return;
    if (typeof sessionStorage === 'undefined') return;
    const pending = sessionStorage.getItem(PENDING_CHAT_TURN_KEY);
    if (!pending) return;
    pendingConsumed.current = true;
    sessionStorage.removeItem(PENDING_CHAT_TURN_KEY);
    void sendContent(pending);
  }, [loading, sendContent, threadId]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending || busy) return;
    if (!threadId) {
      await startThread(content);
      return;
    }
    setInput('');
    await sendContent(content);
  }

  async function startThread(firstMessage?: string) {
    setError('');
    setBusy(true);
    try {
      if (firstMessage) {
        sessionStorage.setItem(PENDING_CHAT_TURN_KEY, firstMessage);
      }
      const created = await api<CreatorChatThreadDTO>('/world/creator-chats', {
        method: 'POST',
        body: { project_id: null, title: null },
      });
      router.push(`/creator-chats/${created.id}`);
    } catch (reason) {
      setError(errorMessage(reason));
      if (firstMessage) sessionStorage.removeItem(PENDING_CHAT_TURN_KEY);
      setBusy(false);
    }
  }

  function handleApplied() {
    void load();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.closest('form')?.requestSubmit();
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner label="正在加载对话…" />
      </div>
    );
  }

  const studioHref = thread?.project_id ? `/projects/${thread.project_id}/world` : null;
  const history = groupThreadsByRecency(threads);
  const empty = (!threadId || messages.length === 0) && !sending && !streamText;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col lg:h-dvh">
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-line lg:flex">
          <div className="p-3">
            <Button
              className="w-full min-h-9 text-sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void startThread()}
            >
              + 新对话
            </Button>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="会话列表">
            {threads.length === 0 ? (
              <p className="px-3 py-4 text-xs text-zinc-600">还没有对话</p>
            ) : (
              history.map((group) => (
                <div key={group.id} className="mb-3">
                  <p className="px-3 pb-1 text-[11px] uppercase tracking-wider text-zinc-600">
                    {group.label}
                  </p>
                  <ul className="grid gap-0.5">
                    {group.threads.map((item) => {
                      const active = item.id === threadId;
                      return (
                        <li key={item.id}>
                          <Link
                            href={`/creator-chats/${item.id}`}
                            className={`block rounded-lg px-3 py-2 transition ${
                              active
                                ? 'bg-white/5 text-white'
                                : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <p className="truncate text-sm">
                              {item.title ?? '未命名对话'}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-zinc-600">
                              {item.project_name ?? '新世界'} · {relativeTime(item.updated_at)}
                            </p>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-3 px-4 lg:px-6">
            <Link
              href="/creator-chats"
              className="text-sm text-zinc-500 transition hover:text-white lg:hidden"
            >
              对话
            </Link>
            {threadId ? (
              <h1 className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                {thread?.title ?? '新世界对话'}
              </h1>
            ) : (
              <span className="flex-1" />
            )}
            {studioHref ? (
              <Link
                href={studioHref}
                className="shrink-0 text-sm text-accent transition hover:underline"
              >
                Studio
              </Link>
            ) : (
              <Link
                href="/projects"
                className="shrink-0 text-sm text-zinc-500 transition hover:text-zinc-300"
              >
                Studio
              </Link>
            )}
          </header>

          {threadId && !thread ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState
                title="对话加载失败"
                description={error || '暂时无法连接到服务器，请稍后重试。'}
                action={
                  <div className="flex items-center justify-center gap-3">
                    <Button onClick={() => void load()}>重试</Button>
                    <Link className="text-sm text-accent hover:underline" href="/creator-chats">
                      新对话
                    </Link>
                  </div>
                }
              />
            </div>
          ) : (
            <>
              <div
                className={`min-h-0 flex-1 overflow-y-auto px-4 lg:px-6 ${empty ? 'flex items-center' : 'py-6'}`}
              >
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
                  {empty && (
                    <div className="flex flex-col items-center py-10 text-center">
                      <p className="text-lg font-medium text-white">开始构建你的世界</p>
                      <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                        用一句话说设定。确认后的提案会写入草稿，细节在 Studio 里改。
                      </p>
                      <div className="mt-6 flex flex-wrap justify-center gap-2">
                        {STARTERS.map((starter) => (
                          <button
                            key={starter}
                            type="button"
                            disabled={sending || busy}
                            className="rounded-full border border-line px-3 py-1.5 text-xs text-zinc-400 transition hover:border-accent/40 hover:text-white disabled:opacity-40"
                            onClick={() => {
                              if (!threadId) {
                                void startThread(starter);
                                return;
                              }
                              void sendContent(starter);
                            }}
                          >
                            {starter}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {messages.map((message) => {
                    const { proposals, applied } = parseProposals(message);
                    if (message.role === 'system') {
                      return (
                        <p
                          key={message.id}
                          className="mx-auto text-center text-xs text-zinc-500"
                        >
                          {message.content}
                        </p>
                      );
                    }
                    if (message.role === 'user') {
                      return (
                        <div key={message.id} className="flex justify-end">
                          <div className="max-w-[80%] rounded-2xl bg-white/10 px-4 py-2.5 text-sm leading-6 text-zinc-100">
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={message.id} className="min-w-0">
                        <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-100">
                          {message.content}
                        </p>
                        {proposals.length > 0 && (
                          <ProposalCard
                            threadId={threadId ?? message.thread_id}
                            messageId={message.id}
                            proposals={proposals}
                            applied={applied}
                            onApplied={handleApplied}
                          />
                        )}
                      </div>
                    );
                  })}
                  {sending && streamText && (
                    <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-100">
                      {streamText}
                    </p>
                  )}
                  {sending && !streamText && (
                    <p className="text-sm text-zinc-500">正在思考…</p>
                  )}
                  <div ref={endRef} />
                </div>
              </div>

              <div className="px-4 pb-5 pt-1 lg:px-6">
                <form
                  className="mx-auto max-w-2xl rounded-2xl border border-line bg-white/[0.04] px-3 py-2 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] focus-within:border-zinc-500"
                  onSubmit={(event) => void send(event)}
                >
                  {error && (
                    <p className="px-1 pb-2 text-xs text-red-300" role="alert">
                      {error}
                    </p>
                  )}
                  <Textarea
                    className="min-h-[52px] resize-none border-0 bg-transparent px-1 py-2 focus:ring-0"
                    placeholder="发给世界构建者…"
                    value={input}
                    disabled={sending || busy}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                  />
                  <div className="flex items-center justify-between gap-3 px-1 pb-1">
                    <span className="text-[11px] text-zinc-600">Enter 发送</span>
                    <button
                      type="submit"
                      disabled={sending || busy || input.trim().length === 0}
                      className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold text-ink transition hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="发送"
                    >
                      ↑
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
