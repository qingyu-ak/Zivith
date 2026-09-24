'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage, rollbackCreatorChat, sendCreatorChatTurn, unwrapList } from '@/lib/api';
import type { CreatorChatMessageDTO, WorldSelection } from '@/lib/types';
import {
  CHAT_FOCUS_LABEL,
  chatHrefForStudio,
  focusFromSelection,
  normalizeThread,
  pickStudioAgentThread,
  resolveThreadForProject,
  studioAgentThreadKey,
  type ChatFocus,
} from '@/lib/creator-chat-nav';
import {
  AGENT_WRITE_MODES,
  AGENT_WRITE_MODE_HINT,
  AGENT_WRITE_MODE_LABEL,
  AGENT_WRITE_MODE_SHORT,
  decideWriteAction,
  readStoredWriteMode,
  writeStoredWriteMode,
  type AgentWriteMode,
} from '@/lib/agent-write-mode';
import {
  CHAT_EFFORT_HINT,
  CHAT_EFFORT_LABEL,
  CHAT_EFFORT_TOKEN_CAP,
  estimateMessageTokens,
  formatContextMeter,
  contextUsagePercent,
  readStoredEffort,
  writeStoredEffort,
  type ChatEffort,
} from '@/lib/chat-composer';
import { rollbackPreview, rollbackSlice, userTicks } from '@/lib/conversation-ticks';
import { ConversationTicksRail } from '@/components/creator-chat/conversation-ticks-rail';
import {
  handledProposalState,
  parseProposals,
  unconfirmedProposalCount,
} from '@/lib/chat-proposals';
import { formatMemoryOps } from '@/lib/memory-ops';
import {
  appendUniqueById,
  errorRetryContent,
  lastUserContent,
  retryTargetForMessage,
} from '@/lib/message-actions';
import {
  filterFocusableEntities,
  insertAtTrigger,
  insertMention,
  incompleteMentionHint,
  listFocusableEntities,
  mentionQueryAt,
} from '@/lib/agent-mentions';
import { threadDisplayTitle } from '@/lib/chat-history';
import {
  IconArrowRight,
  IconCheck,
  IconChevron,
  IconClipboard,
  IconHand,
  IconPlus,
  IconShieldAlert,
  IconShieldCheck,
} from '@/components/nav-icons';
import { insertDictatedText } from '@/lib/voice-transcript';
import { useVoiceDictation } from '@/lib/use-voice-dictation';
import { VoiceMicButton } from './creator-chat/voice-mic-button';
import { useStudioSelection } from './world/studio-selection';
import { ChatErrorBanner } from './creator-chat/chat-error-banner';
import { MentionMenu } from './creator-chat/mention-menu';
import { MessageActions } from './creator-chat/message-actions';
import { ThoughtSummary } from './creator-chat/thought-summary';
import { ProposalCard } from './creator-chat/proposal-card';
import { ModelPicker } from './model-picker';

interface ProjectUsageDTO {
  total_calls: number;
  total_estimated_cost: number | null;
  by_task_type: Array<{
    task_type: string;
    calls: number;
    quantity: number;
    unit: string;
  }>;
}

interface ThreadContextDTO {
  token_estimate: number;
  token_cap: number;
  message_count: number;
  summary_version: number | null;
  rolling_summary_present: boolean;
}

/**
 * Studio 壳级 Agent 面板（类 Cursor/Trae）：当前项目的世界构建者对话内嵌在右侧，
 * 选中实体自动作为 focus 传入，提案卡片就地确认，不必跳回 Chat 页。
 */
