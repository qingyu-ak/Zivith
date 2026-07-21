'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Badge, Button, Card, Field, Spinner, Textarea } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import { getFormText } from '@/lib/form-data';
import type {
  OutputDTO,
  ShotDTO,
  VisualRequirementDTO,
  WorkflowMediaDTO,
  WorkflowRunDTO,
  WorkflowStepName,
} from '@/lib/types';

const stepLabels: Record<WorkflowStepName, string> = {
  story: '故事生成',
  story_review: '故事审核',
  scene: '场景拆分',
  scene_review: '场景审核',
  visual_prep: '视觉准备',
  visual_assets_review: '视觉资产审核',
  shot: '镜头设计',
  shot_review: '镜头审核',
  prompt: '提示词生成',
  prompt_review: '提示词审核',
  video: 'Mock 视频生成',
  video_review: '视频审核',
};

const statusLabels = {
  queued: '等待中',
  running: '进行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stepOutput(run: WorkflowRunDTO, name: WorkflowStepName): Record<string, unknown> {
  return run.steps.find((step) => step.name === name)?.output ?? {};
}

interface VisualReviewItem {
  requirement: VisualRequirementDTO;
  media?: WorkflowMediaDTO;
}

interface PromptReviewItem {
  shot: ShotDTO;
  promptId: string;
}

interface VideoReviewItem {
  shot: ShotDTO;
  output?: OutputDTO;
}

