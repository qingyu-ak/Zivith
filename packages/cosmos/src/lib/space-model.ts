import * as THREE from 'three';
import type {
  AssetDTO,
  SceneDTO,
  WorldEventDTO,
  WorldRelationshipDTO,
  WorldResourcesDTO,
} from '../types';
import { moodColor, planetPalette, seededRandom, starColor, type PlanetPalette } from './palette';
import { applySpacePosition, buildSpaceTree, type SpaceNode } from './space-tree';

/**
 * 空间语义层（实验版，纯前端派生）：
 *
 *   Project = Universe / World（一颗世界星球）
 *     └── Region    ← location 资产（星球上的地点层级）
 *           └── Scene  ← scene 资产（地点内的空间单元）
 *
 * 球体只表示「世界」这一空间尺度；地点与场景是同一空间内的 Pin。
 * Entity（角色/事件）是「存在于空间中的内容」，通过登场关系与事件投影到空间；
 * 角色在多个场景间的登场顺序（按故事顺序）即其空间移动轨迹。
 *
 * 将来接入后端 Space/SpatialNode/EntityPlacement 表后，
 * 这里的派生逻辑可替换为直接读取空间树，渲染层不需要变。
 */

export const ORPHAN_REGION_ID = '__orphan__';

export interface SceneSpaceNode {
  scene: SceneDTO;
  regionId: string;
  /** 相对区域中心的球面偏移（度） */
  lat: number;
  lng: number;
  color: string;
}

export interface RegionSpaceNode {
  id: string;
  name: string;
  location: AssetDTO | null;
  description: string;
  tags: string[];
  color: string;
  lat: number;
  lng: number;
  scenes: SceneSpaceNode[];
  orphan: boolean;
}

export interface TrackStop {
  scene: SceneDTO;
  region: RegionSpaceNode;
  storyId: string;
  storyTitle: string;
}

export interface CharacterTrack {
  character: AssetDTO;
  /** 按故事顺序排列的登场轨迹（= 空间移动路径） */
  stops: TrackStop[];
}

export interface WorldSpace {
  world: {
    id: string;
    name: string;
    description: string;
    palette: PlanetPalette;
    seed: string;
    genre?: string;
  };
  /** 动态空间树（Project 根 → 地点 → 场景）；球体只出现在天体级节点 */
  rootSpace: SpaceNode;
  regions: RegionSpaceNode[];
  regionById: Map<string, RegionSpaceNode>;
  sceneById: Map<string, SceneSpaceNode>;
  /** characterId → 空间轨迹 */
  tracks: Map<string, CharacterTrack>;
  /** sceneId → 在场角色 */
  charactersAtScene: Map<string, AssetDTO[]>;
  /** sceneId → 相关事件 */
  eventsAtScene: Map<string, WorldEventDTO[]>;
  /** 角色之间的原始关系（辅助信息） */
  characterRelations: WorldRelationshipDTO[];
}

/** 世界星球的固定地球观感（贴图由 planet-texture 的 Earth 生成器负责） */
const EARTH_WORLD_PALETTE: PlanetPalette = {
  ocean: ['#07204f', '#1e6f9e'],
  land: ['#47803a', '#9d9285'],
  ice: '#f2f6fa',
  glow: '#7fb2ff',
};

