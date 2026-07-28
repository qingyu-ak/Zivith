'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Spinner } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import type { GenerationTaskDTO } from '@/lib/types';

const statusLabels: Record<GenerationTaskDTO['status'], string> = {
  queued: '排队中',
  running: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export function GenerationQueuePanel({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<GenerationTaskDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const items = await api<GenerationTaskDTO[]>(
        `/projects/${projectId}/generation-tasks?limit=12`,
      );
      setTasks(items);
      setError('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 3000);
    return () => clearInterval(timer);
  }, [load]);

  async function cancelTask(taskId: string) {
    if (!confirm('确定取消该视频生成任务吗？')) return;
    setCancellingId(taskId);
    setError('');
    setNotice('');
    try {
      await api(`/projects/${projectId}/generation-tasks/${taskId}/cancel`, {
        method: 'POST',
        body: {},
      });
      setNotice('已取消任务（若供应商侧已开始，可能仍会短暂计费）');
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setCancellingId(null);
    }
  }

  const active = tasks.some((task) => task.status === 'queued' || task.status === 'running');

  return (
    <Card className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-accent">Phase 2</p>
          <h2 className="mt-1 text-lg font-semibold">生成队列</h2>
          <p className="mt-1 text-sm text-zinc-500">
            视频任务经队列执行；排队中可取消，生成中尽力取消。
          </p>
        </div>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          刷新
        </Button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>
      )}

      {loading && tasks.length === 0 ? (
        <div className="mt-5">
          <Spinner label="加载生成任务…" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="mt-5 text-sm text-zinc-500">尚无视频生成任务。</p>
      ) : (
        <div className="mt-5 grid gap-2">
          {active && <p className="text-xs text-amber-200">有任务进行中，列表每 3 秒自动刷新。</p>}
          {tasks.map((task) => {
            const payload = task.payload ?? {};
            const shotId = typeof payload.shot_id === 'string' ? payload.shot_id.slice(0, 8) : '—';
            const canCancel = task.status === 'queued' || task.status === 'running';
            const failDetail =
              typeof task.result?.message === 'string'
                ? task.result.message
                : task.error_code
                  ? task.error_code
                  : '';
            return (
              <div
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-ink px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">镜头 {shotId}…</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {task.provider ?? 'mock'} · 尝试 {task.attempts}
                  </p>
                  {task.status === 'failed' && failDetail && (
                    <p className="mt-1 text-xs text-red-300/80 break-words">{failDetail}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      task.status === 'completed'
                        ? 'success'
                        : task.status === 'running' || task.status === 'queued'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {statusLabels[task.status]}
                  </Badge>
                  {canCancel && (
                    <Button
                      variant="ghost"
                      disabled={cancellingId === task.id}
                      onClick={() => void cancelTask(task.id)}
                    >
                      {cancellingId === task.id ? '取消中…' : '取消'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
