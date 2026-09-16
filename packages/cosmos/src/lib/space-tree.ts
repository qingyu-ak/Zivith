/**
 * Space 语义层（实验版，纯前端派生）。
 *
 * 类型与 Agent 文案在 packages/domain/src/space.ts（本目录 zivith-space 再导出）。
 * 这里只负责从现有 Project / location / scene 生成树；后端若补 Space 表，换数据源即可。
 */

export type { SpaceRef, SpaceType } from './zivith-space';
export { spaceTypeLabel } from './zivith-space';
import type { SpaceRef, SpaceType } from './zivith-space';

export interface SpaceNode {
  id: string;
  projectId: string;
  parentId: string | null;
  type: SpaceType;
  name: string;
  description: string;
  position: { lat: number; lng: number };
  scale: number;
  metadata: Record<string, unknown>;
  children: SpaceNode[];
}

const CELESTIAL: ReadonlySet<SpaceType> = new Set([
  'universe',
  'galaxy',
  'star_system',
  'star',
  'planet',
  'moon',
]);

export function isCelestialSpace(type: SpaceType): boolean {
  return CELESTIAL.has(type);
}

export function inferRootSpaceType(genre?: string): Extract<SpaceType, 'galaxy' | 'planet'> {
  if (genre && /星际|银河|宇宙|科幻|星舰/.test(genre)) return 'galaxy';
  return 'planet';
}

export function inferLocationSpaceType(name: string, tags: string[] = []): SpaceType {
  const text = [name, ...tags].join(' ');
  if (/洲|大陆/.test(text)) return 'continent';
  if (/国|王朝|王国/.test(text)) return 'country';
  if (/原|域|流域|群岛|雪原|边关/.test(text)) return 'region';
  if (/城|京|港|镇|市|都/.test(text)) return 'city';
  if (/区|坊|街区/.test(text)) return 'district';
  return 'location';
}

export function flattenSpace(root: SpaceNode): SpaceNode[] {
  const out: SpaceNode[] = [];
  const walk = (node: SpaceNode) => {
    out.push(node);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return out;
}

export function findSpace(root: SpaceNode, id: string | null | undefined): SpaceNode | null {
  if (!id) return null;
  if (root.id === id) return root;
  for (const child of root.children) {
    const hit = findSpace(child, id);
    if (hit) return hit;
  }
  return null;
}

/** 从根到目标的路径（含两端）。找不到则只返回根。 */
export function spacePathTo(root: SpaceNode, id: string | null | undefined): SpaceNode[] {
  if (!id || root.id === id) return [root];
  const trail: SpaceNode[] = [];
  const walk = (node: SpaceNode): boolean => {
    trail.push(node);
    if (node.id === id) return true;
    for (const child of node.children) {
      if (walk(child)) return true;
    }
    trail.pop();
    return false;
  };
  return walk(root) ? trail : [root];
}

export function toSpaceRef(node: SpaceNode): SpaceRef {
  return { id: node.id, type: node.type, name: node.name };
}

export function applySpacePosition(node: SpaceNode, lat: number, lng: number): void {
  node.position = { lat, lng };
}

interface TreeInput {
  projectId: string;
  projectName: string;
  projectDescription: string;
  genre?: string;
  locations: Array<{ id: string; name: string; description?: string | null; tags?: string[] }>;
  scenes: Array<{
    id: string;
    title: string;
    description?: string | null;
    summary?: string | null;
    location_id?: string | null;
    mood?: string | null;
    shot_count?: number;
  }>;
  orphanRegionId: string;
}

export function buildSpaceTree(input: TreeInput): SpaceNode {
  const rootType = inferRootSpaceType(input.genre);
  const rootId = input.projectId;
  const root: SpaceNode = {
    id: rootId,
    projectId: input.projectId,
    parentId: null,
    type: rootType,
    name: input.projectName,
    description: input.projectDescription,
    position: { lat: 0, lng: 0 },
    scale: 1,
    metadata: { genre: input.genre ?? null, role: 'root' },
    children: [],
  };

  const locationIds = new Set(input.locations.map((loc) => loc.id));
  for (const loc of input.locations) {
    const childScenes = input.scenes.filter((scene) => scene.location_id === loc.id);
    root.children.push(locationNode(input.projectId, rootId, loc, childScenes));
  }

  const orphans = input.scenes.filter(
    (scene) => !scene.location_id || !locationIds.has(scene.location_id),
  );
  if (orphans.length > 0) {
    root.children.push({
      id: input.orphanRegionId,
      projectId: input.projectId,
      parentId: rootId,
      type: 'region',
      name: '未知之地',
      description: '尚未归属任何地点的场景聚集于此。',
      position: { lat: 0, lng: 0 },
      scale: 0.45,
      metadata: { orphan: true },
      children: orphans.map((scene) => sceneNode(input.projectId, input.orphanRegionId, scene)),
    });
  }

  return root;
}

function locationNode(
  projectId: string,
  parentId: string,
  loc: { id: string; name: string; description?: string | null; tags?: string[] },
  scenes: TreeInput['scenes'],
): SpaceNode {
  return {
    id: loc.id,
    projectId,
    parentId,
    type: inferLocationSpaceType(loc.name, loc.tags ?? []),
    name: loc.name,
    description: loc.description ?? '',
    position: { lat: 0, lng: 0 },
    scale: 0.5,
    metadata: { tags: loc.tags ?? [], source: 'location' },
    children: scenes.map((scene) => sceneNode(projectId, loc.id, scene)),
  };
}

function sceneNode(
  projectId: string,
  parentId: string,
  scene: TreeInput['scenes'][number],
): SpaceNode {
  return {
    id: scene.id,
    projectId,
    parentId,
    type: 'scene',
    name: scene.title,
    description: scene.summary ?? scene.description ?? '',
    position: { lat: 0, lng: 0 },
    scale: 0.2,
    metadata: {
      source: 'scene',
      mood: scene.mood ?? null,
      shot_count: scene.shot_count ?? 0,
    },
    children: [],
  };
}
