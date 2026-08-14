'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  AssetDTO,
  SceneDTO,
  StoryDTO,
  WorldEventDTO,
  WorldRelationshipDTO,
  WorldResourcesDTO,
  WorldSelection,
} from '@/lib/types';
import { api, errorMessage } from '@/lib/api';

const KIND_COLOR: Record<string, string> = {
  character: 'text-[#4d6bfe] border-[#4d6bfe]/30 bg-[#4d6bfe]/10',
  location: 'text-[#a78bfa] border-[#a78bfa]/40 bg-[#a78bfa]/10',
  scene: 'text-[#60a5fa] border-[#60a5fa]/40 bg-[#60a5fa]/10',
  world_event: 'text-[#fbbf24] border-[#fbbf24]/40 bg-[#fbbf24]/10',
  story: 'text-[#f472b6] border-[#f472b6]/40 bg-[#f472b6]/10',
  project: 'text-zinc-700 border-zinc-500/40 bg-zinc-500/10',
  relationship: 'text-[#f59e0b] border-[#f59e0b]/40 bg-[#f59e0b]/10',
  shot: 'text-[#fb7185] border-[#fb7185]/40 bg-[#fb7185]/10',
};

const KIND_LABEL: Record<string, string> = {
  character: '角色',
  location: '地点',
  scene: '场景',
  world_event: '世界事件',
  story: '故事',
  project: '项目',
  relationship: '关系',
  shot: '镜头',
};

const fieldClass =
  'w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-accent/60';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="min-w-0 break-words text-right text-zinc-700">{value}</span>
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

