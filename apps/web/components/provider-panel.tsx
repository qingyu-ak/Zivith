'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Badge, Button, Card, Field, Input, Select, Spinner } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import type { ProviderCatalogDTO, ProviderId, ProviderModelsDTO } from '@/lib/types';

const modalityLabels = {
  llm: '文本 / LLM',
  image: '图像',
  video: '视频',
  audio: '音频',
} as const;

type Modality = keyof typeof modalityLabels;

function optionsFor(modality: Modality, catalog: ProviderCatalogDTO | null) {
  if (!catalog) return [];
  return catalog.providers.filter((provider) => provider.modalities.includes(modality));
}

function summaryLine(selection: Record<Modality, ProviderId>, models: ProviderModelsDTO) {
  return (Object.keys(modalityLabels) as Modality[])
    .map((modality) => {
      const model = models[modality]?.trim();
      return `${modalityLabels[modality]}: ${selection[modality]}${model ? ` (${model})` : ''}`;
    })
    .join(' · ');
}

export function ProviderPanel() {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<ProviderCatalogDTO | null>(null);
  const [selection, setSelection] = useState<Record<Modality, ProviderId>>({
    llm: 'mock',
    image: 'mock',
    video: 'mock',
    audio: 'mock',
  });
  const [models, setModels] = useState<ProviderModelsDTO>({
    llm: '',
    image: '',
    video: '',
    audio: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const value = await api<ProviderCatalogDTO>('/providers');
      setCatalog(value);
      setSelection(value.selection);
      setModels(value.models);
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{
        selection: Record<Modality, ProviderId>;
        models: ProviderModelsDTO;
        note?: string;
      }>('/providers/selection', {
        method: 'PUT',
        body: {
          llm: selection.llm,
          image: selection.image,
          video: selection.video,
          audio: selection.audio,
          models,
        },
      });
      setSelection(result.selection);
      setModels(result.models);
      setNotice(result.note ?? '已保存提供商选择');
      setOpen(false);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="mb-8">
        <Spinner label="正在加载提供商配置…" />
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-widest text-accent">Phase 2.5</p>
          <h2 className="mt-1 text-lg font-semibold">模型提供商</h2>
          {!open && (
            <p
              className="mt-1 truncate text-sm text-zinc-500"
              title={summaryLine(selection, models)}
            >
              {summaryLine(selection, models)}
            </p>
          )}
          {open && (
            <p className="mt-1 text-sm text-zinc-500">
              选择 LLM / 图像 / 视频 / 音频供应商与模型；未配置密钥时自动回退 Mock。
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!open &&
            catalog?.providers
              .filter((provider) => provider.configured)
              .map((provider) => (
                <Badge key={provider.id} tone="success">
                  {provider.label}
                </Badge>
              ))}
          <Button type="button" variant="secondary" onClick={() => setOpen((value) => !value)}>
            {open ? '收起' : '更改选择'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {notice && !open && <p className="mt-3 text-sm text-emerald-300">{notice}</p>}

      {open && (
        <>
          {notice && (
            <p className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">
              {notice}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {catalog?.providers.map((provider) => (
              <Badge key={provider.id} tone={provider.configured ? 'success' : 'neutral'}>
                {provider.label}
                {provider.configured ? ' · 已配置' : ' · 缺密钥'}
              </Badge>
            ))}
          </div>
          <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(event) => void save(event)}>
            {(Object.keys(modalityLabels) as Modality[]).map((modality) => (
              <div
                key={modality}
                className="grid gap-3 rounded-lg border border-line bg-ink/40 p-4"
              >
                <Field label={modalityLabels[modality]}>
                  <Select
                    value={selection[modality]}
                    onChange={(event) =>
                      setSelection((current) => ({
                        ...current,
                        [modality]: event.target.value as ProviderId,
                      }))
                    }
                  >
                    {optionsFor(modality, catalog).map((provider) => (
                      <option
                        key={provider.id}
                        value={provider.id}
                        disabled={!provider.configured && provider.id !== 'mock'}
                      >
                        {provider.label}
                        {!provider.configured && provider.id !== 'mock' ? '（未配置）' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="模型 ID（可自定义）">
                  <Input
                    value={models[modality]}
                    onChange={(event) =>
                      setModels((current) => ({ ...current, [modality]: event.target.value }))
                    }
                    placeholder={
                      modality === 'image'
                        ? '例如 black-forest-labs/FLUX.1-schnell'
                        : '留空则使用环境默认'
                    }
                  />
                </Field>
                {modality === 'image' && /image-edit|img2img/i.test(models.image) && (
                  <p className="text-xs text-amber-300">
                    当前模型名像是「图片编辑」而非文生图，视觉准备容易失败。请换成 FLUX / SD 等
                    text-to-image 模型。
                  </p>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-3 md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? '保存中…' : '保存并收起'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                取消
              </Button>
            </div>
          </form>
        </>
      )}
    </Card>
  );
}
