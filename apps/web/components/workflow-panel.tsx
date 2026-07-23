'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Field, Select, Spinner, Textarea } from '@zivith/ui';
import { api, errorMessage, session } from '@/lib/api';
import { getFormText } from '@/lib/form-data';
import type {
  OutputDTO,
  PromptVersionDTO,
  SceneDTO,
  ShotDTO,
  StoryDTO,
  VisualRequirementDTO,
  WorkflowMediaDTO,
  WorkflowRunDTO,
  WorkflowStepName,
} from '@/lib/types';

type AutomationLevel = 'full_manual' | 'assisted' | 'semi_auto' | 'full_auto';

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

const automationLabels: Record<AutomationLevel, string> = {
  full_manual: '全手动',
  assisted: '辅助（默认）',
  semi_auto: '半自动',
  full_auto: '全自动',
};

const automationStages = [
  ['story', '故事'],
  ['scene', '场景'],
  ['visual_assets', '视觉资产'],
  ['shot', '镜头'],
  ['prompt', '提示词'],
  ['video', '视频'],
] as const;

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function stepOutput(run: WorkflowRunDTO, name: WorkflowStepName): Record<string, unknown> {
  return run.steps.find((step) => step.name === name)?.output ?? {};
}

function textField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

type ArtifactKind = 'story' | 'scene' | 'visual' | 'shot' | 'prompt' | 'video';

function stepArtifactKind(name: WorkflowStepName): ArtifactKind | null {
  switch (name) {
    case 'story':
    case 'story_review':
      return 'story';
    case 'scene':
    case 'scene_review':
      return 'scene';
    case 'visual_prep':
    case 'visual_assets_review':
      return 'visual';
    case 'shot':
    case 'shot_review':
      return 'shot';
    case 'prompt':
    case 'prompt_review':
      return 'prompt';
    case 'video':
    case 'video_review':
      return 'video';
    default:
      return null;
  }
}

function defaultSelectedStep(run: WorkflowRunDTO): WorkflowStepName | null {
  if (run.state.awaiting_review) return run.state.awaiting_review;
  const completed = [...run.steps].reverse().find((step) => step.status === 'completed');
  return completed?.name ?? run.steps[0]?.name ?? null;
}