export function WorkflowPanel({
  projectId,
  onArtifactsChanged,
}: {
  projectId: string;
  onArtifactsChanged: () => Promise<void>;
}) {
  const [run, setRun] = useState<WorkflowRunDTO | null>(null);
  const [showStart, setShowStart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [visualItems, setVisualItems] = useState<VisualReviewItem[]>([]);
  const [promptItems, setPromptItems] = useState<PromptReviewItem[]>([]);
  const [videoItems, setVideoItems] = useState<VideoReviewItem[]>([]);

  const loadLatest = useCallback(async () => {
    try {
      const runs = await api<WorkflowRunDTO[]>(`/projects/${projectId}/workflows?limit=1`);
      setRun(runs[0] ?? null);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [projectId]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  useEffect(() => {
    if (!run) return;
    const review = run.state.awaiting_review;
    setVisualItems([]);
    setPromptItems([]);
    setVideoItems([]);
    if (!review || !['visual_assets_review', 'prompt_review', 'video_review'].includes(review)) {
      return;
    }

    let active = true;
    setLoadingArtifacts(true);
    const load = async () => {
      if (review === 'visual_assets_review') {
        const sceneIds = stringArray(stepOutput(run, 'scene').scene_ids);
        const groups = await Promise.all(
          sceneIds.map((sceneId) =>
            api<VisualRequirementDTO[]>(`/scenes/${sceneId}/visual-requirements`),
          ),
        );
        const requirements = groups.flat();
        const items = await Promise.all(
          requirements.map(async (requirement) => {
            const mediaId = requirement.candidate_media_ids[0];
            const media = mediaId ? await api<WorkflowMediaDTO>(`/media/${mediaId}`) : undefined;
            return { requirement, media };
          }),
        );
        if (active) setVisualItems(items);
      } else if (review === 'prompt_review') {
        const output = stepOutput(run, 'prompt');
        const shotIds = stringArray(output.shot_ids);
        const promptIds = stringArray(output.prompt_version_ids);
        const shots = await Promise.all(shotIds.map((id) => api<ShotDTO>(`/shots/${id}`)));
        if (active) {
          setPromptItems(
            shots.flatMap((shot, index) =>
              promptIds[index] ? [{ shot, promptId: promptIds[index] }] : [],
            ),
          );
        }
      } else {
        const output = stepOutput(run, 'video');
        const shotIds = stringArray(output.shot_ids);
        const outputIds = new Set(stringArray(output.output_ids));
        const items = await Promise.all(
          shotIds.map(async (id) => {
            const [shot, outputs] = await Promise.all([
              api<ShotDTO>(`/shots/${id}`),
              api<OutputDTO[]>(`/shots/${id}/outputs`),
            ]);
            return { shot, output: outputs.find((item) => outputIds.has(item.id)) };
          }),
        );
        if (active) setVideoItems(items);
      }
    };
    void load()
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setLoadingArtifacts(false);
      });
    return () => {
      active = false;
    };
  }, [run]);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const created = await api<WorkflowRunDTO>('/workflows/story-to-video', {
        method: 'POST',
        body: {
          project_id: projectId,
          brief: getFormText(form, 'brief'),
          automation: {
            story: 'assisted',
            scene: 'assisted',
            visual_assets: 'assisted',
            shot: 'assisted',
            prompt: 'assisted',
            video: 'assisted',
          },
        },
      });
      setRun(created);
      setShowStart(false);
      await onArtifactsChanged();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function approveRequiredArtifacts(review: WorkflowStepName) {
    if (!run) return;
    if (review === 'visual_assets_review') {
      for (const { requirement } of visualItems) {
        if (requirement.status === 'approved' || !requirement.required) continue;
        const mediaId = requirement.candidate_media_ids[0];
        if (!mediaId) throw new Error('视觉需求缺少候选图片');
        await api(`/scenes/${requirement.scene_id}/visual-requirements/${requirement.id}/approve`, {
          method: 'POST',
          body: { media_id: mediaId },
        });
      }
    }
    if (review === 'prompt_review') {
      for (const { shot, promptId } of promptItems) {
        await api(`/shots/${shot.id}/prompts/${promptId}/approve`, {
          method: 'POST',
          body: {},
        });
      }
    }
  }

  async function submitReview(action: 'approve' | 'retry_with_feedback') {
    if (!run?.state.awaiting_review) return;
    const review = run.state.awaiting_review;
    setBusy(true);
    setError('');
    try {
      if (action === 'approve') await approveRequiredArtifacts(review);
      const updated = await api<WorkflowRunDTO>(`/workflows/${run.id}/review`, {
        method: 'POST',
        body: {
          step: review,
          action,
          ...(action === 'retry_with_feedback' ? { feedback } : {}),
        },
      });
      setRun(updated);
      setFeedback('');
      await onArtifactsChanged();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!run || !window.confirm('确定取消当前 AI 工作流吗？')) return;
    setBusy(true);
    setError('');
    try {
      await api(`/workflows/${run.id}/cancel`, { method: 'POST', body: {} });
      await loadLatest();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const review = run?.state.awaiting_review;
  const terminal = run && ['completed', 'failed', 'cancelled'].includes(run.status);

  return (
    <Card className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-accent">Phase 2</p>
          <h2 className="mt-1 text-lg font-semibold">AI 故事转视频工作流</h2>
        </div>
        <div className="flex gap-2">
          {run && !terminal && (
            <Button variant="danger" disabled={busy} onClick={() => void cancel()}>
              取消工作流
            </Button>
          )}
          <Button
            variant={showStart ? 'ghost' : 'secondary'}
            disabled={busy}
            onClick={() => setShowStart((value) => !value)}
          >
            {showStart ? '收起' : terminal || !run ? '启动新工作流' : '重新开始'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      {showStart && (
        <form className="mt-5 grid gap-4" onSubmit={(event) => void start(event)}>
          <Field label="创意简报" hint="至少 10 个字，描述主题、角色、冲突和期望风格。">
            <Textarea
              name="brief"
              required
              minLength={10}
              autoFocus
              placeholder="例如：一台维护机器人在废弃城市中发现最后一颗种子……"
            />
          </Field>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Agent 正在生成…' : '启动 AI Pipeline'}
            </Button>
          </div>
        </form>
      )}

      {run && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
            {run.steps.map((step) => (
              <div
                key={step.id}
                className={`rounded-lg border p-3 text-xs ${
                  step.status === 'completed'
                    ? 'border-accent/30 bg-accent/5 text-accent'
                    : step.status === 'running'
                      ? 'border-amber-400/30 bg-amber-400/5 text-amber-300'
                      : 'border-line text-zinc-500'
                }`}
              >
                <p className="font-medium">{stepLabels[step.name]}</p>
                <p className="mt-1 opacity-70">{statusLabels[step.status]}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-3 border-t border-line pt-5">
            <Badge
              tone={
                run.status === 'completed'
                  ? 'success'
                  : run.status === 'running'
                    ? 'warning'
                    : 'neutral'
              }
            >
              {statusLabels[run.status]}
            </Badge>
            <p className="text-sm text-zinc-400">
              {review ? `等待你完成“${stepLabels[review]}”` : '工作流状态已同步'}
            </p>
          </div>

          {loadingArtifacts && <Spinner label="正在加载审核材料…" />}

          {review === 'visual_assets_review' && !loadingArtifacts && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visualItems.map(({ requirement, media }) => (
                <div key={requirement.id} className="rounded-lg border border-line bg-ink p-3">
                  {(media?.access_url || media?.url) && (
                    <img
                      className="mb-3 aspect-video w-full rounded-md object-cover"
                      src={media.access_url || media.url || ''}
                      alt={requirement.reason}
                    />
                  )}
                  <p className="text-sm font-medium">
                    {requirement.asset_type === 'character' ? '角色' : '地点'} ·{' '}
                    {requirement.variant_key}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{requirement.reason}</p>
                </div>
              ))}
            </div>
          )}

          {review === 'prompt_review' && !loadingArtifacts && (
            <div className="mt-5 grid gap-3">
              {promptItems.map(({ shot }) => (
                <div key={shot.id} className="rounded-lg border border-line bg-ink p-4">
                  <p className="text-sm font-medium">{shot.label || '未命名镜头'}</p>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">
                    {shot.prompt?.positive || '暂无正向提示词'}
                  </p>
                  {shot.prompt?.negative && (
                    <p className="mt-2 text-xs leading-5 text-red-300/70">
                      Negative: {shot.prompt.negative}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {review === 'video_review' && !loadingArtifacts && (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {videoItems.map(({ shot, output }) => (
                <div key={shot.id} className="rounded-lg border border-line bg-ink p-3">
                  {output?.video_url && (
                    <video className="aspect-video w-full rounded-md bg-black" controls src={output.video_url} />
                  )}
                  <p className="mt-3 text-sm font-medium">{shot.label || '未命名镜头'}</p>
                </div>
              ))}
            </div>
          )}

          {review && (
            <div className="mt-5 grid gap-3 border-t border-line pt-5">
              <Textarea
                className="min-h-20"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="如需重新生成，请填写修改意见"
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={busy || loadingArtifacts}
                  onClick={() => void submitReview('approve')}
                >
                  {busy ? '正在处理…' : '审核通过并继续'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || !feedback.trim()}
                  onClick={() => void submitReview('retry_with_feedback')}
                >
                  按反馈重新生成
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
