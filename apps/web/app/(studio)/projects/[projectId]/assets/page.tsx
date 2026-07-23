'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
} from '@zivith/ui';
import { api, errorMessage, unwrapList } from '@/lib/api';
import { getFormList, getFormText, getOptionalFormText } from '@/lib/form-data';
import type {
  AppearanceVariantDTO,
  AppearanceVariantMediaDTO,
  AssetDTO,
  AssetType,
  MediaDTO,
} from '@/lib/types';

function imageUrl(image: string | MediaDTO | AppearanceVariantMediaDTO) {
  if (typeof image === 'string') return image;
  const accessUrl = 'access_url' in image ? image.access_url : undefined;
  return accessUrl ?? image.thumbnail_url ?? image.url ?? '';
}

function stateLabel(state: AppearanceVariantDTO['state']) {
  if (state === 'approved') return '已批准';
  if (state === 'review') return '待选择';
  return '草稿';
}

export default function AssetsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [type, setType] = useState<AssetType>('character');
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [selected, setSelected] = useState<AssetDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [variants, setVariants] = useState<AppearanceVariantDTO[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantBusyKey, setVariantBusyKey] = useState('');
  const [newVariantKey, setNewVariantKey] = useState('');
  const [newVariantTitle, setNewVariantTitle] = useState('');
  const [newVariantReason, setNewVariantReason] = useState('');
  const [newVariantDescription, setNewVariantDescription] = useState('');
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const value = await api<AssetDTO[] | { data?: AssetDTO[]; items?: AssetDTO[] }>(
        `/projects/${projectId}/assets?type=${type}`,
      );
      setAssets(unwrapList(value));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [projectId, type]);

  const loadVariants = useCallback(async (assetId: string) => {
    setVariantsLoading(true);
    try {
      const value = await api<AppearanceVariantDTO[]>(`/assets/${assetId}/appearance-variants`);
      setVariants(value);
    } catch (reason) {
      setError(errorMessage(reason));
      setVariants([]);
    } finally {
      setVariantsLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelected(null);
    setVariants([]);
    void load();
  }, [load]);

  useEffect(() => {
    if (selected && type === 'character' && !creating) {
      void loadVariants(selected.id);
    } else {
      setVariants([]);
    }
  }, [selected, type, creating, loadVariants]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const common = {
      asset_type: type,
      type,
      name: getFormText(form, 'name'),
      description: getFormText(form, 'description'),
      tags: getFormList(form, 'tags'),
    };
    const data =
      type === 'character'
        ? {
            ...common,
            aliases: getFormList(form, 'aliases'),
            base_character_id: getOptionalFormText(form, 'base_character_id'),
            personality: getFormText(form, 'personality'),
            default_outfit: getFormText(form, 'default_outfit'),
            appearance: Object.fromEntries(
              [
                'gender',
                'age_range',
                'height',
                'build',
                'skin_tone',
                'hair',
                'eyes',
                'distinguishing_features',
                'custom',
              ].map((key) => [key, getFormText(form, `appearance.${key}`)]),
            ),
          }
        : {
            ...common,
            type: getFormText(form, 'location_type'),
            time_period: getFormText(form, 'time_period'),
            weather_default: getFormText(form, 'weather_default'),
            lighting_default: getFormText(form, 'lighting_default'),
            mood_default: getFormText(form, 'mood_default'),
            floor_plan_url: getFormText(form, 'floor_plan_url'),
          };
    try {
      const value = await api<AssetDTO>(
        selected ? `/assets/${selected.id}` : `/projects/${projectId}/assets`,
        { method: selected ? 'PATCH' : 'POST', body: data },
      );
      setSelected(value);
      setCreating(false);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function remove(asset: AssetDTO) {
    if (!confirm(`确定删除“${asset.name}”吗？`)) return;
    try {
      await api(`/assets/${asset.id}`, { method: 'DELETE' });
      if (selected?.id === asset.id) setSelected(null);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>, asset: AssetDTO) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set('project_id', projectId);
    form.set('asset_id', asset.id);
    try {
      const media = await api<MediaDTO>('/assets/media/upload', { method: 'POST', body: form });
      const ids = (asset.reference_images ?? []).map((item) =>
        typeof item === 'string' ? item : item.id,
      );
      const updated = await api<AssetDTO>(`/assets/${asset.id}`, {
        method: 'PATCH',
        body: { reference_images: [...ids, media.id] },
      });
      const withUploadedMedia = {
        ...updated,
        reference_images: [...(asset.reference_images ?? []), media],
      };
      setSelected(withUploadedMedia);
      setAssets((items) => items.map((item) => (item.id === asset.id ? withUploadedMedia : item)));
      if (type === 'character') await loadVariants(asset.id);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    try {
      await api(`/assets/${selected.id}/appearance-variants`, {
        method: 'POST',
        body: {
          key: newVariantKey.trim(),
          title: newVariantTitle.trim(),
          change_reason: newVariantReason.trim() || null,
          description: newVariantDescription.trim() || null,
        },
      });
      setNewVariantKey('');
      setNewVariantTitle('');
      setNewVariantReason('');
      setNewVariantDescription('');
      await loadVariants(selected.id);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function generateVariant(variant: AppearanceVariantDTO) {
    if (!selected) return;
    setVariantBusyKey(variant.key);
    try {
      await api(`/assets/${selected.id}/appearance-variants/${variant.key}/generate`, {
        method: 'POST',
        body: {
          prompt: (promptDrafts[variant.key] ?? '').trim() || undefined,
        },
      });
      await loadVariants(selected.id);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setVariantBusyKey('');
    }
  }

  async function approveVariant(variant: AppearanceVariantDTO, mediaId?: string) {
    if (!selected) return;
    setVariantBusyKey(variant.key);
    try {
      await api(`/assets/${selected.id}/appearance-variants/${variant.key}/approve`, {
        method: 'POST',
        body: mediaId ? { media_id: mediaId } : {},
      });
      await loadVariants(selected.id);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setVariantBusyKey('');
    }
  }

  async function removeVariant(variant: AppearanceVariantDTO) {
    if (!selected || variant.key === 'default') return;
    if (!confirm(`确定删除形象「${variant.title}」吗？`)) return;
    try {
      await api(`/assets/${selected.id}/appearance-variants/${variant.key}`, {
        method: 'DELETE',
      });
      await loadVariants(selected.id);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  const current = creating ? null : selected;
  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-accent">项目资产库</p>
          <h1 className="mt-1 text-3xl font-semibold">角色与地点</h1>
          <p className="mt-2 text-zinc-400">持久、可复用，并在所有故事中保持一致。</p>
        </div>
        <Button
          onClick={() => {
            setCreating(true);
            setSelected(null);
          }}
        >
          新建{type === 'character' ? '角色' : '地点'}
        </Button>
      </header>
      <div className="mb-6 flex gap-2" role="tablist" aria-label="资产类型">
        <Button
          variant={type === 'character' ? 'primary' : 'secondary'}
          onClick={() => setType('character')}
        >
          角色
        </Button>
        <Button
          variant={type === 'location' ? 'primary' : 'secondary'}
          onClick={() => setType('location')}
        >
          地点
        </Button>
      </div>
      {error && (
        <p className="mb-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          {loading ? (
            <Spinner label="正在加载资产…" />
          ) : assets.length === 0 ? (
            <EmptyState
              title={`还没有${type === 'character' ? '角色' : '地点'}`}
              description="创建可复用资产，并上传参考图保持视觉一致。"
              action={<Button onClick={() => setCreating(true)}>立即创建</Button>}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {assets.map((asset) => (
                <Card
                  key={asset.id}
                  className={`cursor-pointer ${selected?.id === asset.id ? 'border-accent/60' : ''}`}
                >
                  <button
                    className="w-full text-left"
                    onClick={() => {
                      setCreating(false);
                      setSelected(asset);
                    }}
                  >
                    <div className="mb-4 aspect-[16/9] overflow-hidden rounded-lg bg-zinc-900">
                      {asset.reference_images?.[0] ? (
                        <img
                          className="size-full object-cover"
                          src={imageUrl(asset.reference_images[0])}
                          alt={`${asset.name}参考图`}
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-3xl text-zinc-700">
                          {type === 'character' ? '人' : '景'}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold">{asset.name}</h2>
                      <Badge>{type === 'character' ? '角色' : '地点'}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{asset.description}</p>
                  </button>
                  <Button
                    className="mt-4"
                    variant="danger"
                    onClick={() => {
                      void remove(asset);
                    }}
                  >
                    删除
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
        {(creating || selected) && (
          <Card className="h-fit lg:sticky lg:top-6">
            <h2 className="mb-5 text-lg font-semibold">
              {creating
                ? `新建${type === 'character' ? '角色' : '地点'}`
                : `编辑${type === 'character' ? '角色' : '地点'}`}
            </h2>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                void save(event);
              }}
            >
              <Field label="名称">
                <Input name="name" defaultValue={current?.name ?? ''} required />
              </Field>
              <Field label="详细描述">
                <Textarea name="description" defaultValue={current?.description ?? ''} required />
              </Field>
              {type === 'character' ? (
                <>
                  <Field label="别名" hint="用英文逗号分隔">
                    <Input name="aliases" defaultValue={current?.aliases?.join(', ') ?? ''} />
                  </Field>
                  <Field label="基础角色 ID">
                    <Input
                      name="base_character_id"
                      defaultValue={current?.base_character_id ?? ''}
                    />
                  </Field>
                  <Field label="性格">
                    <Textarea name="personality" defaultValue={current?.personality ?? ''} />
                  </Field>
                  <Field label="默认服装">
                    <Textarea name="default_outfit" defaultValue={current?.default_outfit ?? ''} />
                  </Field>
                  {[
                    ['gender', '性别呈现'],
                    ['age_range', '年龄段'],
                    ['height', '身高'],
                    ['build', '体型'],
                    ['skin_tone', '肤色'],
                    ['hair', '发型与发色'],
                    ['eyes', '眼睛'],
                    ['distinguishing_features', '显著特征'],
                    ['custom', '其他外貌'],
                  ].map(([key, label]) => (
                    <Field key={key} label={label}>
                      <Input
                        name={`appearance.${key}`}
                        defaultValue={
                          current?.appearance?.[key as keyof NonNullable<AssetDTO['appearance']>] ??
                          ''
                        }
                      />
                    </Field>
                  ))}
                </>
              ) : (
                <>
                  <Field label="地点类型">
                    <Select name="location_type" defaultValue={current?.type ?? ''}>
                      <option value="">未设置</option>
                      {[
                        ['interior', '室内'],
                        ['exterior', '室外'],
                        ['fantasy', '幻想'],
                        ['scifi', '科幻'],
                        ['modern', '现代'],
                        ['historical', '历史'],
                        ['abstract', '抽象'],
                      ].map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="时代">
                    <Input name="time_period" defaultValue={current?.time_period ?? ''} />
                  </Field>
                  <Field label="默认天气">
                    <Input name="weather_default" defaultValue={current?.weather_default ?? ''} />
                  </Field>
                  <Field label="默认灯光">
                    <Input name="lighting_default" defaultValue={current?.lighting_default ?? ''} />
                  </Field>
                  <Field label="默认氛围">
                    <Input name="mood_default" defaultValue={current?.mood_default ?? ''} />
                  </Field>
                  <Field label="平面图地址">
                    <Input
                      name="floor_plan_url"
                      type="url"
                      defaultValue={current?.floor_plan_url ?? ''}
                    />
                  </Field>
                </>
              )}
              <Field label="标签" hint="用英文逗号分隔">
                <Input name="tags" defaultValue={current?.tags?.join(', ') ?? ''} />
              </Field>
              <Button type="submit">{creating ? '创建资产' : '保存更改'}</Button>
            </form>
            {selected && (
              <div className="mt-6 border-t border-line pt-5">
                <h3 className="mb-3 font-medium">参考图</h3>
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {selected.reference_images?.map((image, index) => (
                    <img
                      key={typeof image === 'string' ? image : image.id}
                      className="aspect-square w-full rounded-lg object-cover"
                      src={imageUrl(image)}
                      alt={`${selected.name}参考图 ${index + 1}`}
                    />
                  ))}
                </div>
                <form
                  className="grid gap-3"
                  onSubmit={(event) => {
                    void upload(event, selected);
                  }}
                >
                  <Input
                    name="file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    required
                  />
                  <Button type="submit" variant="secondary">
                    上传参考图
                  </Button>
                </form>
              </div>
            )}
            {selected && type === 'character' && (
              <div className="mt-6 border-t border-line pt-5">
                <h3 className="mb-1 font-medium">形象变体</h3>
                <p className="mb-4 text-xs text-zinc-500">
                  按剧情状态维护多套形象（默认 / 受伤 / 年幼等），可独立生成并批准锚定图。
                </p>
                {variantsLoading ? (
                  <Spinner label="正在加载形象…" />
                ) : (
                  <div className="grid gap-4">
                    {variants.map((variant) => {
                      const anchorSrc = variant.anchor_media
                        ? imageUrl(variant.anchor_media)
                        : '';
                      const busy = variantBusyKey === variant.key;
                      return (
                        <div
                          key={variant.id}
                          className="rounded-lg border border-line/80 bg-zinc-950/40 p-3"
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">
                                {variant.title}{' '}
                                <span className="text-xs font-normal text-zinc-500">
                                  ({variant.key})
                                </span>
                              </p>
                              {variant.change_reason && (
                                <p className="mt-1 text-xs text-zinc-400">
                                  变化原因：{variant.change_reason}
                                </p>
                              )}
                            </div>
                            <Badge>{stateLabel(variant.state)}</Badge>
                          </div>
                          {anchorSrc ? (
                            <img
                              className="mb-3 aspect-square w-full rounded-md object-cover"
                              src={anchorSrc}
                              alt={`${variant.title}锚定图`}
                            />
                          ) : (
                            <div className="mb-3 grid aspect-video place-items-center rounded-md bg-zinc-900 text-xs text-zinc-600">
                              尚无锚定图
                            </div>
                          )}
                          {(variant.anchor_media?.generation_metadata?.reference_injection ===
                            'skipped_unsupported' ||
                            variant.candidate_media?.some(
                              (item) =>
                                item.generation_metadata?.reference_injection ===
                                'skipped_unsupported',
                            )) && (
                            <p className="mb-2 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                              本次未注入参考图（当前模型不支持）
                            </p>
                          )}
                          {variant.description && (
                            <p className="mb-2 text-xs text-zinc-400">{variant.description}</p>
                          )}
                          {!!variant.candidate_media?.length && (
                            <div className="mb-3 grid grid-cols-3 gap-2">
                              {variant.candidate_media.map((media) => (
                                <button
                                  key={media.id}
                                  type="button"
                                  className="overflow-hidden rounded-md border border-transparent hover:border-accent/60"
                                  disabled={busy}
                                  onClick={() => void approveVariant(variant, media.id)}
                                  title="选为锚定图"
                                >
                                  <img
                                    className="aspect-square w-full object-cover"
                                    src={imageUrl(media)}
                                    alt="候选图"
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                          <Field label="生图提示词">
                            <Textarea
                              value={promptDrafts[variant.key] ?? ''}
                              placeholder="留空则用角色外观 + 形象描述自动拼接"
                              onChange={(event) =>
                                setPromptDrafts((current) => ({
                                  ...current,
                                  [variant.key]: event.target.value,
                                }))
                              }
                            />
                          </Field>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void generateVariant(variant)}
                            >
                              {busy ? '处理中…' : '生成锚定图'}
                            </Button>
                            {variant.candidate_media_ids[0] && (
                              <Button
                                type="button"
                                disabled={busy}
                                onClick={() => void approveVariant(variant)}
                              >
                                批准当前候选
                              </Button>
                            )}
                            {variant.key !== 'default' && (
                              <Button
                                type="button"
                                variant="danger"
                                disabled={busy}
                                onClick={() => void removeVariant(variant)}
                              >
                                删除
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <form
                  className="mt-5 grid gap-3 border-t border-line/60 pt-4"
                  onSubmit={(event) => {
                    void createVariant(event);
                  }}
                >
                  <h4 className="text-sm font-medium">新增形象</h4>
                  <Field label="形象键" hint="英文 slug，如 wounded / young">
                    <Input
                      value={newVariantKey}
                      onChange={(event) => setNewVariantKey(event.target.value)}
                      placeholder="wounded"
                      required
                    />
                  </Field>
                  <Field label="展示名">
                    <Input
                      value={newVariantTitle}
                      onChange={(event) => setNewVariantTitle(event.target.value)}
                      placeholder="受伤形象"
                      required
                    />
                  </Field>
                  <Field label="变化原因">
                    <Input
                      value={newVariantReason}
                      onChange={(event) => setNewVariantReason(event.target.value)}
                      placeholder="战斗后"
                    />
                  </Field>
                  <Field label="外观增量描述">
                    <Textarea
                      value={newVariantDescription}
                      onChange={(event) => setNewVariantDescription(event.target.value)}
                      placeholder="衣衫破损，左臂绷带"
                    />
                  </Field>
                  <Button type="submit" variant="secondary">
                    添加形象
                  </Button>
                </form>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
