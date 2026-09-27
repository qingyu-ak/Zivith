/**
 * @zivith/cosmos — 空间可视化视图与数据合同。
 *
 * Studio（apps/web）与独立预览壳（experiments/cosmos）都从这里导入；
 * 样式从 `@zivith/cosmos/styles.css` 导入。
 */
export type {
  AssetDTO,
  MediaDTO,
  SceneDTO,
  StoryDTO,
  WorldEventDTO,
  WorldRelationshipDTO,
  WorldResourcesDTO,
} from './types';

export { MOCK_UNIVERSE, type UniverseBubble } from './data/mock-universe';

export {
  LS_API_BASE,
  LS_API_TOKEN,
  getWorldResources,
  listProjects,
  resolveApiRoot,
  zivithFetch,
  type ApiProject,
} from './lib/api';

export { SpaceCosmos } from './views/SpaceCosmos';
export { CharacterCosmos } from './views/CharacterCosmos';
export { UniverseView } from './views/UniverseView';
export { SystemView } from './views/SystemView';
export { ConnectPanel, type ConnectedProject } from './views/ConnectPanel';
