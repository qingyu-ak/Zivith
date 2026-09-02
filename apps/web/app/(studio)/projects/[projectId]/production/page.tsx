'use client';

import { useParams } from 'next/navigation';
import { WorkflowPanel } from '@/components/workflow-panel';
import { GenerationQueuePanel } from '@/components/generation-queue-panel';

/** 制作（/production）：工作流编排 + 生成队列，承接原项目页面板（只搬不移逻辑） */
export default function ProductionPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">制作</h1>
        <p className="mt-2 text-zinc-400">工作流编排与生成队列。</p>
      </header>
      <div className="grid gap-6">
        <WorkflowPanel projectId={projectId} onArtifactsChanged={async () => {}} />
        <GenerationQueuePanel projectId={projectId} />
      </div>
    </div>
  );
}
