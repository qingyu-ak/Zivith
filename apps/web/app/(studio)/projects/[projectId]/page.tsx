'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, Card, EmptyState, Field, Input, Spinner, Textarea } from '@zivith/ui';
import { api, errorMessage, unwrapList } from '@/lib/api';
import { getFormText } from '@/lib/form-data';
import type { ProjectDTO, StoryDTO } from '@/lib/types';

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [stories, setStories] = useState<StoryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [projectValue, storyValue] = await Promise.all([
        api<ProjectDTO>(`/projects/${projectId}`),
        api<StoryDTO[] | { data?: StoryDTO[]; items?: StoryDTO[] }>(
          `/projects/${projectId}/stories`,
        ),
      ]);
      setProject(projectValue);
      setStories(unwrapList(storyValue));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/projects/${projectId}/stories`, {
        method: 'POST',
        body: {
          title: getFormText(form, 'title'),
          logline: getFormText(form, 'logline'),
          synopsis: getFormText(form, 'synopsis'),
          genre: getFormText(form, 'genre'),
          theme: getFormText(form, 'theme'),
          target_audience: getFormText(form, 'target_audience'),
        },
      });
      setShowForm(false);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function deleteStory(story: StoryDTO) {
    if (!confirm(`确定删除故事“${story.title}”吗？`)) return;
    try {
      await api(`/stories/${story.id}`, { method: 'DELETE' });
      setStories((items) => items.filter((item) => item.id !== story.id));
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  if (loading)
    return (
      <div className="p-8">
        <Spinner label="正在打开项目…" />
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link className="text-sm text-zinc-500 hover:text-accent" href="/projects">
            ← 所有项目
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">{project?.name ?? '项目'}</h1>
          <p className="mt-2 text-zinc-400">
            {project?.description || '从一个故事开始构建你的创意宇宙。'}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`/projects/${projectId}/assets`}>
            <Button variant="secondary">资产库</Button>
          </Link>
          <Button onClick={() => setShowForm((value) => !value)}>
            {showForm ? '取消' : '新建故事'}
          </Button>
        </div>
      </header>
      {error && (
        <p className="mb-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {showForm && (
        <Card className="mb-8">
          <h2 className="mb-5 text-lg font-semibold">故事元数据</h2>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              void createStory(event);
            }}
          >
            <Field label="标题">
              <Input name="title" required autoFocus />
            </Field>
            <Field label="类型">
              <Input name="genre" placeholder="剧情 / 科幻 / 悬疑" />
            </Field>
            <Field label="一句话梗概">
              <Input name="logline" />
            </Field>
            <Field label="主题">
              <Input name="theme" />
            </Field>
            <Field label="目标观众">
              <Input name="target_audience" />
            </Field>
            <Field label="完整梗概">
              <Textarea name="synopsis" />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit">保存故事</Button>
            </div>
          </form>
        </Card>
      )}
      {stories.length === 0 ? (
        <EmptyState
          title="项目还是空的"
          description="创建故事，然后把它拆分为连续的场景和可编辑镜头。"
          action={<Button onClick={() => setShowForm(true)}>创建故事</Button>}
        />
      ) : (
        <div className="grid gap-4">
          {stories.map((story, index) => (
            <Card key={story.id} className="flex flex-wrap items-center gap-5">
              <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-accent/10 font-mono text-accent">
                {String(index + 1).padStart(2, '0')}
              </div>
              <Link className="min-w-48 flex-1" href={`/projects/${projectId}/stories/${story.id}`}>
                <h2 className="font-semibold hover:text-accent">{story.title}</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {story.logline || '尚未填写一句话梗概'}
                </p>
              </Link>
              <span className="text-sm text-zinc-500">{story.scene_count ?? 0} 个场景</span>
              <Button
                variant="danger"
                onClick={() => {
                  void deleteStory(story);
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
