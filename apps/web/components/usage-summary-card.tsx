'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Card, Spinner } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';

interface UsageSummary {
  project_id: string;
  total_calls: number;
  total_estimated_cost: number | null;
  by_task_type: Array<{
    task_type: string;
    calls: number;
    quantity: number;
    unit: string;
    estimated_cost: number;
  }>;
  by_provider: Array<{
    provider: string;
    calls: number;
    quantity: number;
    estimated_cost: number;
  }>;
}

const taskLabels: Record<string, string> = {
  llm: 'LLM',
  llm_story: '故事 LLM',
  llm_scene: '场景 LLM',
  llm_visual_trait: '视觉特征 LLM',
  image_generate: '图像生成',
  video_generate: '视频生成',
  audio_tts: '语音合成',
};

export function UsageSummaryCard({ projectId }: { projectId: string }) {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const value = await api<UsageSummary>(`/projects/${projectId}/usage`);
      setSummary(value);
      setError('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-accent">用量</p>
          <h2 className="mt-1 text-lg font-semibold">生成用量汇总</h2>
          <p className="mt-1 text-sm text-zinc-500">记录每次 LLM / 图 / 视 / 音调用（含失败）。</p>
        </div>
        <button
          type="button"
          className="text-sm text-accent hover:underline"
          onClick={() => void load()}
        >
          刷新
        </button>
      </div>
      {loading && (
        <div className="mt-4">
          <Spinner label="正在加载用量…" />
        </div>
      )}
      {error && (
        <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && summary && (
        <div className="mt-4 grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">调用 {summary.total_calls} 次</Badge>
            {summary.total_estimated_cost != null && summary.total_estimated_cost > 0 && (
              <Badge tone="neutral">估算成本 {summary.total_estimated_cost.toFixed(4)}</Badge>
            )}
          </div>
          {summary.by_task_type.length === 0 ? (
            <p className="text-sm text-zinc-500">
              尚无用量记录。运行工作流或生成媒体后会出现在这里。
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {summary.by_task_type.map((row) => (
                <div
                  key={row.task_type}
                  className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
                >
                  <p className="font-medium">{taskLabels[row.task_type] ?? row.task_type}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {row.calls} 次 · {row.quantity.toFixed(row.unit === 'tokens' ? 0 : 2)}{' '}
                    {row.unit}
                  </p>
                </div>
              ))}
            </div>
          )}
          {summary.by_provider.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {summary.by_provider.map((row) => (
                <Badge key={row.provider} tone="neutral">
                  {row.provider} · {row.calls}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
