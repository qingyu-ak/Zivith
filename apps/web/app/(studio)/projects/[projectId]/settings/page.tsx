'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { IconArrowLeft } from '@/components/nav-icons';
import { STUDIO_SURFACE, navigationHistoryFor } from '@/lib/navigation-history';
import { clearSettingsReturn, readSettingsReturn } from '@/lib/settings-return';
import { ModelSettings } from '@/components/model-settings';
import { ModelVisibilityList } from '@/components/model-visibility';
import { UsageSummaryCard } from '@/components/usage-summary-card';
import {
  CHAT_EFFORT_HINT,
  CHAT_EFFORT_LABEL,
  asChatEffort,
  readStoredEffort,
  writeStoredEffort,
  type ChatEffort,
} from '@/lib/chat-composer';
import {
  AGENT_WRITE_MODE_HINT,
  AGENT_WRITE_MODE_LABEL,
  AGENT_WRITE_MODES,
  asAgentWriteMode,
  readStoredWriteMode,
  writeStoredWriteMode,
  type AgentWriteMode,
} from '@/lib/agent-write-mode';
import { api } from '@/lib/api';
import type { WriteLogItemDTO } from '@/lib/types';

type SettingsSection = 'general' | 'appearance' | 'models' | 'memory' | 'writes' | 'usage';

function parseSection(raw: string | null | undefined): SettingsSection | null {
  if (
    raw === 'general' ||
    raw === 'appearance' ||
    raw === 'models' ||
    raw === 'memory' ||
    raw === 'writes' ||
    raw === 'usage'
  ) {
    return raw;
  }
  return null;
}

