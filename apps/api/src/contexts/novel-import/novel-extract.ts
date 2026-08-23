// M2 小说导入 — 规则提取（设计 §5.2 步骤④，mock-first 无密钥轨）
// 从章节文本统计角色/地点提及、事件句、共现关系、性格句。

export interface ChapterExtraction {
  /** 名字 → 出现次数 */
  characterMentions: Map<string, number>;
  /** 地点 → 出现次数 */
  locationMentions: Map<string, number>;
  /** 事件句（含章号与出场角色） */
  events: Array<{ chapterIndex: number; text: string; characters: string[] }>;
  /** 性格/身份句（名字 + 描述） */
  traits: Array<{ name: string; text: string }>;
  /** 角色共现（"A|B" 排序拼接）→ 次数 */
  cooccurrences: Map<string, number>;
}

const SPEECH_VERB =
  '(?:说|道|问|答|喊|叫|吼|骂|笑|哭|叹|嘀咕|低声|大声|沉声|冷冷|淡淡|严肃|激动|惊讶|犹豫|点头|摇头|摆手|皱眉|抬头|低头|转过头|转过身|出现|消失|走进|走出|跑|跳|站|坐|拿|背|带|看|望|盯|握|挥|冲|退|宣布|决定|明白|知道|记得|发现|得到|失去|打败|击败|救|帮|拉|推|抱|追|逃|到达|成为|变成|获得)';
const NAME = '([\\u4e00-\\u9fa5]{2,4})';

const NAME_STOPWORDS = new Set([
  '自己', '他们', '她们', '他们俩', '大家', '我们', '你们', '这个', '那个', '什么', '然后',
  '突然', '终于', '可是', '但是', '只是', '还是', '所以', '因为', '如果', '虽然', '不过',
  '一声', '一句', '一句', '两人', '三人', '众人', '别人', '对方', '此时', '此刻', '似乎',
  '仿佛', '而且', '接着', '随后', '最后', '首先', '其中', '这里', '那里', '哪里', '所有',
  '有些', '许多', '很多', '非常', '十分', '已经', '曾经', '正在', '将要', '一直', '一边',
]);

const LOCATION_SUFFIX =
  '学院|大学|中学|学校|城|镇|村|山|岛|宫|殿|阁|楼|街|路|国|海|江|河|湖|森林|沙漠|峡谷|平原|高原|盆地|庄园|教堂|医院|公司|研究所|实验室|基地|车站|机场|码头|酒馆|旅馆|图书馆';

const MOVE_CHAR = /[走进出到去来回往赶冲穿越离飞跑]/;

/** 修剪地点主体中的移动动词前缀（「走进青云」→「青云」）。 */
function trimLocationBody(body: string): string | null {
  let trimmed = body;
  while (trimmed.length > 2 && MOVE_CHAR.test(trimmed[0] ?? '')) trimmed = trimmed.slice(1);
  let lastMove = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (MOVE_CHAR.test(trimmed[i] ?? '')) lastMove = i;
  }
  if (lastMove !== -1) trimmed = trimmed.slice(lastMove + 1);
  return trimmed.length >= 2 ? trimmed : null;
}

const EVENT_VERBS =
  /杀了|杀死|战死|牺牲|死亡|去世|打败|击败|战胜|获胜|战败|逃跑|逃离|抵达|到达|出发|启程|爆发|决战|开战|结束|开始|发现|找到|得到|失去|觉醒|召唤|签订|背叛|重逢|分别|相遇|救出|绑架|失踪|加冕|登基|审判|处决|突破|晋升|入学|毕业|比试|比赛|决斗/;

const TRAIT_PATTERN = /([\u4e00-\u9fa5]{2,4})(的性格|为人|脾气|身份|外表|外貌|穿着|擅长|能力|实力|背景)/;

