'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage, sendCreatorChatTurn } from '@/lib/api';
import type { CreatorChatMessageDTO } from '@/lib/types';
import {
  CHAT_FOCUS_LABEL,
  focusFromSelection,
  resolveThreadForProject,
} from '@/lib/creator-chat-nav';
import {
  CHAT_EFFORT_HINT,
  CHAT_EFFORT_LABEL,
  readStoredEffort,
  writeStoredEffort,
  type ChatEffort,
} from '@/lib/chat-composer';
import { parseProposals } from '@/lib/chat-proposals';
import { useStudioSelection } from './world/studio-selection';
import { ProposalCard } from './creator-chat/proposal-card';
import { ModelPicker } from './model-picker';

/**
 * Studio 壳级 Agent 面板（类 Cursor/Trae）：当前项目的世界构建者对话内嵌在右侧，
 * 选中实体自动作为 focus 传入，提案卡片就地确认，不必跳回 Chat 页。
 */
export function StudioAgentPanel({ projectId }: { projectId: string }) {
  const { selection, resources } = useStudioSelection();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CreatorChatMessageDTO[]>([]);
  const [input, setInput] = useState('');
  const [streamText, setStreamText] = useState('');
  const [memoryNote, setMemoryNote] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [effort, setEffort] = useState<ChatEffort>('balanced');
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const focus = useMemo(
    () => (resources && selection ? focusFromSelection(resources, selection) : null),
    [resources, selection],
  );
  const focusRef = useRef(focus);
  focusRef.current = focus;

  useEffect(() => {
    setEffort(readStoredEffort());
  }, []);

  const loadHistory = useCallback(
    async (id: string) => {
      const value = await api<{
        thread: unknown;
        messages: CreatorChatMessageDTO[];
      }>(`/world/creator-chats/${id}`);
      setMessages(Array.isArray(value.messages) ? value.messages : []);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setThreadId(null);
    setMessages([]);
    void resolveThreadForProject(projectId)
      .then((id) => {
        if (cancelled) return;
        setThreadId(id);
        return loadHistory(id);
      })
      .catch((reason) => {
        if (!cancelled) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [projectId, loadHistory]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamText, sending]);

  const send = useCallback(async () => {
    const content = input.trim();
    if (!threadId || sending || !content) return;
    setError('');
    setSending(true);
    setInput('');
    setStreamText('');
    setMemoryNote('');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let sawError = '';
    let sawDone = false;
    const onEvent = (event: string, data: unknown) => {
      const record =
        typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
      if (event === 'user') {
        const userMessage = record?.user_message;
        if (
          typeof userMessage === 'object' &&
          userMessage !== null &&
          typeof (userMessage as CreatorChatMessageDTO).id === 'string'
        ) {
          setMessages((current) => [...current, userMessage as CreatorChatMessageDTO]);
        }
        return;
      }
      if (event === 'memory') {
        const ops = record?.ops as { added?: unknown; updated?: unknown } | undefined;
        if (ops) {
          const added = Number(ops.added ?? 0);
          const updated = Number(ops.updated ?? 0);
          const parts = [`归档 ${added}`];
          if (updated > 0) parts.push(`合并 ${updated}`);
          setMemoryNote(`记忆：${parts.join(' · ')}`);
        }
        return;
      }
      if (event === 'delta' && typeof record?.text === 'string') {
        setStreamText((current) => current + record?.text);
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
          setMessages((current) => [...current, assistantMessage as CreatorChatMessageDTO]);
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
        threadId,
        content,
        onEvent,
        focusRef.current,
        effort,
        controller.signal,
      );
      if (sawError) setError(sawError);
    } catch (reason) {
      if (!controller.signal.aborted) setError(errorMessage(reason));
    } finally {
      setSending(false);
      // 流被中止或异常中断时 done 不会来：补拉一次历史对齐服务端状态。
      if (!sawDone) void loadHistory(threadId).catch(() => {});
    }
  }, [input, threadId, sending, effort, loadHistory]);

  const busy = sending || loading;

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <p className="text-sm font-medium text-zinc-900">Agent</p>
        <span className="flex-1" />
      </div>

      {focus ? (
        <p className="shrink-0 border-b border-line bg-violet-50 px-3 py-1.5 text-[11px] text-violet-800">
          聚焦：{CHAT_FOCUS_LABEL[focus.kind] ?? focus.kind}「{focus.name}」，这轮对话会围绕它展开
        </p>
      ) : null}

      {error ? (
        <p className="shrink-0 px-3 py-1.5 text-[11px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <p className="text-xs text-zinc-400">正在打开当前项目的 Agent 对话…</p>
        ) : messages.length === 0 && !streamText ? (
          <p className="text-xs leading-5 text-zinc-400">
            和世界构建者说点什么，提案会在这里就地确认。选中实体后对话自动聚焦它。
          </p>
        ) : (
          <ul className="space-y-3">
            {messages.map((message) => {
              const parsed = parseProposals(message);
              return (
                <li key={message.id}>
                  {message.role === 'user' ? (
                    <p className="ml-6 whitespace-pre-wrap rounded-xl bg-zinc-100 px-3 py-2 text-[13px] leading-6 text-zinc-800">
                      {message.content}
                    </p>
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
                            onApplied={() => {
                              if (threadId) void loadHistory(threadId).catch(() => {});
                            }}
                            onRejected={() => {
                              if (threadId) void loadHistory(threadId).catch(() => {});
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
            {(sending || !!streamText) && (
              <li>
                <p className="whitespace-pre-wrap text-[13px] leading-6 text-zinc-800">
                  {streamText}
                  {sending && !streamText ? '正在思考…' : ''}
                </p>
              </li>
            )}
          </ul>
        )}
        {memoryNote && !sending ? (
          <p className="mt-2 text-[11px] text-zinc-400">{memoryNote}</p>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="shrink-0 border-t border-line p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          className="min-h-[44px] w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[13px] leading-6 text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white"
          placeholder="让 Agent 做点什么…"
          value={input}
          rows={2}
          readOnly={busy}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.closest('form')?.requestSubmit();
            }
          }}
        />
        <div className="mt-1.5 flex items-center gap-2">
          <ModelPicker projectId={projectId} />
          <select
            className="max-w-24 rounded-full border border-zinc-200 bg-transparent px-2 py-0.5 text-[11px] text-zinc-600"
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
          <span className="flex-1" />
          {sending ? (
            <button
              type="button"
              className="rounded-lg bg-zinc-900 px-3 py-1 text-xs text-white hover:bg-zinc-800"
              onClick={() => abortRef.current?.abort()}
            >
              停止
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !threadId}
              className="rounded-lg bg-zinc-900 px-3 py-1 text-xs text-white transition hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              发送
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
