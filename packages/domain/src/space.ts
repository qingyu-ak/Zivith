/**
 * Space 合同：Cosmos（Where）与 Studio（Who / When / 编辑）共用。
 *
 * Cosmos 是世界空间浏览器，不另存一套地点数据。
 * 选中地点 / 场景后，用 `studioWorldHref` 打开 Studio Inspector，
 * 用 `spatialContextToPrompt` 给 Creator Chat 注入「这里是哪里」。
 * 3D 视觉留在 experiments/cosmos；语义从这里长，不从 Three.js 长。
 */

export type SpaceType =
  | 'universe'
  | 'galaxy'
  | 'star_system'
  | 'star'
  | 'planet'
  | 'moon'
  | 'continent'
  | 'region'
  | 'country'
  | 'city'
  | 'district'
  | 'location'
  | 'scene';

export interface SpaceRef {
  id: string;
  type: SpaceType;
  name: string;
}

export type StudioSpaceSelectKind = 'location' | 'scene' | 'character';

export interface StudioSpaceSelect {
  kind: StudioSpaceSelectKind;
  id: string;
}

export interface SpatialContext {
  projectId: string;
  spacePath: SpaceRef[];
  currentSpace?: SpaceRef;
  selectedLocation?: SpaceRef;
  selectedScene?: SpaceRef;
  /** 地点资产 description，和 Studio Inspector 同一字段 */
  locationBrief?: string;
  currentTime?: {
    storyId: string;
    storyTitle: string;
    sceneOrder: number;
  };
  nearbyEntities: Array<{ id: string; name: string; kind: 'character' | 'event' }>;
  relevantEvents: Array<{ id: string; name: string; description?: string }>;
  relatedShots: Array<{ label: string }>;
}

export const DEFAULT_STUDIO_ORIGIN = 'http://127.0.0.1:3100';

export function studioWorldHref(
  origin: string,
  projectId: string,
  select: StudioSpaceSelect,
): string {
  const url = new URL(`/projects/${encodeURIComponent(projectId)}/world`, origin);
  url.searchParams.set('select', select.kind);
  url.searchParams.set('entity', select.id);
  return url.toString();
}

export function spatialContextToPrompt(ctx: SpatialContext): string {
  const path = ctx.spacePath
    .map((node) => `${spaceTypeLabel(node.type)}「${node.name}」`)
    .join(' / ');
  const lines = ['## 当前空间上下文', `空间路径：${path || '（世界根）'}`];
  if (ctx.currentSpace) {
    lines.push(`当前所在：${spaceTypeLabel(ctx.currentSpace.type)}「${ctx.currentSpace.name}」`);
  }
  if (ctx.locationBrief) {
    lines.push(`地点简介：${ctx.locationBrief}`);
  }
  if (ctx.currentTime) {
    lines.push(`当前时间：《${ctx.currentTime.storyTitle}》第 ${ctx.currentTime.sceneOrder} 场`);
  }
  const characters = ctx.nearbyEntities.filter((e) => e.kind === 'character');
  if (characters.length > 0) {
    lines.push(`在场角色：${characters.map((c) => c.name).join('、')}`);
  }
  if (ctx.relevantEvents.length > 0) {
    lines.push(`相关事件：${ctx.relevantEvents.map((e) => e.name).join('、')}`);
  }
  if (ctx.relatedShots.length > 0) {
    lines.push(`分镜：${ctx.relatedShots.map((s) => s.label).join('、')}`);
  }
  lines.push('用户说「这里」时，指的就是当前空间路径的最内一层。');
  return lines.join('\n');
}

export function spaceTypeLabel(type: SpaceType): string {
  const labels: Record<SpaceType, string> = {
    universe: '宇宙',
    galaxy: '银河',
    star_system: '恒星系',
    star: '恒星',
    planet: '世界',
    moon: '卫星',
    continent: '大陆',
    region: '区域',
    country: '国家',
    city: '城市',
    district: '街区',
    location: '地点',
    scene: '场景',
  };
  return labels[type];
}
