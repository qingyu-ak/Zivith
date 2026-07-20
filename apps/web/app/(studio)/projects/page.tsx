'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { Button, Card, EmptyState, Field, Input, Spinner, Textarea } from '@zivith/ui';
import { api, errorMessage, unwrapList } from '@/lib/api';
import { getFormText } from '@/lib/form-data';
import type { ProjectDTO } from '@/lib/types';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const value = await api<ProjectDTO[] | { data?: ProjectDTO[]; items?: ProjectDTO[] }>(
        '/projects',
      );
      setProjects(unwrapList(value));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/projects', {
        method: 'POST',
        body: {
          name: getFormText(form, 'name'),
          description: getFormText(form, 'description'),
        },
      });
      event.currentTarget.reset();
      setCreating(false);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function remove(project: ProjectDTO) {
    if (!window.confirm(`确定删除项目“${project.name}”吗？此操作无法撤销。`)) return;
    try {
      await api(`/projects/${project.id}`, { method: 'DELETE' });
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-accent">创作中心</p>
          <h1 className="mt-1 text-3xl font-semibold">你的项目</h1>
          <p className="mt-2 text-zinc-400">每个项目都是一个独立的故事宇宙。</p>
        </div>
        <Button onClick={() => setCreating((value) => !value)}>
          {creating ? '取消' : '新建项目'}
        </Button>
      </header>

      {error && (
        <p className="mb-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      {creating && (
        <Card className="mb-8">
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              void create(event);
            }}
          >
            <Field label="项目名称">
              <Input name="name" required autoFocus placeholder="例如：雾城来信" />
            </Field>
            <Field label="项目简介">
              <Textarea
                name="description"
                className="min-h-11"
                placeholder="一句话描述你的创意宇宙"
              />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit">创建项目</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <Spinner label="正在加载项目…" />
      ) : projects.length === 0 ? (
        <EmptyState
          title="还没有项目"
          description="创建第一个项目，开始组织故事、场景、镜头与可复用资产。"
          action={<Button onClick={() => setCreating(true)}>创建第一个项目</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="group relative overflow-hidden">
              <Link href={`/projects/${project.id}`} className="block">
                <div className="mb-5 aspect-[16/8] rounded-lg bg-gradient-to-br from-zinc-700 via-zinc-800 to-accent/10" />
                <h2 className="text-lg font-semibold group-hover:text-accent">{project.name}</h2>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-400">
                  {project.description || '暂无项目简介'}
                </p>
                <div className="mt-5 flex gap-4 text-xs text-zinc-500">
                  <span>{project.story_count ?? 0} 个故事</span>
                  <span>{project.asset_count ?? 0} 项资产</span>
                </div>
              </Link>
              <Button
                className="absolute right-3 top-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                variant="danger"
                onClick={() => {
                  void remove(project);
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
