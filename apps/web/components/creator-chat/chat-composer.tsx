'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '@/lib/api';
import { settingsHrefFor, type ChatFocus } from '@/lib/creator-chat-nav';
import { captureSettingsReturn } from '@/lib/settings-return';
import {
  CHAT_EFFORT_HINT,
  CHAT_EFFORT_LABEL,
  CHAT_EFFORT_TOKEN_CAP,
  estimateMessageTokens,
  formatTokenCount,
  formatContextRatio,
  contextUsagePercent,
  llmChoices,
  selectedLlmLabel,
  writeStoredEffort,
  displayModelId,
  filterLlmChoices,
  type ChatEffort,
} from '@/lib/chat-composer';
import type { ProviderCatalogDTO, ProviderId, WorldResourcesDTO } from '@/lib/types';
import {
  IconBrain,
  IconCheck,
  IconChevron,
  IconClipboard,
  IconHand,
  IconPlus,
  IconSend,
  IconShieldAlert,
  IconShieldCheck,
  IconStop,
} from '@/components/nav-icons';
import {
  AGENT_WRITE_MODE_HINT,
  AGENT_WRITE_MODE_LABEL,
  AGENT_WRITE_MODES,
  writeStoredWriteMode,
  type AgentWriteMode,
} from '@/lib/agent-write-mode';
import {
  filterFocusableEntities,
  insertAtTrigger,
  insertMention,
  incompleteMentionHint,
  listFocusableEntities,
  mentionQueryAt,
} from '@/lib/agent-mentions';
import { MentionMenu } from './mention-menu';

type MenuKind = 'confirm' | 'usage' | 'model' | 'effort' | null;

interface ThreadContextDTO {
  token_estimate: number;
  token_cap: number;
  message_count: number;
  summary_version: number | null;
  rolling_summary_present: boolean;
}

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

