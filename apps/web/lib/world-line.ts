// world-line.ts — 从 WorldResourcesDTO 派生世界线视图模型（纯函数，可单测）
//
// 借鉴 vis-timeline 的 "轨道(group) + 条目(item)" 数据模型抽象：
// 每条轨道一类实体（character / scene / world_event，对应 TimelineTrack.kind），
// 条目按 anchorOrder 在非均匀刻度上定位。
// v1 为只读派生视图（TimelineTrack/TimelineItem 表留作未来持久化轨道结构）。

import type {
  AssetDTO,
  SceneDTO,
  WorldEventDTO,
  WorldLineItem,
  WorldLineModel,
  WorldLineRelationship,
  WorldLineTrack,
  WorldRelationshipDTO,
  WorldResourcesDTO,
} from './types';
import { interpolateOrders } from './world-scale';

function eventItem(event: WorldEventDTO): WorldLineItem {
  return {
    id: event.id,
    entityType: 'world_event',
    title: event.title,
    description: event.description,
    anchorOrder: event.presentation_order ?? 0,
    createdAt: event.created_at,
    extra: {
      state: event.state,
      anchor_story_id: event.anchor_story_id ?? null,
      world_time_envelope: event.world_time_envelope ?? null,
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
    },
  };
}

export function buildWorldLineModel(resources: WorldResourcesDTO): WorldLineModel {
  const { stories, characters, locations, scenes, world_events, relationships } =
    resources.entities;

  // —— 刻度 domain：所有实体刻度范围（事件 presentation_order + 场景 order）——
  const anchorOrders: number[] = [
    ...world_events.map((event) => event.presentation_order ?? 0),
    ...scenes.map((scene) => scene.order ?? 0),
  ];
  const baseMin = anchorOrders.length ? Math.min(...anchorOrders) : 1;
  const baseMax = anchorOrders.length ? Math.max(...anchorOrders) : Math.max(baseMin, 1);

  // 角色/地点无显式 order：按 createdAt 序在 [baseMin, baseMax] 内均匀插值
  const byCreated = (a: AssetDTO, b: AssetDTO) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? '');
  const sortedCharacters = [...characters].sort(byCreated);
  const sortedLocations = [...locations].sort(byCreated);
  const characterOrders = interpolateOrders(sortedCharacters.length, baseMin, baseMax);
  const locationOrders = interpolateOrders(sortedLocations.length, baseMin, baseMax);

  const tracks: WorldLineTrack[] = [
    {
      kind: 'character',
      title: '角色',
      items: sortedCharacters.map((character, index) =>
        assetItem(character, 'character', characterOrders[index] ?? baseMax),
      ),
    },
    {
      kind: 'scene',
      title: '场景',
      items: [...scenes]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(sceneItem),
    },
    {
      kind: 'world_event',
      title: '事件',
      items: [...world_events]
        .sort((a, b) => (a.presentation_order ?? 0) - (b.presentation_order ?? 0))
        .map(eventItem),
    },
  ];

  // —— 关系连线：端点映射到轨道条目 id（location 不在轨道上时 source/target 为 null，v1 跳过渲染）——
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

  const allOrders = [...anchorOrders, ...characterOrders, ...locationOrders];
  const min = allOrders.length ? Math.min(...allOrders) : 1;
  const max = allOrders.length ? Math.max(...allOrders) : 1;

  void stories;
  return {
    projectId: resources.project.id,
    projectName: resources.project.name,
    tracks,
    relationships: lines,
    scaleDomain: { min, max },
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
  };
}
