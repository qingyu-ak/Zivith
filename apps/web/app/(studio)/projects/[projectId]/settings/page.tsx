'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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

type SettingsSection = 'general' | 'appearance' | 'models' | 'memory' | 'usage';

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
    items: [{ id: 'memory', label: '记忆' }],
  },
  {
    group: '数据统计',
    items: [{ id: 'usage', label: '使用统计' }],
  },
];

export default function SettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [section, setSection] = useState<SettingsSection>('general');

  // 允许 #models 等深链；活动栏/账号菜单无 hash 时落在常规。
  useEffect(() => {
    const hash = window.location.hash.slice(1) as SettingsSection;
    if (NAV.some((group) => group.items.some((item) => item.id === hash))) {
      setSection(hash);
    }
  }, []);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-5 sm:flex-row sm:p-8">
      <aside className="w-full shrink-0 sm:w-48">
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
                      onClick={() => setSection(item.id)}
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

/** 常规：真实偏好。变更前确认是产品围栏，锁定开启。 */
function GeneralSection() {
  const [effort, setEffort] = useState<ChatEffort>('balanced');
  const [effortReady, setEffortReady] = useState(false);

  useEffect(() => {
    setEffort(readStoredEffort());
    setEffortReady(true);
  }, []);

  return (
    <div>
      <h2 className="text-base font-semibold text-zinc-900">常规</h2>
      <div className="mt-4 grid gap-3">
        <SettingRow
          title="变更前确认"
          description="写入世界前必须确认提案。这是产品围栏，不能关闭。"
        >
          <LockedOnSwitch label="变更前确认（始终开启）" />
        </SettingRow>
        <SettingRow
          title="默认努力程度"
          description="新对话默认使用的思考深度；对话内可随时切换。"
        >
          <select
            className="w-40 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-400"
            value={effort}
            disabled={!effortReady}
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
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500">浅色 · 固定</span>
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
            在世界工作区右侧查看、删除记忆，展开 L2 核心块溯源。
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

/** 锁定开启的开关：展示为强制开启、不可关闭。 */
function LockedOnSwitch({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="switch"
        aria-checked
        aria-label={label}
        className="relative inline-flex h-5 w-9 items-center rounded-full bg-emerald-500 opacity-70"
      >
        <span className="absolute right-0.5 size-4 rounded-full bg-white shadow" />
      </span>
      <span className="text-[11px] text-zinc-400">强制开启</span>
    </span>
  );
}
