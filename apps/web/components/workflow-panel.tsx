'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Field, Spinner, Textarea } from '@zivith/ui';
import { api, errorMessage } from '@/lib/api';
import { getFormText } from '@/lib/form-data';
import type {
  OutputDTO,
  PromptVersionDTO,
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
  issue?: string;
}

interface PromptReviewItem {
  shot: ShotDTO;
  prompt: PromptVersionDTO;
  issue?: string;
  warning?: string;
}

interface VideoReviewItem {
  shot: ShotDTO;
  output?: OutputDTO;
  issue?: string;
}

function canApproveArtifacts(
  review: WorkflowStepName | null | undefined,
  visualItems: VisualReviewItem[],
  promptItems: PromptReviewItem[],
  videoItems: VideoReviewItem[],
): boolean {
  if (!review) return false;
  if (review === 'visual_assets_review') {
    if (visualItems.length === 0) return false;
    return visualItems.every(
      (item) =>
        !item.requirement.required ||
        item.requirement.status === 'approved' ||
        Boolean(item.media && item.requirement.candidate_media_ids[0] && !item.issue),
    );
  }
  if (review === 'prompt_review') {
    return promptItems.length > 0 && promptItems.every((item) => !item.issue);
  }
  if (review === 'video_review') {
    return videoItems.length > 0 && videoItems.every((item) => !item.issue && item.output);
  }
  return true;
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
  const [artifactWarning, setArtifactWarning] = useState('');
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
    setArtifactWarning('');
    if (!review || !['visual_assets_review', 'prompt_review', 'video_review'].includes(review)) {
      return;
    }

    let active = true;
    setLoadingArtifacts(true);
    const load = async () => {
      if (review === 'visual_assets_review') {
        const sceneIds = stringArray(stepOutput(run, 'scene').scene_ids);
        if (sceneIds.length === 0) {
          throw new Error('视觉资产审核材料缺失：工作流未记录场景列表');
        }
        const groups = await Promise.all(
          sceneIds.map((sceneId) =>
            api<VisualRequirementDTO[]>(`/scenes/${sceneId}/visual-requirements`),
          ),
        );
        const requirements = groups.flat();
        if (requirements.length === 0) {
          throw new Error('视觉资产审核材料为空：未找到任何角色/地点视觉需求');
        }
        const items = await Promise.all(
          requirements.map(async (requirement) => {
            const mediaId = requirement.candidate_media_ids[0];
            if (requirement.required && !mediaId) {
              return {
                requirement,
                issue: '必需视觉需求缺少候选图片，无法通过审核',
              } satisfies VisualReviewItem;
            }
            if (!mediaId) {
              return { requirement } satisfies VisualReviewItem;
            }
            try {
              const media = await api<WorkflowMediaDTO>(`/media/${mediaId}`);
              return { requirement, media } satisfies VisualReviewItem;
            } catch {
              return {
                requirement,
                issue: `候选图片 ${mediaId.slice(0, 8)}… 无法加载`,
              } satisfies VisualReviewItem;
            }
          }),
        );
        const blocked = items.filter((item) => item.issue);
        if (active) {
          setVisualItems(items);
          if (blocked.length > 0) {
            setArtifactWarning(
              `${blocked.length} 项视觉需求材料不完整，请修复后再点“审核通过并继续”`,
            );
          }
        }
      } else if (review === 'prompt_review') {
        const output = stepOutput(run, 'prompt');
        const shotIds = stringArray(output.shot_ids);
        const promptIds = stringArray(output.prompt_version_ids);
        if (shotIds.length === 0) {
          throw new Error('提示词审核材料缺失：工作流未记录镜头列表');
        }
        if (shotIds.length !== promptIds.length) {
          throw new Error(
            `提示词审核材料不完整：镜头 ${shotIds.length} 个，提示词版本 ${promptIds.length} 个`,
          );
        }
        const items = await Promise.all(
          shotIds.map(async (shotId, index) => {
            const promptId = promptIds[index]!;
            const [shot, versions] = await Promise.all([
              api<ShotDTO>(`/shots/${shotId}`),
              api<PromptVersionDTO[]>(`/shots/${shotId}/prompts`),
            ]);
            const prompt = versions.find((version) => version.id === promptId);
            if (!prompt) {
              return {
                shot,
                prompt: {
                  id: promptId,
                  shot_id: shotId,
                  positive: '',
                  source: 'missing',
                  created_at: '',
                },
                issue: `找不到提示词版本 ${promptId.slice(0, 8)}…`,
              } satisfies PromptReviewItem;
            }
            const shotPositive = shot.prompt?.positive?.trim() ?? '';
            const versionPositive = prompt.positive.trim();
            if (shotPositive && versionPositive && shotPositive !== versionPositive) {
              return {
                shot,
                prompt,
                issue: undefined,
                warning: '镜头当前提示词与待审版本不一致；通过审核后将以该版本覆盖镜头提示词',
              } satisfies PromptReviewItem;
            }
            return { shot, prompt } satisfies PromptReviewItem;
          }),
        );
        const blocked = items.filter((item) => item.issue);
        const warned = items.filter((item) => item.warning);
        if (active) {
          setPromptItems(items);
          if (blocked.length > 0) {
            setArtifactWarning(`${blocked.length} 条提示词材料异常，请核对后再继续`);
          } else if (warned.length > 0) {
            setArtifactWarning(
              `${warned.length} 条提示词与镜头字段不一致；审核通过后将覆盖为待审版本`,
            );
          }
        }
      } else {
        const output = stepOutput(run, 'video');
        const shotIds = stringArray(output.shot_ids);
        const outputIds = stringArray(output.output_ids);
        if (shotIds.length === 0) {
          throw new Error('视频审核材料缺失：工作流未记录镜头列表');
        }
        if (shotIds.length !== outputIds.length) {
          throw new Error(
            `视频审核材料不完整：镜头 ${shotIds.length} 个，输出 ${outputIds.length} 个`,
          );
        }
        const outputIdSet = new Set(outputIds);
        const items = await Promise.all(
          shotIds.map(async (id, index) => {
            const expectedOutputId = outputIds[index];
            const [shot, outputs] = await Promise.all([
              api<ShotDTO>(`/shots/${id}`),
              api<OutputDTO[]>(`/shots/${id}/outputs`),
            ]);
            const matched =
              outputs.find((item) => item.id === expectedOutputId) ??
              outputs.find((item) => outputIdSet.has(item.id));
            if (!matched) {
              return {
                shot,
                issue: `缺少工作流产出的视频 ${expectedOutputId?.slice(0, 8) ?? ''}…`,
              } satisfies VideoReviewItem;
            }
            if (!matched.video_url) {
              return {
                shot,
                output: matched,
                issue: '视频输出缺少可播放地址',
              } satisfies VideoReviewItem;
            }
            return { shot, output: matched } satisfies VideoReviewItem;
          }),
        );
        const blocked = items.filter((item) => item.issue);
        if (active) {
          setVideoItems(items);
          if (blocked.length > 0) {
            setArtifactWarning(`${blocked.length} 条视频材料异常，请核对后再继续`);
          }
        }
      }
    };
    void load()
      .catch((reason) => {
        if (active) {
          setError(errorMessage(reason));
          setArtifactWarning('');
        }
      })
      .finally(() => {
        if (active) setLoadingArtifacts(false);
      });
    return () => {
      active = false;
    };
  }, [run]);

  const approveReady = useMemo(
    () => canApproveArtifacts(run?.state.awaiting_review, visualItems, promptItems, videoItems),
    [run?.state.awaiting_review, visualItems, promptItems, videoItems],
  );

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setArtifactWarning('');
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
    if (review === 'visual_assets_review') {
      for (const { requirement, media, issue } of visualItems) {
        if (requirement.status === 'approved' || !requirement.required) continue;
        if (issue || !media) {
          throw new Error(issue ?? `视觉需求「${requirement.variant_key}」缺少候选图片`);
        }
        const mediaId = requirement.candidate_media_ids[0];
        if (!mediaId) throw new Error(`视觉需求「${requirement.variant_key}」缺少候选图片`);
        await api(`/scenes/${requirement.scene_id}/visual-requirements/${requirement.id}/approve`, {
          method: 'POST',
          body: { media_id: mediaId },
        });
      }
    }
    if (review === 'prompt_review') {
      for (const { shot, prompt, issue } of promptItems) {
        if (issue) throw new Error(issue);
        await api(`/shots/${shot.id}/prompts/${prompt.id}/approve`, {
          method: 'POST',
          body: {},
        });
      }
    }
  }

  async function submitReview(action: 'approve' | 'retry_with_feedback') {
    if (!run?.state.awaiting_review) return;
    const review = run.state.awaiting_review;
    if (action === 'approve' && !approveReady) {
      setError(artifactWarning || '审核材料尚未就绪，无法通过');
      return;
    }
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
      setArtifactWarning('');
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
      {artifactWarning && !error && (
        <p className="mt-4 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200" role="status">
          {artifactWarning}
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
              {visualItems.length === 0 ? (
                <p className="text-sm text-zinc-500 sm:col-span-2 lg:col-span-3">
                  没有可展示的视觉审核材料。
                </p>
              ) : (
                visualItems.map(({ requirement, media, issue }) => (
                  <div
                    key={requirement.id}
                    className={`rounded-lg border bg-ink p-3 ${
                      issue ? 'border-amber-400/40' : 'border-line'
                    }`}
                  >
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
                    {issue && <p className="mt-2 text-xs text-amber-300">{issue}</p>}
                  </div>
                ))
              )}
            </div>
          )}

          {review === 'prompt_review' && !loadingArtifacts && (
            <div className="mt-5 grid gap-3">
              {promptItems.length === 0 ? (
                <p className="text-sm text-zinc-500">没有可展示的提示词审核材料。</p>
              ) : (
                promptItems.map(({ shot, prompt, issue, warning }) => (
                  <div
                    key={prompt.id}
                    className={`rounded-lg border bg-ink p-4 ${
                      issue ? 'border-amber-400/40' : 'border-line'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{shot.label || '未命名镜头'}</p>
                      <ShotEditorLink projectId={projectId} shot={shot} />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">
                      {prompt.positive || '暂无正向提示词'}
                    </p>
                    {prompt.negative && (
                      <p className="mt-2 text-xs leading-5 text-red-300/70">
                        Negative: {prompt.negative}
                      </p>
                    )}
                    {issue && <p className="mt-2 text-xs text-amber-300">{issue}</p>}
                    {!issue && warning && (
                      <p className="mt-2 text-xs text-amber-200/80">{warning}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {review === 'video_review' && !loadingArtifacts && (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {videoItems.length === 0 ? (
                <p className="text-sm text-zinc-500 md:col-span-2">没有可展示的视频审核材料。</p>
              ) : (
                videoItems.map(({ shot, output, issue }) => (
                  <div
                    key={shot.id}
                    className={`rounded-lg border bg-ink p-3 ${
                      issue ? 'border-amber-400/40' : 'border-line'
                    }`}
                  >
                    {output?.video_url && (
                      <video
                        className="aspect-video w-full rounded-md bg-black"
                        controls
                        src={output.video_url}
                      />
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{shot.label || '未命名镜头'}</p>
                      <ShotEditorLink projectId={projectId} shot={shot} />
                    </div>
                    {issue && <p className="mt-2 text-xs text-amber-300">{issue}</p>}
                  </div>
                ))
              )}
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
                  disabled={busy || loadingArtifacts || !approveReady}
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

function ShotEditorLink({ projectId, shot }: { projectId: string; shot: ShotDTO }) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api<{ story_id: string }>(`/scenes/${shot.scene_id}`)
      .then((scene) => {
        if (!active) return;
        setHref(
          `/projects/${projectId}/stories/${scene.story_id}/scenes/${shot.scene_id}/shots/${shot.id}`,
        );
      })
      .catch(() => {
        if (active) setHref(null);
      });
    return () => {
      active = false;
    };
  }, [projectId, shot.id, shot.scene_id]);

  if (!href) return null;
  return (
    <Link className="text-xs text-accent hover:underline" href={href}>
      打开镜头编辑
    </Link>
  );
}
