import type { WorldResourcesDTO } from '../types';
import { MOCK_WORLD } from './mock-world';

/** Universe Bubble = 一个 Project 的空间入口，不另存一套项目数据。 */
export interface UniverseBubble {
  id: string;
  name: string;
  description: string;
  genre?: string;
  kind: 'mock' | 'api';
  locationCount?: number;
  characterCount?: number;
  resources?: WorldResourcesDTO;
}

function stubWorld(
  id: string,
  name: string,
  description: string,
  genre: string,
  places: Array<[string, string, string, string[]]>,
): WorldResourcesDTO {
  return {
    project: {
      id,
      name,
      description,
      worldview: { genre, premise: description },
    },
    stage: 'draft',
    entities: {
      stories: [],
      characters: [],
      locations: places.map(([placeId, placeName, placeDesc, tags]) => ({
        id: placeId,
        project_id: id,
        type: 'location',
        asset_type: 'location',
        name: placeName,
        description: placeDesc,
        tags,
        cover_image: null,
      })),
      scenes: [],
      world_events: [],
      relationships: [],
      shots: [],
    },
  };
}

const GALAXY_MARCH = stubWorld(
  'proj_mock_galaxy',
  '银河远征',
  '三支舰队在北境恒星系相遇。这里还是草稿世界，只有几处殖民地坐标。',
  '星际探索',
  [
    ['loc_g_harbor', '北境星港', '舰队补给的第一站。', ['港口', '殖民地']],
    ['loc_g_ring', '环带矿区', '碎冰与矿艇共用同一条航路。', ['矿带', '轨道', '星环']],
    ['loc_g_keep', '守望站', '恒星系边缘的监听哨。', ['哨站', '边境']],
  ],
);

const DEEP_CITY = stubWorld(
  'proj_mock_deep',
  '深海城',
  '压力穹顶下的城市还没写完，但已经能看见三座水下街区。',
  '科幻 / 深海',
  [
    ['loc_d_dome', '主穹顶', '整座城的肺。', ['城市', '穹顶']],
    ['loc_d_market', '潮汐市集', '随洋流开关的集市。', ['市集', '街区']],
    ['loc_d_trench', '海沟观测井', '没有回声的地方。', ['深渊', '观测']],
  ],
);

const CYBER_BEIJING = stubWorld(
  'proj_mock_cyber',
  '赛博北京',
  '二环还是二环，只是路牌会改写记忆。',
  '赛博朋克',
  [
    ['loc_c_hutong', '霓虹胡同', '招牌比门牌更老。', ['街区', '胡同']],
    ['loc_c_tower', '中轴塔', '城市的假地平线。', ['地标', '城市']],
    ['loc_c_ring', '二环高架', '永远在下雨的一层。', ['公路', '雨']],
  ],
);

function bubbleFromWorld(
  world: WorldResourcesDTO,
  kind: UniverseBubble['kind'] = 'mock',
): UniverseBubble {
  return {
    id: world.project.id,
    name: world.project.name,
    description: world.project.description ?? '',
    genre: world.project.worldview?.genre,
    kind,
    locationCount: world.entities.locations.length,
    characterCount: world.entities.characters.length,
    resources: world,
  };
}

export const MOCK_UNIVERSE: UniverseBubble[] = [
  bubbleFromWorld(MOCK_WORLD),
  bubbleFromWorld(GALAXY_MARCH),
  bubbleFromWorld(DEEP_CITY),
  bubbleFromWorld(CYBER_BEIJING),
];
