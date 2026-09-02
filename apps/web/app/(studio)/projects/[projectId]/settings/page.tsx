'use client';

import { useParams } from 'next/navigation';
import { ProviderPanel } from '@/components/provider-panel';
import { UsageSummaryCard } from '@/components/usage-summary-card';

/** 设置（/settings）：提供商配置 + 用量统计，承接原项目页面板（只搬不移逻辑） */
export default function SettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">设置</h1>
        <p className="mt-2 text-zinc-400">提供商配置与用量统计。</p>
      </header>
      <div className="grid gap-6">
        <ProviderPanel />
        <UsageSummaryCard projectId={projectId} />
      </div>
    </div>
  );
}
