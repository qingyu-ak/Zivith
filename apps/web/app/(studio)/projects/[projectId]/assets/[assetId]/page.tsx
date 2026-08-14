'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, Card, Field, Input, Select, Spinner, Textarea } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import { getFormList, getFormText, getOptionalFormText } from '@/lib/form-data';
import type {
  AppearanceVariantDTO,
  AppearanceVariantMediaDTO,
  AssetDTO,
  MediaDTO,
} from '@/lib/types';

function imageUrl(image: string | MediaDTO | AppearanceVariantMediaDTO) {
  if (typeof image === 'string') {
    return /^(https?:|data:|blob:)/i.test(image) ? image : '';
  }
  const accessUrl = 'access_url' in image ? image.access_url : undefined;
  return accessUrl ?? image.thumbnail_url ?? image.url ?? '';
}

function stateLabel(state: AppearanceVariantDTO['state']) {
  if (state === 'approved') return '已批准';
  if (state === 'review') return '待选择';
  return '草稿';
}

const PRIMARY_SHEET_KEY = 'sheet_turnaround';
const LEGACY_SHEET_KEYS = new Set(['sheet_front', 'sheet_side', 'sheet_back', 'sheet_face']);
const SHEET_KEYS = new Set([PRIMARY_SHEET_KEY, ...LEGACY_SHEET_KEYS]);

function isSheetVariant(variant: AppearanceVariantDTO) {
  return SHEET_KEYS.has(variant.key);
}

function isPrimarySheetVariant(variant: AppearanceVariantDTO) {
  return variant.key === PRIMARY_SHEET_KEY;
}

function isLegacySheetVariant(variant: AppearanceVariantDTO) {
  return LEGACY_SHEET_KEYS.has(variant.key);
}

