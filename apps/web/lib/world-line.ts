// world-line.ts — 从 WorldResourcesDTO 派生世界线视图模型（纯函数，可单测）
//
// 借鉴 vis-timeline 的 "轨道(group) + 条目(item)" 数据模型抽象：
// 每条轨道一类实体（character / location / scene / world_event），
// 条目按 anchorOrder 在非均匀呈现刻度上定位。
// 世界时间信封保持 opaque：只展示 label / mode，不用 envelope 值改写主轴。
// v1 为只读派生视图（TimelineTrack/TimelineItem 表留作未来持久化轨道结构）。
// H6：显式 WorldTimeBinding（point/range/relative/crossing）叠在呈现主轴上。

import type {
  AssetDTO,
  SceneDTO,
  TemporalDimensionDTO,
  WorldEventDTO,
  WorldLineAxisMark,
  WorldLineItem,
  WorldLineModel,
  WorldLineRelationship,
  WorldLineShotDTO,
  WorldLineTrack,
  WorldRelationshipDTO,
  WorldResourcesDTO,
  WorldSelection,
} from './types';
import { interpolateOrders } from './world-scale';

type WorldTimeEnvelope = Record<string, unknown> | null | undefined;
type WorldTimeMode = 'follow' | 'point' | 'range' | 'relative' | 'crossing' | 'unknown';
type WorldTimeRelation = 'follow' | 'explicit' | 'crossing' | 'unknown';

function opaqueCaption(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.label === 'string' && record.label.trim()) return record.label.trim();
  }
  return null;
}

export function canonicalizeWorldTimeMode(mode: unknown): WorldTimeMode | null {
  if (mode === 'exact' || mode === 'instant') return 'point';
  if (mode === 'parallel') return 'crossing';
  if (
    mode === 'follow' ||
    mode === 'point' ||
    mode === 'range' ||
    mode === 'relative' ||
    mode === 'crossing' ||
    mode === 'unknown'
  ) {
    return mode;
  }
  return null;
}

export function worldTimeMode(envelope: WorldTimeEnvelope): WorldTimeMode | null {
  if (!envelope) return null;
  return canonicalizeWorldTimeMode(envelope.mode);
}

export function worldTimeCaption(envelope: WorldTimeEnvelope): string | null {
  if (!envelope) return null;
  if (typeof envelope.label === 'string' && envelope.label.trim()) return envelope.label.trim();
  const mode = worldTimeMode(envelope);
  if (mode === 'range') {
    const start = opaqueCaption(envelope.start);
    const end = opaqueCaption(envelope.end);
    if (start && end) return `${start} – ${end}`;
    return start ?? end ?? '区间';
  }
  if (mode === 'relative') {
    const relation = typeof envelope.relation === 'string' ? envelope.relation : '';
    if (relation === 'before') return '相对 · 之前';
    if (relation === 'after') return '相对 · 之后';
    if (relation === 'same_as') return '相对 · 同时';
    if (relation === 'overlaps') return '相对 · 重叠';
    return '相对时间';
  }
  if (mode === 'crossing') return '平行维度';
  if (mode === 'unknown') return '时间未知';
  if (typeof envelope.value === 'string' && envelope.value.trim()) return envelope.value.trim();
  return null;
}

export function worldTimeOrder(envelope: WorldTimeEnvelope): number | null {
  if (!envelope || typeof envelope.order !== 'number' || !Number.isInteger(envelope.order)) {
    return null;
  }
  return envelope.order;
}

export function worldTimeRelation(envelope: WorldTimeEnvelope): WorldTimeRelation {
  const mode = worldTimeMode(envelope);
  if (mode === 'crossing') return 'crossing';
  if (mode === 'unknown') return 'unknown';
  if (mode && mode !== 'follow') return 'explicit';
  if (worldTimeCaption(envelope)) return 'explicit';
  return 'follow';
}

