'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import Link from 'next/link';
import { Badge, Button, EmptyState, Input, Select, Spinner, Textarea } from '@zivith/ui';
import { api, errorMessage, unwrapList } from '@/lib/api';
import type {
  CreatorChatMessageDTO,
  CreatorChatThreadDTO,
  ProjectDTO,
  ProposalKind,
} from '@/lib/types';
import { ProposalCard, type ChatProposal } from './proposal-card';
import { WorldStatusPanel } from './world-status-panel';

const PROPOSAL_KINDS: ProposalKind[] = [
  'create_project',
  'create_world_event',
  'create_character',
  'create_location',
  'create_scene',
  'create_relationship',
  'update_entity',
];

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

function parseProposals(message: CreatorChatMessageDTO): {
  proposals: ChatProposal[];
  applied: boolean;
} {
  if (!message.proposal) return { proposals: [], applied: false };
  const rawList = Array.isArray(message.proposal) ? message.proposal : [message.proposal];
  const proposals: ChatProposal[] = [];
  for (const raw of rawList) {
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const kind = record.kind;
    const payload = record.payload;
    if (
      typeof kind !== 'string' ||
      !PROPOSAL_KINDS.includes(kind as ProposalKind) ||
      typeof payload !== 'object' ||
      payload === null
    ) {
      continue;
    }
    proposals.push({ kind: kind as ProposalKind, payload: payload as Record<string, unknown> });
  }
  return { proposals, applied: message.proposal_state === 'applied' };
}

