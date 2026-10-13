'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  AssetDTO,
  SceneDTO,
  StoryDTO,
  TemporalDimensionDTO,
  WorldConflictDTO,
  WorldEventDTO,
  WorldRelationshipDTO,
  WorldResourcesDTO,
  WorldSelection,
} from '@/lib/types';
import { api, errorMessage } from '@/lib/api';
import { RoleplayLaunchButton } from '@/components/creator-chat/roleplay-launch';
import { focusFromSelection } from '@/lib/creator-chat-nav';
import { CharacterArchive } from './character-archive';
import { useStudioSelection } from './studio-selection';
import {
  canonicalizeWorldTimeMode,
  DIMENSION_KIND_LABEL,
  resolveDisplayDimensions,
  countEventsBoundToDimension,
  projectCameraCaption,
  projectStyleCaption,
  projectPromptCaption,
  projectModelCaption,
  worldTimeCaption,
  worldTimeMode,
  worldTimeModeLabel,
  worldTimeOrder,
  worldTimeRelation,
} from '@/lib/world-line';
import { ContinueInChatButton } from './continue-in-chat';
import { EntityStages } from './entity-stages';
import { conflictsForSelection } from '@/lib/world-conflicts';
import { createStudioEntity, type StudioCreateKind } from '@/lib/studio-entity-create';
import { studioDeleteTarget } from '@/lib/studio-entity-delete';
import { CreateCharacterForm } from '@/components/create-character-form';
import { playableCharacters } from '@/lib/create-world-character';
import {
  characterName,
  locationName,
  namedRefLabel,
  parseDraftRef,
  refKey,
  relationshipRefOptions,
  sceneTitle,
} from '@/lib/entity-refs';

const KIND_COLOR: Record<string, string> = {
  character: 'text-[#4d6bfe] border-[#4d6bfe]/30 bg-[#4d6bfe]/10',
  location: 'text-[#059669] border-[#059669]/30 bg-[#059669]/10',
  scene: 'text-[#60a5fa] border-[#60a5fa]/40 bg-[#60a5fa]/10',
  world_event: 'text-[#fbbf24] border-[#fbbf24]/40 bg-[#fbbf24]/10',
  story: 'text-[#f472b6] border-[#f472b6]/40 bg-[#f472b6]/10',
  project: 'text-zinc-700 border-zinc-500/40 bg-zinc-500/10',
  dimension: 'text-violet-800 border-violet-400/50 bg-violet-500/10',
  relationship: 'text-[#f59e0b] border-[#f59e0b]/40 bg-[#f59e0b]/10',
  shot: 'text-[#fb7185] border-[#fb7185]/40 bg-[#fb7185]/10',
  camera: 'text-teal-800 border-teal-400/50 bg-teal-500/10',
  style: 'text-violet-800 border-violet-400/50 bg-violet-500/10',
  prompt: 'text-amber-800 border-amber-400/50 bg-amber-500/10',
  model: 'text-indigo-800 border-indigo-400/50 bg-indigo-500/10',
};

const KIND_LABEL: Record<string, string> = {
  character: '角色',
  location: '地点',
  scene: '场景',
  world_event: '世界事件',
  story: '故事',
  project: 'IP Core',
  dimension: '时间维度',
  relationship: '关系',
  shot: '镜头',
  camera: '机位',
  style: '风格',
  prompt: '提示词',
  model: '模型',
};

const fieldClass =
  'w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-accent/60';

const WORLD_TIME_MODE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'follow', label: '跟随呈现顺序' },
  { value: 'point', label: '时刻（可模糊）' },
  { value: 'range', label: '区间' },
  { value: 'relative', label: '相对（闪回/跳跃）' },
  { value: 'crossing', label: '平行维度' },
  { value: 'unknown', label: '未知' },
];

const DIMENSION_KIND_OPTIONS: Array<{ value: TemporalDimensionDTO['kind']; label: string }> = [
  { value: 'worldline', label: '世界线' },
  { value: 'calendar', label: '历法' },
  { value: 'dream', label: '梦境' },
  { value: 'simulation', label: '模拟' },
  { value: 'custom', label: '自定义' },
];

