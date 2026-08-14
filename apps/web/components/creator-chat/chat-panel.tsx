'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Spinner } from '@zivith/ui';
import { api, errorMessage, sendCreatorChatTurn, unwrapList } from '@/lib/api';
import { PENDING_CHAT_TURN_KEY, threadDisplayTitle } from '@/lib/chat-history';
import {
  CHAT_FOCUS_LABEL,
  clearPendingFocus,
  mergeChatFocus,
  normalizeThread,
  parseFocusFromSearch,
  readPendingFocus,
  type ChatFocus,
} from '@/lib/creator-chat-nav';
import { useCollapsedSidebar } from '@/lib/sidebar-state';
import type { CreatorChatMessageDTO, CreatorChatThreadDTO, ProposalKind } from '@/lib/types';
import { IconExternal, IconSearch, IconSend, IconSidebar } from '@/components/nav-icons';
import { ChatSidebar, ChatSidebarRail } from './chat-sidebar';
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

export function ChatPanel() {
  const params = useParams<{ threadId?: string }>();
  const threadId = typeof params.threadId === 'string' ? params.threadId : undefined;
  const router = useRouter();
  const [collapsed, toggleCollapsed] = useCollapsedSidebar('chat');
  const [thread, setThread] = useState<CreatorChatThreadDTO | null>(null);
  const [messages, setMessages] = useState<CreatorChatMessageDTO[]>([]);
  const [threads, setThreads] = useState<CreatorChatThreadDTO[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(Boolean(threadId));
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState<ChatFocus | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const pendingConsumed = useRef(false);
  const focusRef = useRef<ChatFocus | null>(null);
  focusRef.current = focus;

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
      setThread(normalizeThread(value.thread));
      setMessages(Array.isArray(value.messages) ? value.messages : []);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  const loadThreads = useCallback(() => {
    api<CreatorChatThreadDTO[] | { data?: CreatorChatThreadDTO[]; items?: CreatorChatThreadDTO[] }>(
      '/world/creator-chats',
    )
      .then((value) =>
        setThreads(
          unwrapList(value)
            .map(normalizeThread)
            .filter((item): item is CreatorChatThreadDTO => Boolean(item)),
        ),
      )
      .catch(() => setThreads([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads, threadId]);

  useEffect(() => {
    if (!threadId || typeof window === 'undefined') {
      setFocus(null);
      return;
    }
    const fromUrl = parseFocusFromSearch(new URLSearchParams(window.location.search));
    const pending = readPendingFocus();
    const merged = mergeChatFocus(fromUrl, pending, threadId);
    if (pending) clearPendingFocus();
    setFocus(merged);
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
        await sendCreatorChatTurn(
          threadId,
          content,
          (event, data) => {
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
          },
          focusRef.current,
        );
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
      const created = await api<unknown>('/world/creator-chats', {
        method: 'POST',
        body: { project_id: null, title: null },
      });
      const createdThread = normalizeThread(created);
      if (!createdThread?.id) throw new Error('无法创建对话');
      router.push(`/creator-chats/${createdThread.id}`);
    } catch (reason) {
      setError(errorMessage(reason));
      if (firstMessage) sessionStorage.removeItem(PENDING_CHAT_TURN_KEY);
      setBusy(false);
    }
  }

  function handleApplied() {
    void load();
    loadThreads();
  }

  function dismissFocus() {
    setFocus(null);
    clearPendingFocus();
    if (threadId) router.replace(`/creator-chats/${threadId}`);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.closest('form')?.requestSubmit();
    }
  }

  const studioHref = thread?.project_id ? `/projects/${thread.project_id}/world` : '/projects';
  const empty = (!threadId || messages.length === 0) && !sending && !streamText && !loading;
  const canSend = input.trim().length > 0 && !sending && !busy;

  return (
    <div className="flex h-dvh overflow-hidden bg-white text-zinc-900 [color-scheme:light]">
      {collapsed ? (
        <ChatSidebarRail onToggle={toggleCollapsed} onNewChat={() => void startThread()} />
      ) : (
        <ChatSidebar
          threads={threads}
          threadId={threadId}
          busy={busy}
          onToggle={toggleCollapsed}
          onNewChat={() => void startThread()}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 px-4 lg:px-6">
          {collapsed && (
            <>
              <Link href="/creator-chats" className="text-[17px] font-semibold tracking-tight text-zinc-900">
                ZIVITH
              </Link>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"
                aria-label="展开侧栏"
                onClick={toggleCollapsed}
              >
                <IconSidebar className="size-4" />
              </button>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"
                aria-label="搜索对话"
                onClick={toggleCollapsed}
              >
                <IconSearch className="size-4" />
              </button>
            </>
          )}
          {threadId ? (
            <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium text-zinc-800">
              {thread ? threadDisplayTitle(thread) : '新世界对话'}
            </h1>
          ) : (
            <span className="flex-1" />
          )}
          <Link
            href={studioHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
          >
            Studio
            <IconExternal className="size-3.5" />
          </Link>
        </header>

        {threadId && !thread && !loading ? (
          <div className="grid flex-1 place-items-center p-8">
            <div className="max-w-sm text-center">
              <p className="text-base font-medium text-zinc-800">对话加载失败</p>
              <p className="mt-2 text-sm text-zinc-500">{error || '暂时无法连接到服务器，请稍后重试。'}</p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  className="rounded-full bg-[#4d6bfe] px-4 py-2 text-sm font-medium text-white"
                  onClick={() => void load()}
                >
                  重试
                </button>
                <Link className="text-sm text-[#4d6bfe]" href="/creator-chats">
                  新对话
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`min-h-0 flex-1 overflow-y-auto px-4 lg:px-6 ${empty ? 'flex items-center' : 'py-6'}`}
            >
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
                {loading && (
                  <div className="grid min-h-[40vh] place-items-center">
                    <Spinner label="正在加载对话…" />
                  </div>
                )}
                {empty && (
                  <div className="mx-auto w-full max-w-xl rounded-2xl bg-[#f3f4f6] px-8 py-10 text-center">
                    <div className="mx-auto mb-4 grid size-10 place-items-center rounded-full bg-white text-sm font-bold text-[#4d6bfe] shadow-sm">
                      Z
                    </div>
                    <p className="text-lg font-medium text-zinc-900">开始构建你的世界</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      用一句话说设定。确认后的提案会写入草稿，细节在 Studio 里改。
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                      {STARTERS.map((starter) => (
                        <button
                          key={starter}
                          type="button"
                          disabled={sending || busy}
                          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition hover:border-[#4d6bfe]/40 hover:text-zinc-900 disabled:opacity-40"
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
                      <p key={message.id} className="mx-auto text-center text-xs text-zinc-400">
                        {message.content}
                      </p>
                    );
                  }
                  if (message.role === 'user') {
                    return (
                      <div key={message.id} className="flex justify-end">
                        <div className="max-w-[80%] rounded-2xl bg-[#eef0f4] px-4 py-2.5 text-sm leading-6 text-zinc-800">
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={message.id} className="min-w-0">
                      <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-800">
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
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-800">{streamText}</p>
                )}
                {sending && !streamText && <p className="text-sm text-zinc-400">正在思考…</p>}
                <div ref={endRef} />
              </div>
            </div>

            <div className="px-4 pb-3 pt-1 lg:px-6">
              <form
                className="mx-auto max-w-2xl rounded-[28px] border border-zinc-200 bg-white px-4 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.06)]"
                onSubmit={(event) => void send(event)}
              >
                {error && (
                  <p className="px-1 pb-2 text-xs text-red-500" role="alert">
                    {error}
                  </p>
                )}
                {focus && (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl bg-[#eef2ff] px-3 py-1.5 text-xs text-[#1e3a8a]">
                    <span>
                      正在讨论{CHAT_FOCUS_LABEL[focus.kind]}「{focus.name}」
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-[11px] text-zinc-500 hover:text-zinc-800"
                      onClick={dismissFocus}
                    >
                      取消
                    </button>
                  </div>
                )}
                <textarea
                  className="min-h-[52px] w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-zinc-800 outline-none placeholder:text-zinc-400"
                  placeholder={
                    focus
                      ? `继续完善「${focus.name}」…`
                      : '发给世界构建者…'
                  }
                  value={input}
                  disabled={sending || busy}
                  rows={1}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                />
                <div className="flex items-center justify-end gap-2 px-1 pt-1">
                  <button
                    type="submit"
                    disabled={!canSend}
                    className="grid size-8 place-items-center rounded-full bg-[#4d6bfe] text-white transition hover:bg-[#3d5aee] disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
                    aria-label="发送"
                  >
                    <IconSend className="size-4" />
                  </button>
                </div>
              </form>
              <p className="mx-auto mt-2 max-w-2xl text-center text-[11px] text-zinc-400">
                内容由 AI 生成，请仔细甄别
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