export function worldTimeModeLabel(mode: WorldTimeMode | null): string | null {
  if (!mode || mode === 'follow') return null;
  if (mode === 'point') return '时刻';
  if (mode === 'range') return '区间';
  if (mode === 'relative') return '相对';
  if (mode === 'crossing') return '平行';
  return '未知';
}

export const DIMENSION_KIND_LABEL: Record<TemporalDimensionDTO['kind'], string> = {
  worldline: '世界线',
  calendar: '历法',
  dream: '梦境',
  simulation: '模拟',
  custom: '自定义',
};

export function resolveDisplayDimensions(
  resources: Pick<WorldResourcesDTO, 'temporal_dimensions'>,
): TemporalDimensionDTO[] {
  const stored = resources.temporal_dimensions ?? [];
  if (stored.length > 0) return stored;
  return [{ id: 'main', label: '主世界线', kind: 'worldline' }];
}

export function isPrimaryWorldline(dimension: Pick<TemporalDimensionDTO, 'id' | 'kind'>): boolean {
  return dimension.kind === 'worldline' || dimension.id === 'main';
}

export function worldTimeDimensionId(envelope: WorldTimeEnvelope): string | null {
  if (!envelope || typeof envelope.dimension_id !== 'string') return null;
  const value = envelope.dimension_id.trim();
  return value || null;
}

export function countEventsBoundToDimension(
  events: Array<{ world_time_envelope?: WorldTimeEnvelope }>,
  dimensionId: string,
): number {
  return events.filter((event) => worldTimeDimensionId(event.world_time_envelope) === dimensionId)
    .length;
}

export type OverlayFocus = 'none' | 'match' | 'other' | 'follow';

export function overlayFocusOfItem(
  item: Pick<WorldLineItem, 'entityType' | 'extra'>,
  focusedDimensionId: string | null | undefined,
  focusedIsPrimary = false,
): OverlayFocus {
  if (!focusedDimensionId || focusedIsPrimary) return 'none';
  if (item.entityType !== 'world_event') return 'follow';
  const envelope = (item.extra?.world_time_envelope ?? null) as WorldTimeEnvelope;
  const dimensionId = worldTimeDimensionId(envelope);
  if (!dimensionId || worldTimeRelation(envelope) === 'follow') return 'follow';
  return dimensionId === focusedDimensionId ? 'match' : 'other';
}

function eventPresentationOrder(event: WorldEventDTO): number {
  return event.presentation_order ?? 0;
}

function eventDiverges(event: WorldEventDTO): boolean {
  const hinted = worldTimeOrder(event.world_time_envelope);
  return hinted != null && hinted !== eventPresentationOrder(event);
}

function eventItem(event: WorldEventDTO): WorldLineItem {
  const caption = worldTimeCaption(event.world_time_envelope);
  const diverges = eventDiverges(event);
  const relation = worldTimeRelation(event.world_time_envelope);
  const mode = worldTimeMode(event.world_time_envelope);
  return {
    id: event.id,
    entityType: 'world_event',
    title: event.title,
    description: event.description,
    anchorOrder: eventPresentationOrder(event),
    createdAt: event.created_at,
    extra: {
      state: event.state,
      anchor_story_id: event.anchor_story_id ?? null,
      world_time_envelope: event.world_time_envelope ?? null,
      world_time_label: caption,
      world_time_diverges: diverges,
      world_time_relation: relation,
      world_time_mode: mode,
      world_time_dimension_id: worldTimeDimensionId(event.world_time_envelope),
      character_ids: event.character_ids ?? [],
      scene_ids: event.scene_ids ?? [],
    },
  };
}

function sceneSummary(scene: SceneDTO): string | null | undefined {
  return scene.summary ?? scene.description;
}

function sceneTime(scene: SceneDTO): string | null {
  return scene.time_of_day ?? scene.time ?? null;
}

