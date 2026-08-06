'use client';

import { useEffect, useState } from 'react';
import type { WorldResourcesDTO, WorldSelection } from '@/lib/types';
import { api, errorMessage } from '@/lib/api';

const KIND_COLOR: Record<string, string> = {
  character: 'text-[#b7ff4a] border-[#b7ff4a]/40 bg-[#b7ff4a]/10',
  location: 'text-[#a78bfa] border-[#a78bfa]/40 bg-[#a78bfa]/10',
  scene: 'text-[#60a5fa] border-[#60a5fa]/40 bg-[#60a5fa]/10',
  world_event: 'text-[#fbbf24] border-[#fbbf24]/40 bg-[#fbbf24]/10',
  story: 'text-[#f472b6] border-[#f472b6]/40 bg-[#f472b6]/10',
  project: 'text-zinc-200 border-zinc-500/40 bg-zinc-500/10',
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="min-w-0 break-words text-right text-zinc-200">{value}</span>
    </div>
  );
}

function JsonValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 1);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function EntityDetail({
  kind,
  label,
  fields,
}: {
  kind: string;
  label: string;
  fields: Array<{ label: string; value: React.ReactNode }>;
}) {
  const rows = fields.filter((field) => field.value !== null && field.value !== undefined);
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${KIND_COLOR[kind]}`}>
          {label}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">暂无属性数据</p>
      ) : (
        rows.map((field) => <Row key={field.label} label={field.label} value={field.value} />)
      )}
    </div>
  );
}

function tagsOf(tags?: string[]): string {
  if (!tags || tags.length === 0) return '';
  return tags.join(' · ');
}

const fieldClass =
  'w-full rounded-md border border-line bg-white/5 px-2.5 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-accent/60';

interface ProjectDraft {
  name: string;
  description: string;
  genre: string;
  premise: string;
  rulesText: string;
  notes: string;
}

export function InspectorPanel({
  resources,
  selection,
  onProjectUpdated,
}: {
  resources: WorldResourcesDTO;
  selection: WorldSelection;
  onProjectUpdated?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [draft, setDraft] = useState<ProjectDraft>({
    name: '',
    description: '',
    genre: '',
    premise: '',
    rulesText: '',
    notes: '',
  });

  // 切换选择（或离开 project）时退出编辑态。
  useEffect(() => {
    setEditing(false);
  }, [selection]);

  // 项目数据刷新后重置草稿（含保存后回显）。
  useEffect(() => {
    const worldview = resources.project.worldview ?? {};
    setDraft({
      name: resources.project.name ?? '',
      description: resources.project.description ?? '',
      genre: worldview.genre ?? '',
      premise: worldview.premise ?? '',
      rulesText: (worldview.rules ?? []).join('\n'),
      notes: worldview.notes ?? '',
    });
  }, [resources]);

  const updateDraft = (key: keyof ProjectDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function handleSaveProject() {
    setSaving(true);
    setEditError('');
    try {
      await api(`/projects/${resources.project.id}`, {
        method: 'PATCH',
        body: {
          name: draft.name.trim(),
          description: draft.description.trim(),
          worldview: {
            genre: draft.genre.trim(),
            premise: draft.premise.trim(),
            rules: draft.rulesText
              .split('\n')
              .map((rule) => rule.trim())
              .filter(Boolean),
            notes: draft.notes.trim(),
          },
        },
      });
      setEditing(false);
      onProjectUpdated?.();
    } catch (reason) {
      setEditError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  let detail: React.ReactNode = null;

  if (selection) {
    const entities = resources.entities;
    switch (selection.kind) {
      case 'character': {
        const asset = entities.characters.find((item) => item.id === selection.id);
        if (asset) {
          const appearance = asset.appearance;
          detail = (
            <EntityDetail
              kind="character"
              label="角色"
              fields={[
                { label: '名称', value: asset.name },
                { label: '别名', value: (asset.aliases ?? []).join(' · ') },
                { label: '描述', value: asset.description },
                { label: '标签', value: tagsOf(asset.tags) },
                { label: '性别', value: appearance?.gender },
                { label: '年龄', value: appearance?.age_range },
                { label: '身形', value: appearance?.build },
                { label: '个性', value: asset.personality },
                { label: '常服', value: asset.default_outfit },
              ]}
            />
          );
        }
        break;
      }
      case 'location': {
        const asset = entities.locations.find((item) => item.id === selection.id);
        if (asset) {
          detail = (
            <EntityDetail
              kind="location"
              label="地点"
              fields={[
                { label: '名称', value: asset.name },
                { label: '描述', value: asset.description },
                { label: '标签', value: tagsOf(asset.tags) },
                { label: '时代', value: asset.time_period },
                { label: '默认天气', value: asset.weather_default },
                { label: '默认光线', value: asset.lighting_default },
                { label: '默认氛围', value: asset.mood_default },
              ]}
            />
          );
        }
        break;
      }
      case 'scene': {
        const scene = entities.scenes.find((item) => item.id === selection.id);
        if (scene) {
          detail = (
            <EntityDetail
              kind="scene"
              label="场景"
              fields={[
                { label: '标题', value: scene.title },
                { label: '摘要', value: scene.summary },
                { label: '时间段', value: scene.time_of_day },
                { label: '天气', value: scene.weather },
                { label: '氛围', value: scene.mood },
                { label: '镜头数', value: scene.shot_count ?? 0 },
              ]}
            />
          );
        }
        break;
      }
      case 'world_event': {
        const event = entities.world_events.find((item) => item.id === selection.id);
        if (event) {
          detail = (
            <EntityDetail
              kind="world_event"
              label="世界事件"
              fields={[
                { label: '标题', value: event.title },
                { label: '描述', value: event.description },
                { label: '呈现顺序', value: event.presentation_order ?? 0 },
                { label: '状态', value: event.state },
                { label: '参与角色', value: (event.character_ids ?? []).length },
                { label: '关联场景', value: (event.scene_ids ?? []).length },
                {
                  label: '世界时间',
                  value: <JsonValue value={event.world_time_envelope} />,
                },
              ]}
            />
          );
        }
        break;
      }
      case 'story': {
        const story = entities.stories.find((item) => item.id === selection.id);
        if (story) {
          detail = (
            <EntityDetail
              kind="story"
              label="故事"
              fields={[
                { label: '标题', value: story.title },
                { label: '类型', value: story.genre },
                { label: '主题', value: story.theme },
                { label: '一句话梗概', value: story.logline },
                { label: '完整梗概', value: story.synopsis },
              ]}
            />
          );
        }
        break;
      }
      case 'project': {
        const worldview = resources.project.worldview ?? { rules: [] };
        if (editing) {
          detail = (
            <div className="px-4 py-3">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${KIND_COLOR.project}`}
                >
                  项目
                </span>
                <span className="text-xs text-zinc-500">编辑属性</span>
              </div>
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-500">名称</span>
                  <input
                    className={fieldClass}
                    value={draft.name}
                    onChange={(event) => updateDraft('name', event.target.value)}
                    placeholder="项目名称"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-500">描述</span>
                  <textarea
                    className={fieldClass}
                    value={draft.description}
                    onChange={(event) => updateDraft('description', event.target.value)}
                    rows={3}
                    placeholder="项目一句话描述"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-500">题材</span>
                  <input
                    className={fieldClass}
                    value={draft.genre}
                    onChange={(event) => updateDraft('genre', event.target.value)}
                    placeholder="如：东方玄幻"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-500">核心设定</span>
                  <textarea
                    className={fieldClass}
                    value={draft.premise}
                    onChange={(event) => updateDraft('premise', event.target.value)}
                    rows={3}
                    placeholder="一句话世界观 / 核心设定"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-500">世界规则</span>
                  <textarea
                    className={fieldClass}
                    value={draft.rulesText}
                    onChange={(event) => updateDraft('rulesText', event.target.value)}
                    rows={4}
                    placeholder="每行一条规则，如：灵气浓度决定修行上限"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-500">补充</span>
                  <textarea
                    className={fieldClass}
                    value={draft.notes}
                    onChange={(event) => updateDraft('notes', event.target.value)}
                    rows={3}
                    placeholder="其他补充说明"
                  />
                </label>
                {editError ? <p className="text-xs text-red-400">{editError}</p> : null}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveProject()}
                    className="rounded-md border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/20 disabled:opacity-50"
                  >
                    {saving ? '保存中…' : '保存'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setEditing(false)}
                    className="rounded-md border border-line px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          );
        } else {
          detail = (
            <EntityDetail
              kind="project"
              label="项目"
              fields={[
                { label: '名称', value: resources.project.name },
                { label: '描述', value: resources.project.description },
                { label: '题材', value: worldview.genre },
                { label: '核心设定', value: worldview.premise },
                { label: '世界规则', value: (worldview.rules ?? []).join(' · ') },
                { label: '补充', value: worldview.notes },
                { label: 'ID', value: resources.project.id },
              ]}
            />
          );
        }
        break;
      }
    }
    if (!detail) {
      detail = (
        <div className="px-4 py-6 text-sm text-zinc-500">
          未找到该实体（可能已删除或不在当前视图）
        </div>
      );
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 右上：世界线属性 */}
      <section className="border-b border-line">
        <header className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-xs font-semibold tracking-wider text-zinc-500">世界线属性</h2>
          {selection?.kind === 'project' && !editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-line px-2 py-0.5 text-xs text-zinc-300 transition hover:bg-white/5 hover:text-white"
            >
              编辑
            </button>
          ) : null}
        </header>
        {selection ? (
          detail
        ) : (
          <div className="px-4 pb-6">
            <p className="rounded-lg border border-dashed border-line p-4 text-sm leading-6 text-zinc-500">
              未选择实体。在左侧 Explorer 或中间世界线上点击任意实体查看属性。
            </p>
          </div>
        )}
      </section>

      {/* 右下：创作线属性（v1 占位） */}
      <section className="flex-1">
        <header className="px-4 pt-4 pb-2">
          <h2 className="text-xs font-semibold tracking-wider text-zinc-500">创作线属性</h2>
        </header>
        <div className="px-4 pb-6">
          <p className="text-sm leading-relaxed text-zinc-600">
            创作线属性将在后续版本呈现：15 秒 AI 视频镜头提示词、风格固定词与镜头参数将
            沿创作线轨道逐镜头展开（双时间线下半部分）。
          </p>
        </div>
      </section>
    </div>
  );
}
