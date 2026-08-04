'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from '@zivith/ui';
import { api, errorMessage, unwrapList } from '@/lib/api';
import { getFormText } from '@/lib/form-data';
import type { CreatorChatThreadDTO, ProjectDTO } from '@/lib/types';

function relativeTime(value: string): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '';
  const delta = Date.now() - time;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(value).toLocaleDateString('zh-CN');
}

export default function CreatorChatsPage() {
  const [threads, setThreads] = useState<CreatorChatThreadDTO[]>([]);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [threadList, projectList] = await Promise.all([
        api<CreatorChatThreadDTO[]>('/world/creator-chats'),
        api<ProjectDTO[] | { data?: ProjectDTO[]; items?: ProjectDTO[] }>('/projects').catch(
          () => [],
        ),
      ]);
      setThreads(threadList);
      setProjects(unwrapList(projectList));
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
    setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const thread = await api<CreatorChatThreadDTO>('/world/creator-chats', {
        method: 'POST',
        body: {
          project_id: getFormText(form, 'project_id') || null,
          title: getFormText(form, 'title') || null,
        },
      });
      window.location.href = `/creator-chats/${thread.id}`;
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-accent">创造层 · Creator Chat</p>
          <h1 className="mt-1 text-3xl font-semibold">世界构建对话</h1>
          <p className="mt-2 max-w-2xl text-zinc-400">
            像与副驾驶聊天一样描述你的 IP。它会引导你完善世界观、角色、场景与事件，
            并把确认的设定自动写入世界数据库（草稿，需在 Studio 中审批）。
          </p>
        </div>
        <Button onClick={() => setCreating((value) => !value)}>
          {creating ? '取消' : '新建对话'}
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
            onSubmit={(event) => void create(event)}
          >
            <Field
              label="关联项目"
              hint="留空则让世界构建者先为你创建新 IP 项目"
            >
              <Select name="project_id" defaultValue="">
                <option value="">让 AI 自动创建新项目</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="对话标题（可选）">
              <Input name="title" placeholder="例如：雾城来信 · 世界搭建" />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? '创建中…' : '开始对话'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <Spinner label="正在加载对话…" />
      ) : threads.length === 0 ? (
        <EmptyState
          title="还没有世界构建对话"
          description="开启一段对话，描述你的创意宇宙。世界构建者会一步步引导你完善它。"
          action={<Button onClick={() => setCreating(true)}>开始第一次对话</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {threads.map((thread) => (
            <Link key={thread.id} href={`/creator-chats/${thread.id}`} className="block">
              <Card className="group h-full transition hover:border-accent/40">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold text-white group-hover:text-accent">
                    {thread.title ?? '未命名世界对话'}
                  </h2>
                  {thread.project_name ? (
                    <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent">
                      {thread.project_name}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-400">
                      新世界
                    </span>
                  )}
                </div>
                <p className="mt-4 text-xs text-zinc-500">
                  更新于 {relativeTime(thread.updated_at)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
