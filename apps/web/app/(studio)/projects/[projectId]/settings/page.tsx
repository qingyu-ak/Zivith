'use client';

import { useParams } from 'next/navigation';
import { ModelSettings } from '@/components/model-settings';
import { UsageSummaryCard } from '@/components/usage-summary-card';

export default function SettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <div className="mx-auto max-w-6xl p-5 sm:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">模型设置</h1>
        <p className="mt-2 text-sm text-zinc-500">
          左侧选供应商，右侧填密钥和调用时的 model 名。自定义端点只在当前 API 进程内保存。
        </p>
      </header>
      <ModelSettings />
      <div className="mt-8">
        <UsageSummaryCard projectId={projectId} />
      </div>
    </div>
  );
}
