import { seededRandom } from './palette';
import type { RegionSpaceNode, SceneSpaceNode } from './space-model';

export type SiteTheme = 'harbor' | 'city' | 'wild' | 'isles' | 'river';
export type ParcelKind = 'water' | 'ground' | 'road' | 'green' | 'dock' | 'block' | 'scene';
export type SiteMassing = 'plate' | 'hall' | 'tower';

export interface SiteParcel {
  id: string;
  kind: ParcelKind;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  label?: string;
  sceneId?: string;
  color: string;
  massing?: SiteMassing;
}

export interface SiteLayout {
  theme: SiteTheme;
  title: string;
  subtitle: string;
  extent: number;
  parcels: SiteParcel[];
}

const THEME_LABEL: Record<SiteTheme, string> = {
  harbor: '海港平面',
  city: '城市平面',
  wild: '地貌平面',
  isles: '群岛平面',
  river: '流域平面',
};

export function inferSiteTheme(region: RegionSpaceNode): SiteTheme {
  const text = [region.name, ...region.tags, region.description].join(' ');
  if (/港|海|码头|灯塔/.test(text)) return 'harbor';
  if (/岛|湾|洞窟/.test(text)) return 'isles';
  if (/江|河|水乡|漕运|芦苇/.test(text)) return 'river';
  if (/城|京|市|都|王城/.test(text)) return 'city';
  return 'wild';
}

export function inferSceneMassing(title: string): SiteMassing {
  if (/灯塔|塔|哨塔|学士塔/.test(title)) return 'tower';
  if (/悬崖|湾|洞窟|雪原|哨|野|林/.test(title)) return 'plate';
  return 'hall';
}

function box(
  id: string,
  kind: ParcelKind,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  color: string,
  extra: Partial<SiteParcel> = {},
): SiteParcel {
  return { id, kind, x, z, w, d, h, rot: 0, color, ...extra };
}

function placeHarborScene(
  node: SceneSpaceNode,
  index: number,
): { x: number; z: number; massing: SiteMassing } {
  const title = node.scene.title;
  if (/灯塔/.test(title)) return { x: 10.4, z: 6.1, massing: 'tower' };
  if (/码头|渡|晨雾/.test(title)) return { x: -1.2, z: 2.0, massing: 'hall' };
  if (/悬崖|诀别/.test(title)) return { x: -10.6, z: -6.4, massing: 'plate' };
  return {
    x: -8 + (index % 4) * 5.4,
    z: -2.4 - Math.floor(index / 4) * 4,
    massing: inferSceneMassing(title),
  };
}

function placeCityScene(
  index: number,
  title: string,
): { x: number; z: number; massing: SiteMassing } {
  const col = (index % 3) - 1;
  const row = Math.floor(index / 3) - 0.5;
  return { x: col * 7.4, z: row * 6.6, massing: inferSceneMassing(title) };
}

function placeRiverScene(
  index: number,
  title: string,
): { x: number; z: number; massing: SiteMassing } {
  const bank = index % 2 === 0 ? -9.6 : 9.6;
  return { x: bank, z: -9.5 + index * 4.8, massing: inferSceneMassing(title) };
}

function placeIslesScene(
  index: number,
  title: string,
  rand: () => number,
): { x: number; z: number; massing: SiteMassing } {
  const ring = 5.8 + (index % 3) * 2.2;
  const a = index * 1.7 + 0.4;
  return {
    x: Math.cos(a) * ring + (rand() - 0.5) * 1.2,
    z: Math.sin(a) * ring + (rand() - 0.5) * 1.2,
    massing: inferSceneMassing(title),
  };
}

function placeWildScene(
  index: number,
  title: string,
  n: number,
): { x: number; z: number; massing: SiteMassing } {
  const t = n <= 1 ? 0 : (index / Math.max(1, n - 1)) * Math.PI * 1.2 - 0.4;
  return { x: Math.sin(t) * 8.5, z: Math.cos(t) * 6.2 - 1, massing: inferSceneMassing(title) };
}