export default function AssetDetailPage() {
  const { projectId, assetId } = useParams<{ projectId: string; assetId: string }>();
  const router = useRouter();
  const [asset, setAsset] = useState<AssetDTO | null>(null);
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
  const [selectedCandidateByVariant, setSelectedCandidateByVariant] = useState<
    Record<string, string>
  >({});
  const [candidateCount, setCandidateCount] = useState(1);
  const [sheetError, setSheetError] = useState('');
  const [locationPrompt, setLocationPrompt] = useState('');
  const [locationBusy, setLocationBusy] = useState('');

  const loadAsset = useCallback(async () => {
    setLoading(true);
    try {
      const value = await api<AssetDTO>(`/assets/${assetId}`);
      setAsset(value);
      if (value.location_sheet_prompt?.trim()) {
        setLocationPrompt(value.location_sheet_prompt.trim());
      }
      setError('');
    } catch (reason) {
      setError(errorMessage(reason));
      setAsset(null);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  const loadVariants = useCallback(async () => {
    if (!asset || asset.type !== 'character') {
      setVariants([]);
      return;
    }
    setVariantsLoading(true);
    try {
      const value = await api<AppearanceVariantDTO[]>(`/assets/${asset.id}/appearance-variants`);
      setVariants(value);
      setPromptDrafts((current) => {
        const next = { ...current };
        for (const variant of value) {
          if (!isSheetVariant(variant)) continue;
          if (next[variant.key]?.trim()) continue;
          if (variant.description?.trim()) next[variant.key] = variant.description.trim();
        }
        return next;
      });
      setSelectedCandidateByVariant((current) => {
        const next = { ...current };
        for (const variant of value) {
          const preferred =
            variant.anchor_media_id && variant.candidate_media_ids.includes(variant.anchor_media_id)
              ? variant.anchor_media_id
              : variant.candidate_media_ids[0];
          if (preferred && !next[variant.key]) next[variant.key] = preferred;
        }
        return next;
      });
    } catch (reason) {
      setError(errorMessage(reason));
      setVariants([]);
    } finally {
      setVariantsLoading(false);
    }
  }, [asset]);

  useEffect(() => {
    void loadAsset();
  }, [loadAsset]);

  useEffect(() => {
    void loadVariants();
  }, [loadVariants]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset) return;
    const form = new FormData(event.currentTarget);
    const common = {
      asset_type: asset.type,
      type: asset.type,
      name: getFormText(form, 'name'),
      description: getFormText(form, 'description'),
      tags: getFormList(form, 'tags'),
    };
    const data =
      asset.type === 'character'
        ? {
            ...common,
            aliases: getFormList(form, 'aliases'),
            base_character_id: getOptionalFormText(form, 'base_character_id'),
            personality: getOptionalFormText(form, 'personality'),
            default_outfit: getOptionalFormText(form, 'default_outfit'),
            appearance: {
              gender: getOptionalFormText(form, 'appearance.gender'),
              age_range: getOptionalFormText(form, 'appearance.age_range'),
              height: getOptionalFormText(form, 'appearance.height'),
              build: getOptionalFormText(form, 'appearance.build'),
              skin_tone: getOptionalFormText(form, 'appearance.skin_tone'),
              hair: getOptionalFormText(form, 'appearance.hair'),
              eyes: getOptionalFormText(form, 'appearance.eyes'),
              distinguishing_features: getOptionalFormText(
                form,
                'appearance.distinguishing_features',
              ),
              custom: getOptionalFormText(form, 'appearance.custom'),
            },
          }
        : {
            ...common,
            location_type: getOptionalFormText(form, 'location_type'),
            time_period: getOptionalFormText(form, 'time_period'),
            weather_default: getOptionalFormText(form, 'weather_default'),
            lighting_default: getOptionalFormText(form, 'lighting_default'),
            mood_default: getOptionalFormText(form, 'mood_default'),
            floor_plan_url: getOptionalFormText(form, 'floor_plan_url'),
          };

    try {
      const value = await api<AssetDTO>(`/assets/${asset.id}`, {
        method: 'PATCH',
        body: data,
      });
      setAsset(value);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function remove() {
    if (!asset) return;
    if (!confirm(`确定删除「${asset.name}」吗？`)) return;
    try {
      await api(`/assets/${asset.id}`, { method: 'DELETE' });
      router.push(`/projects/${projectId}/assets`);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset) return;
    const form = event.currentTarget;
    const file = new FormData(form).get('file');
    if (!(file instanceof File)) return;
    const body = new FormData();
    body.append('file', file);
    try {
      await api(`/assets/${asset.id}/references`, { method: 'POST', body });
      form.reset();
      await loadAsset();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset) return;
    try {
      await api(`/assets/${asset.id}/appearance-variants`, {
        method: 'POST',
        body: {
          key: newVariantKey.trim(),
          title: newVariantTitle.trim(),
          change_reason: newVariantReason.trim() || undefined,
          description: newVariantDescription.trim() || undefined,
        },
      });
      setNewVariantKey('');
      setNewVariantTitle('');
      setNewVariantReason('');
      setNewVariantDescription('');
      await loadVariants();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function generateVariant(variant: AppearanceVariantDTO) {
    if (!asset) return;
    setVariantBusyKey(variant.key);
    try {
      await api(`/assets/${asset.id}/appearance-variants/${variant.key}/generate`, {
        method: 'POST',
        body: {
          count: candidateCount,
          ...(promptDrafts[variant.key]?.trim()
            ? { prompt: promptDrafts[variant.key].trim() }
            : {}),
        },
      });
      await loadVariants();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setVariantBusyKey('');
    }
  }

  async function approveVariant(variant: AppearanceVariantDTO, mediaId?: string) {
    if (!asset) return;
    setVariantBusyKey(variant.key);
    try {
      const chosen =
        mediaId ?? selectedCandidateByVariant[variant.key] ?? variant.candidate_media_ids[0];
      await api(`/assets/${asset.id}/appearance-variants/${variant.key}/approve`, {
        method: 'POST',
        body: chosen ? { media_id: chosen } : {},
      });
      await loadVariants();
      await loadAsset();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setVariantBusyKey('');
    }
  }

  async function removeVariant(variant: AppearanceVariantDTO) {
    if (!asset || variant.key === 'default' || isSheetVariant(variant)) return;
    if (!confirm(`确定删除形象「${variant.title}」吗？`)) return;
    try {
      await api(`/assets/${asset.id}/appearance-variants/${variant.key}`, {
        method: 'DELETE',
      });
      await loadVariants();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function draftSheetPrompt() {
    if (!asset) return;
    setVariantBusyKey('__sheet_draft__');
    setSheetError('');
    try {
      const result = await api<{ generation_prompt?: string }>(
        `/assets/${asset.id}/appearance-variants/draft-sheet-prompt`,
        { method: 'POST', body: {} },
      );
      if (result.generation_prompt) {
        setPromptDrafts((current) => ({
          ...current,
          [PRIMARY_SHEET_KEY]: result.generation_prompt!,
        }));
      }
      await loadVariants();
    } catch (reason) {
      const message = errorMessage(reason);
      setSheetError(message);
      setError(message);
    } finally {
      setVariantBusyKey('');
    }
  }

  async function generateSheetSet() {
    if (!asset) return;
    setVariantBusyKey('__sheet__');
    setSheetError('');
    try {
      await api(`/assets/${asset.id}/appearance-variants/generate-sheet`, {
        method: 'POST',
        body: {
          count: candidateCount,
          ...(promptDrafts[PRIMARY_SHEET_KEY]?.trim()
            ? { prompt: promptDrafts[PRIMARY_SHEET_KEY].trim() }
            : {}),
        },
      });
      await loadVariants();
      await loadAsset();
    } catch (reason) {
      const message = errorMessage(reason);
      setSheetError(message);
      setError(message);
    } finally {
      setVariantBusyKey('');
    }
  }

  async function draftLocationSheet() {
    if (!asset) return;
    setLocationBusy('draft');
    setSheetError('');
    try {
      const result = await api<{ generation_prompt?: string }>(
        `/assets/${asset.id}/location-sheet/draft-prompt`,
        { method: 'POST', body: {} },
      );
      if (result.generation_prompt) setLocationPrompt(result.generation_prompt);
      await loadAsset();
    } catch (reason) {
      const message = errorMessage(reason);
      setSheetError(message);
      setError(message);
    } finally {
      setLocationBusy('');
    }
  }

  async function generateLocationSheet() {
    if (!asset || !locationPrompt.trim()) return;
    setLocationBusy('generate');
    setSheetError('');
    try {
      await api(`/assets/${asset.id}/location-sheet/generate`, {
        method: 'POST',
        body: { prompt: locationPrompt.trim(), count: candidateCount },
      });
      await loadAsset();
    } catch (reason) {
      const message = errorMessage(reason);
      setSheetError(message);
      setError(message);
    } finally {
      setLocationBusy('');
    }
  }

  async function removeCandidate(variant: AppearanceVariantDTO, mediaId: string) {
    if (!asset) return;
    if (!confirm('删除这张候选图？历史中将不再保留该图。')) return;
    setVariantBusyKey(variant.key);
    try {
      await api(`/assets/${asset.id}/appearance-variants/${variant.key}/candidates/${mediaId}`, {
        method: 'DELETE',
      });
      setSelectedCandidateByVariant((current) => {
        if (current[variant.key] !== mediaId) return current;
        const next = { ...current };
        delete next[variant.key];
        return next;
      });
      await loadVariants();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setVariantBusyKey('');
    }
  }

  const primarySheet = variants.find(isPrimarySheetVariant) ?? null;
  const legacySheetVariants = variants.filter(isLegacySheetVariant);
  const narrativeVariants = variants.filter((variant) => !isSheetVariant(variant));

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-5 sm:p-8">
        <Spinner label="正在加载资产详情…" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="mx-auto max-w-5xl p-5 sm:p-8">
        <p className="mb-4 text-red-600">{error || '资产不存在'}</p>
        <Link className="text-accent underline" href={`/projects/${projectId}/assets`}>
          返回角色与地点
        </Link>
      </div>
    );
  }

  const isCharacter = asset.type === 'character';

  return (
    <div className="mx-auto max-w-5xl p-5 sm:p-8">
      <header className="mb-8">
        <Link
          href={`/projects/${projectId}/assets`}
          className="text-sm text-accent hover:underline"
        >
          ← 返回角色与地点
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-accent">{isCharacter ? '角色详情' : '地点详情'}</p>
            <h1 className="mt-1 text-3xl font-semibold">{asset.name}</h1>
            <p className="mt-2 max-w-3xl text-zinc-400">{asset.description}</p>
          </div>
          <Button variant="danger" onClick={() => void remove()}>
            删除
          </Button>
        </div>
      </header>

      {error && (
        <p className="mb-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-6">
        <Card>
          <h2 className="mb-5 text-lg font-semibold">基础信息</h2>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void save(event)}>
            <Field label="名称">
              <Input name="name" defaultValue={asset.name} required key={`${asset.id}-name`} />
            </Field>
            <Field label="标签" hint="用英文逗号分隔">
              <Input
                name="tags"
                defaultValue={asset.tags?.join(', ') ?? ''}
                key={`${asset.id}-tags`}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="详细描述">
                <Textarea
                  name="description"
                  defaultValue={asset.description ?? ''}
                  required
                  key={`${asset.id}-description`}
                />
              </Field>
            </div>
            {isCharacter ? (
              <>
                <Field label="别名" hint="用英文逗号分隔">
                  <Input
                    name="aliases"
                    defaultValue={asset.aliases?.join(', ') ?? ''}
                    key={`${asset.id}-aliases`}
                  />
                </Field>
                <Field label="基础角色 ID">
                  <Input
                    name="base_character_id"
                    defaultValue={asset.base_character_id ?? ''}
                    key={`${asset.id}-base`}
                  />
                </Field>
                <Field label="性格">
                  <Textarea
                    name="personality"
                    defaultValue={asset.personality ?? ''}
                    key={`${asset.id}-personality`}
                  />
                </Field>
                <Field label="默认服装">
                  <Textarea
                    name="default_outfit"
                    defaultValue={asset.default_outfit ?? ''}
                    key={`${asset.id}-outfit`}
                  />
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
                        asset.appearance?.[key as keyof NonNullable<AssetDTO['appearance']>] ?? ''
                      }
                    />
                  </Field>
                ))}
              </>
            ) : (
              <>
                <Field label="地点类型">
                  <Select
                    name="location_type"
                    defaultValue={
                      typeof (asset as { location_type?: string }).location_type === 'string'
                        ? (asset as { location_type?: string }).location_type
                        : ''
                    }
                  >
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
                  <Input name="time_period" defaultValue={asset.time_period ?? ''} />
                </Field>
                <Field label="默认天气">
                  <Input name="weather_default" defaultValue={asset.weather_default ?? ''} />
                </Field>
                <Field label="默认灯光">
                  <Input name="lighting_default" defaultValue={asset.lighting_default ?? ''} />
                </Field>
                <Field label="默认氛围">
                  <Input name="mood_default" defaultValue={asset.mood_default ?? ''} />
                </Field>
                <Field label="平面图地址">
                  <Input
                    name="floor_plan_url"
                    type="url"
                    defaultValue={asset.floor_plan_url ?? ''}
                  />
                </Field>
              </>
            )}
            <div className="md:col-span-2">
              <Button type="submit">保存更改</Button>
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">封面 / 参考图</h2>
          {asset.cover_image && imageUrl(asset.cover_image) && (
            <img
              className="mb-4 aspect-[16/9] w-full max-w-xl rounded-lg object-cover"
              src={imageUrl(asset.cover_image)}
              alt={`${asset.name}封面`}
            />
          )}
          <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {asset.reference_images?.map((image, index) => {
              const src = imageUrl(image);
              if (!src) return null;
              return (
                <img
                  key={typeof image === 'string' ? image : image.id}
                  className="aspect-square w-full rounded-lg object-cover"
                  src={src}
                  alt={`${asset.name}参考图 ${index + 1}`}
                />
              );
            })}
          </div>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_auto]"
            onSubmit={(event) => void upload(event)}
          >
            <Input name="file" type="file" accept="image/png,image/jpeg,image/webp" required />
            <Button type="submit" variant="secondary">
              上传参考图
            </Button>
          </form>
        </Card>

        {!isCharacter && (
          <Card>
            <h2 className="mb-1 text-lg font-semibold">地点设定表（单图多角度）</h2>
            <p className="mb-4 text-xs text-zinc-500">
              从描述起草提示词 → 审核 → 一次 T2I 生成主建立镜头 + 互补角度，并设为封面。
            </p>
            <Field label="设定表提示词">
              <Textarea
                value={locationPrompt}
                placeholder="可先「从描述起草」，再按提示词生成"
                onChange={(event) => setLocationPrompt(event.target.value)}
              />
            </Field>
            {sheetError && (
              <p className="mt-2 rounded-md bg-red-500/10 p-2 text-xs text-red-600" role="alert">
                {sheetError}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-zinc-400">
                候选数
                <select
                  className="rounded border border-line bg-white px-2 py-1 text-xs text-zinc-700"
                  value={candidateCount}
                  disabled={Boolean(locationBusy)}
                  onChange={(event) => setCandidateCount(Number(event.target.value) || 1)}
                >
                  {[1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(locationBusy)}
                onClick={() => void draftLocationSheet()}
              >
                {locationBusy === 'draft' ? '起草中…' : '从描述起草提示词'}
              </Button>
              <Button
                type="button"
                disabled={Boolean(locationBusy) || !locationPrompt.trim()}
                onClick={() => void generateLocationSheet()}
              >
                {locationBusy === 'generate' ? '生成中…' : '按提示词生成设定表'}
              </Button>
            </div>
          </Card>
        )}

        {isCharacter && (
          <Card>
            <h2 className="mb-1 text-lg font-semibold">角色设定表（单图多视角）</h2>
            <p className="mb-4 text-xs text-zinc-500">
              一张图 2×2：全身正视 / 侧视 / 后视 / 独立大块面部特写。审核提示词后再生成。
            </p>
            {variantsLoading ? (
              <Spinner label="正在加载形象…" />
            ) : primarySheet ? (
              <div className="rounded-lg border border-line/80 bg-zinc-950/40 p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="font-medium">{primarySheet.title}</p>
                  <Badge>{stateLabel(primarySheet.state)}</Badge>
                </div>
                {primarySheet.anchor_media || primarySheet.candidate_media?.[0] ? (
                  <img
                    className="mb-2 aspect-[4/3] w-full rounded-md object-cover"
                    src={imageUrl(
                      primarySheet.anchor_media ?? primarySheet.candidate_media?.[0] ?? '',
                    )}
                    alt="角色设定表"
                  />
                ) : (
                  <div className="mb-2 grid aspect-video place-items-center rounded-md bg-zinc-900 text-xs text-zinc-600">
                    尚未生成（请先审核提示词）
                  </div>
                )}
                {!!primarySheet.candidate_media?.length && (
                  <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {primarySheet.candidate_media.map((media) => {
                      const selectedId =
                        selectedCandidateByVariant[primarySheet.key] ??
                        primarySheet.anchor_media_id ??
                        primarySheet.candidate_media_ids[0];
                      const isSelected = media.id === selectedId;
                      const busy = variantBusyKey === primarySheet.key;
                      return (
                        <div key={media.id} className="relative">
                          <button
                            type="button"
                            className={`w-full overflow-hidden rounded-md border ${
                              isSelected
                                ? 'border-accent ring-1 ring-accent/50'
                                : 'border-transparent hover:border-accent/60'
                            }`}
                            disabled={busy}
                            onClick={() =>
                              setSelectedCandidateByVariant((current) => ({
                                ...current,
                                [primarySheet.key]: media.id,
                              }))
                            }
                          >
                            <img
                              className="aspect-[4/3] w-full object-cover"
                              src={imageUrl(media)}
                              alt="候选设定表"
                            />
                          </button>
                          <button
                            type="button"
                            className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-red-200"
                            disabled={busy}
                            onClick={() => void removeCandidate(primarySheet, media.id)}
                          >
                            删
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <Field label="设定表提示词（审核后再生成）">
                  <Textarea
                    value={promptDrafts[PRIMARY_SHEET_KEY] ?? ''}
                    placeholder="应包含 2x2 四宫格与独立面部特写面板"
                    onChange={(event) =>
                      setPromptDrafts((current) => ({
                        ...current,
                        [PRIMARY_SHEET_KEY]: event.target.value,
                      }))
                    }
                  />
                </Field>
                {sheetError && (
                  <p
                    className="mt-2 rounded-md bg-red-500/10 p-2 text-xs text-red-600"
                    role="alert"
                  >
                    {sheetError}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-zinc-400">
                    候选数
                    <select
                      className="rounded border border-line bg-white px-2 py-1 text-xs text-zinc-700"
                      value={candidateCount}
                      disabled={
                        variantBusyKey === '__sheet__' || variantBusyKey === '__sheet_draft__'
                      }
                      onChange={(event) => setCandidateCount(Number(event.target.value) || 1)}
                    >
                      {[1, 2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={Boolean(variantBusyKey) || variantsLoading}
                    onClick={() => void draftSheetPrompt()}
                  >
                    {variantBusyKey === '__sheet_draft__' ? '起草中…' : '从描述起草提示词'}
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      Boolean(variantBusyKey) ||
                      variantsLoading ||
                      !promptDrafts[PRIMARY_SHEET_KEY]?.trim()
                    }
                    onClick={() => void generateSheetSet()}
                  >
                    {variantBusyKey === '__sheet__' ? '生成中…' : '按提示词生成设定表'}
                  </Button>
                  {(selectedCandidateByVariant[PRIMARY_SHEET_KEY] ||
                    primarySheet.candidate_media_ids[0]) && (
                    <Button
                      type="button"
                      disabled={Boolean(variantBusyKey)}
                      onClick={() => void approveVariant(primarySheet)}
                    >
                      批准选中
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">设定表槽位尚未创建，刷新页面即可。</p>
            )}

            {legacySheetVariants.length > 0 && (
              <details className="mt-4 rounded-lg border border-line/60 p-3 text-sm text-zinc-400">
                <summary className="cursor-pointer text-zinc-600">
                  旧版分视图槽位（已弃用，仅兼容）
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {legacySheetVariants.map((variant) => {
                    const anchorSrc = variant.anchor_media ? imageUrl(variant.anchor_media) : '';
                    return (
                      <div
                        key={variant.id}
                        className="rounded-md border border-line/50 bg-zinc-950/30 p-2"
                      >
                        <div className="mb-1 flex justify-between gap-2">
                          <span>{variant.title}</span>
                          <Badge>{stateLabel(variant.state)}</Badge>
                        </div>
                        {anchorSrc ? (
                          <img
                            className="aspect-square w-full rounded object-cover"
                            src={anchorSrc}
                            alt={variant.title}
                          />
                        ) : (
                          <div className="grid aspect-video place-items-center rounded bg-zinc-900 text-xs text-zinc-600">
                            无图
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </Card>
        )}

        {isCharacter && (
          <Card>
            <h2 className="mb-1 text-lg font-semibold">形象变体</h2>
            <p className="mb-4 text-xs text-zinc-500">
              按剧情状态维护多套形象（默认 / 受伤 / 年幼等）。重新生成会追加候选，不自动删旧图。
            </p>
            {variantsLoading ? null : (
              <div className="grid gap-4">
                {narrativeVariants.map((variant) => {
                  const anchorSrc = variant.anchor_media ? imageUrl(variant.anchor_media) : '';
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
                          className="mb-3 aspect-square w-full max-w-xs rounded-md object-cover"
                          src={anchorSrc}
                          alt={`${variant.title}锚定图`}
                        />
                      ) : (
                        <div className="mb-3 grid aspect-video max-w-xs place-items-center rounded-md bg-zinc-900 text-xs text-zinc-600">
                          尚无锚定图
                        </div>
                      )}
                      {!!variant.candidate_media?.length && (
                        <div className="mb-3 grid grid-cols-3 gap-2 sm:max-w-lg">
                          {variant.candidate_media.map((media) => {
                            const selectedId =
                              selectedCandidateByVariant[variant.key] ??
                              variant.anchor_media_id ??
                              variant.candidate_media_ids[0];
                            const isSelected = media.id === selectedId;
                            return (
                              <div key={media.id} className="relative">
                                <button
                                  type="button"
                                  className={`w-full overflow-hidden rounded-md border ${
                                    isSelected
                                      ? 'border-accent ring-1 ring-accent/50'
                                      : 'border-transparent hover:border-accent/60'
                                  }`}
                                  disabled={busy}
                                  onClick={() =>
                                    setSelectedCandidateByVariant((current) => ({
                                      ...current,
                                      [variant.key]: media.id,
                                    }))
                                  }
                                >
                                  <img
                                    className="aspect-square w-full object-cover"
                                    src={imageUrl(media)}
                                    alt="候选图"
                                  />
                                </button>
                                <button
                                  type="button"
                                  className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-red-200"
                                  disabled={busy}
                                  onClick={() => void removeCandidate(variant, media.id)}
                                >
                                  删
                                </button>
                              </div>
                            );
                          })}
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
                          {busy ? '处理中…' : '生成候选图'}
                        </Button>
                        {(selectedCandidateByVariant[variant.key] ||
                          variant.candidate_media_ids[0]) && (
                          <Button
                            type="button"
                            disabled={busy}
                            onClick={() => void approveVariant(variant)}
                          >
                            批准选中候选
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
              className="mt-5 grid gap-3 border-t border-line/60 pt-4 md:grid-cols-2"
              onSubmit={(event) => void createVariant(event)}
            >
              <h3 className="text-sm font-medium md:col-span-2">新增形象</h3>
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
              <div className="md:col-span-2">
                <Button type="submit" variant="secondary">
                  添加形象
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