function Field({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-500">{label}</span>
      {rows ? (
        <textarea
          className={fieldClass}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          placeholder={placeholder}
        />
      ) : (
        <input
          className={fieldClass}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}

function SaveActions({
  saving,
  error,
  onSave,
  onCancel,
}: {
  saving: boolean;
  error: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2 pt-1">
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="rounded-md border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/20 disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="rounded-md border border-line px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50"
        >
          取消
        </button>
      </div>
    </div>
  );
}

function tagsOf(tags?: string[]): string {
  if (!tags || tags.length === 0) return '';
  return tags.join(' · ');
}

function splitList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(values?: string[]): string {
  return (values ?? []).join('，');
}

function requiredText(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function sceneSummary(scene: SceneDTO): string {
  return scene.summary ?? scene.description ?? '';
}

function sceneTime(scene: SceneDTO): string {
  return scene.time_of_day ?? scene.time ?? '';
}

type EntityDraft = Record<string, string>;

function characterDraft(asset: AssetDTO): EntityDraft {
  const appearance = asset.appearance ?? {};
  return {
    name: asset.name ?? '',
    description: asset.description ?? '',
    aliases: joinList(asset.aliases),
    tags: joinList(asset.tags),
    gender: appearance.gender ?? '',
    age_range: appearance.age_range ?? '',
    build: appearance.build ?? '',
    personality: asset.personality ?? '',
    default_outfit: asset.default_outfit ?? '',
  };
}

function locationDraft(asset: AssetDTO): EntityDraft {
  return {
    name: asset.name ?? '',
    description: asset.description ?? '',
    tags: joinList(asset.tags),
    time_period: asset.time_period ?? '',
    weather_default: asset.weather_default ?? '',
    lighting_default: asset.lighting_default ?? '',
    mood_default: asset.mood_default ?? '',
  };
}

function eventDraft(event: WorldEventDTO): EntityDraft {
  return {
    title: event.title ?? '',
    description: event.description ?? '',
  };
}

function relationshipDraft(relationship: WorldRelationshipDTO): EntityDraft {
  return {
    label: relationship.label ?? '',
    description: relationship.description ?? '',
  };
}

function sceneDraft(scene: SceneDTO): EntityDraft {
  return {
    title: scene.title ?? '',
    summary: sceneSummary(scene),
    time_of_day: sceneTime(scene),
    weather: scene.weather ?? '',
    mood: scene.mood ?? '',
  };
}

function storyDraft(story: StoryDTO): EntityDraft {
  return {
    title: story.title ?? '',
    genre: story.genre ?? '',
    theme: story.theme ?? '',
    logline: story.logline ?? '',
    synopsis: story.synopsis ?? '',
  };
}

function projectDraftFrom(resources: WorldResourcesDTO): EntityDraft {
  const worldview = resources.project.worldview ?? {};
  return {
    name: resources.project.name ?? '',
    description: resources.project.description ?? '',
    genre: worldview.genre ?? '',
    premise: worldview.premise ?? '',
    rulesText: (worldview.rules ?? []).join('\n'),
    notes: worldview.notes ?? '',
  };
}

function draftForSelection(
  resources: WorldResourcesDTO,
  selection: Exclude<WorldSelection, null>,
): EntityDraft {
  const entities = resources.entities;
  switch (selection.kind) {
    case 'project':
      return projectDraftFrom(resources);
    case 'character': {
      const asset = entities.characters.find((item) => item.id === selection.id);
      return asset ? characterDraft(asset) : {};
    }
    case 'location': {
      const asset = entities.locations.find((item) => item.id === selection.id);
      return asset ? locationDraft(asset) : {};
    }
    case 'world_event': {
      const event = entities.world_events.find((item) => item.id === selection.id);
      return event ? eventDraft(event) : {};
    }
    case 'relationship': {
      const relationship = entities.relationships.find((item) => item.id === selection.id);
      return relationship ? relationshipDraft(relationship) : {};
    }
    case 'scene': {
      const scene = entities.scenes.find((item) => item.id === selection.id);
      return scene ? sceneDraft(scene) : {};
    }
    case 'story': {
      const story = entities.stories.find((item) => item.id === selection.id);
      return story ? storyDraft(story) : {};
    }
    default:
      return {};
  }
}

export function InspectorPanel({
  resources,
  selection,
  onUpdated,
}: {
  resources: WorldResourcesDTO;
  selection: WorldSelection;
  onUpdated?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [draft, setDraft] = useState<EntityDraft>({});

  useEffect(() => {
    setEditing(false);
    setEditError('');
  }, [selection]);

  useEffect(() => {
    if (!selection) return;
    setDraft(draftForSelection(resources, selection));
  }, [resources, selection]);

  const updateDraft = (key: string, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    if (!selection) return;
    setSaving(true);
    setEditError('');
    try {
      await persistSelection(resources, selection, draft);
      setEditing(false);
      onUpdated?.();
    } catch (reason) {
      setEditError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  let detail: React.ReactNode = null;

  if (selection) {
    detail = editing
      ? renderEditor(selection, resources, draft, updateDraft, saving, editError, save, () =>
          setEditing(false),
        )
      : renderReadonly(selection, resources);
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
      <section className="border-b border-line">
        <header className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-xs font-semibold tracking-wider text-zinc-500">世界线属性</h2>
          {selection && !editing && selection.kind !== 'shot' ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-line px-2 py-0.5 text-xs text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
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

function EditorShell({
  kind,
  children,
  saving,
  error,
  onSave,
  onCancel,
}: {
  kind: string;
  children: React.ReactNode;
  saving: boolean;
  error: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-4 py-3">
      <div className="mb-3 flex items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${KIND_COLOR[kind]}`}>
          {KIND_LABEL[kind] ?? kind}
        </span>
        <span className="text-xs text-zinc-500">编辑属性</span>
      </div>
      <div className="space-y-3">
        {children}
        <SaveActions saving={saving} error={error} onSave={onSave} onCancel={onCancel} />
      </div>
    </div>
  );
}

function renderEditor(
  selection: Exclude<WorldSelection, null>,
  resources: WorldResourcesDTO,
  draft: EntityDraft,
  updateDraft: (key: string, value: string) => void,
  saving: boolean,
  error: string,
  onSave: () => void,
  onCancel: () => void,
): React.ReactNode {
  const shell = (children: React.ReactNode) => (
    <EditorShell
      kind={selection.kind}
      saving={saving}
      error={error}
      onSave={onSave}
      onCancel={onCancel}
    >
      {children}
    </EditorShell>
  );

  switch (selection.kind) {
    case 'project':
      return shell(
        <>
          <Field label="名称" value={draft.name ?? ''} onChange={(value) => updateDraft('name', value)} />
          <Field
            label="描述"
            value={draft.description ?? ''}
            onChange={(value) => updateDraft('description', value)}
            rows={3}
          />
          <Field label="题材" value={draft.genre ?? ''} onChange={(value) => updateDraft('genre', value)} />
          <Field
            label="核心设定"
            value={draft.premise ?? ''}
            onChange={(value) => updateDraft('premise', value)}
            rows={3}
          />
          <Field
            label="世界规则"
            value={draft.rulesText ?? ''}
            onChange={(value) => updateDraft('rulesText', value)}
            rows={4}
            placeholder="每行一条规则"
          />
          <Field
            label="补充"
            value={draft.notes ?? ''}
            onChange={(value) => updateDraft('notes', value)}
            rows={3}
          />
        </>,
      );
    case 'character':
      return shell(
        <>
          <Field label="名称" value={draft.name ?? ''} onChange={(value) => updateDraft('name', value)} />
          <Field
            label="描述"
            value={draft.description ?? ''}
            onChange={(value) => updateDraft('description', value)}
            rows={3}
          />
          <Field
            label="别名"
            value={draft.aliases ?? ''}
            onChange={(value) => updateDraft('aliases', value)}
            placeholder="逗号或换行分隔"
          />
          <Field
            label="标签"
            value={draft.tags ?? ''}
            onChange={(value) => updateDraft('tags', value)}
            placeholder="逗号或换行分隔"
          />
          <Field label="性别" value={draft.gender ?? ''} onChange={(value) => updateDraft('gender', value)} />
          <Field
            label="年龄"
            value={draft.age_range ?? ''}
            onChange={(value) => updateDraft('age_range', value)}
          />
          <Field label="身形" value={draft.build ?? ''} onChange={(value) => updateDraft('build', value)} />
          <Field
            label="个性"
            value={draft.personality ?? ''}
            onChange={(value) => updateDraft('personality', value)}
            rows={2}
          />
          <Field
            label="常服"
            value={draft.default_outfit ?? ''}
            onChange={(value) => updateDraft('default_outfit', value)}
          />
        </>,
      );
    case 'location':
      return shell(
        <>
          <Field label="名称" value={draft.name ?? ''} onChange={(value) => updateDraft('name', value)} />
          <Field
            label="描述"
            value={draft.description ?? ''}
            onChange={(value) => updateDraft('description', value)}
            rows={3}
          />
          <Field label="标签" value={draft.tags ?? ''} onChange={(value) => updateDraft('tags', value)} />
          <Field
            label="时代"
            value={draft.time_period ?? ''}
            onChange={(value) => updateDraft('time_period', value)}
          />
          <Field
            label="默认天气"
            value={draft.weather_default ?? ''}
            onChange={(value) => updateDraft('weather_default', value)}
          />
          <Field
            label="默认光线"
            value={draft.lighting_default ?? ''}
            onChange={(value) => updateDraft('lighting_default', value)}
          />
          <Field
            label="默认氛围"
            value={draft.mood_default ?? ''}
            onChange={(value) => updateDraft('mood_default', value)}
          />
        </>,
      );
    case 'world_event':
      return shell(
        <>
          <Field label="标题" value={draft.title ?? ''} onChange={(value) => updateDraft('title', value)} />
          <Field
            label="描述"
            value={draft.description ?? ''}
            onChange={(value) => updateDraft('description', value)}
            rows={4}
          />
        </>,
      );
    case 'relationship':
      return shell(
        <>
          <Field
            label="标签"
            value={draft.label ?? ''}
            onChange={(value) => updateDraft('label', value)}
            placeholder="如：师徒"
          />
          <Field
            label="描述"
            value={draft.description ?? ''}
            onChange={(value) => updateDraft('description', value)}
            rows={3}
          />
          <p className="text-xs text-zinc-600">关系两端与类型请在创作聊天中调整，避免误改引用。</p>
        </>,
      );
    case 'scene':
      return shell(
        <>
          <Field label="标题" value={draft.title ?? ''} onChange={(value) => updateDraft('title', value)} />
          <Field
            label="摘要"
            value={draft.summary ?? ''}
            onChange={(value) => updateDraft('summary', value)}
            rows={3}
          />
          <Field
            label="时间段"
            value={draft.time_of_day ?? ''}
            onChange={(value) => updateDraft('time_of_day', value)}
          />
          <Field label="天气" value={draft.weather ?? ''} onChange={(value) => updateDraft('weather', value)} />
          <Field label="氛围" value={draft.mood ?? ''} onChange={(value) => updateDraft('mood', value)} />
        </>,
      );
    case 'story':
      return shell(
        <>
          <Field label="标题" value={draft.title ?? ''} onChange={(value) => updateDraft('title', value)} />
          <Field label="类型" value={draft.genre ?? ''} onChange={(value) => updateDraft('genre', value)} />
          <Field label="主题" value={draft.theme ?? ''} onChange={(value) => updateDraft('theme', value)} />
          <Field
            label="一句话梗概"
            value={draft.logline ?? ''}
            onChange={(value) => updateDraft('logline', value)}
            rows={2}
          />
          <Field
            label="完整梗概"
            value={draft.synopsis ?? ''}
            onChange={(value) => updateDraft('synopsis', value)}
            rows={4}
          />
        </>,
      );
    default:
      return (
        <div className="px-4 py-6 text-sm text-zinc-500">
          当前选中「{KIND_LABEL[selection.kind] ?? selection.kind}」，暂不支持在此编辑。
        </div>
      );
  }
}

function renderReadonly(
  selection: Exclude<WorldSelection, null>,
  resources: WorldResourcesDTO,
): React.ReactNode {
  const entities = resources.entities;
  switch (selection.kind) {
    case 'character': {
      const asset = entities.characters.find((item) => item.id === selection.id);
      if (!asset) return null;
      const appearance = asset.appearance;
      return (
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
    case 'location': {
      const asset = entities.locations.find((item) => item.id === selection.id);
      if (!asset) return null;
      return (
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
    case 'scene': {
      const scene = entities.scenes.find((item) => item.id === selection.id);
      if (!scene) return null;
      return (
        <EntityDetail
          kind="scene"
          label="场景"
          fields={[
            { label: '标题', value: scene.title },
            { label: '摘要', value: sceneSummary(scene) },
            { label: '时间段', value: sceneTime(scene) },
            { label: '天气', value: scene.weather },
            { label: '氛围', value: scene.mood },
            { label: '镜头数', value: scene.shot_count ?? 0 },
          ]}
        />
      );
    }
    case 'world_event': {
      const event = entities.world_events.find((item) => item.id === selection.id);
      if (!event) return null;
      return (
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
            { label: '世界时间', value: <JsonValue value={event.world_time_envelope} /> },
          ]}
        />
      );
    }
    case 'relationship': {
      const relationship = entities.relationships.find((item) => item.id === selection.id);
      if (!relationship) return null;
      return (
        <EntityDetail
          kind="relationship"
          label="关系"
          fields={[
            { label: '类型', value: relationship.kind },
            { label: '标签', value: relationship.label },
            { label: '描述', value: relationship.description },
            { label: '方向', value: relationship.direction },
            { label: '起点', value: `${relationship.source_type}:${relationship.source_id}` },
            { label: '终点', value: `${relationship.target_type}:${relationship.target_id}` },
            { label: '状态', value: relationship.state },
          ]}
        />
      );
    }
    case 'story': {
      const story = entities.stories.find((item) => item.id === selection.id);
      if (!story) return null;
      return (
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
    case 'project': {
      const worldview = resources.project.worldview ?? { rules: [] };
      return (
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
    case 'shot': {
      const shot = (resources.entities.shots ?? []).find((item) => item.id === selection.id);
      if (!shot) return null;
      const scene = entities.scenes.find((item) => item.id === shot.scene_id);
      const href =
        scene?.story_id
          ? `/projects/${resources.project.id}/stories/${scene.story_id}/scenes/${scene.id}/shots/${shot.id}`
          : null;
      return (
        <div>
          <EntityDetail
            kind="shot"
            label="镜头"
            fields={[
              { label: '标签', value: shot.label || `镜头 ${shot.order}` },
              { label: '顺序', value: shot.order },
              { label: '状态', value: shot.state },
              { label: '氛围', value: shot.mood },
              { label: '所属场景', value: scene?.title },
            ]}
          />
          {href ? (
            <div className="px-4 pb-4">
              <Link
                href={href}
                className="text-xs text-accent hover:underline"
              >
                打开镜头规格编辑器 →
              </Link>
            </div>
          ) : null}
        </div>
      );
    }
    default:
      return null;
  }
}

async function persistSelection(
  resources: WorldResourcesDTO,
  selection: Exclude<WorldSelection, null>,
  draft: EntityDraft,
): Promise<void> {
  switch (selection.kind) {
    case 'project':
      await api(`/projects/${resources.project.id}`, {
        method: 'PATCH',
        body: {
          name: requiredText(draft.name ?? '', resources.project.name),
          description: (draft.description ?? '').trim(),
          worldview: {
            genre: (draft.genre ?? '').trim(),
            premise: (draft.premise ?? '').trim(),
            rules: (draft.rulesText ?? '')
              .split('\n')
              .map((rule) => rule.trim())
              .filter(Boolean),
            notes: (draft.notes ?? '').trim(),
          },
        },
      });
      return;
    case 'character': {
      const existing = resources.entities.characters.find((item) => item.id === selection.id);
      await api(`/assets/${selection.id}`, {
        method: 'PATCH',
        body: {
          name: requiredText(draft.name ?? '', existing?.name ?? '未命名角色'),
          description: requiredText(draft.description ?? '', existing?.description || '（待补充）'),
          aliases: splitList(draft.aliases ?? ''),
          tags: splitList(draft.tags ?? ''),
          appearance: {
            ...(existing?.appearance ?? {}),
            gender: (draft.gender ?? '').trim() || null,
            age_range: (draft.age_range ?? '').trim() || null,
            build: (draft.build ?? '').trim() || null,
          },
          personality: (draft.personality ?? '').trim() || null,
          default_outfit: (draft.default_outfit ?? '').trim() || null,
        },
      });
      return;
    }
    case 'location': {
      const existing = resources.entities.locations.find((item) => item.id === selection.id);
      await api(`/assets/${selection.id}`, {
        method: 'PATCH',
        body: {
          name: requiredText(draft.name ?? '', existing?.name ?? '未命名地点'),
          description: requiredText(draft.description ?? '', existing?.description || '（待补充）'),
          tags: splitList(draft.tags ?? ''),
          time_period: (draft.time_period ?? '').trim() || null,
          weather_default: (draft.weather_default ?? '').trim() || null,
          lighting_default: (draft.lighting_default ?? '').trim() || null,
          mood_default: (draft.mood_default ?? '').trim() || null,
        },
      });
      return;
    }
    case 'world_event':
      await api(`/world/world-events/${selection.id}`, {
        method: 'PATCH',
        body: {
          title: requiredText(draft.title ?? '', '未命名事件'),
          description: (draft.description ?? '').trim() || null,
        },
      });
      return;
    case 'relationship':
      await api(`/world/relationships/${selection.id}`, {
        method: 'PATCH',
        body: {
          label: (draft.label ?? '').trim() || null,
          description: (draft.description ?? '').trim() || null,
        },
      });
      return;
    case 'scene':
      await api(`/scenes/${selection.id}`, {
        method: 'PATCH',
        body: {
          title: requiredText(draft.title ?? '', '未命名场景'),
          summary: (draft.summary ?? '').trim() || null,
          time_of_day: (draft.time_of_day ?? '').trim() || null,
          weather: (draft.weather ?? '').trim() || null,
          mood: (draft.mood ?? '').trim() || null,
        },
      });
      return;
    case 'story':
      await api(`/stories/${selection.id}`, {
        method: 'PATCH',
        body: {
          title: requiredText(draft.title ?? '', '未命名故事'),
          genre: (draft.genre ?? '').trim() || null,
          theme: (draft.theme ?? '').trim() || null,
          logline: (draft.logline ?? '').trim() || null,
          synopsis: (draft.synopsis ?? '').trim() || null,
        },
      });
      return;
    default:
      throw new Error('当前实体暂不支持在 Inspector 中保存');
  }
}