export function StudioAgentPanel({ projectId }: { projectId: string }) {
  const { selection, setSelection, resources, threads, reload } = useStudioSelection();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CreatorChatMessageDTO[]>([]);
  const [input, setInput] = useState('');
  const [streamText, setStreamText] = useState('');
  const [memoryNote, setMemoryNote] = useState('');
  const [sending, setSending] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setErrorState] = useState('');
  const [errorCanRetry, setErrorCanRetry] = useState(false);
  const setError = (text: string, retryable = false) => {
    setErrorState(text);
    setErrorCanRetry(Boolean(text) && retryable);
  };
  const [effort, setEffort] = useState<ChatEffort>('balanced');
  const [writeMode, setWriteMode] = useState<AgentWriteMode>('confirm');
  const [usage, setUsage] = useState<ProjectUsageDTO | null>(null);
  const [context, setContext] = useState<ThreadContextDTO | null>(null);
  const [writeMenuOpen, setWriteMenuOpen] = useState(false);
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const [pinnedFocus, setPinnedFocus] = useState<ChatFocus | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [rollbackTickId, setRollbackTickId] = useState<string | null>(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const lastSentRef = useRef('');
  const generationIdRef = useRef(0);
  const threadIdRef = useRef<string | null>(threadId);
  threadIdRef.current = threadId;
  const endRef = useRef<HTMLDivElement | null>(null);
  const writeMenuRef = useRef<HTMLDivElement | null>(null);
  const threadMenuRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const voice = useVoiceDictation({
    disabled: sending || loading || !threadId,
    insert: (text) => {
      const at = areaRef.current?.selectionStart ?? cursorRef.current;
      const next = insertDictatedText(inputRef.current, at, text);
      setInput(next.value);
      setCursor(next.cursor);
      requestAnimationFrame(() => {
        const area = areaRef.current;
        if (!area) return;
        area.focus();
        area.setSelectionRange(next.cursor, next.cursor);
      });
    },
  });
  const autoApplyRef = useRef(new Set<string>());
  const [applyingProposalIds, setApplyingProposalIds] = useState<string[]>([]);
  const writeModeRef = useRef<AgentWriteMode>(writeMode);
  writeModeRef.current = writeMode;

  const treeFocus = useMemo(
    () => (resources && selection ? focusFromSelection(resources, selection) : null),
    [resources, selection],
  );
  const focus = pinnedFocus ?? treeFocus;
  const focusRef = useRef(focus);
  focusRef.current = focus;

  const worldThreads = useMemo(
    () => threads.filter((thread) => thread.kind !== 'roleplay'),
    [threads],
  );
  const currentThread = worldThreads.find((thread) => thread.id === threadId) ?? null;

  const mention = mentionQueryAt(input, cursor);
  const mentionItems = useMemo(() => {
    if (!mention || !resources) return [];
    return filterFocusableEntities(listFocusableEntities(resources), mention.query);
  }, [mention?.start, mention?.query, resources]);
  const mentionOpen = Boolean(mention);
  const mentionHint = incompleteMentionHint(input, cursor, mentionItems.length);

  useEffect(() => {
    setEffort(readStoredEffort());
    setWriteMode(readStoredWriteMode());
  }, []);

  useEffect(() => {
    if (!writeMenuOpen && !threadMenuOpen) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (!writeMenuRef.current?.contains(target)) setWriteMenuOpen(false);
      if (!threadMenuRef.current?.contains(target)) setThreadMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setWriteMenuOpen(false);
        setThreadMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [writeMenuOpen, threadMenuOpen]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mention?.query, mention?.start]);

  useEffect(() => {
    if (!selection || !pinnedFocus) return;
    if (selection.kind !== pinnedFocus.kind || selection.id !== pinnedFocus.id) {
      setPinnedFocus(null);
    }
  }, [selection, pinnedFocus]);

  // 输入框下沿的用量页脚：挂载与每轮对话后刷新。
  const loadUsage = useCallback(() => {
    void api<ProjectUsageDTO>(`/projects/${projectId}/usage`)
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [projectId]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const loadContext = useCallback(async (id: string, mode: ChatEffort) => {
    try {
      const value = await api<ThreadContextDTO>(
        `/world/creator-chats/${id}/context?effort=${encodeURIComponent(mode)}`,
      );
      setContext(value);
    } catch {
      setContext(null);
    }
  }, []);

  useEffect(() => {
    if (threadId) void loadContext(threadId, effort);
  }, [threadId, effort, loadContext]);

  const loadHistory = useCallback(async (id: string) => {
    const value = await api<{
      thread: unknown;
      messages: CreatorChatMessageDTO[];
    }>(`/world/creator-chats/${id}`);
    setMessages(Array.isArray(value.messages) ? value.messages : []);
  }, []);

  // 写入模式为「完全访问 / 半自动」时，done 后按裁决自动写入提案（高危种类永远询问）。
  const autoApplyIfAllowed = useCallback(
    async (message: CreatorChatMessageDTO) => {
      if (autoApplyRef.current.has(message.id)) return;
      const parsed = parseProposals(message);
      if (parsed.applied || parsed.rejected || parsed.proposals.length === 0) return;
      if (
        decideWriteAction(
          writeModeRef.current,
          parsed.proposals.map((item) => item.kind),
        ) !== 'auto'
      ) {
        return;
      }
      const target = message.thread_id || threadId;
      if (!target) return;
      autoApplyRef.current.add(message.id);
      setApplyingProposalIds((current) =>
        current.includes(message.id) ? current : [...current, message.id],
      );
      try {
        await api(`/world/creator-chats/${target}/proposals/${message.id}/apply`, {
          method: 'POST',
          body: {},
        });
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id ? { ...item, proposal_state: 'applied' } : item,
          ),
        );
        await loadHistory(target);
        void loadContext(target, effort);
        void reload({ silent: true });
      } catch (reason) {
        const handled = handledProposalState(reason);
        if (handled === 'applied') {
          setMessages((current) =>
            current.map((item) =>
              item.id === message.id ? { ...item, proposal_state: 'applied' } : item,
            ),
          );
          await loadHistory(target);
          void loadContext(target, effort);
          void reload({ silent: true });
          return;
        }
        if (handled === 'rejected') {
          setMessages((current) =>
            current.map((item) =>
              item.id === message.id ? { ...item, proposal_state: 'rejected' } : item,
            ),
          );
          return;
        }
        autoApplyRef.current.delete(message.id);
        setError('自动写入失败，请手动确认提案');
      } finally {
        setApplyingProposalIds((current) => current.filter((id) => id !== message.id));
      }
    },
    [threadId, loadHistory, loadContext, effort, reload],
  );

  const rememberThread = useCallback(
    (id: string) => {
      window.localStorage.setItem(studioAgentThreadKey(projectId), id);
    },
    [projectId],
  );

  const openThread = useCallback(
    async (id: string) => {
      generationIdRef.current += 1;
      abortRef.current?.abort();
      sendingRef.current = false;
      lastSentRef.current = '';
      threadIdRef.current = id;
      setSending(false);
      setStopped(false);
      setStreamText('');
      setMemoryNote('');
      setThreadId(id);
      rememberThread(id);
      setThreadMenuOpen(false);
      setError('');
      await loadHistory(id);
      void loadContext(id, effort);
    },
    [rememberThread, loadHistory, loadContext, effort],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setThreadId(null);
    setMessages([]);
    const stored =
      typeof window === 'undefined'
        ? null
        : window.localStorage.getItem(studioAgentThreadKey(projectId));
    void (async () => {
      try {
        const listed = await api<unknown[] | { data?: unknown[]; items?: unknown[] }>(
          `/world/projects/${projectId}/creator-chats`,
        );
        if (cancelled) return;
        const normalized = unwrapList(listed)
          .map(normalizeThread)
          .filter((thread): thread is NonNullable<typeof thread> => Boolean(thread?.id));
        const picked = pickStudioAgentThread(normalized, stored);
        const id = picked ?? (await resolveThreadForProject(projectId));
        if (cancelled) return;
        setThreadId(id);
        rememberThread(id);
        await loadHistory(id);
        if (!picked) void reload({ silent: true });
      } catch (reason) {
        if (!cancelled) setError(errorMessage(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [projectId, loadHistory, rememberThread, reload]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamText, sending]);

  function applyMention(entity: ChatFocus) {
    if (!mention) return;
    const next = insertMention(input, cursor, mention.start, entity.name);
    setInput(next.text);
    setCursor(next.cursor);
    setPinnedFocus(entity);
    setSelection({ kind: entity.kind, id: entity.id } satisfies Exclude<WorldSelection, null>);
    setError('');
    requestAnimationFrame(() => {
      const area = areaRef.current;
      if (!area) return;
      area.focus();
      area.setSelectionRange(next.cursor, next.cursor);
    });
  }

  async function createThread() {
    if (sending || loading) return;
    setError('');
    try {
      const created = await api<unknown>('/world/creator-chats', {
        method: 'POST',
        body: { project_id: projectId, title: null },
      });
      const thread = normalizeThread(created);
      if (!thread?.id) throw new Error('无法创建对话');
      await reload({ silent: true });
      await openThread(thread.id);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  const sendContent = useCallback(
    async (content: string, options?: { retry?: boolean }) => {
      const trimmed = content.trim();
      if (!threadId || !trimmed) return;
      abortRef.current?.abort();
      sendingRef.current = true;
      lastSentRef.current = trimmed;
      const generation = ++generationIdRef.current;
      const startedThreadId = threadId;
      setError('');
      setSending(true);
      setStopped(false);
      setStreamText('');
      setMemoryNote('');
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const stillCurrent = () =>
        generation === generationIdRef.current && threadIdRef.current === startedThreadId;
      let sawError = '';
      let sawDone = false;
      let acceptedUser = false;
      const onEvent = (event: string, data: unknown) => {
        if (!stillCurrent()) return;
        const record =
          typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
        if (event === 'user') {
          const userMessage = record?.user_message;
          if (
            typeof userMessage === 'object' &&
            userMessage !== null &&
            typeof (userMessage as CreatorChatMessageDTO).id === 'string'
          ) {
            acceptedUser = true;
            setMessages((current) =>
              appendUniqueById(current, userMessage as CreatorChatMessageDTO),
            );
          }
          return;
        }
        if (event === 'memory') {
          const ops =
            record?.ops && typeof record.ops === 'object'
              ? (record.ops as Record<string, unknown>)
              : null;
          if (ops) setMemoryNote(formatMemoryOps(ops));
          return;
        }
        if (event === 'delta' && typeof record?.text === 'string') {
          const chunk = record.text;
          setStreamText((current) => current + chunk);
          return;
        }
        if (event === 'done') {
          sawDone = true;
          const assistantMessage = record?.assistant_message;
          if (
            typeof assistantMessage === 'object' &&
            assistantMessage !== null &&
            typeof (assistantMessage as CreatorChatMessageDTO).id === 'string'
          ) {
            const next = assistantMessage as CreatorChatMessageDTO;
            setMessages((current) => appendUniqueById(current, next));
            void autoApplyIfAllowed(next);
          }
          setStreamText('');
          return;
        }
        if (event === 'error') {
          sawError = typeof record?.message === 'string' ? record.message : '回复失败';
        }
      };
      try {
        await sendCreatorChatTurn(
          startedThreadId,
          trimmed,
          onEvent,
          focusRef.current,
          effort,
          controller.signal,
          options?.retry ? { retry: true } : undefined,
        );
        if (!stillCurrent()) return;
        if (sawError) {
          setError(sawError, true);
          if (!acceptedUser) {
            setInput((current) => (current.trim() ? current : trimmed));
          }
        }
      } catch (reason) {
        if (!stillCurrent()) return;
        const aborted =
          (reason instanceof DOMException && reason.name === 'AbortError') ||
          (reason instanceof Error && reason.name === 'AbortError') ||
          controller.signal.aborted;
        if (aborted) {
          setStopped(true);
        } else {
          setError(errorMessage(reason), true);
          if (!acceptedUser) {
            setInput((current) => (current.trim() ? current : trimmed));
          }
        }
      }
      if (!stillCurrent()) return;
      if (abortRef.current === controller) abortRef.current = null;
      sendingRef.current = false;
      setSending(false);
      if (!sawDone) void loadHistory(startedThreadId).catch(() => {});
      loadUsage();
      void loadContext(startedThreadId, effort);
      void reload({ silent: true });
    },
    [threadId, effort, loadHistory, loadUsage, loadContext, autoApplyIfAllowed, reload],
  );

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || !threadId) return;
    const hint = incompleteMentionHint(input, cursor, mentionItems.length);
    if (hint) {
      setError(hint);
      return;
    }
    setInput('');
    await sendContent(content);
  }, [input, cursor, mentionItems.length, threadId, sendContent]);

  const busy = sending || loading;
  const contextCap = context?.token_cap ?? CHAT_EFFORT_TOKEN_CAP[effort];
  const historyTokens =
    context?.token_estimate ?? estimateMessageTokens(messages.map((item) => item.content));
  const contextUsed = historyTokens + estimateMessageTokens([input]);
  const contextPct = contextUsagePercent(contextUsed, contextCap);
  const llmUsage = usage?.by_task_type.find((item) => item.task_type.startsWith('llm'));
  const contextMeter = formatContextMeter(contextUsed, contextCap, {
    approximate: !context,
    llmCalls: usage ? (llmUsage?.calls ?? 0) : null,
  });
  const currentPending = threadId
    ? unconfirmedProposalCount(threadId, worldThreads, threadId, messages)
    : 0;

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
        <div className="relative min-w-0 flex-1" ref={threadMenuRef}>
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-left hover:bg-zinc-100"
            aria-expanded={threadMenuOpen}
            aria-label="切换对话"
            onClick={() => {
              setWriteMenuOpen(false);
              setThreadMenuOpen((open) => !open);
            }}
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">
              {currentThread ? threadDisplayTitle(currentThread) : 'Agent'}
            </span>
            {currentPending > 0 ? (
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-800">
                {currentPending}
              </span>
            ) : null}
            <IconChevron className="size-3.5 shrink-0 text-zinc-400" />
          </button>
          {threadMenuOpen ? (
            <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
              {worldThreads.length === 0 ? (
                <p className="px-3 py-2 text-xs text-zinc-400">还没有对话</p>
              ) : (
                worldThreads.map((thread) => {
                  const pending = unconfirmedProposalCount(
                    thread.id,
                    worldThreads,
                    threadId,
                    messages,
                  );
                  const active = thread.id === threadId;
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                        active ? 'bg-zinc-50 text-zinc-900' : 'text-zinc-700'
                      }`}
                      onClick={() => void openThread(thread.id)}
                    >
                      <span className="min-w-0 flex-1 truncate">{threadDisplayTitle(thread)}</span>
                      {pending > 0 ? (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-800">
                          未确认 {pending}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          aria-label="新对话"
          disabled={sending || loading}
          onClick={() => void createThread()}
        >
          <IconPlus className="size-3.5" />
        </button>
        {threadId ? (
          <Link
            href={chatHrefForStudio(threadId)}
            className="shrink-0 px-1 text-[11px] text-zinc-500 transition hover:text-zinc-800"
            title="在 Chat 页打开同一条世界构建对话"
          >
            Chat ↗
          </Link>
        ) : null}
      </div>
      {focus ? (
        <p className="shrink-0 border-b border-line px-3 py-1 text-[11px] text-violet-800">
          聚焦 {CHAT_FOCUS_LABEL[focus.kind] ?? focus.kind}「{focus.name}」
          {pinnedFocus ? ' · 本轮 @ 引用' : ''}
        </p>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
      <div className="min-h-0 h-full overflow-y-auto px-3 py-3">
        {loading ? (
          <p className="text-xs text-zinc-400">正在打开当前项目的 Agent 对话…</p>
        ) : messages.length === 0 && !streamText ? (
          <p className="text-xs leading-5 text-zinc-400">
            输入 @ 引用实体作为本轮聚焦。提案在这里就地确认。
          </p>
        ) : (
          <ul className="space-y-3">
            {messages.map((message) => {
              const parsed = parseProposals(message);
              const writeAction = decideWriteAction(
                writeMode,
                parsed.proposals.map((item) => item.kind),
              );
              const retry = retryTargetForMessage(messages, message.id);
              if (message.role === 'system') {
                return (
                  <li key={message.id}>
                    <p className="text-center text-[11px] text-zinc-400">{message.content}</p>
                  </li>
                );
              }
              return (
                <li key={message.id} className="group">
                  {message.role === 'user' ? (
                    <div>
                      <p className="ml-6 whitespace-pre-wrap rounded-xl bg-zinc-100 px-3 py-2 text-[13px] leading-6 text-zinc-800">
                        {message.content}
                      </p>
                      <MessageActions
                        copyText={message.content}
                        align="end"
                        busy={sending}
                        retry={() => {
                          if (retry?.ok) void sendContent(retry.content, { retry: true });
                        }}
                        retryBlocked={retry && !retry.ok ? retry.blocked : retry ? null : 'empty'}
                      />
                    </div>
                  ) : (
                    <div className="mr-2">
                      <p className="whitespace-pre-wrap text-[13px] leading-6 text-zinc-800">
                        {message.content}
                      </p>
                      {parsed.proposals.length > 0 ? (
                        <div className="mt-2">
                          <ProposalCard
                            threadId={message.thread_id || threadId || ''}
                            messageId={message.id}
                            proposals={parsed.proposals}
                            applied={parsed.applied}
                            rejected={parsed.rejected}
                            applying={applyingProposalIds.includes(message.id)}
                            plan={writeAction === 'plan'}
                            executeLabel={writeAction === 'plan' ? '按此计划写入' : undefined}
                            studioLink={false}
                            onApplied={() => {
                              if (threadId) {
                                void loadHistory(threadId).catch(() => {});
                                void loadContext(threadId, effort);
                              }
                              void reload({ silent: true });
                            }}
                            onRejected={() => {
                              if (threadId) void loadHistory(threadId).catch(() => {});
                            }}
                          />
                        </div>
                      ) : null}
                      <MessageActions
                        copyText={message.content}
                        busy={sending}
                        retry={() => {
                          if (retry?.ok) void sendContent(retry.content, { retry: true });
                        }}
                        retryBlocked={retry && !retry.ok ? retry.blocked : retry ? null : 'empty'}
                      />
                    </div>
                  )}
                </li>
              );
            })}
            {(sending || stopped || !!streamText) && (
              <li className="group">
                <p className="whitespace-pre-wrap text-[13px] leading-6 text-zinc-800">
                  {streamText}
                  {sending && !streamText ? '正在思考…' : ''}
                </p>
                {stopped && streamText ? (
                  <p className="mt-1 text-[11px] text-zinc-400">已停止生成</p>
                ) : null}
                {streamText ? (
                  <MessageActions
                    copyText={streamText}
                    busy={sending}
                    retry={() => {
                      const content = lastUserContent(messages) ?? lastSentRef.current;
                      if (content.trim()) void sendContent(content, { retry: true });
                    }}
                    retryBlocked={
                      lastUserContent(messages) || lastSentRef.current.trim() ? null : 'empty'
                    }
                  />
                ) : null}
              </li>
            )}
          </ul>
        )}
        {memoryNote && !sending ? <ThoughtSummary note={memoryNote} className="mt-2" /> : null}
        <div ref={endRef} />
      </div>
      {userTicks(messages).length > 0 ? (
        <div className="pointer-events-none absolute inset-y-0 right-1 z-10 flex items-start pt-3">
          <div className="pointer-events-auto max-h-full">
            <ConversationTicksRail
              ticks={userTicks(messages)}
              userLabel="你"
              assistantLabel="助手"
              onPick={(messageId) => setRollbackTickId(messageId)}
            />
          </div>
        </div>
      ) : null}
      </div>

      <form
        className="shrink-0 border-t border-line p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {error ? (
          <div className="mb-2">
            <ChatErrorBanner
              message={error}
              busy={sending}
              onRetry={
                errorCanRetry
                  ? () => {
                      const content = errorRetryContent(lastSentRef.current, messages);
                      if (content) void sendContent(content, { retry: true });
                    }
                  : undefined
              }
              onDismiss={() => setError('')}
            />
          </div>
        ) : null}
        {rollbackTickId ? (
          <div className="mb-2 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] text-zinc-600">
            <p>
              回退到这句之后：拿掉{' '}
              {rollbackPreview(rollbackSlice(messages, rollbackTickId, 'keep').drop).dialogueCount}{' '}
              句。本场因此写入的事件/关系会尽量撤回。
            </p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                className="text-zinc-400"
                disabled={rollbackBusy}
                onClick={() => setRollbackTickId(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="text-[#1e3a8a]"
                disabled={rollbackBusy || !threadId}
                onClick={() => {
                  if (!threadId) return;
                  setRollbackBusy(true);
                  void rollbackCreatorChat(threadId, rollbackTickId, 'keep')
                    .then(() => {
                      setRollbackTickId(null);
                      return loadHistory(threadId);
                    })
                    .catch((reason) => setError(errorMessage(reason)))
                    .finally(() => setRollbackBusy(false));
                }}
              >
                {rollbackBusy ? '回退中…' : '确认回退'}
              </button>
            </div>
          </div>
        ) : null}
        {/* Cursor 式输入框：模型 / 努力程度 / 发送都在框内下沿 */}
        <div className="relative rounded-xl border border-zinc-200 bg-zinc-50 px-2 pt-1.5 transition focus-within:border-zinc-400 focus-within:bg-white">
          {mentionOpen ? (
            <MentionMenu
              items={mentionItems}
              activeIndex={mentionIndex}
              onPick={applyMention}
              emptyHint={resources ? '没有匹配的实体' : '正在加载实体…'}
              id="studio-mention-list"
            />
          ) : null}
          <textarea
            ref={areaRef}
            className="min-h-[44px] w-full resize-none bg-transparent px-1 py-0.5 text-[13px] leading-6 text-zinc-800 outline-none placeholder:text-zinc-400"
            placeholder="改设定、补角色，或 @ 引用实体…"
            value={input}
            rows={2}
            readOnly={loading}
            aria-autocomplete="list"
            aria-expanded={mentionOpen}
            aria-controls={mentionOpen ? 'studio-mention-list' : undefined}
            onChange={(event) => {
              setInput(event.target.value);
              setCursor(event.target.selectionStart);
              if (voice.notice) voice.setNotice('');
            }}
            onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
            onKeyUp={(event) => setCursor(event.currentTarget.selectionStart)}
            onKeyDown={(event) => {
              if (mentionOpen) {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setMentionIndex((index) =>
                    Math.max(0, Math.min(mentionItems.length - 1, index + 1)),
                  );
                  return;
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setMentionIndex((index) => Math.max(0, index - 1));
                  return;
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  const picked = mentionItems[mentionIndex] ?? mentionItems[0];
                  if (picked) {
                    event.preventDefault();
                    applyMention(picked);
                    return;
                  }
                  event.preventDefault();
                  return;
                }
                if (event.key === 'Escape' && mention) {
                  event.preventDefault();
                  const next = `${input.slice(0, mention.start)}${input.slice(cursor)}`;
                  setInput(next);
                  setCursor(mention.start);
                  return;
                }
              }
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.closest('form')?.requestSubmit();
              }
            }}
          />
          {voice.recording && voice.interim ? (
            <p className="px-1 pb-0.5 text-[11px] leading-4 text-zinc-500" aria-live="polite">
              {voice.interim}
              <span className="ml-1 inline-block h-3 w-px animate-pulse bg-zinc-400 align-middle" />
            </p>
          ) : null}
          {voice.notice ? (
            <p className="px-1 pb-0.5 text-[11px] text-red-500" role="alert">
              {voice.notice}
            </p>
          ) : null}
          <div className="flex flex-nowrap items-center gap-0.5 pb-1">
            <div className="relative" ref={writeMenuRef}>
              <button
                type="button"
                className={`inline-flex h-7 items-center gap-0.5 rounded-full px-1.5 text-[11px] hover:bg-zinc-100 ${
                  writeMode === 'full' ? 'text-amber-700' : 'text-zinc-600'
                }`}
                aria-expanded={writeMenuOpen}
                aria-label={`写入模式：${AGENT_WRITE_MODE_LABEL[writeMode]}`}
                title={AGENT_WRITE_MODE_HINT[writeMode]}
                onClick={() => setWriteMenuOpen((open) => !open)}
              >
                <WriteModeIcon mode={writeMode} />
                <span>{AGENT_WRITE_MODE_SHORT[writeMode]}</span>
                <IconChevron className="size-3 shrink-0 text-zinc-400" />
              </button>
              {writeMenuOpen ? (
                <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-64 overflow-hidden rounded-2xl border border-zinc-200 bg-white py-1 shadow-lg">
                  {AGENT_WRITE_MODES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                      onClick={() => {
                        setWriteMode(item);
                        writeStoredWriteMode(item);
                        setWriteMenuOpen(false);
                      }}
                    >
                      <span
                        className={`mt-0.5 ${item === 'full' ? 'text-amber-600' : 'text-zinc-500'}`}
                      >
                        <WriteModeIcon mode={item} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{AGENT_WRITE_MODE_LABEL[item]}</span>
                        <span className="mt-0.5 block text-[11px] font-normal text-zinc-400">
                          {AGENT_WRITE_MODE_HINT[item]}
                        </span>
                      </span>
                      {writeMode === item ? <IconCheck className="mt-0.5 size-4 shrink-0" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <VoiceMicButton
              size="sm"
              recording={voice.recording}
              voiceState={voice.voiceState}
              voiceReason={voice.voiceReason}
              disabled={sending || loading || !threadId}
              onToggle={voice.toggle}
            />
            <button
              type="button"
              className="grid size-7 place-items-center rounded-full text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              aria-label="引用实体"
              title="输入 @ 引用实体"
              disabled={busy}
              onClick={() => {
                const at = areaRef.current?.selectionStart ?? input.length;
                const next = insertAtTrigger(input, at);
                setInput(next.text);
                setCursor(next.cursor);
                requestAnimationFrame(() => {
                  const area = areaRef.current;
                  if (!area) return;
                  area.focus();
                  area.setSelectionRange(next.cursor, next.cursor);
                });
              }}
            >
              @
            </button>
            <ModelPicker projectId={projectId} />
            <select
              className="max-w-24 rounded-full bg-transparent px-1.5 py-0.5 text-[11px] text-zinc-600 outline-none transition hover:bg-zinc-100"
              value={effort}
              title={CHAT_EFFORT_HINT[effort]}
              aria-label="努力程度"
              onChange={(event) => {
                const next = event.target.value as ChatEffort;
                setEffort(next);
                writeStoredEffort(next);
              }}
            >
              {(['fast', 'balanced', 'deep'] as const).map((item) => (
                <option key={item} value={item}>
                  {CHAT_EFFORT_LABEL[item]}
                </option>
              ))}
            </select>
            <span className="min-w-0 flex-1" />
            {sending && !input.trim() ? (
              <button
                type="button"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-800"
                aria-label="暂停思考"
                title="取消这一轮思考"
                onClick={() => abortRef.current?.abort()}
              >
                <span className="block size-2.5 rounded-[2px] bg-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || !threadId || Boolean(mentionHint) || loading}
                aria-label={sending ? '补充' : '发送'}
                title={mentionHint ?? (sending ? '补充' : '发送')}
                className="grid size-7 shrink-0 place-items-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400"
              >
                {sending ? (
                  <span className="px-0.5 text-[9px] font-medium">补充</span>
                ) : (
                  <IconArrowRight className="size-4 -rotate-90" />
                )}
              </button>
            )}
          </div>
        </div>
        <p
          className={`mt-1 px-1 text-[11px] leading-4 ${
            contextPct >= 90 ? 'text-amber-600' : 'text-zinc-400'
          }`}
          title={!context ? '服务端上下文尚未返回，当前是按字数粗估' : CHAT_EFFORT_HINT[effort]}
        >
          {contextMeter}
        </p>
      </form>
    </div>
  );
}

function WriteModeIcon({ mode }: { mode: AgentWriteMode }) {
  const className = 'size-3.5 shrink-0';
  if (mode === 'semi') return <IconShieldCheck className={className} />;
  if (mode === 'plan') return <IconClipboard className={className} />;
  if (mode === 'full') return <IconShieldAlert className={className} />;
  return <IconHand className={className} />;
}
