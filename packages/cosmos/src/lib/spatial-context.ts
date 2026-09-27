import type { SpatialContext } from './zivith-space';
import { spatialContextToPrompt } from './zivith-space';
import type { AssetDTO, SceneDTO, WorldEventDTO } from '../types';
import { spacePathTo, toSpaceRef, type SpaceNode } from './space-tree';

export type { SpatialContext };
export { spatialContextToPrompt };

/**
 * 从当前 Cosmos 选择派生 SpatialContext。
 * Creator Chat 接入时直接 spatialContextToPrompt(ctx) 注入即可。
 */
export function buildSpatialContext(input: {
  root: SpaceNode;
  selectedLocationId: string | null;
  selectedSceneId: string | null;
  scene?: SceneDTO | null;
  storyTitle?: string | null;
  charactersHere: AssetDTO[];
  eventsHere: WorldEventDTO[];
}): SpatialContext {
  const targetId = input.selectedSceneId ?? input.selectedLocationId ?? input.root.id;
  const pathNodes = spacePathTo(input.root, targetId);
  const spacePath = pathNodes.map(toSpaceRef);
  const current = spacePath[spacePath.length - 1];
  const locationNode = pathNodes.find((node) => node.type !== 'scene' && node.parentId !== null);
  const sceneNode = pathNodes.find((node) => node.type === 'scene');
  const locationBrief = locationNode?.description.trim() || '';

  const relatedShots: Array<{ label: string }> = [];
  const shotCount = input.scene?.shot_count;
  if (typeof shotCount === 'number' && shotCount > 0) {
    relatedShots.push({ label: `${shotCount} 个分镜` });
  }

  const ctx: SpatialContext = {
    projectId: input.root.projectId,
    spacePath,
    nearbyEntities: [
      ...input.charactersHere.map((c) => ({ id: c.id, name: c.name, kind: 'character' as const })),
      ...input.eventsHere.map((e) => ({ id: e.id, name: e.title, kind: 'event' as const })),
    ],
    relevantEvents: input.eventsHere.map((e) => {
      const row: { id: string; name: string; description?: string } = { id: e.id, name: e.title };
      if (e.description) row.description = e.description;
      return row;
    }),
    relatedShots,
  };
  if (current) ctx.currentSpace = current;
  if (locationNode) ctx.selectedLocation = toSpaceRef(locationNode);
  if (sceneNode) ctx.selectedScene = toSpaceRef(sceneNode);
  if (locationBrief) ctx.locationBrief = locationBrief;
  if (input.scene && input.storyTitle) {
    ctx.currentTime = {
      storyId: input.scene.story_id,
      storyTitle: input.storyTitle,
      sceneOrder: input.scene.order,
    };
  }
  return ctx;
}