function bump(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function isLikelyName(candidate: string): boolean {
  if (NAME_STOPWORDS.has(candidate)) return false;
  // 纯常见虚词/副词组合过滤：含「的」「了」「是」开头的碎片
  if (/^[的了是在和与对从向被把这有人]/.test(candidate)) return false;
  if (/[的了着过吗呢吧啊哦嘛之]/.test(candidate)) return false;
  return true;
}

export function extractFromChapter(
  chapterIndex: number,
  content: string,
  knownNames: ReadonlySet<string> = new Set(),
): ChapterExtraction {
  const characterMentions = new Map<string, number>();
  const locationMentions = new Map<string, number>();
  const cooccurrences = new Map<string, number>();
  const events: ChapterExtraction['events'] = [];
  const traits: ChapterExtraction['traits'] = [];

  // ① 对话引导词前的名字（中文小说最强人名信号）
  const speechName = new RegExp(`${NAME}${SPEECH_VERB}`, 'g');
  for (const m of content.matchAll(speechName)) {
    const name = m[1] ?? '';
    if (!isLikelyName(name)) continue;
    bump(characterMentions, name);
  }

  // ② 已知名字的裸提及（跨章累积后消歧更强）
  for (const name of knownNames) {
    let count = 0;
    let pos = content.indexOf(name);
    while (pos !== -1) {
      count++;
      pos = content.indexOf(name, pos + name.length);
    }
    if (count > 0) bump(characterMentions, name, count);
  }

  // ③ 地点（匹配后修剪移动动词前缀：「走进青云学院」→「青云学院」）
  const locationPattern = new RegExp(`([\\u4e00-\\u9fa5]{2,6}?(?:${LOCATION_SUFFIX}))`, 'g');
  const locationSuffixPattern = new RegExp(`(?:${LOCATION_SUFFIX})$`);
  for (const m of content.matchAll(locationPattern)) {
    const hit = m[1] ?? '';
    const suffixMatch = hit.match(locationSuffixPattern);
    const suffix = suffixMatch?.[0] ?? '';
    const body = trimLocationBody(hit.slice(0, hit.length - suffix.length));
    if (body) bump(locationMentions, body + suffix);
  }

  // ④ 句级分析：事件句 / 性格句 / 共现
  const sentences = content
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 120);
  for (const sentence of sentences) {
    const present = [...characterMentions.keys()].filter((name) => sentence.includes(name));
    if (EVENT_VERBS.test(sentence) && present.length > 0) {
      events.push({ chapterIndex, text: sentence, characters: present.slice(0, 5) });
    }
    const traitMatch = sentence.match(TRAIT_PATTERN);
    const traitName = traitMatch?.[1] ?? '';
    if (traitMatch && isLikelyName(traitName)) {
      traits.push({ name: traitName, text: sentence });
    }
    if (present.length >= 2) {
      for (let i = 0; i < present.length; i++) {
        for (let j = i + 1; j < present.length; j++) {
          const key = [present[i], present[j]].sort().join('|');
          bump(cooccurrences, key);
        }
      }
    }
  }

  return { characterMentions, locationMentions, events, traits, cooccurrences };
}

/** 编辑距离 ≤1 且长度 ≥3 视为同一实体（「路明非」=「路明飞」）。 */
function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) diff++;
      if (diff > 1) return false;
    }
    return diff === 1;
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
    } else if (skipped) {
      return false;
    } else {
      skipped = true;
      j++;
    }
  }
  return true;
}

export interface CharacterAggregate {
  /** 规范名（频次最高的称呼） */
  name: string;
  aliases: string[];
  mentions: number;
  traits: string[];
  chapters: Set<number>;
}

/** 跨章合并：名字聚合 + 编辑距离消歧。 */
export function aggregateCharacters(
  perChapter: ChapterExtraction[],
  traitsByChapter: Array<Array<{ name: string; text: string }>> = [],
): CharacterAggregate[] {
  const groups: Array<{ names: Map<string, number>; traits: string[]; chapters: Set<number> }> = [];
  const findGroup = (name: string) =>
    groups.find((group) =>
      [...group.names.keys()].some((existing) => editDistanceAtMostOne(existing, name)),
    );

  perChapter.forEach((extraction, chapterIndex) => {
    for (const [name, count] of extraction.characterMentions) {
      let group = findGroup(name);
      if (!group) {
        group = { names: new Map(), traits: [], chapters: new Set() };
        groups.push(group);
      }
      group.names.set(name, (group.names.get(name) ?? 0) + count);
      group.chapters.add(chapterIndex);
    }
  });

  traitsByChapter.forEach((traits, chapterIndex) => {
    for (const trait of traits) {
      const group = findGroup(trait.name);
      if (group && group.traits.length < 8 && !group.traits.includes(trait.text)) {
        group.traits.push(trait.text);
        group.chapters.add(chapterIndex);
      }
    }
  });

  return groups
    .map((group) => {
      const sorted = [...group.names.entries()].sort((a, b) => b[1] - a[1]);
      const [name, mentions] = sorted[0] ?? ['', 0];
      return {
        name,
        aliases: sorted.slice(1).map(([alias]) => alias),
        mentions,
        traits: group.traits,
        chapters: group.chapters,
      };
    })
    .filter((aggregate) => aggregate.name && aggregate.mentions >= 2);
}