interface VisualReviewItem {
  requirement: VisualRequirementDTO;
  media?: WorkflowMediaDTO;
  sceneTitle?: string;
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

function mediaMeta(media?: WorkflowMediaDTO): NonNullable<WorkflowMediaDTO['generation_metadata']> {
  return media?.generation_metadata && typeof media.generation_metadata === 'object'
    ? media.generation_metadata
    : {};
}

function isFailedPlaceholder(media?: WorkflowMediaDTO): boolean {
  return mediaMeta(media).provider === 'mock-fallback';
}

function canApproveArtifacts(
  review: WorkflowStepName | null | undefined,
  visualItems: VisualReviewItem[],
  promptItems: PromptReviewItem[],
  videoItems: VideoReviewItem[],
  story: StoryDTO | null,
  scenes: SceneDTO[],
  shots: ShotDTO[],
): boolean {
  if (!review) return false;
  if (review === 'story_review') return Boolean(story);
  if (review === 'scene_review') return scenes.length > 0;
  if (review === 'shot_review') return shots.length > 0;
  if (review === 'visual_assets_review') {
    if (visualItems.length === 0) return false;
    return visualItems.every(
      (item) =>
        !item.requirement.required ||
        item.requirement.status === 'approved' ||
        Boolean(
          item.media &&
          item.requirement.candidate_media_ids[0] &&
          !item.issue &&
          !isFailedPlaceholder(item.media),
        ),
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

function readAutomation(
  form: FormData,
): Record<(typeof automationStages)[number][0], AutomationLevel> {
  const allowed = new Set<string>(Object.keys(automationLabels));
  const result = {} as Record<(typeof automationStages)[number][0], AutomationLevel>;
  for (const [key] of automationStages) {
    const value = form.get(`automation.${key}`);
    result[key] =
      typeof value === 'string' && allowed.has(value) ? (value as AutomationLevel) : 'assisted';
  }
  return result;
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
  const [notice, setNotice] = useState('');
  const [artifactWarning, setArtifactWarning] = useState('');
  const [story, setStory] = useState<StoryDTO | null>(null);
  const [scenes, setScenes] = useState<SceneDTO[]>([]);
  const [shots, setShots] = useState<ShotDTO[]>([]);
  const [visualItems, setVisualItems] = useState<VisualReviewItem[]>([]);
  const [promptItems, setPromptItems] = useState<PromptReviewItem[]>([]);
  const [videoItems, setVideoItems] = useState<VideoReviewItem[]>([]);
  const [selectedStep, setSelectedStep] = useState<WorkflowStepName | null>(null);
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const clearArtifacts = useCallback(() => {
    setStory(null);
    setScenes([]);
    setShots([]);
    setVisualItems([]);
    setPromptItems([]);
    setVideoItems([]);
    setArtifactWarning('');
  }, []);

  const loadLatest = useCallback(async () => {
    try {
      const runs = await api<WorkflowRunDTO[]>(`/projects/${projectId}/workflows?limit=1`);
      setRun(runs[0] ?? null);
      return runs[0] ?? null;
    } catch (reason) {
      setError(errorMessage(reason));
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  useEffect(() => {
    if (!run) {
      setSelectedStep(null);
      return;
    }
    setSelectedStep((current) => {
      if (current && run.steps.some((step) => step.name === current)) return current;
      return defaultSelectedStep(run);
    });
  }, [run?.id, run?.state.awaiting_review, run?.status]);

  useEffect(() => {
    if (!run || ['completed', 'failed', 'cancelled'].includes(run.status)) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
    const token = session.getToken();
    if (!token) return;

    const controller = new AbortController();
    let active = true;

    const connect = async () => {
      try {
        const response = await fetch(`${API_URL}/workflows/${run.id}/events`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() ?? '';
          for (const chunk of chunks) {
            const lines = chunk.split('\n');
            const event = lines
              .find((line) => line.startsWith('event:'))
              ?.slice(6)
              .trim();
            const dataLine = lines.find((line) => line.startsWith('data:'));
            if (!dataLine) continue;
            try {
              const data = JSON.parse(dataLine.slice(5).trim()) as {
                status?: string;
                run_id?: string;
              };
              if (event === 'workflow' || event === 'done') {
                const latest = await api<WorkflowRunDTO>(`/workflows/${run.id}`);
                if (active) setRun(latest);
              }
              if (event === 'done' || data.status === 'completed') {
                await onArtifactsChanged();
              }
            } catch {
              // ignore malformed SSE frames
            }
          }
        }
      } catch (reason) {
        if (!active || controller.signal.aborted) return;
        // SSE drops on API restart / navigation — reconnect quietly instead of red banner.
        if (
          reason instanceof Error &&
          (reason.name === 'AbortError' || /failed to fetch/i.test(reason.message))
        ) {
          window.setTimeout(() => {
            if (active && !controller.signal.aborted) void connect();
          }, 2_500);
          return;
        }
        setError(errorMessage(reason));
      }
    };

    void connect();
    return () => {
      active = false;
      controller.abort();
    };
  }, [run?.id, run?.status, onArtifactsChanged]);

  useEffect(() => {
    if (!run || !selectedStep) {
      clearArtifacts();
      return;
    }
    const kind = stepArtifactKind(selectedStep);
    clearArtifacts();
    if (!kind) return;

    let active = true;
    setLoadingArtifacts(true);
    const load = async () => {
      if (kind === 'story') {
        const storyId = textField(stepOutput(run, 'story').story_id);
        if (!storyId) throw new Error('故事材料缺失：工作流未记录故事 ID');
        const loaded = await api<StoryDTO>(`/stories/${storyId}`);
        if (active) {
          if (!loaded?.title) throw new Error('故事材料无法加载');
          setStory(loaded);
        }
        return;
      }

      if (kind === 'scene') {
        const sceneIds = stringArray(stepOutput(run, 'scene').scene_ids);
        if (sceneIds.length === 0) throw new Error('场景材料缺失：工作流未记录场景列表');
        const loaded = await Promise.all(sceneIds.map((id) => api<SceneDTO>(`/scenes/${id}`)));
        if (active) {
          if (loaded.some((item) => !item?.id)) throw new Error('部分场景材料无法加载');
          setScenes(loaded);
        }
        return;
      }

      if (kind === 'shot') {
        const shotIds = stringArray(stepOutput(run, 'shot').shot_ids);
        if (shotIds.length === 0) throw new Error('镜头材料缺失：工作流未记录镜头列表');
        const loaded = await Promise.all(shotIds.map((id) => api<ShotDTO>(`/shots/${id}`)));
        if (active) {
          if (loaded.some((item) => !item?.id)) throw new Error('部分镜头材料无法加载');
          setShots(loaded);
        }
        return;
      }

      if (kind === 'visual') {
        const sceneIds = stringArray(stepOutput(run, 'scene').scene_ids);
        if (sceneIds.length === 0) {
          throw new Error('视觉资产材料缺失：工作流未记录场景列表');
        }
        const scenesLoaded = await Promise.all(
          sceneIds.map((sceneId) => api<SceneDTO>(`/scenes/${sceneId}`)),
        );
        const sceneTitleById = new Map(
          scenesLoaded.map((scene) => [scene.id, scene.title] as const),
        );
        const groups = await Promise.all(
          sceneIds.map((sceneId) =>
            api<VisualRequirementDTO[]>(`/scenes/${sceneId}/visual-requirements`),
          ),
        );
        const requirements = groups.flat();
        if (requirements.length === 0) {
          throw new Error('视觉资产材料为空：未找到任何角色/地点视觉需求');
        }
        const items = await Promise.all(
          requirements.map(async (requirement) => {
            const sceneTitle = sceneTitleById.get(requirement.scene_id);
            const mediaId = requirement.candidate_media_ids[0];
            if (requirement.required && !mediaId) {
              return {
                requirement,
                sceneTitle,
                issue: '必需视觉需求缺少候选图片，无法通过审核',
              } satisfies VisualReviewItem;
            }
            if (!mediaId) return { requirement, sceneTitle } satisfies VisualReviewItem;
            try {
              const media = await api<WorkflowMediaDTO>(`/media/${mediaId}`);
              if (isFailedPlaceholder(media)) {
                const detail = mediaMeta(media).generation_error;
                return {
                  requirement,
                  media,
                  sceneTitle,
                  issue: detail
                    ? `生图失败（占位图）：${detail.slice(0, 160)}`
                    : '生图失败，当前仅为占位图。请检查图像模型后点击「按提示词生成」',
                } satisfies VisualReviewItem;
              }
              return { requirement, media, sceneTitle } satisfies VisualReviewItem;
            } catch {
              return {
                requirement,
                sceneTitle,
                issue: `候选图片 ${mediaId.slice(0, 8)}… 无法加载`,
              } satisfies VisualReviewItem;
            }
          }),
        );
        const blocked = items.filter((item) => item.issue);
        if (active) {
          setVisualItems(items);
          setPromptDrafts(
            Object.fromEntries(
              items.map((item) => [item.requirement.id, item.requirement.generation_prompt ?? '']),
            ),
          );
          if (blocked.length > 0) {
            setArtifactWarning(
              `${blocked.length} 项视觉需求材料不完整，请修复后再点“审核通过并继续”`,
            );
          }
        }
        return;
      }

      if (kind === 'prompt') {
        const output = stepOutput(run, 'prompt');
        const shotIds = stringArray(output.shot_ids);
        const promptIds = stringArray(output.prompt_version_ids);
        if (shotIds.length === 0) {
          throw new Error('提示词材料缺失：工作流未记录镜头列表');
        }
        const items = await Promise.all(
          shotIds.map(async (shotId, index) => {
            const promptId = promptIds[index];
            const [shot, versions] = await Promise.all([
              api<ShotDTO>(`/shots/${shotId}`),
              api<PromptVersionDTO[]>(`/shots/${shotId}/prompts`),
            ]);
            const prompt =
              (promptId ? versions.find((version) => version.id === promptId) : undefined) ??
              versions.find((version) => version.approved_at) ??
              versions[0];
            if (!prompt) {
              return {
                shot,
                prompt: {
                  id: promptId ?? `missing-${shotId}`,
                  shot_id: shotId,
                  positive: '',
                  source: 'missing',
                  created_at: '',
                },
                issue: promptId ? `找不到提示词版本 ${promptId.slice(0, 8)}…` : '缺少提示词版本',
              } satisfies PromptReviewItem;
            }
            const shotPositive = shot.prompt?.positive?.trim() ?? '';
            const versionPositive = prompt.positive.trim();
            if (shotPositive && versionPositive && shotPositive !== versionPositive) {
              return {
                shot,
                prompt,
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
        return;
      }

      const output = stepOutput(run, 'video');
      const shotIds = stringArray(output.shot_ids);
      const outputIds = stringArray(output.output_ids);
      if (shotIds.length === 0) {
        throw new Error('视频材料缺失：工作流未记录镜头列表');
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
            outputs.find((item) => outputIdSet.has(item.id)) ??
            outputs.find((item) => item.is_active) ??
            outputs[0];
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
  }, [run, selectedStep, clearArtifacts]);

  const approveReady = useMemo(
    () =>
      canApproveArtifacts(
        run?.state.awaiting_review,
        visualItems,
        promptItems,
        videoItems,
        story,
        scenes,
        shots,
      ),
    [run?.state.awaiting_review, visualItems, promptItems, videoItems, story, scenes, shots],
  );

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (run && !['completed', 'failed', 'cancelled'].includes(run.status)) {
      const ok = window.confirm(
        '当前仍有进行中的工作流。启动新工作流不会自动取消旧任务，确定继续吗？',
      );
      if (!ok) return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setNotice('');
    setArtifactWarning('');
    try {
      const created = await api<WorkflowRunDTO>('/workflows/story-to-video', {
        method: 'POST',
        body: {
          project_id: projectId,
          brief: getFormText(form, 'brief'),
          automation: readAutomation(form),
        },
      });
      setRun(created);
      setShowStart(false);
      setNotice('工作流已启动，请按阶段完成审核。');
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
    setNotice('');
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
      setNotice(action === 'approve' ? '审核已通过，工作流继续推进。' : '已按反馈重新排队生成。');
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
    setNotice('');
    try {
      await api(`/workflows/${run.id}/cancel`, { method: 'POST', body: {} });
      clearArtifacts();
      const latest = await loadLatest();
      setNotice(latest?.status === 'cancelled' ? '工作流已取消。' : '取消请求已提交。');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setError('');
    try {
      await loadLatest();
      setNotice('已刷新最新工作流状态。');
    } finally {
      setBusy(false);
    }
  }

  function toggleStart() {
    if (busy) return;
    setShowStart((value) => !value);
    setError('');
  }

  const review = run?.state.awaiting_review;
  const terminal = Boolean(run && ['completed', 'failed', 'cancelled'].includes(run.status));
  const viewKind = selectedStep ? stepArtifactKind(selectedStep) : null;
  const isLiveReview = Boolean(review && selectedStep === review);
  // Visual prep + visual assets review share the same cards; allow generate while that gate is open.
  const canEditVisual = review === 'visual_assets_review' && viewKind === 'visual' && !terminal;

  async function regenerateVisual(requirement: VisualRequirementDTO) {
    const prompt = (promptDrafts[requirement.id] ?? requirement.generation_prompt ?? '').trim();
    if (!prompt) {
      setError('请先填写生图提示词');
      return;
    }
    setRegeneratingId(requirement.id);
    setError('');
    setNotice('');
    try {
      await api(`/scenes/${requirement.scene_id}/visual-requirements/${requirement.id}/generate`, {
        method: 'POST',
        body: { prompt },
      });
      setNotice('已按当前提示词重新生成候选图');
      // Force reload by toggling selected step dependency
      setSelectedStep((current) => current);
      const sceneIds = stringArray(stepOutput(run!, 'scene').scene_ids);
      const scenesLoaded = await Promise.all(
        sceneIds.map((sceneId) => api<SceneDTO>(`/scenes/${sceneId}`)),
      );
      const sceneTitleById = new Map(scenesLoaded.map((scene) => [scene.id, scene.title] as const));
      const groups = await Promise.all(
        sceneIds.map((sceneId) =>
          api<VisualRequirementDTO[]>(`/scenes/${sceneId}/visual-requirements`),
        ),
      );
      const requirements = groups.flat();
      const items = await Promise.all(
        requirements.map(async (item) => {
          const sceneTitle = sceneTitleById.get(item.scene_id);
          const mediaId = item.candidate_media_ids[0];
          if (!mediaId) return { requirement: item, sceneTitle } satisfies VisualReviewItem;
          try {
            const media = await api<WorkflowMediaDTO>(`/media/${mediaId}`);
            return { requirement: item, media, sceneTitle } satisfies VisualReviewItem;
          } catch {
            return {
              requirement: item,
              sceneTitle,
              issue: `候选图片 ${mediaId.slice(0, 8)}… 无法加载`,
            } satisfies VisualReviewItem;
          }
        }),
      );
      setVisualItems(items);
      setPromptDrafts((current) => ({
        ...current,
        [requirement.id]: prompt,
      }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setRegeneratingId(null);
    }
  }

  return (
    <Card className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-accent">Phase 2</p>
          <h2 className="mt-1 text-lg font-semibold">AI 故事转视频工作流</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {run && (
            <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
              刷新状态
            </Button>
          )}
          {run && !terminal && (
            <Button variant="danger" disabled={busy} onClick={() => void cancel()}>
              取消工作流
            </Button>
          )}
          <Button variant={showStart ? 'ghost' : 'secondary'} disabled={busy} onClick={toggleStart}>
            {showStart ? '收起' : terminal || !run ? '启动新工作流' : '重新开始'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="mt-4 rounded-lg bg-accent/10 p-3 text-sm text-accent" role="status">
          {notice}
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {automationStages.map(([key, label]) => (
              <Field
                key={key}
                label={`${label}自动化`}
                hint={
                  key === 'prompt' || key === 'visual_assets'
                    ? '强制人工审核，全自动也会停闸'
                    : undefined
                }
              >
                <Select name={`automation.${key}`} defaultValue="assisted">
                  {(Object.keys(automationLabels) as AutomationLevel[]).map((level) => (
                    <option key={level} value={level}>
                      {automationLabels[level]}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
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
            {run.steps.map((step) => {
              const selectable =
                step.status === 'completed' || step.status === 'running' || step.name === review;
              const selected = selectedStep === step.name;
              return (
                <button
                  key={step.id}
                  type="button"
                  disabled={!selectable}
                  onClick={() => setSelectedStep(step.name)}
                  className={`rounded-lg border p-3 text-left text-xs transition ${
                    selected ? 'ring-1 ring-accent' : ''
                  } ${
                    step.status === 'completed'
                      ? 'border-accent/30 bg-accent/5 text-accent'
                      : step.status === 'running'
                        ? 'border-amber-400/30 bg-amber-400/5 text-amber-300'
                        : step.status === 'cancelled'
                          ? 'border-red-400/30 bg-red-400/5 text-red-300'
                          : 'border-line text-zinc-500'
                  } ${selectable ? 'cursor-pointer hover:brightness-110' : 'cursor-default opacity-60'}`}
                >
                  <p className="font-medium">{stepLabels[step.name]}</p>
                  <p className="mt-1 opacity-70">{statusLabels[step.status]}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
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
              {selectedStep ? ` · 正在查看“${stepLabels[selectedStep]}”` : ''}
            </p>
          </div>

          {selectedStep && !isLiveReview && (
            <p className="mt-3 text-xs text-zinc-500">
              只读回看历史产物。要改内容请回到当前审核闸使用「按反馈重新生成」，或取消后重新开始。任意步骤时间旅行回退尚未立项。
            </p>
          )}

          {loadingArtifacts && <Spinner label="正在加载材料…" />}

          {viewKind === 'story' && !loadingArtifacts && story && (
            <div className="mt-5 rounded-lg border border-line bg-ink p-4">
              <p className="text-sm font-medium">{story.title}</p>
              {story.logline && (
                <p className="mt-2 text-xs leading-5 text-zinc-400">{story.logline}</p>
              )}
              {story.synopsis && (
                <p className="mt-3 text-xs leading-6 text-zinc-500">{story.synopsis}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                {story.genre && <Badge tone="neutral">{story.genre}</Badge>}
                {story.theme && <Badge tone="neutral">{story.theme}</Badge>}
              </div>
            </div>
          )}

          {viewKind === 'scene' && !loadingArtifacts && (
            <div className="mt-5 grid gap-3">
              {scenes.length === 0 ? (
                <p className="text-sm text-zinc-500">没有可展示的场景材料。</p>
              ) : (
                scenes.map((scene) => (
                  <div key={scene.id} className="rounded-lg border border-line bg-ink p-4">
                    <p className="text-sm font-medium">
                      #{scene.order} {scene.title}
                    </p>
                    {scene.summary && (
                      <p className="mt-2 text-xs leading-5 text-zinc-400">{scene.summary}</p>
                    )}
                    <p className="mt-2 text-xs text-zinc-500">
                      {[scene.time_of_day, scene.weather, scene.mood].filter(Boolean).join(' · ') ||
                        '时间 / 天气 / 情绪待补充'}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {viewKind === 'shot' && !loadingArtifacts && (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {shots.length === 0 ? (
                <p className="text-sm text-zinc-500 md:col-span-2">没有可展示的镜头材料。</p>
              ) : (
                shots.map((shot) => (
                  <div key={shot.id} className="rounded-lg border border-line bg-ink p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        #{shot.order} {shot.label || '未命名镜头'}
                      </p>
                      <ShotEditorLink projectId={projectId} shot={shot} />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">
                      {shot.action?.description || '暂无动作描述'}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {[shot.camera?.shot_type, shot.camera?.movement, shot.mood]
                        .filter(Boolean)
                        .join(' · ') || '摄影 / 情绪待补充'}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {viewKind === 'visual' && !loadingArtifacts && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visualItems.length === 0 ? (
                <p className="text-sm text-zinc-500 sm:col-span-2 lg:col-span-3">
                  没有可展示的视觉材料。
                </p>
              ) : (
                visualItems.map(({ requirement, media, sceneTitle, issue }) => {
                  const imageSrc = media?.access_url || media?.url || '';
                  const failedPlaceholder = isFailedPlaceholder(media);
                  const typeLabel =
                    requirement.asset_type === 'character' ? '角色关键图' : '地点参考';
                  const draft = promptDrafts[requirement.id] ?? requirement.generation_prompt ?? '';
                  return (
                    <div
                      key={requirement.id}
                      className={`rounded-lg border bg-ink p-3 ${
                        issue ? 'border-amber-400/40' : 'border-line'
                      }`}
                    >
                      {imageSrc ? (
                        <img
                          className="mb-3 aspect-video w-full rounded-md object-cover bg-zinc-900"
                          src={imageSrc}
                          alt={requirement.reason}
                          onError={(event) => {
                            event.currentTarget.replaceWith(
                              Object.assign(document.createElement('div'), {
                                className:
                                  'mb-3 flex aspect-video items-center justify-center rounded-md bg-zinc-900 text-xs text-zinc-600',
                                textContent: '图片加载失败',
                              }),
                            );
                          }}
                        />
                      ) : (
                        <div className="mb-3 flex aspect-video items-center justify-center rounded-md bg-zinc-900 text-xs text-zinc-600">
                          暂无预览
                        </div>
                      )}
                      {failedPlaceholder && (
                        <p className="mb-2 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                          占位图（生图未成功）· 请检查图像模型后重新生成
                        </p>
                      )}
                      <p className="text-sm font-medium">
                        {sceneTitle ? `场景「${sceneTitle}」` : '场景'} · {typeLabel}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {requirement.asset?.name ?? requirement.variant_key}
                      </p>
                      {requirement.asset?.appearance_summary && (
                        <p className="mt-1 text-xs leading-5 text-zinc-500">
                          特征：{requirement.asset.appearance_summary}
                        </p>
                      )}
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{requirement.reason}</p>
                      <Field label="生图提示词">
                        <Textarea
                          value={draft}
                          disabled={!canEditVisual || busy || regeneratingId === requirement.id}
                          onChange={(event) =>
                            setPromptDrafts((current) => ({
                              ...current,
                              [requirement.id]: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      {canEditVisual && (
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy || regeneratingId === requirement.id}
                            onClick={() => void regenerateVisual(requirement)}
                          >
                            {regeneratingId === requirement.id
                              ? '生成中…'
                              : failedPlaceholder || !imageSrc
                                ? '按提示词生成'
                                : '按提示词重生成'}
                          </Button>
                        </div>
                      )}
                      {issue && <p className="mt-2 text-xs text-amber-300">{issue}</p>}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {viewKind === 'prompt' && !loadingArtifacts && (
            <div className="mt-5 grid gap-3">
              {promptItems.length === 0 ? (
                <p className="text-sm text-zinc-500">没有可展示的提示词材料。</p>
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

          {viewKind === 'video' && !loadingArtifacts && (
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

          {isLiveReview && review && (
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