export function buildWorldSpace(
  resources: WorldResourcesDTO,
  surface?: { isLand(latDeg: number, lngDeg: number): boolean },
): WorldSpace {
  const characters = resources.entities.characters ?? [];
  const locations = resources.entities.locations ?? [];
  const scenes = resources.entities.scenes ?? [];
  const relationships = resources.entities.relationships ?? [];
  const events = resources.entities.world_events ?? [];
  const stories = [...(resources.entities.stories ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  // —— 世界（球体只在这一级出现） —— //
  const genre = resources.project.worldview?.genre;
  const world = {
    id: resources.project.id,
    name: resources.project.name,
    description: resources.project.description ?? '',
    palette: EARTH_WORLD_PALETTE,
    seed: `world:${resources.project.id}`,
    genre,
  };

  // —— 区域（location 资产；无地点场景进「未知之地」） —— //
  const regions: RegionSpaceNode[] = locations.map((loc) => {
    const palette = planetPalette(loc.name, loc.tags, loc.id);
    return {
      id: loc.id,
      name: loc.name,
      location: loc,
      description: loc.description ?? '',
      tags: loc.tags ?? [],
      color: palette.glow,
      lat: 0,
      lng: 0,
      scenes: [],
      orphan: false,
    };
  });
  const orphanScenes = scenes.filter(
    (s) => !s.location_id || !locations.some((l) => l.id === s.location_id),
  );
  if (orphanScenes.length > 0) {
    regions.push({
      id: ORPHAN_REGION_ID,
      name: '未知之地',
      location: null,
      description: '尚未归属任何地点的场景聚集于此。',
      tags: ['未知'],
      color: '#8d8db0',
      lat: 0,
      lng: 0,
      scenes: [],
      orphan: true,
    });
  }

  const regionById = new Map(regions.map((r) => [r.id, r] as const));
  const sceneById = new Map<string, SceneSpaceNode>();

  // 区域在球面上确定性散布（斐波那契，避开极点；优先落在陆地上）
  scatterOnGlobe(
    regions.map((r) => r.id),
    'regions:' + world.id,
    (id, lat, lng) => {
      const region = regionById.get(id)!;
      region.lat = lat;
      region.lng = lng;
    },
    56,
    surface ? (lat, lng) => surface.isLand(lat, lng) : undefined,
  );

  // 场景挂在所属区域内，围绕区域中心散布
  for (const scene of scenes) {
    const regionId =
      scene.location_id && regionById.has(scene.location_id) ? scene.location_id : ORPHAN_REGION_ID;
    const region = regionById.get(regionId)!;
    const node: SceneSpaceNode = {
      scene,
      regionId,
      lat: 0,
      lng: 0,
      color: moodColor(scene.mood, scene.id),
    };
    region.scenes.push(node);
    sceneById.set(scene.id, node);
  }
  for (const region of regions) {
    scatterOnGlobe(
      region.scenes.map((s) => s.scene.id),
      'scenes:' + region.id,
      (id, lat, lng) => {
        const node = sceneById.get(id)!;
        // 相对区域中心 ±11°，并夹在可用纬度内
        node.lat = THREE.MathUtils.clamp(region.lat + lat, -66, 66);
        node.lng = region.lng + lng;
      },
      20,
    );
  }

  // —— 实体投影：谁在哪儿（登场关系 + 事件） —— //
  const characterById = new Map(characters.map((c) => [c.id, c] as const));
  const charactersAtScene = new Map<string, AssetDTO[]>();
  const eventsAtScene = new Map<string, WorldEventDTO[]>();
  const scenesOfCharacter = new Map<string, Set<string>>();

  const bindCharacterToScene = (characterId: string, sceneId: string) => {
    const character = characterById.get(characterId);
    if (!character || !sceneById.has(sceneId)) return;
    const list = charactersAtScene.get(sceneId) ?? [];
    if (!list.some((c) => c.id === characterId)) list.push(character);
    charactersAtScene.set(sceneId, list);
    const set = scenesOfCharacter.get(characterId) ?? new Set<string>();
    set.add(sceneId);
    scenesOfCharacter.set(characterId, set);
  };

  for (const rel of relationships) {
    if (rel.source_type === 'asset' && rel.target_type === 'scene') {
      bindCharacterToScene(rel.source_id, rel.target_id);
    } else if (rel.source_type === 'scene' && rel.target_type === 'asset') {
      bindCharacterToScene(rel.target_id, rel.source_id);
    }
  }
  for (const event of events) {
    for (const sceneId of event.scene_ids ?? []) {
      const list = eventsAtScene.get(sceneId) ?? [];
      list.push(event);
      eventsAtScene.set(sceneId, list);
    }
    for (const sceneId of event.scene_ids ?? []) {
      for (const characterId of event.character_ids ?? []) {
        bindCharacterToScene(characterId, sceneId);
      }
    }
  }

  // —— 角色空间轨迹：登场场景按故事顺序排列 —— //
  const sceneStory = new Map(scenes.map((s) => [s.id, s] as const));
  const storyById = new Map(stories.map((s) => [s.id, s] as const));
  const tracks = new Map<string, CharacterTrack>();
  for (const [characterId, sceneIds] of scenesOfCharacter) {
    const character = characterById.get(characterId);
    if (!character) continue;
    const stops: TrackStop[] = [...sceneIds]
      .map((id) => sceneStory.get(id))
      .filter((s): s is SceneDTO => !!s)
      .sort((a, b) => {
        const sa = storyById.get(a.story_id)?.order ?? 0;
        const sb = storyById.get(b.story_id)?.order ?? 0;
        return sa - sb || a.order - b.order;
      })
      .map((scene) => ({
        scene,
        region: regionById.get(
          sceneById.get(scene.id)?.regionId ?? ORPHAN_REGION_ID,
        ) as RegionSpaceNode,
        storyId: scene.story_id,
        storyTitle: storyById.get(scene.story_id)?.title ?? '',
      }));
    tracks.set(characterId, { character, stops });
  }

  const characterRelations = relationships.filter(
    (r) => r.source_type === 'asset' && r.target_type === 'asset',
  );

  const rootSpace = buildSpaceTree({
    projectId: world.id,
    projectName: world.name,
    projectDescription: world.description,
    genre: world.genre,
    locations,
    scenes,
    orphanRegionId: ORPHAN_REGION_ID,
  });
  for (const region of regions) {
    const node = rootSpace.children.find((child) => child.id === region.id);
    if (!node) continue;
    applySpacePosition(node, region.lat, region.lng);
    for (const sceneNode of region.scenes) {
      const child = node.children.find((item) => item.id === sceneNode.scene.id);
      if (child) applySpacePosition(child, sceneNode.lat, sceneNode.lng);
    }
  }

  return {
    world,
    rootSpace,
    regions,
    regionById,
    sceneById,
    tracks,
    charactersAtScene,
    eventsAtScene,
    characterRelations,
  };
}

/** 斐波那契球面散布：均匀、避开极点、种子化（同一数据永远同一画面） */
function scatterOnGlobe(
  ids: string[],
  seed: string,
  apply: (id: string, lat: number, lng: number) => void,
  spread: number,
  prefer?: (lat: number, lng: number) => boolean,
): void {
  const n = ids.length;
  if (n === 0) return;
  const rand = seededRandom(seed);
  const goldenAngle = 137.508;
  const offset = rand() * 360;
  ids.forEach((id, i) => {
    const t = (i + 0.5) / n;
    // asin 让纬度按球面积均匀，spread 控制纬度包络
    const lat = Math.max(-spread, Math.min(spread, (Math.asin(-0.92 + 1.84 * t) * 180) / Math.PI));
    let lng = (offset + i * goldenAngle) % 360;
    // 地点 Pin 尽量落在陆地上（绕经度圈寻找，保持种子确定性）
    if (prefer) {
      for (let k = 1; k <= 48; k++) {
        if (prefer(lat, lng)) break;
        lng = (lng + 13.7) % 360;
      }
    }
    apply(id, lat, lng);
  });
}

/** 球面经纬度（度）→ 单位方向向量 */
export function dirFromLatLng(lat: number, lng: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  );
}

/** 球面两点间的最短弧插值（单位向量） */
export function slerpDir(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const va = a.clone().normalize();
  const vb = b.clone().normalize();
  const omega = Math.acos(THREE.MathUtils.clamp(va.dot(vb), -1, 1));
  if (omega < 1e-4) return va;
  const so = Math.sin(omega);
  return va
    .clone()
    .multiplyScalar(Math.sin((1 - t) * omega) / so)
    .add(vb.clone().multiplyScalar(Math.sin(t * omega) / so))
    .normalize();
}

/** 角色轨迹的星色（与关系模式中该角色的星同色） */
export function trackColor(characterId: string): string {
  return starColor(characterId);
}
