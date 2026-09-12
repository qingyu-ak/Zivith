'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { displayModelId } from '@/lib/chat-composer';
import type { ProviderCatalogDTO } from '@/lib/types';

/** 仿 Cursor「Choose which models appear in the model picker」：搜索 + 每条模型开关。 */
export function ModelVisibilityList() {
  const [catalog, setCatalog] = useState<ProviderCatalogDTO | null>(null);
  const [query, setQuery] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const value = await api<ProviderCatalogDTO>('/providers');
      setCatalog(value);
      setError('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!catalog) return [];
    return catalog.providers
      .filter((provider) => provider.modalities.includes('llm'))
      .flatMap((provider) =>
        (provider.llm_models ?? []).map((model) => ({
          provider: provider.id,
          providerLabel: provider.label,
          model: model.id,
          visible: !(catalog.hidden_models ?? []).some(
            (hidden) => hidden.provider === provider.id && hidden.model === model.id,
          ),
        })),
      );
  }, [catalog]);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(
        (row) =>
          row.model.toLowerCase().includes(needle) ||
          row.providerLabel.toLowerCase().includes(needle) ||
          displayModelId(row.model).toLowerCase().includes(needle),
      )
    : rows;

  async function toggle(row: (typeof rows)[number], visible: boolean) {
    const key = `${row.provider}:${row.model}`;
    setBusyKey(key);
    setError('');
    try {
      const result = await api<{ hidden_models: ProviderCatalogDTO['hidden_models'] }>(
        '/providers/model-visibility',
        { method: 'PUT', body: { provider: row.provider, model: row.model, visible } },
      );
      setCatalog((current) =>
        current ? { ...current, hidden_models: result.hidden_models ?? [] } : current,
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusyKey('');
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">正在加载模型列表…</p>;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-zinc-900">模型选择器</h3>
      <p className="mt-1 text-sm text-zinc-500">
        选择哪些模型出现在对话的模型菜单里。当前正在使用的模型即使被关闭也会保留，直到你另选一个。
      </p>
      <input
        className="mt-4 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white"
        placeholder="搜索模型"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {filtered.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-400">
          {rows.length === 0
            ? '还没有可用模型。先在下方 API Keys 里给供应商添加模型。'
            : '没有匹配的模型'}
        </p>
      ) : (
        <ul className="mt-3 max-h-80 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200">
          {filtered.map((row) => {
            const key = `${row.provider}:${row.model}`;
            return (
              <li key={key} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px] text-zinc-800">
                    {displayModelId(row.model)}
                  </p>
                  <p className="truncate text-[11px] text-zinc-400" title={row.model}>
                    {row.providerLabel} · {row.model}
                  </p>
                </div>
                <Switch
                  checked={row.visible}
                  disabled={busyKey === key}
                  onChange={(visible) => void toggle(row, visible)}
                  label={`切换 ${row.model} 是否出现在模型菜单`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (visible: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50 ${
        checked ? 'bg-emerald-500' : 'bg-zinc-300'
      }`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[1.125rem]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
