'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, Button, Card, EmptyState, Field, Input, Spinner, Textarea } from '@zivith/ui';
import { api, errorMessage, unwrapList } from '@/lib/api';
import { getFormText } from '@/lib/form-data';
import type { SceneDTO, ShotDTO, StoryDTO } from '@/lib/types';

const stateLabels = {
  draft: '草稿',
  prompting: '构建提示词',
  generating: '生成中',
  review: '待审核',
  approved: '已批准',
};

export default function StoryEditorPage() {
  const { projectId, storyId } = useParams<{ projectId: string; storyId: string }>();
  const [story, setStory] = useState<StoryDTO | null>(null);
  const [scenes, setScenes] = useState<SceneDTO[]>([]);
  const [shots, setShots] = useState<Record<string, ShotDTO[]>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingScene, setAddingScene] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [storyValue, sceneValue] = await Promise.all([
        api<StoryDTO>(`/stories/${storyId}`),
        api<SceneDTO[] | { data?: SceneDTO[]; items?: SceneDTO[] }>(`/stories/${storyId}/scenes`),
      ]);
      const sceneItems = unwrapList(sceneValue).sort((a, b) => a.order - b.order);
      setStory(storyValue);
      setScenes(sceneItems);
      const shotEntries = await Promise.all(
        sceneItems.map(async (scene) => {
          const value = await api<ShotDTO[] | { data?: ShotDTO[]; items?: ShotDTO[] }>(
            `/scenes/${scene.id}/shots`,
          );
          return [scene.id, unwrapList(value)] as const;
        }),
      );
      setShots(Object.fromEntries(shotEntries));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [storyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/stories/${storyId}`, {
        method: 'PATCH',
        body: {
          title: getFormText(form, 'title'),
          logline: getFormText(form, 'logline'),
          synopsis: getFormText(form, 'synopsis'),
          genre: getFormText(form, 'genre'),
          theme: getFormText(form, 'theme'),
          target_audience: getFormText(form, 'target_audience'),
        },
      });
      setEditing(false);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function createScene(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/stories/${storyId}/scenes`, {
        method: 'POST',
        body: {
          title: getFormText(form, 'title'),
          summary: getFormText(form, 'summary'),
          time_of_day: getFormText(form, 'time_of_day'),
          weather: getFormText(form, 'weather'),
          mood: getFormText(form, 'mood'),
          order: scenes.length + 1,
        },
      });
      setAddingScene(false);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function move(scene: SceneDTO, direction: -1 | 1) {
    const target = scene.order + direction;
    if (target < 1 || target > scenes.length) return;
    try {
      await api(`/scenes/${scene.id}/reorder`, { method: 'POST', body: { new_order: target } });
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function editScene(scene: SceneDTO) {
    const title = window.prompt('场景标题', scene.title);
    if (title === null || !title.trim()) return;
    const summary = window.prompt('场景概要', scene.summary ?? '');
    if (summary === null) return;
    try {
      await api(`/scenes/${scene.id}`, {
        method: 'PATCH',
        body: { title: title.trim(), summary },
      });
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function deleteScene(scene: SceneDTO) {
    if (!window.confirm(`确定删除场景“${scene.title}”及其中所有镜头吗？`)) return;
    try {
      await api(`/scenes/${scene.id}`, { method: 'DELETE' });
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function createShot(sceneId: string) {
    try {
      const item = await api<ShotDTO>(`/scenes/${sceneId}/shots`, {
        method: 'POST',
        body: {
          label: '未命名镜头',
          order: (shots[sceneId]?.length ?? 0) + 1,
          style: { aspect_ratio: '16:9', fps: 24 },
          prompt: { source: 'auto' },
        },
      });
      setShots((value) => ({ ...value, [sceneId]: [...(value[sceneId] ?? []), item] }));
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  if (loading)
    return (
      <div className="p-8">
        <Spinner label="正在加载故事结构…" />
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <header className="mb-8">
        <Link className="text-sm text-zinc-500 hover:text-accent" href={`/projects/${projectId}`}>
          ← 返回项目
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-accent">故事编辑器</p>
            <h1 className="mt-1 text-3xl font-semibold">{story?.title}</h1>
            <p className="mt-2 text-zinc-400">{story?.logline || '尚未填写一句话梗概'}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setEditing((value) => !value)}>
              编辑元数据
            </Button>
            <Button onClick={() => setAddingScene((value) => !value)}>添加场景</Button>
          </div>
        </div>
      </header>
      {error && (
        <p className="mb-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {editing && story && (
        <Card className="mb-6">
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              void saveStory(event);
            }}
          >
            <Field label="标题">
              <Input name="title" defaultValue={story.title} required />
            </Field>
            <Field label="类型">
              <Input name="genre" defaultValue={story.genre ?? ''} />
            </Field>
            <Field label="一句话梗概">
              <Input name="logline" defaultValue={story.logline ?? ''} />
            </Field>
            <Field label="主题">
              <Input name="theme" defaultValue={story.theme ?? ''} />
            </Field>
            <Field label="目标观众">
              <Input name="target_audience" defaultValue={story.target_audience ?? ''} />
            </Field>
            <Field label="完整梗概">
              <Textarea name="synopsis" defaultValue={story.synopsis ?? ''} />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit">保存更改</Button>
            </div>
          </form>
        </Card>
      )}
      {addingScene && (
        <Card className="mb-6">
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              void createScene(event);
            }}
          >
            <Field label="场景标题">
              <Input name="title" required autoFocus />
            </Field>
            <Field label="时间">
              <Input name="time_of_day" placeholder="清晨 / 深夜" />
            </Field>
            <Field label="天气">
              <Input name="weather" />
            </Field>
            <Field label="氛围">
              <Input name="mood" />
            </Field>
            <Field label="场景概要">
              <Textarea name="summary" />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit">创建场景</Button>
            </div>
          </form>
        </Card>
      )}
      {scenes.length === 0 ? (
        <EmptyState
          title="还没有场景"
          description="将故事拆分为发生在连续环境中的场景。"
          action={<Button onClick={() => setAddingScene(true)}>添加第一个场景</Button>}
        />
      ) : (
        <div className="space-y-5">
          {scenes.map((scene) => (
            <Card key={scene.id}>
              <div className="flex flex-wrap items-start gap-4">
                <div className="grid size-10 place-items-center rounded-lg bg-white/5 font-mono text-zinc-400">
                  {scene.order}
                </div>
                <div className="min-w-52 flex-1">
                  <h2 className="font-semibold">{scene.title}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{scene.summary || '暂无场景概要'}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                    <span>{scene.time_of_day || '时间未定'}</span>
                    <span>·</span>
                    <span>{scene.weather || '天气未定'}</span>
                    <span>·</span>
                    <span>{scene.mood || '氛围未定'}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    aria-label="上移场景"
                    onClick={() => {
                      void move(scene, -1);
                    }}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label="下移场景"
                    onClick={() => {
                      void move(scene, 1);
                    }}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void editScene(scene);
                    }}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void createShot(scene.id);
                    }}
                  >
                    添加镜头
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      void deleteScene(scene);
                    }}
                  >
                    删除
                  </Button>
                </div>
              </div>
              <div className="mt-5 grid gap-2 border-t border-line pt-4">
                {(shots[scene.id] ?? []).length === 0 ? (
                  <p className="text-sm text-zinc-600">这个场景还没有镜头。</p>
                ) : (
                  (shots[scene.id] ?? []).map((shot) => (
                    <Link
                      key={shot.id}
                      href={`/projects/${projectId}/stories/${storyId}/scenes/${scene.id}/shots/${shot.id}`}
                      className="flex items-center gap-3 rounded-lg bg-ink px-4 py-3 hover:ring-1 hover:ring-accent/40"
                    >
                      <span className="font-mono text-xs text-zinc-600">
                        {String(shot.order).padStart(2, '0')}
                      </span>
                      <span className="flex-1 text-sm">{shot.label || '未命名镜头'}</span>
                      <Badge
                        tone={
                          shot.state === 'approved'
                            ? 'success'
                            : shot.state === 'review'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {stateLabels[shot.state]}
                      </Badge>
                    </Link>
                  ))
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