/** 由地点类型 + 场景生成一张可复现的示意平面（不是 GIS）。 */
export function buildSiteLayout(region: RegionSpaceNode): SiteLayout {
  const theme = inferSiteTheme(region);
  const rand = seededRandom('site:' + region.id);
  const extent = 28;
  const parcels: SiteParcel[] = [];
  parcels.push(box('ground', 'ground', 0, 0, extent, extent, 0.05, '#243140'));

  if (theme === 'harbor') {
    parcels.push(box('water', 'water', 0, 8.4, extent, 11.2, 0.2, '#2a92b8'));
    parcels.push(box('quay', 'block', 0, 1.55, 22, 3.6, 0.28, '#4a5568'));
    for (let i = 0; i < 4; i++) {
      parcels.push(box(`dock-${i}`, 'dock', -8.4 + i * 4.8, 4.85, 1.15, 4.2, 0.32, '#7a684e'));
    }
    parcels.push(box('warehouse-a', 'block', -7.2, -0.4, 5.4, 2.4, 1.05, '#4a5568'));
    parcels.push(box('st-a', 'road', 3.2, -7.2, 0.55, 11, 0.1, '#5a6578'));
    parcels.push(box('st-b', 'road', -2.4, -8.4, 14, 0.55, 0.1, '#5a6578'));
    parcels.push(box('house-row', 'block', 6.4, -5.4, 7.2, 3.2, 0.7, '#3a4558'));
    parcels.push(box('warehouse-b', 'block', 4.8, -0.2, 6.2, 2.6, 1.25, '#414c5e'));
    parcels.push(box('cliff', 'green', -11.2, -6.8, 5.6, 7.2, 0.55, '#2a4636'));
    parcels.push(box('rock', 'block', 11.1, 6.2, 3.2, 3.2, 0.42, '#5a6574'));
  } else if (theme === 'isles') {
    parcels.push(box('sea', 'water', 0, 0, extent, extent, 0.16, '#1e7a9a'));
    parcels[0].color = '#155a78';
    const isles = [
      [-6.2, -4.4, 7.2, 5.4],
      [5.8, 3.2, 6.4, 5.8],
      [-2.4, 7.1, 4.6, 3.8],
      [7.4, -6.6, 5.2, 4.4],
    ] as const;
    isles.forEach(([x, z, w, d], i) => {
      parcels.push(box(`isle-${i}`, 'ground', x, z, w, d, 0.28, i % 2 ? '#2c4034' : '#26382e'));
    });
  } else if (theme === 'river') {
    parcels.push(box('river', 'water', 0, 0, 5.6, extent, 0.16, '#1e8498'));
    parcels.push(box('reed-e', 'green', 8.1, 1.2, 9.2, 20, 0.12, '#234a34'));
    parcels.push(box('reed-w', 'green', -8.2, -0.8, 8.6, 18, 0.12, '#1d3f2d'));
    parcels.push(box('bank-n', 'block', -8.8, -10.4, 4.8, 2.2, 0.28, '#3b4656'));
    parcels.push(box('bank-s', 'block', 8.6, 9.6, 4.4, 2.0, 0.28, '#3b4656'));
  } else if (theme === 'city') {
    for (let i = -2; i <= 2; i++) {
      parcels.push(box(`rd-h-${i}`, 'road', 0, i * 5.2, 24, 1.05, 0.1, '#5a6578'));
      parcels.push(box(`rd-v-${i}`, 'road', i * 5.2, 0, 1.05, 24, 0.1, '#5a6578'));
    }
    let n = 0;
    for (let gx = -2; gx <= 1; gx++) {
      for (let gz = -2; gz <= 1; gz++) {
        parcels.push(
          box(
            `blk-${n++}`,
            'block',
            gx * 5.2 + 2.6,
            gz * 5.2 + 2.6,
            3.55,
            3.55,
            0.55 + rand() * 1.35,
            '#3a4558',
          ),
        );
      }
    }
  } else {
    parcels.push(box('field', 'green', 0, 1.4, 20, 16, 0.1, '#244332'));
    for (let i = 0; i < 5; i++) {
      parcels.push(
        box(
          `ridge-${i}`,
          'block',
          (rand() - 0.5) * 16,
          (rand() - 0.5) * 14,
          2.4 + rand() * 2.8,
          1.4 + rand() * 1.8,
          0.35 + rand() * 0.7,
          '#4a5566',
        ),
      );
    }
  }

  region.scenes.forEach((node, i) => {
    const title = node.scene.title;
    const placed =
      theme === 'harbor'
        ? placeHarborScene(node, i)
        : theme === 'river'
          ? placeRiverScene(i, title)
          : theme === 'isles'
            ? placeIslesScene(i, title, rand)
            : theme === 'city'
              ? placeCityScene(i, title)
              : placeWildScene(i, title, region.scenes.length);
    const massing = placed.massing;
    const h =
      massing === 'tower'
        ? 3.4
        : massing === 'hall'
          ? 1.45 + (node.scene.shot_count ?? 2) * 0.08
          : 0.42;
    const size = massing === 'tower' ? 2.1 : massing === 'hall' ? 3.4 : 3.8;
    parcels.push(
      box(`scene-${node.scene.id}`, 'scene', placed.x, placed.z, size, size, h, node.color, {
        label: node.scene.title,
        sceneId: node.scene.id,
        massing,
      }),
    );
  });

  return {
    theme,
    title: region.name,
    subtitle: `${THEME_LABEL[theme]} · ${region.scenes.length} 个场景`,
    extent,
    parcels,
  };
}
