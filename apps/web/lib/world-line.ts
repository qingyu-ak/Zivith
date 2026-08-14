// world-line.ts — 从 WorldResourcesDTO 派生世界线视图模型（纯函数，可单测）
//
// 借鉴 vis-timeline 的 "轨道(group) + 条目(item)" 数据模型抽象：
// 每条轨道一类实体（character / location / scene / world_event），
// 条目按 anchorOrder 在非均匀呈现刻度上定位。
// 世界时间信封保持 opaque：只展示 label，不用 envelope.order 改写主轴。
// v1 为只读派生视图（TimelineTrack/TimelineItem 表留作未来持久化轨道结构）。

import type {
  AssetDTO,
  SceneDTO,
  WorldEventDTO,
  WorldLineAxisMark,
  WorldLineItem,
  WorldLineModel,
  WorldLineRelationship,
  WorldLineTrack,
  WorldRelationshipDTO,
  WorldResourcesDTO,
} from './types';
import { interpolateOrders } from './world-scale';

export function worldTimeCaption(
  envelope: Record<string, unknown> | null | undefined,
): string | null {
  if (!envelope) return null;
  if (typeof envelope.label === 'string' && envelope.label.trim()) return envelope.label.trim();
  if (typeof envelope.value === 'string' && envelope.value.trim()) return envelope.value.trim();
  return null;
}

export function worldTimeOrder(
  envelope: Record<string, unknown> | null | undefined,
): number | null {
  if (!envelope || typeof envelope.order !== 'number' || !Number.isInteger(envelope.order)) {
    return null;
  }
  return envelope.order;
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
      items: [...scenes]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(sceneItem),
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
 * 沿 Presentation 顺序展示制作链路——故事 → 场景 → 镜头。
 * 故事按 order 排布；场景以全局展示序号定位；镜头嵌在所属场景的刻度区间内。
 */
export function buildProductionLineModel(resources: WorldResourcesDTO): WorldLineModel {
  const { stories, scenes, shots = [] } = resources.entities;

  const sortedStories = [...stories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const storyOrder = new Map(sortedStories.map((story, index) => [story.id, story.order ?? index + 1]));

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
  for (const { scene, order: sceneOrder } of sortedScenes) {
    const sceneShots = [...(shotsByScene.get(scene.id) ?? [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
    const denom = sceneShots.length + 1;
    sceneShots.forEach((shot, index) => {
      shotItems.push({
        id: shot.id,
        entityType: 'shot',
        title: shot.label?.trim() || `镜头 ${shot.order ?? index + 1}`,
        description: shot.mood ?? null,
        anchorOrder: sceneOrder + (index + 1) / denom,
        createdAt: shot.created_at ?? '',
        extra: {
          scene_id: shot.scene_id,
          story_id: scene.story_id,
          order: shot.order ?? index + 1,
          state: shot.state ?? 'draft',
          mood: shot.mood ?? null,
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