function sectionFromUrl(): SettingsSection {
  if (typeof window === 'undefined') return 'general';
  return (
    parseSection(new URLSearchParams(window.location.search).get('section')) ??
    parseSection(window.location.hash.replace(/^#/, '')) ??
    'general'
  );
}

const NAV: Array<{ group: string; items: Array<{ id: SettingsSection; label: string }> }> = [
  {
    group: '基础设置',
    items: [
      { id: 'general', label: '常规' },
      { id: 'appearance', label: '外观' },
      { id: 'models', label: '模型设置' },
    ],
  },
  {
    group: 'Agent 能力',
    items: [
      { id: 'memory', label: '记忆' },
      { id: 'writes', label: '修改记录' },
    ],
  },
  {
    group: '数据统计',
    items: [{ id: 'usage', label: '使用统计' }],
  },
];

export default function SettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [section, setSection] = useState<SettingsSection>('general');

  // 深链：?section=models 或 #models。账号菜单无参数时落在常规。
  useEffect(() => {
    const apply = () => setSection(sectionFromUrl());
    apply();
    window.addEventListener('hashchange', apply);
    window.addEventListener('popstate', apply);
    return () => {
      window.removeEventListener('hashchange', apply);
      window.removeEventListener('popstate', apply);
    };
  }, []);

  function selectSection(id: SettingsSection) {
    setSection(id);
    router.replace(`/projects/${projectId}/settings?section=${id}`, { scroll: false });
  }

  function leaveSettings() {
    const origin = readSettingsReturn();
    if (origin) {
      clearSettingsReturn();
      router.push(origin);
      return;
    }
    const previous = navigationHistoryFor(STUDIO_SURFACE).backLeaving((path) =>
      path.includes('/settings'),
    );
    router.push(previous ?? `/projects/${projectId}/world`);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-5 sm:flex-row sm:p-8">
      <aside className="w-full shrink-0 sm:w-48">
        <button
          type="button"
          className="mb-3 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
          onClick={leaveSettings}
        >
          <IconArrowLeft className="size-4" />
          返回
        </button>
        <h1 className="text-lg font-semibold text-zinc-900">设置</h1>
        <nav className="mt-4 grid gap-4" aria-label="设置分组">
          {NAV.map((group) => (
            <div key={group.group}>
              <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                {group.group}
              </p>
              <ul className="grid gap-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={section === item.id ? 'page' : undefined}
                      className={`w-full rounded-lg px-2 py-1.5 text-left text-sm transition ${
                        section === item.id
                          ? 'bg-zinc-100 font-medium text-zinc-900'
                          : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                      }`}
                      onClick={() => selectSection(item.id)}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <section className="min-w-0 flex-1">
        {section === 'general' ? <GeneralSection /> : null}
        {section === 'appearance' ? <AppearanceSection /> : null}
        {section === 'models' ? (
          <div className="grid gap-6">
            <ModelVisibilityList />
            <div>
              <h2 className="text-base font-semibold text-zinc-900">API Keys 与供应商</h2>
              <p className="mt-1 text-sm text-zinc-500">
                供应商密钥、自定义端点、模型列表与媒体槽位。自定义端点只在当前 API 进程内保存。
              </p>
              <div className="mt-4">
                <ModelSettings />
              </div>
            </div>
          </div>
        ) : null}
        {section === 'memory' ? <MemorySection projectId={projectId} /> : null}
        {section === 'writes' ? <WritesSection projectId={projectId} /> : null}
        {section === 'usage' ? (
          <div>
            <h2 className="text-base font-semibold text-zinc-900">使用统计</h2>
            <p className="mt-1 text-sm text-zinc-500">当前项目的调用次数与估算成本。</p>
            <div className="mt-4">
              <UsageSummaryCard projectId={projectId} />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** 常规：写入策略与默认努力程度。 */
function GeneralSection() {
  const [effort, setEffort] = useState<ChatEffort>('balanced');
  const [writeMode, setWriteMode] = useState<AgentWriteMode>('confirm');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setEffort(readStoredEffort());
    setWriteMode(readStoredWriteMode());
    setReady(true);
  }, []);

  return (
    <div>
      <h2 className="text-base font-semibold text-zinc-900">常规</h2>
      <div className="mt-4 grid gap-3">
        <SettingRow
          title="Agent 写入模式"
          description="Agent 可以改 IP Core 与 Studio 里的世界实体。写入会留下提案记录；删除项目等高危操作始终询问。"
        >
          <select
            className="w-44 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-400"
            value={writeMode}
            disabled={!ready}
            aria-label="Agent 写入模式"
            onChange={(event) => {
              const next = asAgentWriteMode(event.target.value);
              setWriteMode(next);
              writeStoredWriteMode(next);
            }}
          >
            {AGENT_WRITE_MODES.map((item) => (
              <option key={item} value={item}>
                {AGENT_WRITE_MODE_LABEL[item]}
              </option>
            ))}
          </select>
        </SettingRow>
        <p className="-mt-1 px-1 text-xs leading-5 text-zinc-500">
          {AGENT_WRITE_MODE_HINT[writeMode]} 记忆冲突仍以内联卡确认，不会随写入模式自动覆盖。
        </p>
        <SettingRow
          title="默认努力程度"
          description="新对话默认使用的上下文深度；对话内可随时切换。"
        >
          <select
            className="w-40 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-400"
            value={effort}
            disabled={!ready}
            aria-label="默认努力程度"
            onChange={(event) => {
              const next = asChatEffort(event.target.value);
              setEffort(next);
              writeStoredEffort(next);
            }}
          >
            {(['fast', 'balanced', 'deep'] as const).map((item) => (
              <option key={item} value={item}>
                {CHAT_EFFORT_LABEL[item]} · {CHAT_EFFORT_HINT[item]}
              </option>
            ))}
          </select>
        </SettingRow>
      </div>
    </div>
  );
}

/** 外观：只列真实存在的固定项，不做假开关。 */
function AppearanceSection() {
  return (
    <div>
      <h2 className="text-base font-semibold text-zinc-900">外观</h2>
      <div className="mt-4 grid gap-3">
        <SettingRow title="主题" description="Chat 与 Studio 均为浅色，暂不提供深色主题。">
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500">
            浅色 · 固定
          </span>
        </SettingRow>
        <SettingRow title="代码主题" description="Zivith 不含代码编辑器，无代码高亮设置。">
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500">不适用</span>
        </SettingRow>
      </div>
    </div>
  );
}

/** Agent 能力 · 记忆：指向已有能力，不重做引擎。 */
function MemorySection({ projectId }: { projectId: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-zinc-900">记忆</h2>
      <p className="mt-1 text-sm text-zinc-500">
        对话中的事实会自动归档为记忆。与已有设定矛盾的内容不会自动写入，会以内联确认卡出现在对话里。
      </p>
      <ul className="mt-4 grid gap-2 text-sm text-zinc-700">
        <li className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="font-medium">冲突确认卡</p>
          <p className="mt-1 text-sm text-zinc-500">
            在 Creator Chat 对话流内出现：对比新旧内容，选「保留新卡」或「保留已有卡」。
          </p>
        </li>
        <li className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="font-medium">记忆面板（L1 原子 / L2 核心块）</p>
          <p className="mt-1 text-sm text-zinc-500">
            选中角色后，右侧「全书档案」可改扮演会读的记忆（短事实可编辑/新增）。下方记忆面板也能编辑
            L1/L2。
          </p>
          <Link
            href={`/projects/${projectId}/world`}
            className="mt-2 inline-block text-sm text-[#4d6bfe] hover:underline"
          >
            打开世界工作区 →
          </Link>
        </li>
      </ul>
    </div>
  );
}

function WritesSection({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<WriteLogItemDTO[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void api<{ items: WriteLogItemDTO[] }>(`/world/projects/${projectId}/write-log`)
      .then((value) => {
        if (!cancelled) setItems(value.items ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setError('暂时无法读取修改记录');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <div>
      <h2 className="text-base font-semibold text-zinc-900">修改记录</h2>
      <p className="mt-1 text-sm text-zinc-500">
        已写入世界的提案会留在这里，也可在对应对话里查看。实体修订会写入历史；按修订一键回退尚未做成按钮。删除项目始终确认，且为软删。
      </p>
      {error ? (
        <p className="mt-4 text-sm text-red-500" role="alert">
          {error}
        </p>
      ) : null}
      {items === null ? (
        <p className="mt-4 text-sm text-zinc-400">加载中…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">还没有写入记录。确认或自动落库后会出现在这里。</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <p className="text-sm text-zinc-800">{item.summary || '世界写入'}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {new Date(item.created_at).toLocaleString('zh-CN')}
                {item.thread_title ? ` · ${item.thread_title}` : ''}
              </p>
              <Link
                href={`/creator-chats/${item.thread_id}`}
                className="mt-2 inline-block text-sm text-[#4d6bfe] hover:underline"
              >
                在对话中查看 →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-xl border border-zinc-200 bg-white px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-900">{title}</p>
        <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