export function ChatComposer({
  value,
  placeholder,
  sending,
  canSend,
  projectId,
  settingsProjectId,
  threadId,
  messageTexts,
  effort,
  onEffortChange,
  writeMode,
  onWriteModeChange,
  onChange,
  onSubmit,
  onStop,
  onNewChat,
  resources = null,
  mentionEnabled = false,
  onMentionPick,
  blocked = false,
}: {
  value: string;
  placeholder: string;
  sending: boolean;
  canSend: boolean;
  projectId?: string | null;
  settingsProjectId?: string | null;
  threadId?: string | null;
  messageTexts: string[];
  effort: ChatEffort;
  onEffortChange: (effort: ChatEffort) => void;
  writeMode: AgentWriteMode;
  onWriteModeChange: (mode: AgentWriteMode) => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onNewChat: () => void;
  resources?: WorldResourcesDTO | null;
  mentionEnabled?: boolean;
  onMentionPick?: (entity: ChatFocus) => void;
  /** 还没有选中世界时锁定输入，避免发送后才报错。 */
  blocked?: boolean;
}) {
  const rootRef = useRef<HTMLFormElement | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const [menu, setMenu] = useState<MenuKind>(null);
  const [catalog, setCatalog] = useState<ProviderCatalogDTO | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [context, setContext] = useState<ThreadContextDTO | null>(null);
  const [usage, setUsage] = useState<ProjectUsageDTO | null>(null);
  const [modelQuery, setModelQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [cursor, setCursor] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);

  const mention = mentionEnabled ? mentionQueryAt(value, cursor) : null;
  const mentionItems = useMemo(() => {
    if (!mention || !resources) return [];
    return filterFocusableEntities(listFocusableEntities(resources), mention.query);
  }, [mention?.start, mention?.query, resources]);
  const mentionMenuOpen = Boolean(mentionEnabled && mention);
  const mentionHint = mentionEnabled
    ? incompleteMentionHint(value, cursor, mentionItems.length)
    : null;

  useEffect(() => {
    setMentionIndex(0);
  }, [mention?.query, mention?.start]);

  useEffect(() => {
    if (cursor > value.length) setCursor(value.length);
  }, [value, cursor]);

  useEffect(() => {
    void api<ProviderCatalogDTO>('/providers')
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (threadId) {
      void api<ThreadContextDTO>(
        `/world/creator-chats/${threadId}/context?effort=${encodeURIComponent(effort)}`,
      )
        .then((value) => {
          if (!cancelled) setContext(value);
        })
        .catch(() => {
          if (!cancelled) setContext(null);
        });
    } else {
      setContext(null);
    }
    if (projectId) {
      void api<ProjectUsageDTO>(`/projects/${projectId}/usage`)
        .then((value) => {
          if (!cancelled) setUsage(value);
        })
        .catch(() => {
          if (!cancelled) setUsage(null);
        });
    } else {
      setUsage(null);
    }
    return () => {
      cancelled = true;
    };
  }, [threadId, projectId, effort, messageTexts.length]);

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setMenu(null);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setMenu(null);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (menu !== 'model') {
      setModelQuery('');
      return;
    }
    searchRef.current?.focus();
  }, [menu]);

  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  const cap = context?.token_cap ?? CHAT_EFFORT_TOKEN_CAP[effort];
  const historyTokens = context?.token_estimate ?? estimateMessageTokens(messageTexts);
  const used = historyTokens + estimateMessageTokens([value]);
  const usedPct = contextUsagePercent(used, cap);
  const llmUsage = usage?.by_task_type.find((item) => item.task_type.startsWith('llm'));
  const contextRatio = formatContextRatio(used, cap, { approximate: !context });
  const choices = llmChoices(catalog);
  const visibleChoices = filterLlmChoices(choices, modelQuery);
  const modelLabel = selectedLlmLabel(catalog);
  const settingsHref = settingsHrefFor(projectId, [settingsProjectId], 'models');
  const account = catalog?.siliconflow_account;
  const llmProvider = catalog?.providers.find((item) => item.id === catalog.selection.llm);

  async function pickModel(provider: ProviderId, model: string) {
    setSaving(true);
    setNotice('');
    try {
      const result = await api<{
        selection: ProviderCatalogDTO['selection'];
        models: ProviderCatalogDTO['models'];
      }>('/providers/selection', {
        method: 'PUT',
        body: { llm: provider, models: { llm: model } },
      });
      setCatalog((current) =>
        current
          ? {
              ...current,
              selection: result.selection,
              models: { ...current.models, ...result.models },
            }
          : current,
      );
      setMenu(null);
    } catch (reason) {
      setNotice(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  function applyMention(entity: ChatFocus) {
    if (!mention) return;
    const next = insertMention(value, cursor, mention.start, entity.name);
    onChange(next.text);
    setCursor(next.cursor);
    onMentionPick?.(entity);
    setNotice('');
    requestAnimationFrame(() => {
      const area = areaRef.current;
      if (!area) return;
      area.focus();
      area.setSelectionRange(next.cursor, next.cursor);
    });
  }

  function insertAtFromToolbar() {
    const at = areaRef.current?.selectionStart ?? cursor;
    const next = insertAtTrigger(value, at);
    onChange(next.text);
    setCursor(next.cursor);
    setMenu(null);
    requestAnimationFrame(() => {
      const area = areaRef.current;
      if (!area) return;
      area.focus();
      area.setSelectionRange(next.cursor, next.cursor);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mentionHint) {
      setNotice(mentionHint);
      return;
    }
    if (blocked || !canSend) return;
    onSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionMenuOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMentionIndex((index) => Math.min(Math.max(mentionItems.length - 1, 0), index + 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionIndex((index) => Math.max(0, index - 1));
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && mentionItems.length > 0) {
        const picked = mentionItems[mentionIndex] ?? mentionItems[0];
        if (picked) {
          event.preventDefault();
          applyMention(picked);
        }
        return;
      }
      if (event.key === 'Escape' && mention) {
        event.preventDefault();
        const next = `${value.slice(0, mention.start)}${value.slice(cursor)}`;
        onChange(next);
        setCursor(mention.start);
        setNotice('');
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.closest('form')?.requestSubmit();
    }
  }

  return (
    <form
      ref={rootRef}
      className="relative mx-auto max-w-2xl rounded-[28px] border border-zinc-200 bg-white px-3 pb-2 pt-3 shadow-[0_8px_30px_rgba(15,23,42,0.06)]"
      onSubmit={handleSubmit}
    >
      <div className="relative">
        {mentionMenuOpen ? (
          <MentionMenu
            items={mentionItems}
            activeIndex={mentionIndex}
            onPick={applyMention}
            emptyHint={resources ? '没有匹配的实体' : '打开世界项目后才能引用实体'}
            id="chat-mention-list"
          />
        ) : null}
        <textarea
          ref={areaRef}
          className="min-h-[52px] w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-zinc-800 outline-none placeholder:text-zinc-400 disabled:text-zinc-400"
          placeholder={placeholder}
          value={value}
          rows={2}
          readOnly={sending || blocked}
          aria-autocomplete={mentionEnabled ? 'list' : undefined}
          aria-expanded={mentionMenuOpen}
          aria-controls={mentionMenuOpen ? 'chat-mention-list' : undefined}
          onChange={(event) => {
            onChange(event.target.value);
            setCursor(event.target.selectionStart);
            if (notice) setNotice('');
          }}
          onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
          onKeyUp={(event) => setCursor(event.currentTarget.selectionStart)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {notice ? (
        <p className="px-2 pb-1 text-[11px] text-red-500" role="alert">
          {notice}
        </p>
      ) : null}
      <div className="flex items-center gap-1 px-1 pt-1">
        <button
          type="button"
          className="grid size-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          aria-label="新对话"
          onClick={onNewChat}
        >
          <IconPlus className="size-4" />
        </button>
        {mentionEnabled ? (
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full text-[15px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="引用实体"
            title="输入 @ 引用实体，选中后作为本轮聚焦"
            disabled={sending}
            onClick={insertAtFromToolbar}
          >
            @
          </button>
        ) : null}
        <div className="relative">
          <button
            type="button"
            className={`inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs hover:bg-zinc-100 ${
              writeMode === 'full' ? 'text-amber-700' : 'text-zinc-600'
            }`}
            aria-expanded={menu === 'confirm'}
            aria-label={`写入模式：${AGENT_WRITE_MODE_LABEL[writeMode]}`}
            onClick={() => setMenu(menu === 'confirm' ? null : 'confirm')}
          >
            <WriteModeIcon mode={writeMode} />
            {AGENT_WRITE_MODE_LABEL[writeMode]}
            <IconChevron className="size-3.5 text-zinc-400" />
          </button>
          {menu === 'confirm' ? (
            <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-72 overflow-hidden rounded-2xl border border-zinc-200 bg-white py-1 shadow-lg">
              {AGENT_WRITE_MODES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                  onClick={() => {
                    onWriteModeChange(item);
                    writeStoredWriteMode(item);
                    setMenu(null);
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
        <span className="flex-1" />
        <div className="relative">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100"
            aria-label={`本轮上下文预算 ${contextRatio}`}
            aria-expanded={menu === 'usage'}
            title={`本轮预算 ${contextRatio}（努力程度，不是模型窗口）`}
            onClick={() => setMenu(menu === 'usage' ? null : 'usage')}
          >
            <ContextUsageRing percent={usedPct} hot={usedPct >= 90} />
          </button>
          {menu === 'usage' ? (
            <div className="absolute bottom-[calc(100%+8px)] right-0 z-20 w-80 rounded-2xl border border-zinc-200 bg-white p-3.5 text-sm shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-zinc-500">本轮预算</p>
                <p className="tabular-nums text-zinc-800">{contextRatio}</p>
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                {CHAT_EFFORT_LABEL[effort]} · {CHAT_EFFORT_HINT[effort]}
                {context?.rolling_summary_present ? ` · 摘要 v${context.summary_version ?? 1}` : ''}
              </p>
              <p className="mt-1 text-[11px] text-zinc-400">由努力程度决定，不是模型上下文上限。</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-zinc-800"
                  style={{ width: `${Math.min(100, Math.max(usedPct, used > 0 ? 4 : 0))}%` }}
                />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
                <p className="text-zinc-500">项目用量</p>
                <Link
                  href={settingsHref}
                  className="text-xs text-[#4d6bfe]"
                  onClick={() => {
                    captureSettingsReturn();
                    setMenu(null);
                  }}
                >
                  管理提供商
                </Link>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <UsageCell
                  name={llmProvider?.label ?? '文本模型'}
                  detail={
                    llmUsage
                      ? `${llmUsage.calls} 次 · ${formatTokenCount(llmUsage.quantity)} token`
                      : llmProvider?.configured
                        ? `${catalog?.models.llm ?? ''} · 已配置`
                        : '未配置密钥'
                  }
                  ok={Boolean(llmProvider?.configured)}
                />
                <UsageCell
                  name="SiliconFlow"
                  detail={
                    account
                      ? `余额 ${account.total_balance ?? account.balance ?? '—'}`
                      : usage
                        ? `${usage.total_calls} 次调用`
                        : catalog?.providers.find((item) => item.id === 'siliconflow')?.configured
                          ? '已配置'
                          : '未配置密钥'
                  }
                  ok={Boolean(
                    account ||
                    catalog?.providers.find((item) => item.id === 'siliconflow')?.configured,
                  )}
                />
              </div>
            </div>
          ) : null}
        </div>
        <div className="relative">
          <button
            type="button"
            className="inline-flex h-8 max-w-[10rem] items-center gap-1 rounded-full px-2 text-xs text-zinc-700 hover:bg-zinc-100"
            aria-expanded={menu === 'model'}
            onClick={() => setMenu(menu === 'model' ? null : 'model')}
          >
            <span className="truncate">{modelLabel}</span>
            <IconChevron className="size-3.5 shrink-0 text-zinc-400" />
          </button>
          {menu === 'model' ? (
            <div className="absolute bottom-[calc(100%+8px)] right-0 z-20 flex w-72 max-h-[min(20rem,46vh)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
              <p className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-2 text-xs text-zinc-400">
                Zivith
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px]">对话</span>
              </p>
              <div className="shrink-0 px-2 pb-2">
                <input
                  ref={searchRef}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white"
                  placeholder="搜索模型"
                  value={modelQuery}
                  onChange={(event) => setModelQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault();
                  }}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto py-1">
                {visibleChoices.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-zinc-400">没有匹配的模型</p>
                ) : (
                  visibleChoices.map((choice, index) => {
                    const showProvider =
                      index === 0 || visibleChoices[index - 1]?.provider !== choice.provider;
                    const active =
                      catalog?.selection.llm === choice.provider &&
                      catalog.models.llm === choice.model;
                    return (
                      <div key={`${choice.provider}:${choice.model}`}>
                        {showProvider ? (
                          <p className="px-3 pb-1 pt-2 text-[11px] text-zinc-400">
                            {choice.providerLabel}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          disabled={saving}
                          title={choice.model}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                          onClick={() => void pickModel(choice.provider, choice.model)}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {displayModelId(choice.model)}
                          </span>
                          {choice.tag ? (
                            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
                              {choice.tag}
                            </span>
                          ) : null}
                          {active ? <IconCheck className="size-4 shrink-0 text-zinc-700" /> : null}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="shrink-0 border-t border-zinc-100">
                <Link
                  href={settingsHref}
                  className="block px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
                  onClick={() => {
                    captureSettingsReturn();
                    setMenu(null);
                  }}
                >
                  管理模型
                </Link>
              </div>
            </div>
          ) : null}
        </div>
        <div className="relative">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs text-zinc-700 hover:bg-zinc-100"
            aria-expanded={menu === 'effort'}
            onClick={() => setMenu(menu === 'effort' ? null : 'effort')}
          >
            <IconBrain className="size-3.5" />
            {CHAT_EFFORT_LABEL[effort]}
            <IconChevron className="size-3.5 text-zinc-400" />
          </button>
          {menu === 'effort' ? (
            <div className="absolute bottom-[calc(100%+8px)] right-0 z-20 w-64 overflow-hidden rounded-2xl border border-zinc-200 bg-white py-1 shadow-lg">
              {(['fast', 'balanced', 'deep'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                  onClick={() => {
                    onEffortChange(item);
                    writeStoredEffort(item);
                    setMenu(null);
                  }}
                >
                  <span>
                    <span className="block">{CHAT_EFFORT_LABEL[item]}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-zinc-400">
                      {CHAT_EFFORT_HINT[item]}
                    </span>
                  </span>
                  {effort === item ? <IconCheck className="mt-0.5 size-4 shrink-0" /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {sending && onStop ? (
          <button
            type="button"
            className="grid size-8 place-items-center rounded-lg bg-zinc-900 text-white transition hover:bg-zinc-800"
            aria-label="停止生成"
            onClick={onStop}
          >
            <IconStop className="size-3.5" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend || Boolean(mentionHint) || blocked}
            className="grid size-8 place-items-center rounded-lg bg-zinc-900 text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
            aria-label="发送"
            title={mentionHint ?? '发送'}
          >
            <IconSend className="size-4" />
          </button>
        )}
      </div>
    </form>
  );
}

function ContextUsageRing({ percent, hot }: { percent: number; hot: boolean }) {
  const fill = Math.min(100, Math.max(0, percent));
  const color = hot ? '#d97706' : '#3f3f46';
  return (
    <span className="relative grid size-4 place-items-center" aria-hidden>
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: `conic-gradient(${color} ${fill}%, #e4e4e7 0)` }}
      />
      <span className="relative size-2.5 rounded-full bg-white" />
    </span>
  );
}

function WriteModeIcon({ mode }: { mode: AgentWriteMode }) {
  const className = 'size-3.5';
  if (mode === 'semi') return <IconShieldCheck className={className} />;
  if (mode === 'plan') return <IconClipboard className={className} />;
  if (mode === 'full') return <IconShieldAlert className={className} />;
  return <IconHand className={className} />;
}

function UsageCell({ name, detail, ok }: { name: string; detail: string; ok: boolean }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-2.5 py-2">
      <p className="truncate text-xs font-medium text-zinc-800">{name}</p>
      <p className="mt-1 truncate text-[11px] text-zinc-500">{detail}</p>
      <span className={`mt-2 block h-0.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-zinc-200'}`} />
    </div>
  );
}
