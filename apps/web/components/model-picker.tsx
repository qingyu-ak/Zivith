'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '@/lib/api';
import {
  displayModelId,
  filterLlmChoices,
  llmChoices,
  selectedLlmLabel,
} from '@/lib/chat-composer';
import { settingsHrefFor } from '@/lib/creator-chat-nav';
import type { ProviderCatalogDTO, ProviderId } from '@/lib/types';
import { IconCheck, IconChevron } from './nav-icons';

/**
 * 模型选择器（Agent 面板用，与 Chat 输入条同源逻辑）：
 * 搜索 + 按供应商分组；选中即写全局 selection；被隐藏的当前模型仍保留可选。
 */
export function ModelPicker({ projectId }: { projectId?: string | null }) {
  const [catalog, setCatalog] = useState<ProviderCatalogDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void api<ProviderCatalogDTO>('/providers')
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    searchRef.current?.focus();
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choices = llmChoices(catalog);
  const visible = filterLlmChoices(choices, query);
  const manageHref = settingsHrefFor(projectId, [], 'models');

  async function pick(provider: ProviderId, model: string) {
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
      setOpen(false);
    } catch (reason) {
      setNotice(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="inline-flex h-7 max-w-[7rem] items-center gap-1 rounded-full px-2 text-[11px] text-zinc-600 transition hover:bg-zinc-100"
        aria-label="选择模型"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">{selectedLlmLabel(catalog)}</span>
        <IconChevron className="size-3 shrink-0 text-zinc-400" />
      </button>
      {open ? (
        <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 flex w-72 max-h-[min(20rem,46vh)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
          <div className="shrink-0 px-2 pb-2 pt-2">
            <input
              ref={searchRef}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white"
              placeholder="搜索模型"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {notice ? <p className="px-3 py-1 text-[11px] text-red-500">{notice}</p> : null}
            {visible.length === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-400">没有匹配的模型</p>
            ) : (
              visible.map((choice, index) => {
                const showProvider =
                  index === 0 || visible[index - 1]?.provider !== choice.provider;
                const active =
                  catalog?.selection.llm === choice.provider && catalog.models.llm === choice.model;
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
                      onClick={() => void pick(choice.provider, choice.model)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {displayModelId(choice.model)}
                      </span>
                      {active ? <IconCheck className="size-4 shrink-0 text-zinc-700" /> : null}
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <div className="shrink-0 border-t border-zinc-100">
            <Link
              href={manageHref}
              className="block px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
              onClick={() => setOpen(false)}
            >
              管理模型
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
