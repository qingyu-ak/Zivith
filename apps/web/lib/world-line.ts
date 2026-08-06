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

function sceneItem(scene: SceneDTO): WorldLineItem {
  return {
    id: scene.id,
    entityType: 'scene',
    title: scene.title,
    description: scene.summary,
    anchorOrder: scene.order ?? 0,
    createdAt: scene.created_at ?? '',
    extra: {
      story_id: scene.story_id,
      location_id: scene.location_id ?? null,
      time_of_day: scene.time_of_day ?? null,
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