export function ChatPanel({ threadId }: { threadId: string }) {
  const [thread, setThread] = useState<CreatorChatThreadDTO | null>(null);
  const [messages, setMessages] = useState<CreatorChatMessageDTO[]>([]);
  const [threads, setThreads] = useState<CreatorChatThreadDTO[]>([]);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const value = await api<{
        thread: CreatorChatThreadDTO;
        messages: CreatorChatMessageDTO[];
      }>(`/world/creator-chats/${threadId}`);
      setThread(value.thread);
      setMessages(value.messages);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Trae 风格左侧会话边栏：常驻历史会话列表 + 新建表单可选项目。
    api<CreatorChatThreadDTO[]>('/world/creator-chats')
      .then(setThreads)
      .catch(() => setThreads([]));
    api<ProjectDTO[] | { data?: ProjectDTO[]; items?: ProjectDTO[] }>('/projects')
      .then((value) => setProjects(unwrapList(value)))
      .catch(() => setProjects([]));
  }, [threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setError('');
    setSending(true);
    setInput('');
    try {
      const value = await api<{
        user_message: CreatorChatMessageDTO;
        assistant_message: CreatorChatMessageDTO | null;
      }>(`/world/creator-chats/${threadId}/messages`, {
        method: 'POST',
        body: { role: 'user', content },
      });
      setMessages((current) => [
        ...current,
        value.user_message,
        ...(value.assistant_message ? [value.assistant_message] : []),
      ]);
      setThreads((current) => {
        const target = current.find((item) => item.id === threadId);
        if (!target) return current;
        return [{ ...target, updated_at: new Date().toISOString() }, ...current.filter((item) => item.id !== threadId)];
      });
    } catch (reason) {
      setError(errorMessage(reason));
      setInput(content);
    } finally {
      setSending(false);
    }
  }

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
          project_id: (form.get('project_id') as string) || null,
          title: (form.get('title') as string) || null,
        },
      });
      window.location.href = `/creator-chats/${thread.id}`;
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  }

  function handleApplied() {
    void load();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const form = event.currentTarget.closest('form');
      form?.requestSubmit();
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner label="正在加载对话…" />
      </div>
    );
  }

  const projectId = thread?.project_id ?? null;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col lg:h-dvh">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <Link href="/creator-chats" className="text-sm text-zinc-400 transition hover:text-white">
          ← 全部对话
        </Link>
        <h1 className="truncate text-base font-semibold text-white">
          {thread?.title ?? '新世界对话'}
        </h1>
        {thread?.project_name ? (
          <Badge tone="success">{thread.project_name}</Badge>
        ) : thread ? (
          <Badge>尚未关联项目</Badge>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左侧：会话边栏（Trae 风格） */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line lg:flex">
          <div className="border-b border-line p-3">
            <Button
              className="w-full"
              variant="secondary"
              onClick={() => setCreating((value) => !value)}
            >
              {creating ? '取消新建' : '+ 新建对话'}
            </Button>
            {creating && (
              <form
                className="mt-3 grid gap-3"
                onSubmit={(event) => void create(event)}
              >
                <Select name="project_id" defaultValue="">
                  <option value="">让 AI 自动创建新项目</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
                <Input name="title" placeholder="对话标题（可选）" />
                <Button type="submit" disabled={busy}>
                  {busy ? '创建中…' : '开始对话'}
                </Button>
              </form>
            )}
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="会话列表">
            {threads.length === 0 ? (
              <p className="px-3 py-4 text-xs text-zinc-600">还没有其他对话</p>
            ) : (
              <ul className="grid gap-1">
                {threads.map((item) => {
                  const active = item.id === threadId;
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/creator-chats/${item.id}`}
                        className={`block rounded-lg px-3 py-2.5 transition ${
                          active
                            ? 'bg-white/5 text-white'
                            : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <p className="truncate text-sm font-medium">
                          {item.title ?? '未命名世界对话'}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-600">
                          {item.project_name ? (
                            <span className="truncate">{item.project_name}</span>
                          ) : (
                            <span>新世界</span>
                          )}
                          <span>· {relativeTime(item.updated_at)}</span>
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
          <div className="border-t border-line p-2">
            <Link
              href="/creator-chats"
              className="block rounded-lg px-3 py-2 text-xs text-zinc-500 transition hover:bg-white/5 hover:text-white"
            >
              查看全部对话 →
            </Link>
          </div>
        </aside>

        {/* 中间：对话流 + 输入区 */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!thread && (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState
                title="对话加载失败"
                description={error || '暂时无法连接到服务器，请稍后重试。'}
                action={
                  <div className="flex items-center justify-center gap-3">
                    <Button onClick={() => void load()}>重试</Button>
                    <Link className="text-sm text-accent hover:underline" href="/creator-chats">
                      返回对话列表
                    </Link>
                  </div>
                }
              />
            </div>
          )}
          {thread && (
            <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              {messages.length === 0 && (
                <EmptyState
                  title="开始构建你的世界"
                  description="告诉世界构建者你的创意：题材、主角、想要的世界观。它会不断向你提问，并把确认的设定整理成提案。"
                />
              )}
              {messages.map((message) => {
                const { proposals, applied } = parseProposals(message);
                if (message.role === 'system') {
                  return (
                    <p
                      key={message.id}
                      className="mx-auto rounded-full bg-white/5 px-4 py-1.5 text-center text-xs text-zinc-400"
                    >
                      {message.content}
                    </p>
                  );
                }
                if (message.role === 'user') {
                  return (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-4 py-3 text-sm leading-6 text-ink">
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={message.id} className="flex items-start gap-3">
                    <span
                      className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-white/5 text-sm text-zinc-400"
                      aria-hidden
                    >
                      ◉
                    </span>
                    <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-line bg-panel px-4 py-3">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                        {message.content}
                      </p>
                      {proposals.length > 0 && (
                        <ProposalCard
                          threadId={threadId}
                          messageId={message.id}
                          proposals={proposals}
                          applied={applied}
                          onApplied={handleApplied}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              {sending && (
                <div className="flex items-center gap-2 pl-1 text-sm text-zinc-400">
                  <Spinner label="世界构建者正在思考…" />
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="border-t border-line bg-ink/80 px-5 py-4">
            <div className="mx-auto max-w-3xl">
              <form
                className="flex flex-col gap-2 rounded-2xl border border-line bg-white/5 p-3 transition focus-within:border-accent/50"
                onSubmit={(event) => void send(event)}
              >
                {error && (
                  <p
                    className="rounded-lg bg-red-500/10 p-2.5 text-xs text-red-300"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
                <Textarea
                  className="min-h-20 resize-none border-0 bg-transparent px-1 py-1 focus:ring-0"
                  placeholder="描述你的世界设定，例如：我想做一个玄幻世界，主角是一个凡人修士……"
                  value={input}
                  disabled={sending}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-600">Enter 发送 · Shift+Enter 换行</span>
                  <Button type="submit" disabled={sending || input.trim().length === 0}>
                    {sending ? '发送中…' : '发送'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
            </div>
          )}
        </div>

        {/* 右侧：世界状态面板（Track J3） */}
        <aside className="hidden w-80 shrink-0 border-l border-line xl:flex">
          <WorldStatusPanel projectId={projectId} />
        </aside>
      </div>
    </div>
  );
}
