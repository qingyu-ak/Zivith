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

const emptyModels: ProviderModelsDTO = {
  llm: '',
  image: '',
  image_i2i: '',
  video: '',
  video_i2v: '',
  audio: '',
};

function optionsFor(modality: Modality, catalog: ProviderCatalogDTO | null) {
  if (!catalog) return [];
  return catalog.providers.filter((provider) => provider.modalities.includes(modality));
}

function summaryLine(selection: Record<Modality, ProviderId>, models: ProviderModelsDTO) {
  return [
    `${modalityLabels.llm}: ${selection.llm}${models.llm ? ` (${models.llm})` : ''}`,
    `${modalityLabels.image}: ${selection.image}${models.image ? ` T2I=${models.image}` : ''}${
      models.image_i2i ? ` / I2I=${models.image_i2i}` : ''
    }`,
    `${modalityLabels.video}: ${selection.video}${models.video ? ` T2V=${models.video}` : ''}${
      models.video_i2v ? ` / I2V=${models.video_i2v}` : ''
    }`,
    `${modalityLabels.audio}: ${selection.audio}${models.audio ? ` (${models.audio})` : ''}`,
  ].join(' · ');
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
  const [models, setModels] = useState<ProviderModelsDTO>(emptyModels);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const value = await api<ProviderCatalogDTO>('/providers');
      setCatalog(value);
      setSelection(value.selection);
      setModels({ ...emptyModels, ...value.models });
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
      setModels({ ...emptyModels, ...result.models });
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
              文生图 / 文图生图 / 文生视频 / 文图生视频分槽配置；有参考图时自动走 I2I / I2V。
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
        <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {catalog?.siliconflow_account && (
        <p
          className={`mt-4 rounded-lg p-3 text-sm ${
            Number(catalog.siliconflow_account.total_balance ?? 0) < 20
              ? 'bg-amber-500/10 text-amber-200'
              : 'bg-zinc-200 text-zinc-600'
          }`}
        >
          SiliconFlow 余额约 {catalog.siliconflow_account.total_balance ?? '—'}（充值{' '}
          {catalog.siliconflow_account.charge_balance ?? '—'}）。Wan 视频约
          $0.29/条；余额过低时任务会长期 InQueue，请到 cloud.siliconflow.cn 充值后再生成视频。
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
                className="grid gap-3 rounded-lg border border-line bg-zinc-50 p-4"
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

                {modality === 'llm' || modality === 'audio' ? (
                  <Field label="模型 ID（可自定义）">
                    <Input
                      value={models[modality]}
                      onChange={(event) =>
                        setModels((current) => ({ ...current, [modality]: event.target.value }))
                      }
                      placeholder="留空则使用环境默认"
                    />
                  </Field>
                ) : null}

                {modality === 'image' ? (
                  <>
                    <Field label="文生图 T2I（首张角色/场景）">
                      <Input
                        value={models.image}
                        onChange={(event) =>
                          setModels((current) => ({ ...current, image: event.target.value }))
                        }
                        placeholder="例如 Qwen/Qwen-Image"
                      />
                    </Field>
                    <Field label="文图生图 I2I（有参考图时）">
                      <Input
                        value={models.image_i2i}
                        onChange={(event) =>
                          setModels((current) => ({ ...current, image_i2i: event.target.value }))
                        }
                        placeholder="例如 Qwen/Qwen-Image-Edit"
                      />
                    </Field>
                    <p className="text-xs text-zinc-500">
                      流程：首次设定用 T2I；侧/背/脸、变化后形象与场景关键帧用 I2I 锁一致性。
                    </p>
                    {/image-edit|img2img/i.test(models.image) && (
                      <p className="text-xs text-amber-300">
                        T2I 槽位不宜填编辑模型，请把 Image-Edit 放到 I2I。
                      </p>
                    )}
                  </>
                ) : null}

                {modality === 'video' ? (
                  <>
                    <Field label="文生视频 T2V">
                      <Input
                        value={models.video}
                        onChange={(event) =>
                          setModels((current) => ({ ...current, video: event.target.value }))
                        }
                        placeholder="例如 Wan-AI/Wan2.2-T2V-A14B"
                      />
                    </Field>
                    <Field label="文图生视频 I2V（有参考帧时）">
                      <Input
                        value={models.video_i2v}
                        onChange={(event) =>
                          setModels((current) => ({ ...current, video_i2v: event.target.value }))
                        }
                        placeholder="例如 Wan-AI/Wan2.2-I2V-A14B"
                      />
                    </Field>
                    <p className="text-xs text-zinc-500">
                      有可访问的 http(s) 关键帧时自动走 I2V，否则走 T2V。
                    </p>
                    {/Wan2\.1/i.test(models.video) || /Wan2\.1/i.test(models.video_i2v) ? (
                      <p className="text-xs text-amber-300">
                        Wan2.1 已在 SiliconFlow 下线，请改用 Wan2.2 T2V / I2V。
                      </p>
                    ) : null}
                  </>
                ) : null}
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
