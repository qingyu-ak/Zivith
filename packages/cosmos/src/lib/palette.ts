/** 颜色与确定性随机的共享工具：同一条数据永远生成同一个画面。 */

export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32：字符串种子 → 可复现的随机序列 */
export function seededRandom(seed: string): () => number {
  let a = hashString(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hueFromId(id: string): number {
  return hashString(id) % 360;
}

export function starColor(id: string): string {
  return `hsl(${hueFromId(id)}, 85%, 72%)`;
}

/* ---------- 关系线配色 ---------- */

const RELATION_COLORS: Array<[RegExp, string]> = [
  [/家|亲|兄妹|姐弟|兄弟|姐妹|血缘/, '#ffab70'],
  [/恋|爱|羁绊|情侣/, '#ff5d8f'],
  [/挚友|朋友|友人|同袍|战友|同伴/, '#5dd6c8'],
  [/师|徒|授业/, '#ffd166'],
  [/宿敌|仇|敌|复仇|对立/, '#ff4d4d'],
  [/同盟|盟|合作|并肩|协作/, '#7aa2ff'],
  [/效忠|上下级|属|麾下|主仆|受命/, '#b48aff'],
  [/旧识|故交|旧年/, '#8fa3c8'],
  [/买卖|情报|消息|交易/, '#6be0d0'],
];

export function relationColor(kind: string, id: string): string {
  for (const [re, color] of RELATION_COLORS) {
    if (re.test(kind)) return color;
  }
  return `hsl(${hueFromId(id)}, 70%, 66%)`;
}

/* ---------- 星球配色 ---------- */

export interface PlanetPalette {
  ocean: [string, string];
  land: [string, string];
  ice?: string;
  /** 大气辉光 / 默认色 */
  glow: string;
}

const PLANET_PALETTES: Array<[RegExp, PlanetPalette]> = [
  [
    /雪|冰|寒|冬/,
    {
      ocean: ['#7fa8d8', '#b8d2ee'],
      land: ['#e6eef8', '#ffffff'],
      ice: '#ffffff',
      glow: '#bcd8ff',
    },
  ],
  [
    /海|港|潮|洋|岸/,
    { ocean: ['#0b2f5e', '#1c5aa0'], land: ['#3f6f5e', '#8fbf9f'], glow: '#5aa8ff' },
  ],
  [/岛|屿|礁/, { ocean: ['#0d3a52', '#1a6b8a'], land: ['#3d8a5f', '#a8d88f'], glow: '#57e0b8' }],
  [
    /江|河|湖|渡|溪|泽|滩/,
    { ocean: ['#0c3c46', '#177a80'], land: ['#4f7a4a', '#9fd08a'], glow: '#4fd8c8' },
  ],
  [
    /城|京|宫|都|堡|阙/,
    { ocean: ['#3a2f52', '#5f4c82'], land: ['#b8955a', '#ecd8a8'], glow: '#e8c46b' },
  ],
  [/漠|沙|丘|荒/, { ocean: ['#5a4326', '#8a6a3a'], land: ['#d8b070', '#f0dca8'], glow: '#ffcf8a' }],
  [
    /森|林|原|野|草原/,
    { ocean: ['#16351f', '#2a5a35'], land: ['#4a8a4f', '#a0d888'], glow: '#6be08a' },
  ],
  [
    /雾|秘|谜|遗迹/,
    { ocean: ['#232338', '#3a3a58'], land: ['#565676', '#8d8db0'], glow: '#a29fe0' },
  ],
];

export function planetPalette(name: string, tags: string[] | undefined, id: string): PlanetPalette {
  const text = [name, ...(tags ?? [])].join(' ');
  for (const [re, palette] of PLANET_PALETTES) {
    if (re.test(text)) return palette;
  }
  const h = hueFromId(id);
  const h2 = (h + 45) % 360;
  return {
    ocean: [`hsl(${h}, 50%, 22%)`, `hsl(${h}, 55%, 38%)`],
    land: [`hsl(${h2}, 42%, 44%)`, `hsl(${h2}, 48%, 66%)`],
    glow: `hsl(${h}, 78%, 70%)`,
  };
}

/* ---------- 情绪配色（场景标记） ---------- */

const MOOD_COLORS: Array<[RegExp, string]> = [
  [/温馨|暖|喜悦|欢|轻松/, '#ffbe5c'],
  [/紧张|惊|危|激|急/, '#ff6b6b'],
  [/神秘|诡|谜|幻/, '#b48aff'],
  [/悲|伤|哀|离|怅/, '#7aa2ff'],
  [/压抑|沉重|阴|郁/, '#8a94b8'],
];

export function moodColor(mood: string | null | undefined, id: string): string {
  if (mood) {
    for (const [re, color] of MOOD_COLORS) {
      if (re.test(mood)) return color;
    }
  }
  return `hsl(${hueFromId(id)}, 70%, 66%)`;
}

/** 把 hsl/css 颜色统一转成 hex，便于 canvas 与 three 共用 */
export function toHex(cssColor: string): string {
  const el = document.createElement('canvas').getContext('2d');
  if (!el) return '#ffffff';
  el.fillStyle = cssColor;
  return el.fillStyle;
}
