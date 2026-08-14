'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import type { AssetDTO, AssetType, MediaDTO } from '@/lib/types';

function imageUrl(image: string | MediaDTO): string {
  if (typeof image === 'string') {
    return /^(https?:|data:|blob:)/i.test(image) ? image : '';
  }
  const access = 'access_url' in image ? (image as { access_url?: string }).access_url : undefined;
  return access ?? image.thumbnail_url ?? image.url ?? '';
}

function coverSrc(asset: AssetDTO) {
  return imageUrl(asset.cover_image ?? asset.reference_images?.[0] ?? '');
}

export default function AssetsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [type, setType] = useState<AssetType>('character');
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const value = await api<AssetDTO[] | { data?: AssetDTO[]; items?: AssetDTO[] }>(
        `/projects/${projectId}/assets?type=${type}`,
      );
      setAssets(unwrapList(value));
      setError('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [projectId, type]);

  useEffect(() => {
    setCreating(false);
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
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
      const value = await api<AssetDTO>(`/projects/${projectId}/assets`, {
        method: 'POST',
        body: data,
      });
      setCreating(false);
      router.push(`/projects/${projectId}/assets/${value.id}`);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function remove(asset: AssetDTO) {
    if (!confirm(`确定删除「${asset.name}」吗？`)) return;
    try {
      await api(`/assets/${asset.id}`, { method: 'DELETE' });
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-accent">项目资产库</p>
          <h1 className="mt-1 text-3xl font-semibold">角色与地点</h1>
          <p className="mt-2 text-zinc-400">持久、可复用，并在所有故事中保持一致。</p>
        </div>
        <Button onClick={() => setCreating(true)}>
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
        <p className="mb-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {creating && (
        <Card className="mb-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">新建{type === 'character' ? '角色' : '地点'}</h2>
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              取消
            </Button>
          </div>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void create(event)}>
            <Field label="名称">
              <Input name="name" required />
            </Field>
            <Field label="标签" hint="用英文逗号分隔">
              <Input name="tags" />
            </Field>
            <div className="md:col-span-2">
              <Field label="详细描述">
                <Textarea name="description" required />
              </Field>
            </div>
            {type === 'character' ? (
              <>
                <Field label="别名" hint="用英文逗号分隔">
                  <Input name="aliases" />
                </Field>
                <Field label="性格">
                  <Textarea name="personality" />
                </Field>
                <Field label="默认服装">
                  <Textarea name="default_outfit" />
                </Field>
                <Field label="发型与发色">
                  <Input name="appearance.hair" />
                </Field>
              </>
            ) : (
              <>
                <Field label="地点类型">
                  <Select name="location_type" defaultValue="">
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
                <Field label="默认氛围">
                  <Input name="mood_default" />
                </Field>
              </>
            )}
            <div className="md:col-span-2">
              <Button type="submit">创建并进入详情</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <Spinner label="正在加载资产…" />
      ) : assets.length === 0 ? (
        <EmptyState
          title={`还没有${type === 'character' ? '角色' : '地点'}`}
          description="创建可复用资产，并上传参考图保持视觉一致。"
          action={<Button onClick={() => setCreating(true)}>立即创建</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <Card key={asset.id}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => router.push(`/projects/${projectId}/assets/${asset.id}`)}
              >
                <div className="mb-4 aspect-[16/9] overflow-hidden rounded-lg bg-zinc-900">
                  {coverSrc(asset) ? (
                    <img
                      className="size-full object-cover"
                      src={coverSrc(asset)}
                      alt={`${asset.name}封面`}
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
                <p className="mt-3 text-xs text-accent">点击进入详情页 →</p>
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
  );
}