function opaqueField(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'label' in value) {
    const label = (value as { label?: unknown }).label;
    if (typeof label === 'string') return label;
  }
  return '';
}

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
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${KIND_COLOR[kind]}`}
        >
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

function ConflictEditHint({
  conflicts,
  editing,
  onEdit,
}: {
  conflicts: WorldConflictDTO[];
  editing: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="mx-4 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-900">
      {conflicts.map((conflict) => (
        <p key={conflict.id}>{conflict.summary}</p>
      ))}
      <p className="mt-1 text-zinc-600">
        {editing
          ? '改下面描述里互相打架的句子，保存后这条冲突会消失。'
          : '点「编辑描述」，只保留你要的那一则（或改成不互斥的写法）。'}
      </p>
      {!editing ? (
        <button
          type="button"
          onClick={onEdit}
          className="mt-1.5 rounded-md border border-amber-700/30 bg-white px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-50"
        >
          编辑描述
        </button>
      ) : null}
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

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-500">{label}</span>
      <select
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChecklistField({
  label,
  options,
  selected,
  onChange,
  emptyHint,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyHint?: string;
}) {
  return (
    <fieldset className="block">
      <legend className="mb-1 block text-xs text-zinc-500">{label}</legend>
      {options.length === 0 ? (
        <p className="text-[11px] leading-5 text-zinc-500">{emptyHint ?? '还没有可选项。'}</p>
      ) : (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-line bg-white px-2.5 py-1.5">
          {options.map((option) => {
            const checked = selected.includes(option.id);
            return (
              <label key={option.id} className="flex items-center gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selected.filter((id) => id !== option.id)
                        : [...selected, option.id],
                    )
                  }
                />
                <span className="min-w-0 truncate">{option.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
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
    height: appearance.height ?? '',
    build: appearance.build ?? '',
    skin_tone: appearance.skin_tone ?? '',
    hair: appearance.hair ?? '',
    eyes: appearance.eyes ?? '',
    distinguishing_features: appearance.distinguishing_features ?? '',
    custom: appearance.custom ?? '',
    personality: asset.personality ?? '',
    default_outfit: asset.default_outfit ?? '',
    stage_label: '',
    as_of_world_event_id: '',
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
    stage_label: '',
    as_of_world_event_id: '',
  };
}

function eventDraft(event: WorldEventDTO): EntityDraft {
  const envelope = event.world_time_envelope ?? {};
  const caption = worldTimeCaption(envelope);
  const mode = canonicalizeWorldTimeMode(envelope.mode) ?? (caption ? 'point' : 'follow');
  return {
    title: event.title ?? '',
    description: event.description ?? '',
    world_time_mode: mode,
    dimension_id: typeof envelope.dimension_id === 'string' ? envelope.dimension_id : 'main',
    world_time_label: typeof envelope.label === 'string' ? envelope.label : (caption ?? ''),
    confidence: typeof envelope.confidence === 'string' ? envelope.confidence : 'approximate',
    world_time_start: opaqueField(envelope.start),
    world_time_end: opaqueField(envelope.end),
    world_time_relation: typeof envelope.relation === 'string' ? envelope.relation : 'before',
    anchor_item_id: typeof envelope.anchor_item_id === 'string' ? envelope.anchor_item_id : '',
    character_ids: joinList(event.character_ids),
    scene_ids: joinList(event.scene_ids),
  };
}

function relationshipDraft(relationship: WorldRelationshipDTO): EntityDraft {
  return {
    kind: relationship.kind ?? '',
    label: relationship.label ?? '',
    description: relationship.description ?? '',
    direction: relationship.direction ?? 'directed',
    source_key: refKey({ type: relationship.source_type, id: relationship.source_id }),
    target_key: refKey({ type: relationship.target_type, id: relationship.target_id }),
  };
}

function sceneDraft(scene: SceneDTO): EntityDraft {
  return {
    title: scene.title ?? '',
    summary: sceneSummary(scene),
    time_of_day: sceneTime(scene),
    weather: scene.weather ?? '',
    mood: scene.mood ?? '',
    location_id: scene.location_id ?? '',
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

function defaultDimensions(resources: WorldResourcesDTO): TemporalDimensionDTO[] {
  return resolveDisplayDimensions(resources);
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
    dimensions_json: JSON.stringify(defaultDimensions(resources)),
  };
}

function dimensionDraft(dimension: TemporalDimensionDTO): EntityDraft {
  return {
    label: dimension.label ?? '',
    kind: dimension.kind,
  };
}

function envelopeFromDraft(draft: EntityDraft): Record<string, unknown> {
  const mode = draft.world_time_mode || 'follow';
  const label = (draft.world_time_label ?? '').trim();
  if (mode === 'follow') {
    return label ? { mode: 'point', dimension_id: draft.dimension_id || 'main', label } : {};
  }
  const envelope: Record<string, unknown> = {
    mode,
    dimension_id: (draft.dimension_id ?? '').trim() || 'main',
  };
  if (label) envelope.label = label;
  if (mode === 'point' && draft.confidence) envelope.confidence = draft.confidence;
  if (mode === 'range') {
    const start = (draft.world_time_start ?? '').trim();
    const end = (draft.world_time_end ?? '').trim();
    if (start) envelope.start = start;
    if (end) envelope.end = end;
    if (!start && !end && !label) envelope.label = '区间';
  }
  if (mode === 'relative') {
    envelope.relation = draft.world_time_relation || 'before';
    const anchor = (draft.anchor_item_id ?? '').trim();
    if (anchor) envelope.anchor_item_id = anchor;
  }
  return envelope;
}

function parseDimensionsDraft(draft: EntityDraft): TemporalDimensionDTO[] {
  try {
    const parsed = JSON.parse(draft.dimensions_json || '[]') as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [{ id: 'main', label: '主世界线', kind: 'worldline' }];
    }
    return parsed.filter(
      (item): item is TemporalDimensionDTO =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as TemporalDimensionDTO).id === 'string' &&
        typeof (item as TemporalDimensionDTO).label === 'string',
    );
  } catch {
    return [{ id: 'main', label: '主世界线', kind: 'worldline' }];
  }
}

function draftForSelection(
  resources: WorldResourcesDTO,
  selection: Exclude<WorldSelection, null>,
): EntityDraft {
  const entities = resources.entities;
  switch (selection.kind) {
    case 'project':
      return projectDraftFrom(resources);
    case 'dimension': {
      const dimension = resolveDisplayDimensions(resources).find(
        (item) => item.id === selection.id,
      );
      return dimension ? dimensionDraft(dimension) : {};
    }
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

function EmptyWorldActions({ resources }: { resources: WorldResourcesDTO }) {
  const { reload, setSelection, requestEdit } = useStudioSelection();
  const [busy, setBusy] = useState<StudioCreateKind | null>(null);
  const [error, setError] = useState('');

  async function create(kind: StudioCreateKind) {
    if (busy) return;
    setBusy(kind);
    setError('');
    try {
      const next = await createStudioEntity(resources.project.id, resources, kind);
      await reload({ silent: true });
      setSelection(next);
      requestEdit(next);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-4 space-y-3">
      <p className="text-xs text-zinc-500">还没选中实体时，可以直接在这里建：</p>
      {playableCharacters(resources.entities.characters).length === 0 ? (
        <CreateCharacterForm
          projectId={resources.project.id}
          existingNames={resources.entities.characters.map((item) => item.name)}
          allowTalk={false}
          compact
          onCreated={(character) => {
            void reload({ silent: true }).then(() => {
              const next = { kind: 'character' as const, id: character.id };
              setSelection(next);
              requestEdit(next);
            });
          }}
        />
      ) : (
        <p className="text-xs text-zinc-500">再添加角色请用左侧「+ 角色」，需要先填写名字。</p>
      )}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void create('world_event')}
        className="rounded-md border border-line px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
      >
        {busy === 'world_event' ? '创建中…' : '新建事件'}
      </button>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

export function InspectorPanel({
  resources,
  selection,
  view = 'world',
  onSelect,
  onUpdated,
}: {
  resources: WorldResourcesDTO;
  selection: WorldSelection;
  view?: 'world' | 'production' | 'space';
  onSelect?: (selection: Exclude<WorldSelection, null>) => void;
  onUpdated?: () => void;
}) {
  const { pendingEditKey, consumeBeginEditing } = useStudioSelection();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [draft, setDraft] = useState<EntityDraft>({});

  useEffect(() => {
    setEditing(false);
    setEditError('');
  }, [selection]);

  useEffect(() => {
    if (!selection || !pendingEditKey) return;
    if (pendingEditKey === `${selection.kind}:${selection.id}`) {
      setEditing(true);
      return;
    }
    consumeBeginEditing();
  }, [pendingEditKey, selection, consumeBeginEditing]);

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
      consumeBeginEditing();
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
      ? renderEditor(
          selection,
          resources,
          draft,
          updateDraft,
          saving,
          editError,
          () => {
            void save();
          },
          () => {
            consumeBeginEditing();
            setEditing(false);
          },
        )
      : renderReadonly(selection, resources, onSelect);
    if (!detail) {
      detail = (
        <div className="px-4 py-6 text-sm text-zinc-500">
          未找到该实体（可能已删除或不在当前视图）
        </div>
      );
    }
  }

  const relatedConflicts = conflictsForSelection(resources.conflicts, selection);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-x-hidden overflow-y-auto">
      <section className="border-b border-line">
        <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-2">
          <h2 className="text-xs font-semibold tracking-wider text-zinc-500">
            {view === 'space' ? '空间属性' : '世界线属性'}
          </h2>
          {selection &&
          !editing &&
          selection.kind !== 'shot' &&
          selection.kind !== 'camera' &&
          selection.kind !== 'style' &&
          selection.kind !== 'prompt' &&
          selection.kind !== 'model' ? (
            <div className="flex items-center gap-2">
              {selection.kind === 'character' && (
                <ImportUpgradeButton
                  asset={resources.entities.characters.find((item) => item.id === selection.id)}
                  onUpgraded={onUpdated}
                />
              )}
              {selection.kind === 'character' && (
                <RoleplayLaunchButton
                  projectId={resources.project.id}
                  characterAssetId={selection.id}
                  characterName={
                    resources.entities.characters.find((character) => character.id === selection.id)
                      ?.name ?? '该角色'
                  }
                  characters={resources.entities.characters}
                  worldEvents={resources.entities.world_events}
                />
              )}
              <ContinueInChatButton
                projectId={resources.project.id}
                focus={focusFromSelection(resources, selection)}
                label="在对话中继续"
                className="rounded-md border border-line px-2 py-0.5 text-xs text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
              />
              {studioDeleteTarget(selection, resources) ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    const target = studioDeleteTarget(selection, resources);
                    if (!target) return;
                    if (!window.confirm(target.confirm)) return;
                    setSaving(true);
                    setEditError('');
                    void api(target.path, { method: 'DELETE' })
                      .then(() => {
                        onSelect?.({ kind: 'project', id: resources.project.id });
                        onUpdated?.();
                      })
                      .catch((reason: unknown) => setEditError(errorMessage(reason)))
                      .finally(() => setSaving(false));
                  }}
                  className="rounded-md border border-line px-2 py-0.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  删除
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md border border-line px-2 py-0.5 text-xs text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
              >
                {selection.kind === 'character' ? '编辑角色卡' : '编辑'}
              </button>
            </div>
          ) : selection && editing && studioDeleteTarget(selection, resources) ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                const target = studioDeleteTarget(selection, resources);
                if (!target) return;
                if (!window.confirm(target.confirm)) return;
                setSaving(true);
                setEditError('');
                void api(target.path, { method: 'DELETE' })
                  .then(() => {
                    consumeBeginEditing();
                    setEditing(false);
                    onSelect?.({ kind: 'project', id: resources.project.id });
                    onUpdated?.();
                  })
                  .catch((reason: unknown) => setEditError(errorMessage(reason)))
                  .finally(() => setSaving(false));
              }}
              className="rounded-md border border-line px-2 py-0.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              删除
            </button>
          ) : null}
        </header>
        {editError && !editing ? (
          <p className="px-4 pb-2 text-xs text-red-500" role="alert">
            {editError}
          </p>
        ) : null}
        {selection ? (
          <>
            {relatedConflicts.length > 0 ? (
              <ConflictEditHint
                conflicts={relatedConflicts}
                editing={editing}
                onEdit={() => setEditing(true)}
              />
            ) : null}
            {detail}
            {selection.kind === 'character' &&
            resources.entities.characters.some((item) => item.id === selection.id) ? (
              <CharacterArchive
                projectId={resources.project.id}
                characterId={selection.id}
                characterName={
                  resources.entities.characters.find((item) => item.id === selection.id)?.name ?? ''
                }
                resources={resources}
                onSelect={onSelect}
                onUpdated={onUpdated}
              />
            ) : null}
          </>
        ) : view === 'space' ? (
          <div className="px-4 pb-6">
            <p className="text-sm leading-6 text-zinc-600">
              中间是空间浏览器：恒星系 → 世界星球 → 地点 Pin →
              场景。点左侧地点或星球上的标记，这里编辑同一份资产。
            </p>
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              地点简介写在地点描述里，不是另一份空间数据。没有地点时先在树里新建，或回「世界」时间线补条目。
            </p>
          </div>
        ) : view === 'production' ? (
          <div className="px-4 pb-6">
            <p className="text-sm leading-6 text-zinc-600">
              这是创作线视图。中间按呈现顺序排：故事 → 场景 → 镜头，下面四条是镜头的只读投影（机位 /
              风格 / 提示词 / 模型）。
            </p>
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              这个项目还没有故事和镜头，所以轨是空的。去创作聊天先写故事，或点左上角「世界」看角色与时间维度。
            </p>
          </div>
        ) : (
          <div className="px-4 pb-6">
            <EmptyWorldActions resources={resources} />
            <p className="text-sm leading-6 text-zinc-600">
              世界时间默认跟随呈现顺序。点左侧「IP
              Core」可改世界观与规则；点时间维度芯片可增改梦境、历法、平行世界。
            </p>
            <ul className="mt-3 space-y-1.5">
              {defaultDimensions(resources).map((dimension) => (
                <li key={dimension.id}>
                  <button
                    type="button"
                    onClick={() => onSelect?.({ kind: 'dimension', id: dimension.id })}
                    className="w-full rounded-md border border-violet-200 bg-violet-50/70 px-3 py-2 text-left text-sm text-violet-950 hover:border-violet-400"
                  >
                    {dimension.label}
                    <span className="ml-2 text-xs text-violet-600">
                      {DIMENSION_KIND_LABEL[dimension.kind]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              有世界事件后，在事件上声明闪回（相对）、区间或平行绑定；主轴不会改成真实日历。
            </p>
          </div>
        )}
      </section>

      <section className="flex-1">
        <header className="px-4 pt-4 pb-2">
          <h2 className="text-xs font-semibold tracking-wider text-zinc-500">
            {view === 'space' ? '空间导航' : '创作线属性'}
          </h2>
        </header>
        <div className="px-4 pb-6">
          <p className="text-sm leading-relaxed text-zinc-600">
            {view === 'space'
              ? '球体只表示世界这一天体尺度。地点和场景是同一颗星球上的标记；右侧编辑的是世界资源，不是第二套空间表。'
              : view === 'production'
                ? '机位、风格、提示词、模型已经在中间时间线投影，不另存一份。选中条目后属性显示在上方。'
                : '点右上角「创作线」可看到机位 / 风格 / 提示词 / 模型派生轨。它们跟随镜头状态，不另存 TimelineItem。'}
          </p>
        </div>
      </section>
    </div>
  );
}

/** 导入轻量条目 → 全量角色卡（设计 §5.6）。 */
function ImportUpgradeButton({ asset, onUpgraded }: { asset?: AssetDTO; onUpgraded?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const importId = asset?.import_id;
  if (!asset || asset.tier !== 'light' || !importId) return null;
  const assetId = asset.id;

  async function upgrade() {
    setBusy(true);
    setError('');
    try {
      await api(`/novel-imports/${importId}/upgrade`, {
        method: 'POST',
        body: { asset_id: assetId },
      });
      onUpgraded?.();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void upgrade()}
        className="rounded-md border border-[#4d6bfe]/40 px-2 py-0.5 text-xs text-[#1e3a8a] transition hover:bg-[#eef2ff] disabled:opacity-50"
      >
        {busy ? '升级中…' : '升级为角色卡'}
      </button>
      {error ? <span className="text-[10px] text-red-500">{error}</span> : null}
    </span>
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
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${KIND_COLOR[kind]}`}
        >
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