function sceneItem(scene: SceneDTO): WorldLineItem {
  return {
    id: scene.id,
    entityType: 'scene',
    title: scene.title,
    description: sceneSummary(scene),
    anchorOrder: scene.order ?? 0,
    createdAt: scene.created_at ?? '',
    extra: {
      story_id: scene.story_id,
      location_id: scene.location_id ?? null,
      time_of_day: sceneTime(scene),
      weather: scene.weather ?? null,
      mood: scene.mood ?? null,
      state: scene.state ?? 'draft',
    },
  };
}

function assetItem(
  asset: AssetDTO,
  entityType: 'character' | 'location',
  anchorOrder: number,
  extra: Record<string, unknown> = {},
): WorldLineItem {
  return {
    id: asset.id,
    entityType,
    title: asset.name,
    description: asset.description,
    tags: asset.tags,
    anchorOrder,
    createdAt: asset.created_at ?? '',
    extra: {
      type: asset.type ?? asset.asset_type ?? null,
      aliases: asset.aliases ?? [],
      appearance: asset.appearance ?? null,
      personality: asset.personality ?? null,
      default_outfit: asset.default_outfit ?? null,
      ...extra,
    },
  };
}

function byCreated(a: AssetDTO, b: AssetDTO): number {
  return (a.created_at ?? '').localeCompare(b.created_at ?? '');
}

/** 有显式锚点的用锚点；其余按 createdAt 在 domain 内均匀插值。 */
function assignAssetOrders(
  assets: AssetDTO[],
  resolveAnchor: (id: string) => { order: number; extra: Record<string, unknown> } | null,
  baseMin: number,
  baseMax: number,
): Map<string, { order: number; extra: Record<string, unknown> }> {
  const result = new Map<string, { order: number; extra: Record<string, unknown> }>();
  const unanchored: AssetDTO[] = [];
  for (const asset of assets) {
    const anchored = resolveAnchor(asset.id);
    if (anchored) result.set(asset.id, anchored);
    else unanchored.push(asset);
  }
  const interpolated = interpolateOrders(unanchored.length, baseMin, baseMax);
  unanchored.forEach((asset, index) => {
    result.set(asset.id, {
      order: interpolated[index] ?? baseMax,
      extra: { anchored: false },
    });
  });
  return result;
}

function firstEventForCharacter(
  characterId: string,
  events: WorldEventDTO[],
): WorldEventDTO | null {
  const hits = events.filter((event) => (event.character_ids ?? []).includes(characterId));
  if (hits.length === 0) return null;
  return [...hits].sort((a, b) => eventPresentationOrder(a) - eventPresentationOrder(b))[0] ?? null;
}

function firstSceneForLocation(locationId: string, scenes: SceneDTO[]): SceneDTO | null {
  const hits = scenes.filter((scene) => scene.location_id === locationId);
  if (hits.length === 0) return null;
  return [...hits].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0] ?? null;
}

function worldAxisMarks(events: WorldEventDTO[], scenes: SceneDTO[]): WorldLineAxisMark[] {
  if (events.length > 0) {
    return [...events]
      .sort((a, b) => eventPresentationOrder(a) - eventPresentationOrder(b))
      .map((event) => ({
        order: eventPresentationOrder(event),
        label: event.title,
        worldTimeLabel: worldTimeCaption(event.world_time_envelope),
        worldTimeDiverges: eventDiverges(event),
        worldTimeRelation: worldTimeRelation(event.world_time_envelope),
        worldTimeMode: worldTimeMode(event.world_time_envelope),
      }));
  }
  return [...scenes]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((scene) => ({
      order: scene.order ?? 0,
      label: scene.title,
    }));
}

