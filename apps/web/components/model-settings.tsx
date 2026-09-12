'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { ApiFormat, ProviderCatalogDTO, ProviderModelsDTO } from '@/lib/types';

const ADD_ID = '__add__';

type Pane = string;

export function ModelSettings() {
  const [catalog, setCatalog] = useState<ProviderCatalogDTO | null>(null);
  const [pane, setPane] = useState<Pane>('deepseek');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const value = await api<ProviderCatalogDTO>('/providers');
    setCatalog(value);
    return value;
  }, []);

  useEffect(() => {
    void load()
      .then((value) => {
        const current = value.selection.llm;
        if (value.providers.some((item) => item.id === current)) setPane(current);
        else setPane(value.providers[0]?.id ?? 'deepseek');
      })
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  }, [load]);

  const builtins = catalog?.providers.filter((item) => item.kind !== 'custom') ?? [];
  const customs = catalog?.providers.filter((item) => item.kind === 'custom') ?? [];
  const active =
    pane === ADD_ID ? null : (catalog?.providers.find((item) => item.id === pane) ?? null);

  async function refresh(nextPane?: Pane) {
    const value = await load();
    if (nextPane) setPane(nextPane);
    return value;
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">正在加载模型设置…</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="flex min-h-[32rem]">
        <aside className="w-56 shrink-0 border-r border-zinc-100 bg-zinc-50/80 py-3">
          <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            内置
          </p>
          {builtins.map((item) => (
            <ProviderRow
              key={item.id}
              name={item.label}
              configured={item.configured}
              active={pane === item.id}
              onClick={() => setPane(item.id)}
            />
          ))}
          <p className="mt-3 px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            自定义供应商
          </p>
          {customs.map((item) => (
            <ProviderRow
              key={item.id}
              name={item.label}
              configured={item.configured}
              active={pane === item.id}
              onClick={() => setPane(item.id)}
            />
          ))}
          <button
            type="button"
            className={`mx-2 mt-1 flex w-[calc(100%-1rem)] items-center rounded-lg px-2 py-1.5 text-left text-sm ${
              pane === ADD_ID
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-600 hover:bg-white/80'
            }`}
            onClick={() => setPane(ADD_ID)}
          >
            + 添加供应商
          </button>
        </aside>
        <section className="min-w-0 flex-1 p-5">
          {error ? (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          ) : null}
          {notice ? (
            <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </p>
          ) : null}
          {pane === ADD_ID ? (
            <AddProviderForm
              saving={saving}
              onError={setError}
              onNotice={setNotice}
              onSaving={setSaving}
              onCreated={async (id) => {
                await refresh(id);
              }}
            />
          ) : active ? (
            <ProviderDetail
              catalog={catalog}
              provider={active}
              saving={saving}
              onError={setError}
              onNotice={setNotice}
              onSaving={setSaving}
              onRefresh={refresh}
            />
          ) : (
            <p className="text-sm text-zinc-500">选择左侧供应商。</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ProviderRow({
  name,
  configured,
  active,
  onClick,
}: {
  name: string;
  configured: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
        active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-700 hover:bg-white/80'
      }`}
      onClick={onClick}
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${configured ? 'bg-emerald-500' : 'bg-zinc-300'}`}
      />
      <span className="truncate">{name}</span>
    </button>
  );
}

function AddProviderForm({
  saving,
  onError,
  onNotice,
  onSaving,
  onCreated,
}: {
  saving: boolean;
  onError: (value: string) => void;
  onNotice: (value: string) => void;
  onSaving: (value: boolean) => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [format, setFormat] = useState<ApiFormat>('openai_chat');
  const [models, setModels] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  async function submit() {
    onError('');
    onNotice('');
    if (models.length === 0) {
      onError('请先添加至少一个模型，再添加供应商。');
      return;
    }
    onSaving(true);
    try {
      const created = await api<{ id: string }>('/providers/custom', {
        method: 'POST',
        body: {
          name,
          base_url: baseUrl,
          api_key: apiKey,
          api_format: format,
          models,
        },
      });
      if (format === 'openai_chat') {
        await api('/providers/selection', {
          method: 'PUT',
          body: { llm: created.id, models: { llm: models[0] } },
        });
        onNotice('已添加供应商，可在对话里选用。');
      } else {
        onNotice('已添加供应商。Anthropic 格式暂不能用于聊天。');
      }
      await onCreated(created.id);
    } catch (reason) {
      onError(errorMessage(reason));
    } finally {
      onSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900">添加模型供应商</h2>
      <p className="mt-1 text-sm text-zinc-500">配置自定义 API 端点和对话模型。</p>
      <div className="mt-5 grid gap-3">
        <Field label="名称">
          <input
            className={inputClass}
            value={name}
            placeholder="例如 Zhipu GLM"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Base URL">
          <input
            className={inputClass}
            value={baseUrl}
            placeholder="https://api.example.com/v1"
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </Field>
        <Field label="API Key">
          <input
            className={inputClass}
            type="password"
            value={apiKey}
            placeholder="Enter API Key"
            onChange={(event) => setApiKey(event.target.value)}
          />
        </Field>
        <Field label="API 格式">
          <select
            className={inputClass}
            value={format}
            onChange={(event) => setFormat(event.target.value as ApiFormat)}
          >
            <option value="openai_chat">OpenAI Chat Completions（/v1/chat/completions）</option>
            <option value="anthropic_messages">Anthropic Messages（即将支持）</option>
          </select>
        </Field>
        {format === 'anthropic_messages' ? (
          <p className="text-xs text-amber-700">
            对话目前只走 OpenAI 兼容接口，Anthropic 格式暂不能用于聊天。
          </p>
        ) : null}
        <ModelList
          models={models}
          draft={draft}
          onDraft={setDraft}
          onAdd={() => {
            const id = draft.trim();
            if (!id || models.includes(id)) return;
            setModels([...models, id]);
            setDraft('');
          }}
          onRemove={(id) => setModels(models.filter((item) => item !== id))}
        />
      </div>
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-400">请先添加至少一个模型，再添加供应商。</p>
        <button
          type="button"
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
          onClick={() => void submit()}
        >
          {saving ? '添加中…' : '添加供应商'}
        </button>
      </div>
    </div>
  );
}

function ProviderDetail({
  catalog,
  provider,
  saving,
  onError,
  onNotice,
  onSaving,
  onRefresh,
}: {
  catalog: ProviderCatalogDTO | null;
  provider: ProviderCatalogDTO['providers'][number];
  saving: boolean;
  onError: (value: string) => void;
  onNotice: (value: string) => void;
  onSaving: (value: boolean) => void;
  onRefresh: (pane?: Pane) => Promise<ProviderCatalogDTO | void>;
}) {
  const [baseUrl, setBaseUrl] = useState(provider.base_url ?? '');
  const [apiKey, setApiKey] = useState('');
  const [draft, setDraft] = useState('');
  const models = useMemo(
    () => provider.llm_models?.map((item) => item.id) ?? [],
    [provider.llm_models],
  );
  const selected = catalog?.selection.llm === provider.id ? catalog.models.llm : '';

  useEffect(() => {
    setBaseUrl(provider.base_url ?? '');
    setApiKey('');
  }, [provider.id, provider.base_url]);

  async function saveProvider() {
    onError('');
    onNotice('');
    onSaving(true);
    try {
      if (provider.kind === 'custom') {
        await api(`/providers/custom/${provider.id}`, {
          method: 'PUT',
          body: {
            ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
            ...(baseUrl.trim() ? { base_url: baseUrl.trim() } : {}),
          },
        });
      } else if (provider.id === 'deepseek' || provider.id === 'siliconflow') {
        await api('/providers/credentials', {
          method: 'PUT',
          body: {
            provider: provider.id,
            ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
            ...(baseUrl.trim() ? { base_url: baseUrl.trim() } : {}),
          },
        });
      }
      onNotice('已保存。密钥不会回传到浏览器。');
      await onRefresh(provider.id);
    } catch (reason) {
      onError(errorMessage(reason));
    } finally {
      onSaving(false);
    }
  }

  async function addModel() {
    const model = draft.trim();
    if (!model) return;
    onError('');
    await api(`/providers/${provider.id}/models`, { method: 'POST', body: { model } });
    setDraft('');
    await onRefresh(provider.id);
  }

  async function removeModel(model: string) {
    await api(`/providers/${provider.id}/models?model=${encodeURIComponent(model)}`, {
      method: 'DELETE',
    });
    await onRefresh(provider.id);
  }

  async function useInChat(model: string) {
    await api('/providers/selection', {
      method: 'PUT',
      body: { llm: provider.id, models: { llm: model } },
    });
    onNotice(`对话将使用 ${model}`);
    await onRefresh(provider.id);
  }

  async function removeCustom() {
    if (!confirm(`删除供应商「${provider.label}」？`)) return;
    await api(`/providers/custom/${provider.id}`, { method: 'DELETE' });
    await onRefresh('deepseek');
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{provider.label}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {provider.kind === 'custom' ? '自定义 OpenAI 兼容端点' : '内置供应商'}
            {provider.configured ? ' · 已配置密钥' : ' · 未配置密钥'}
          </p>
        </div>
        {provider.kind === 'custom' ? (
          <button
            type="button"
            className="text-sm text-red-500 hover:underline"
            onClick={() => void removeCustom()}
          >
            删除
          </button>
        ) : null}
      </div>
      {provider.id !== 'mock' ? (
        <div className="mt-5 grid gap-3">
          <Field label="Base URL">
            <input
              className={inputClass}
              value={baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </Field>
          <Field label="API Key">
            <input
              className={inputClass}
              type="password"
              value={apiKey}
              placeholder={provider.configured ? '已配置，留空则不改' : 'Enter API Key'}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </Field>
          <Field label="API 格式">
            <input
              className={inputClass}
              readOnly
              value={
                provider.api_format === 'anthropic_messages'
                  ? 'Anthropic Messages'
                  : 'OpenAI Chat Completions（/v1/chat/completions）'
              }
            />
          </Field>
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">本地占位，无需密钥。无真实模型调用。</p>
      )}
      <div className="mt-5">
        <ModelList
          models={models}
          draft={draft}
          selected={selected}
          onDraft={setDraft}
          onAdd={() => void addModel()}
          onRemove={(id) => void removeModel(id)}
          onUse={
            provider.api_format === 'anthropic_messages' ? undefined : (id) => void useInChat(id)
          }
        />
      </div>
      {provider.id !== 'mock' ? (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
            onClick={() => void saveProvider()}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      ) : null}
      {provider.id === 'siliconflow' && catalog ? (
        <MediaSlots catalog={catalog} onRefresh={() => onRefresh(provider.id)} />
      ) : null}
    </div>
  );
}

function ModelList({
  models,
  draft,
  selected,
  onDraft,
  onAdd,
  onRemove,
  onUse,
}: {
  models: string[];
  draft: string;
  selected?: string;
  onDraft: (value: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUse?: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm text-zinc-600">模型列表</p>
      {models.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-400">
          还没有模型。添加后可在对话中选用。
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {models.map((id) => (
            <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-zinc-800">
                {id}
              </span>
              {selected === id ? (
                <span className="text-[11px] text-emerald-600">当前对话</span>
              ) : onUse ? (
                <button
                  type="button"
                  className="text-[11px] text-[#4d6bfe]"
                  onClick={() => onUse(id)}
                >
                  用于对话
                </button>
              ) : null}
              <button
                type="button"
                className="text-zinc-400 hover:text-red-500"
                onClick={() => onRemove(id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-2">
        <input
          className={inputClass}
          value={draft}
          placeholder="调用时的 model 名，例如 deepseek-v4-pro"
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onAdd();
            }
          }}
        />
        <button
          type="button"
          className="shrink-0 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-700 hover:bg-zinc-50"
          onClick={onAdd}
        >
          + 添加模型
        </button>
      </div>
    </div>
  );
}

function MediaSlots({
  catalog,
  onRefresh,
}: {
  catalog: ProviderCatalogDTO;
  onRefresh: () => Promise<unknown>;
}) {
  const [models, setModels] = useState<ProviderModelsDTO>(catalog.models);
  useEffect(() => {
    setModels(catalog.models);
  }, [catalog.models]);
  return (
    <div className="mt-8 border-t border-zinc-100 pt-5">
      <p className="text-sm font-medium text-zinc-800">图像 / 视频 / 音频槽位</p>
      <p className="mt-1 text-xs text-zinc-400">制作流水线仍用这些模型 ID。</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(
          [
            ['image', '文生图 T2I'],
            ['image_i2i', '文图生图 I2I'],
            ['video', '文生视频 T2V'],
            ['video_i2v', '文图生视频 I2V'],
            ['audio', '语音'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-xs text-zinc-500">
            {label}
            <input
              className={`${inputClass} mt-1`}
              value={models[key]}
              onChange={(event) =>
                setModels((current) => ({ ...current, [key]: event.target.value }))
              }
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        className="mt-3 text-sm text-[#4d6bfe]"
        onClick={() =>
          void api('/providers/selection', {
            method: 'PUT',
            body: { models },
          }).then(() => onRefresh())
        }
      >
        保存媒体槽位
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm text-zinc-600">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-zinc-400';