function DimensionEditor({
  dimensions,
  onChange,
}: {
  dimensions: TemporalDimensionDTO[];
  onChange: (next: TemporalDimensionDTO[]) => void;
}) {
  function update(index: number, patch: Partial<TemporalDimensionDTO>) {
    onChange(
      dimensions.map((dimension, current) =>
        current === index ? { ...dimension, ...patch } : dimension,
      ),
    );
  }
  return (
    <div className="space-y-2">
      <span className="block text-xs text-zinc-500">时间维度</span>
      {dimensions.map((dimension, index) => (
        <div key={dimension.id} className="flex gap-2">
          <input
            className={fieldClass}
            value={dimension.label}
            onChange={(event) => update(index, { label: event.target.value })}
            placeholder="维度名称"
          />
          <select
            className={`${fieldClass} w-28 shrink-0`}
            value={dimension.kind}
            onChange={(event) =>
              update(index, { kind: event.target.value as TemporalDimensionDTO['kind'] })
            }
          >
            {DIMENSION_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button
        type="button"
        className="text-xs text-accent hover:underline"
        onClick={() =>
          onChange([...dimensions, { id: `dim-${Date.now()}`, label: '新维度', kind: 'custom' }])
        }
      >
        + 添加维度
      </button>
      <p className="text-[11px] leading-4 text-zinc-500">
        维度只定义这个世界如何计时，核心不会换算真实日历。空绑定仍跟随呈现顺序。
      </p>
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
          <Field
            label="名称"
            value={draft.name ?? ''}
            onChange={(value) => updateDraft('name', value)}
          />
          <Field
            label="描述"
            value={draft.description ?? ''}
            onChange={(value) => updateDraft('description', value)}
            rows={3}
          />
          <Field
            label="题材"
            value={draft.genre ?? ''}
            onChange={(value) => updateDraft('genre', value)}
          />
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
          <DimensionEditor
            dimensions={parseDimensionsDraft(draft)}
            onChange={(next) => updateDraft('dimensions_json', JSON.stringify(next))}
          />
        </>,
      );
    case 'dimension':
      return shell(
        <>
          <Field
            label="名称"
            value={draft.label ?? ''}
            onChange={(value) => updateDraft('label', value)}
          />
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-500">类型</span>
            <select
              className={fieldClass}
              value={draft.kind ?? 'custom'}
              onChange={(event) => updateDraft('kind', event.target.value)}
            >
              {DIMENSION_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] leading-4 text-zinc-500">
            维度只命名这个世界如何计时。事件把信封的 dimension_id
            指到这里；核心不会把历法换算成真实日期。
          </p>
        </>,
      );
    case 'character':
      return shell(
        <>
          <Field
            label="名称"
            value={draft.name ?? ''}
            onChange={(value) => updateDraft('name', value)}
          />
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
          <Field
            label="性别"
            value={draft.gender ?? ''}
            onChange={(value) => updateDraft('gender', value)}
          />
          <Field
            label="年龄"
            value={draft.age_range ?? ''}
            onChange={(value) => updateDraft('age_range', value)}
          />
          <Field
            label="身形"
            value={draft.build ?? ''}
            onChange={(value) => updateDraft('build', value)}
          />
          <Field
            label="身高"
            value={draft.height ?? ''}
            onChange={(value) => updateDraft('height', value)}
          />
          <Field
            label="肤色"
            value={draft.skin_tone ?? ''}
            onChange={(value) => updateDraft('skin_tone', value)}
          />
          <Field
            label="发型发色"
            value={draft.hair ?? ''}
            onChange={(value) => updateDraft('hair', value)}
          />
          <Field
            label="眼睛"
            value={draft.eyes ?? ''}
            onChange={(value) => updateDraft('eyes', value)}
          />
          <Field
            label="辨识特征"
            value={draft.distinguishing_features ?? ''}
            onChange={(value) => updateDraft('distinguishing_features', value)}
            rows={2}
          />
          <Field
            label="补充外形"
            value={draft.custom ?? ''}
            onChange={(value) => updateDraft('custom', value)}
            rows={2}
          />
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
          <Field
            label="阶段名"
            value={draft.stage_label ?? ''}
            onChange={(value) => updateDraft('stage_label', value)}
            placeholder="如：普通学生 / 觉醒 / 领袖"
          />
          <SelectField
            label="此阶段始于"
            value={draft.as_of_world_event_id ?? ''}
            onChange={(value) => updateDraft('as_of_world_event_id', value)}
            options={[
              { value: '', label: '不锚定（只更新当前卡）' },
              ...resources.entities.world_events.map((event) => ({
                value: event.id,
                label: event.title?.trim() || '未命名事件',
              })),
            ]}
          />
          <p className="text-[11px] leading-5 text-zinc-500">
            名称、简介、个性是角色卡：世界构建对话和「与此角色对话」共用这一份。下方「TA
            记得什么」是这个角色在世界里的经历，不是助手的任务笔记。亲历、认识谁、短事实、档案都可以改或忘掉。保存时可选锚定到世界事件，扮演会读那一刻的卡。
          </p>
        </>,
      );
    case 'location':
      return shell(
        <>
          <Field
            label="名称"
            value={draft.name ?? ''}
            onChange={(value) => updateDraft('name', value)}
          />
          <Field
            label="描述"
            value={draft.description ?? ''}
            onChange={(value) => updateDraft('description', value)}
            rows={3}
          />
          <Field
            label="标签"
            value={draft.tags ?? ''}
            onChange={(value) => updateDraft('tags', value)}
          />
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
          <Field
            label="阶段名"
            value={draft.stage_label ?? ''}
            onChange={(value) => updateDraft('stage_label', value)}
            placeholder="如：废港时期 / 重建后"
          />
          <SelectField
            label="此阶段始于"
            value={draft.as_of_world_event_id ?? ''}
            onChange={(value) => updateDraft('as_of_world_event_id', value)}
            options={[
              { value: '', label: '不锚定（只更新当前卡）' },
              ...resources.entities.world_events.map((event) => ({
                value: event.id,
                label: event.title?.trim() || '未命名事件',
              })),
            ]}
          />
        </>,
      );
    case 'world_event':
      return shell(
        <>
          <Field
            label="标题"
            value={draft.title ?? ''}
            onChange={(value) => updateDraft('title', value)}
          />
          <Field
            label="描述"
            value={draft.description ?? ''}
            onChange={(value) => updateDraft('description', value)}
            rows={4}
          />
          <ChecklistField
            label="参与角色"
            options={resources.entities.characters.map((item) => ({
              id: item.id,
              label: item.name,
            }))}
            selected={splitList(draft.character_ids ?? '')}
            onChange={(ids) => updateDraft('character_ids', joinList(ids))}
            emptyHint="还没有角色。先在左侧点「+ 角色」。"
          />
          <ChecklistField
            label="关联场景"
            options={resources.entities.scenes.map((item) => ({
              id: item.id,
              label: item.title,
            }))}
            selected={splitList(draft.scene_ids ?? '')}
            onChange={(ids) => updateDraft('scene_ids', joinList(ids))}
            emptyHint="还没有场景。先在左侧点「+ 场景」。"
          />
          <SelectField
            label="世界时间"
            value={draft.world_time_mode ?? 'follow'}
            onChange={(value) => updateDraft('world_time_mode', value)}
            options={WORLD_TIME_MODE_OPTIONS}
          />
          {(draft.world_time_mode ?? 'follow') !== 'follow' ? (
            <>
              <SelectField
                label="时间维度"
                value={draft.dimension_id || 'main'}
                onChange={(value) => updateDraft('dimension_id', value)}
                options={defaultDimensions(resources).map((dimension) => ({
                  value: dimension.id,
                  label: dimension.label,
                }))}
              />
              <Field
                label="世界时间标签"
                value={draft.world_time_label ?? ''}
                onChange={(value) => updateDraft('world_time_label', value)}
                placeholder="如：第一纪元 · 秋"
              />
            </>
          ) : null}
          {draft.world_time_mode === 'point' ? (
            <SelectField
              label="精确程度"
              value={draft.confidence ?? 'approximate'}
              onChange={(value) => updateDraft('confidence', value)}
              options={[
                { value: 'exact', label: '精确' },
                { value: 'approximate', label: '模糊' },
                { value: 'ambiguous', label: '含混' },
              ]}
            />
          ) : null}
          {draft.world_time_mode === 'range' ? (
            <>
              <Field
                label="区间起点"
                value={draft.world_time_start ?? ''}
                onChange={(value) => updateDraft('world_time_start', value)}
                placeholder="不透明世界时间值"
              />
              <Field
                label="区间终点"
                value={draft.world_time_end ?? ''}
                onChange={(value) => updateDraft('world_time_end', value)}
              />
            </>
          ) : null}
          {draft.world_time_mode === 'relative' ? (
            <>
              <SelectField
                label="相对关系"
                value={draft.world_time_relation ?? 'before'}
                onChange={(value) => updateDraft('world_time_relation', value)}
                options={[
                  { value: 'before', label: '之前（闪回）' },
                  { value: 'after', label: '之后' },
                  { value: 'same_as', label: '同时' },
                  { value: 'overlaps', label: '重叠' },
                ]}
              />
              <Field
                label="锚定条目 ID"
                value={draft.anchor_item_id ?? ''}
                onChange={(value) => updateDraft('anchor_item_id', value)}
                placeholder="可选"
              />
            </>
          ) : null}
        </>,
      );
    case 'relationship': {
      const relOptions = relationshipRefOptions(resources);
      const selectOptions = relOptions.map((item) => ({
        value: refKey(item),
        label: item.label,
      }));
      if (draft.source_key && !selectOptions.some((option) => option.value === draft.source_key)) {
        selectOptions.unshift({ value: draft.source_key, label: draft.source_key });
      }
      if (draft.target_key && !selectOptions.some((option) => option.value === draft.target_key)) {
        selectOptions.push({ value: draft.target_key, label: draft.target_key });
      }
      return shell(
        <>
          <Field
            label="类型"
            value={draft.kind ?? ''}
            onChange={(value) => updateDraft('kind', value)}
            placeholder="如：师徒"
          />
          <Field
            label="标签"
            value={draft.label ?? ''}
            onChange={(value) => updateDraft('label', value)}
            placeholder="显示名（可选）"
          />
          <Field
            label="描述"
            value={draft.description ?? ''}
            onChange={(value) => updateDraft('description', value)}
            rows={3}
          />
          <SelectField
            label="方向"
            value={draft.direction ?? 'directed'}
            onChange={(value) => updateDraft('direction', value)}
            options={[
              { value: 'directed', label: '有向' },
              { value: 'undirected', label: '无向' },
            ]}
          />
          <SelectField
            label="起点"
            value={draft.source_key ?? ''}
            onChange={(value) => updateDraft('source_key', value)}
            options={selectOptions}
          />
          <SelectField
            label="终点"
            value={draft.target_key ?? ''}
            onChange={(value) => updateDraft('target_key', value)}
            options={selectOptions}
          />
        </>,
      );
    }
    case 'scene':
      return shell(
        <>
          <Field
            label="标题"
            value={draft.title ?? ''}
            onChange={(value) => updateDraft('title', value)}
          />
          <Field
            label="摘要"
            value={draft.summary ?? ''}
            onChange={(value) => updateDraft('summary', value)}
            rows={3}
          />
          <SelectField
            label="地点"
            value={draft.location_id ?? ''}
            onChange={(value) => updateDraft('location_id', value)}
            options={[
              { value: '', label: '未指定' },
              ...resources.entities.locations.map((item) => ({
                value: item.id,
                label: item.name,
              })),
            ]}
          />
          <Field
            label="时间段"
            value={draft.time_of_day ?? ''}
            onChange={(value) => updateDraft('time_of_day', value)}
          />
          <Field
            label="天气"
            value={draft.weather ?? ''}
            onChange={(value) => updateDraft('weather', value)}
          />
          <Field
            label="氛围"
            value={draft.mood ?? ''}
            onChange={(value) => updateDraft('mood', value)}
          />
        </>,
      );
    case 'story':
      return shell(
        <>
          <Field
            label="标题"
            value={draft.title ?? ''}
            onChange={(value) => updateDraft('title', value)}
          />
          <Field
            label="类型"
            value={draft.genre ?? ''}
            onChange={(value) => updateDraft('genre', value)}
          />
          <Field
            label="主题"
            value={draft.theme ?? ''}
            onChange={(value) => updateDraft('theme', value)}
          />
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
  onSelect?: (selection: Exclude<WorldSelection, null>) => void,
): React.ReactNode {
  const entities = resources.entities;
  switch (selection.kind) {
    case 'character': {
      const asset = entities.characters.find((item) => item.id === selection.id);
      if (!asset) return null;
      const appearance = asset.appearance;
      return (
        <>
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
              { label: '身高', value: appearance?.height },
              { label: '肤色', value: appearance?.skin_tone },
              { label: '发型发色', value: appearance?.hair },
              { label: '眼睛', value: appearance?.eyes },
              { label: '辨识特征', value: appearance?.distinguishing_features },
              { label: '补充外形', value: appearance?.custom },
              { label: '个性', value: asset.personality },
              { label: '常服', value: asset.default_outfit },
            ]}
          />
          <p className="px-4 pb-3 text-[11px] leading-5 text-zinc-500">
            名称、简介、个性是角色卡：点右上角「编辑角色卡」。下方「TA
            记得什么」是这个角色的经历，不是助手的任务笔记。亲历、认识谁、短事实、档案都可以改或忘掉。
          </p>
          <EntityStages
            projectId={resources.project.id}
            entityType="character"
            entityId={selection.id}
            events={resources.entities.world_events}
            onSelect={onSelect}
          />
        </>
      );
    }
    case 'location': {
      const asset = entities.locations.find((item) => item.id === selection.id);
      if (!asset) return null;
      return (
        <>
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
          <EntityStages
            projectId={resources.project.id}
            entityType="location"
            entityId={selection.id}
            events={resources.entities.world_events}
            onSelect={onSelect}
          />
        </>
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
            {
              label: '地点',
              value: scene.location_id ? locationName(resources, scene.location_id) : '',
            },
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
      const hintedOrder = worldTimeOrder(event.world_time_envelope);
      const presentation = event.presentation_order ?? 0;
      const diverges = hintedOrder != null && hintedOrder !== presentation;
      const relation = worldTimeRelation(event.world_time_envelope);
      const mode = worldTimeMode(event.world_time_envelope);
      const relationLabel =
        relation === 'follow'
          ? '跟随呈现顺序'
          : relation === 'crossing'
            ? '平行维度'
            : relation === 'unknown'
              ? '时间未知'
              : diverges
                ? `偏离呈现序（信封 order=${hintedOrder}）`
                : (worldTimeModeLabel(mode) ?? '显式世界时间');
      return (
        <EntityDetail
          kind="world_event"
          label="世界事件"
          fields={[
            { label: '标题', value: event.title },
            { label: '描述', value: event.description },
            { label: '呈现顺序', value: presentation },
            { label: '状态', value: event.state },
            {
              label: '参与角色',
              value: (event.character_ids ?? [])
                .map((id) => characterName(resources, id))
                .join(' · '),
            },
            {
              label: '关联场景',
              value: (event.scene_ids ?? []).map((id) => sceneTitle(resources, id)).join(' · '),
            },
            {
              label: '世界时间',
              value: worldTimeCaption(event.world_time_envelope) ?? '跟随呈现顺序',
            },
            {
              label: '与主轴关系',
              value: relationLabel,
            },
            { label: '世界时间信封', value: <JsonValue value={event.world_time_envelope} /> },
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
            {
              label: '起点',
              value: namedRefLabel(resources, relationship.source_type, relationship.source_id),
            },
            {
              label: '终点',
              value: namedRefLabel(resources, relationship.target_type, relationship.target_id),
            },
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
          label="IP Core"
          fields={[
            { label: '名称', value: resources.project.name },
            { label: '描述', value: resources.project.description },
            { label: '题材', value: worldview.genre },
            { label: '核心设定', value: worldview.premise },
            { label: '世界规则', value: (worldview.rules ?? []).join(' · ') },
            { label: '补充', value: worldview.notes },
            { label: 'ID', value: resources.project.id },
            {
              label: '时间维度',
              value: defaultDimensions(resources)
                .map((dimension) => `${dimension.label}（${dimension.kind}）`)
                .join(' · '),
            },
          ]}
        />
      );
    }
    case 'dimension': {
      const dimension = resolveDisplayDimensions(resources).find(
        (item) => item.id === selection.id,
      );
      if (!dimension) return null;
      const bound = countEventsBoundToDimension(resources.entities.world_events, dimension.id);
      return (
        <EntityDetail
          kind="dimension"
          label="时间维度"
          fields={[
            { label: '名称', value: dimension.label },
            { label: '类型', value: DIMENSION_KIND_LABEL[dimension.kind] },
            { label: 'ID', value: dimension.id },
            {
              label: '绑定事件',
              value:
                bound === 0
                  ? '尚无。没有绑定事件时，格子里仍是同一批角色和地点。'
                  : `${bound} 个事件指向此维度`,
            },
          ]}
        />
      );
    }
    case 'shot': {
      const shot = (resources.entities.shots ?? []).find((item) => item.id === selection.id);
      if (!shot) return null;
      const scene = entities.scenes.find((item) => item.id === shot.scene_id);
      const href = scene?.story_id
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
              <Link href={href} className="text-xs text-accent hover:underline">
                打开镜头规格编辑器 →
              </Link>
            </div>
          ) : null}
        </div>
      );
    }
    case 'camera':
    case 'style':
    case 'prompt':
    case 'model': {
      const shot = (resources.entities.shots ?? []).find((item) => item.id === selection.id);
      if (!shot) return null;
      const scene = entities.scenes.find((item) => item.id === shot.scene_id);
      const href = scene?.story_id
        ? `/projects/${resources.project.id}/stories/${scene.story_id}/scenes/${scene.id}/shots/${shot.id}`
        : null;
      const camera = shot.camera ?? {};
      const composition = shot.composition ?? {};
      const lighting = shot.lighting ?? {};
      const color = shot.color ?? {};
      const style = shot.style ?? {};
      const prompt = shot.prompt ?? {};
      const fields =
        selection.kind === 'camera'
          ? [
              { label: '投影摘要', value: projectCameraCaption(shot) },
              {
                label: '景别',
                value: typeof camera.shot_type === 'string' ? camera.shot_type : '',
              },
              { label: '机位', value: typeof camera.angle === 'string' ? camera.angle : '' },
              { label: '运动', value: typeof camera.movement === 'string' ? camera.movement : '' },
              {
                label: '构图',
                value: typeof composition.framing === 'string' ? composition.framing : '',
              },
            ]
          : selection.kind === 'style'
            ? [
                { label: '投影摘要', value: projectStyleCaption(shot) },
                {
                  label: '渲染',
                  value: typeof style.rendering === 'string' ? style.rendering : '',
                },
                { label: '光线', value: typeof lighting.type === 'string' ? lighting.type : '' },
                {
                  label: '方向',
                  value: typeof lighting.direction === 'string' ? lighting.direction : '',
                },
                {
                  label: '饱和度',
                  value: typeof color.saturation === 'string' ? color.saturation : '',
                },
                { label: '氛围', value: shot.mood ?? '' },
              ]
            : selection.kind === 'prompt'
              ? [
                  { label: '投影摘要', value: projectPromptCaption(shot) },
                  { label: '已批准', value: shot.approved_prompt?.positive ?? '' },
                  {
                    label: '当前草稿',
                    value: typeof prompt.positive === 'string' ? prompt.positive : '',
                  },
                ]
              : [
                  { label: '投影摘要', value: projectModelCaption(shot) },
                  { label: '提供商', value: shot.output?.provider ?? '' },
                  { label: '模型', value: shot.output?.model ?? '' },
                  { label: '状态', value: shot.output?.status ?? '' },
                ];
      return (
        <div>
          <EntityDetail
            kind={selection.kind}
            label={KIND_LABEL[selection.kind]}
            fields={[
              { label: '所属镜头', value: shot.label || `镜头 ${shot.order}` },
              { label: '所属场景', value: scene?.title },
              ...fields,
              {
                label: '说明',
                value: '只读派生轨：从镜头当前状态投影，不另存 TimelineItem。',
              },
            ]}
          />
          {href ? (
            <div className="px-4 pb-4">
              <Link href={href} className="text-xs text-accent hover:underline">
                在镜头规格里编辑真源 →
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
      await api(`/world/projects/${resources.project.id}/timeline`, {
        method: 'PATCH',
        body: { temporal_dimensions: parseDimensionsDraft(draft) },
      });
      return;
    case 'dimension': {
      const allowed = new Set(DIMENSION_KIND_OPTIONS.map((option) => option.value));
      const nextKind = allowed.has(draft.kind as TemporalDimensionDTO['kind'])
        ? (draft.kind as TemporalDimensionDTO['kind'])
        : 'custom';
      const dimensions = resolveDisplayDimensions(resources).map((dimension) =>
        dimension.id === selection.id
          ? {
              ...dimension,
              label: requiredText(draft.label ?? '', dimension.label),
              kind: nextKind,
            }
          : dimension,
      );
      await api(`/world/projects/${resources.project.id}/timeline`, {
        method: 'PATCH',
        body: { temporal_dimensions: dimensions },
      });
      return;
    }
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
            gender: emptyToNull(draft.gender),
            age_range: emptyToNull(draft.age_range),
            height: emptyToNull(draft.height),
            build: emptyToNull(draft.build),
            skin_tone: emptyToNull(draft.skin_tone),
            hair: emptyToNull(draft.hair),
            eyes: emptyToNull(draft.eyes),
            distinguishing_features: emptyToNull(draft.distinguishing_features),
            custom: emptyToNull(draft.custom),
          },
          personality: (draft.personality ?? '').trim() || null,
          default_outfit: (draft.default_outfit ?? '').trim() || null,
          stage_label: (draft.stage_label ?? '').trim() || null,
          as_of_world_event_id: (draft.as_of_world_event_id ?? '').trim() || null,
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
          stage_label: (draft.stage_label ?? '').trim() || null,
          as_of_world_event_id: (draft.as_of_world_event_id ?? '').trim() || null,
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
          world_time_envelope: envelopeFromDraft(draft),
          character_ids: splitList(draft.character_ids ?? ''),
          scene_ids: splitList(draft.scene_ids ?? ''),
        },
      });
      return;
    case 'relationship': {
      const existing = resources.entities.relationships.find((item) => item.id === selection.id);
      const options = relationshipRefOptions(resources);
      const source = parseDraftRef(draft.source_key ?? '', options);
      const target = parseDraftRef(draft.target_key ?? '', options);
      if (!source || !target) throw new Error('请选择关系的两端');
      if (source.id === target.id && source.type === target.type) {
        throw new Error('关系的两端不能是同一个实体');
      }
      await api(`/world/relationships/${selection.id}`, {
        method: 'PATCH',
        body: {
          kind: requiredText(draft.kind ?? '', existing?.kind ?? 'related'),
          label: emptyToNull(draft.label),
          description: emptyToNull(draft.description),
          direction: draft.direction === 'undirected' ? 'undirected' : 'directed',
          source: { type: source.type, id: source.id },
          target: { type: target.type, id: target.id },
        },
      });
      return;
    }
    case 'scene':
      await api(`/scenes/${selection.id}`, {
        method: 'PATCH',
        body: {
          title: requiredText(draft.title ?? '', '未命名场景'),
          summary: (draft.summary ?? '').trim() || null,
          time_of_day: (draft.time_of_day ?? '').trim() || null,
          weather: (draft.weather ?? '').trim() || null,
          mood: (draft.mood ?? '').trim() || null,
          location_id: (draft.location_id ?? '').trim() || null,
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
    case 'camera':
    case 'style':
    case 'prompt':
    case 'model':
    case 'shot':
      return;
    default:
      throw new Error('当前实体暂不支持在 Inspector 中保存');
  }
}