export function buildWorldLineModel(resources: WorldResourcesDTO): WorldLineModel {
  const { stories, characters, locations, scenes, world_events, relationships } =
    resources.entities;

  const anchorOrders: number[] = [
    ...world_events.map(eventPresentationOrder),
    ...scenes.map((scene) => scene.order ?? 0),
  ];
  const baseMin = anchorOrders.length ? Math.min(...anchorOrders) : 1;
  const baseMax = anchorOrders.length ? Math.max(...anchorOrders) : Math.max(baseMin, 1);

  const sortedCharacters = [...characters].sort(byCreated);
  const sortedLocations = [...locations].sort(byCreated);

  const characterAnchors = assignAssetOrders(
    sortedCharacters,
    (id) => {
      const event = firstEventForCharacter(id, world_events);
      if (!event) return null;
      return {
        order: eventPresentationOrder(event),
        extra: { anchored: true, anchor_event_id: event.id },
      };
    },
    baseMin,
    baseMax,
  );
  const locationAnchors = assignAssetOrders(
    sortedLocations,
    (id) => {
      const scene = firstSceneForLocation(id, scenes);
      if (!scene) return null;
      return {
        order: scene.order ?? 0,
        extra: { anchored: true, anchor_scene_id: scene.id },
      };
    },
    baseMin,
    baseMax,
  );

  const tracks: WorldLineTrack[] = [
    {
      id: 'character',
      kind: 'character',
      title: '角色',
      items: sortedCharacters.map((character) => {
        const anchor = characterAnchors.get(character.id);
        return assetItem(character, 'character', anchor?.order ?? baseMax, anchor?.extra);
      }),
    },
    {
      id: 'location',
      kind: 'location',
      title: '地点',
      items: sortedLocations.map((location) => {
        const anchor = locationAnchors.get(location.id);
        return assetItem(location, 'location', anchor?.order ?? baseMax, anchor?.extra);
      }),
    },
    {
      id: 'scene',
      kind: 'scene',
      title: '场景',
      items: [...scenes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(sceneItem),
    },
    {
      id: 'world_event',
      kind: 'world_event',
      title: '事件',
      items: [...world_events]
        .sort((a, b) => eventPresentationOrder(a) - eventPresentationOrder(b))
        .map(eventItem),
    },
  ];

  const itemById = new Map<string, string>();
  for (const track of tracks) {
    for (const item of track.items) itemById.set(item.id, item.id);
  }

  const lines: WorldLineRelationship[] = relationships.map(
    (relationship: WorldRelationshipDTO) => ({
      id: relationship.id,
      label: relationship.label ?? null,
      sourceItemId: itemById.get(relationship.source_id) ?? null,
      targetItemId: itemById.get(relationship.target_id) ?? null,
      sourceType: relationship.source_type,
      targetType: relationship.target_type,
      state: relationship.state,
    }),
  );

  const allOrders = [
    ...anchorOrders,
    ...[...characterAnchors.values()].map((entry) => entry.order),
    ...[...locationAnchors.values()].map((entry) => entry.order),
  ];
  const min = allOrders.length ? Math.min(...allOrders) : 1;
  const max = allOrders.length ? Math.max(...allOrders) : 1;

  void stories;
  return {
    projectId: resources.project.id,
    projectName: resources.project.name,
    tracks,
    relationships: lines,
    scaleDomain: { min, max },
    axisMarks: worldAxisMarks(world_events, scenes),
  };
}

/**
 * 制作视图模型（K4 "一条 Timeline 的两种视图"）：
 * 沿 Presentation 顺序展示制作链路——故事 → 场景 → 镜头，
 * 再投影只读派生轨：机位 / 提示词 / 模型（H7，不另存 TimelineItem）。
 */
export function isDerivedTrackKind(kind: string): boolean {
  return kind === 'camera' || kind === 'style' || kind === 'prompt' || kind === 'model';
}

export function derivedSourceShotId(
  item: Pick<WorldLineItem, 'entityType' | 'id' | 'extra'>,
): string | null {
  if (typeof item.extra?.shot_id === 'string' && item.extra.shot_id) return item.extra.shot_id;
  if (item.entityType === 'shot') return item.id;
  return null;
}

export function isTimelineItemActive(
  item: Pick<WorldLineItem, 'entityType' | 'id' | 'extra'>,
  selection: WorldSelection,
): boolean {
  if (!selection) return false;
  const shotId = derivedSourceShotId(item);
  if (isDerivedTrackKind(selection.kind)) {
    return (
      shotId === selection.id && (item.entityType === selection.kind || item.entityType === 'shot')
    );
  }
  if (selection.kind === 'shot') {
    return shotId === selection.id;
  }
  return selection.kind === item.entityType && selection.id === item.id;
}

function recordField(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.trim() ? field.trim() : null;
}

export function projectCameraCaption(shot: WorldLineShotDTO): string {
  const caption = [
    recordField(shot.camera, 'shot_type'),
    recordField(shot.camera, 'angle'),
    recordField(shot.camera, 'movement'),
    recordField(shot.composition, 'framing'),
  ]
    .filter(Boolean)
    .join(' · ');
  return caption || '未设定机位';
}

export function projectStyleCaption(shot: WorldLineShotDTO): string {
  const palette =
    shot.color && typeof shot.color === 'object' && Array.isArray(shot.color.palette)
      ? shot.color.palette
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .join('/')
      : null;
  const caption = [
    recordField(shot.style, 'rendering'),
    recordField(shot.lighting, 'type'),
    recordField(shot.lighting, 'direction'),
    recordField(shot.color, 'saturation'),
    palette,
    shot.mood?.trim() || null,
  ]
    .filter(Boolean)
    .join(' · ');
  return caption || '未设定风格';
}

export function projectPromptCaption(shot: WorldLineShotDTO): string {
  const approved = shot.approved_prompt?.positive?.trim();
  if (approved) return `${clipCaption(approved, 18)}（已批准）`;
  const draft = recordField(shot.prompt, 'positive');
  if (draft) return `${clipCaption(draft, 18)}（草稿）`;
  return '未设定提示词';
}

export function projectModelCaption(shot: WorldLineShotDTO): string {
  const model = shot.output?.model?.trim();
  const provider = shot.output?.provider?.trim();
  if (!model && !provider) return '尚未生成';
  const name = [provider, model].filter(Boolean).join(' / ');
  if (shot.output?.is_active) return name;
  return shot.output?.status ? `${name} · ${shot.output.status}` : name;
}

function clipCaption(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function buildProductionLineModel(resources: WorldResourcesDTO): WorldLineModel {
  const { stories, scenes, shots = [] } = resources.entities;

  const sortedStories = [...stories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const storyOrder = new Map(
    sortedStories.map((story, index) => [story.id, story.order ?? index + 1]),
  );

  const sortedScenes = [...scenes]
    .map((scene) => ({
      scene,
      presentationOrder: (storyOrder.get(scene.story_id) ?? 1) * 1000 + (scene.order ?? 0),
    }))
    .sort((a, b) => a.presentationOrder - b.presentationOrder)
    .map((entry, index) => ({ scene: entry.scene, order: index + 1 }));

  const shotsByScene = new Map<string, typeof shots>();
  for (const shot of shots) {
    const list = shotsByScene.get(shot.scene_id) ?? [];
    list.push(shot);
    shotsByScene.set(shot.scene_id, list);
  }

  const shotItems: WorldLineItem[] = [];
  const cameraItems: WorldLineItem[] = [];
  const styleItems: WorldLineItem[] = [];
  const promptItems: WorldLineItem[] = [];
  const modelItems: WorldLineItem[] = [];
  for (const { scene, order: sceneOrder } of sortedScenes) {
    const sceneShots = [...(shotsByScene.get(scene.id) ?? [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
    const denom = sceneShots.length + 1;
    sceneShots.forEach((shot, index) => {
      const anchorOrder = sceneOrder + (index + 1) / denom;
      const createdAt = shot.created_at ?? '';
      const shotLabel = shot.label?.trim() || `镜头 ${shot.order ?? index + 1}`;
      const extra = {
        shot_id: shot.id,
        scene_id: shot.scene_id,
        story_id: scene.story_id,
        order: shot.order ?? index + 1,
        state: shot.state ?? 'draft',
        mood: shot.mood ?? null,
        derived: true,
      };
      shotItems.push({
        id: shot.id,
        entityType: 'shot',
        title: shotLabel,
        description: shot.mood ?? null,
        anchorOrder,
        createdAt,
        extra: {
          scene_id: shot.scene_id,
          story_id: scene.story_id,
          order: shot.order ?? index + 1,
          state: shot.state ?? 'draft',
          mood: shot.mood ?? null,
        },
      });
      cameraItems.push({
        id: `camera:${shot.id}`,
        entityType: 'camera',
        title: projectCameraCaption(shot),
        description: shotLabel,
        anchorOrder,
        createdAt,
        extra,
      });
      styleItems.push({
        id: `style:${shot.id}`,
        entityType: 'style',
        title: projectStyleCaption(shot),
        description: shotLabel,
        anchorOrder,
        createdAt,
        extra,
      });
      promptItems.push({
        id: `prompt:${shot.id}`,
        entityType: 'prompt',
        title: projectPromptCaption(shot),
        description: shotLabel,
        anchorOrder,
        createdAt,
        extra: {
          ...extra,
          approved: Boolean(shot.approved_prompt?.positive?.trim()),
        },
      });
      modelItems.push({
        id: `model:${shot.id}`,
        entityType: 'model',
        title: projectModelCaption(shot),
        description: shotLabel,
        anchorOrder,
        createdAt,
        extra: {
          ...extra,
          provider: shot.output?.provider ?? null,
          model: shot.output?.model ?? null,
        },
      });
    });
  }

  const tracks: WorldLineTrack[] = [
    {
      id: 'story',
      kind: 'story',
      title: '故事',
      items: sortedStories.map((story) => ({
        id: story.id,
        entityType: 'story',
        title: story.title,
        description: story.logline ?? story.synopsis ?? null,
        anchorOrder: storyOrder.get(story.id) ?? 0,
        createdAt: '',
        extra: {
          status: story.status ?? 'draft',
          scene_count: story.scene_count ?? 0,
        },
      })),
    },
    {
      id: 'scene',
      kind: 'scene',
      title: '场景',
      items: sortedScenes.map(({ scene, order }) => ({
        id: scene.id,
        entityType: 'scene',
        title: scene.title,
        description: sceneSummary(scene),
        anchorOrder: order,
        createdAt: scene.created_at ?? '',
        extra: {
          story_id: scene.story_id,
          order: scene.order ?? 0,
          state: scene.state ?? 'draft',
        },
      })),
    },
    {
      id: 'shot',
      kind: 'shot',
      title: '镜头',
      items: shotItems,
    },
    {
      id: 'camera',
      kind: 'camera',
      title: '机位',
      items: cameraItems,
    },
    {
      id: 'style',
      kind: 'style',
      title: '风格',
      items: styleItems,
    },
    {
      id: 'prompt',
      kind: 'prompt',
      title: '提示词',
      items: promptItems,
    },
    {
      id: 'model',
      kind: 'model',
      title: '模型',
      items: modelItems,
    },
  ];

  const orders = [
    ...sortedStories.map((story) => storyOrder.get(story.id) ?? 0),
    ...sortedScenes.map((entry) => entry.order),
    ...shotItems.map((item) => item.anchorOrder),
  ];
  const min = orders.length ? Math.min(...orders) : 1;
  const max = orders.length ? Math.max(...orders) : Math.max(min, 1);

  return {
    projectId: resources.project.id,
    projectName: resources.project.name,
    tracks,
    relationships: [],
    scaleDomain: { min, max },
    axisMarks: sortedScenes.map(({ scene, order }) => ({
      order,
      label: scene.title,
    })),
  };
}
