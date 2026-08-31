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

/** 只保留「名前 + 说/动作」这类强信号；知道/发现 会把「明非忽然知道」当成角色。出现仍保留（「凯撒出现」）。 */
const SPEECH_VERB =
  '(?:点了点头|转过头|转过身|说道|问道|答道|喝道|低声说|大声说|说|问|答|喊|叫|吼|骂|笑|哭|叹|嘀咕|点头|摇头|皱眉|宣布|打败|击败|出现)';
const NAME = '([\\u4e00-\\u9fa5]{2,4}?)';

const NAME_STOPWORDS = new Set(
  `
  自己 他们 她们 他们俩 大家 我们 你们 咱们 这个 那个 这些 那些 什么 怎么 怎样 为何 为什么
  然后 突然 忽然 终于 于是 可是 但是 只是 还是 就是 不是 或者 又或者 所以 因为 如果 虽然
  不过 而且 接着 随后 最后 首先 其中 这里 那里 哪里 所有 有些 许多 很多 非常 十分 已经
  曾经 正在 将要 一直 一边 没有 甚至 立刻 马上 连忙 赶紧 不禁 不由 只见 只听 只觉 以及
  几乎 大约 也许 或许 大概 果然 原来 其实 当然 根本 完全 更加 格外 特别 尤其 电梯 喜欢
  一个 世界 满世界 可以 应该 那么 现在 这样 那样 一声 一句 两人 三人 众人 别人 对方
  此时 此刻 似乎 仿佛 感觉 即使 原本 准备 至于 不得不 心脏 家伙 人们 人人 有人 某人
  老师 教授 学生 男孩 女孩 男人 女人 老人 孩子 医生 护士 司机 士兵 队长 怪物 事情 问题
  时候 地方 样子 声音 眼睛 手中 身上 心里 心中 面前 身后 旁边 之间 之后 之前 开始 结束
  微微 缓缓 静静 慢慢 轻轻 冷冷 淡淡 狠狠 深深 缓缓地 静静地 慢慢地 轻轻地 冷冷地 微微地
  知道 明白 记得 发现 决定 出现 消失 成为 变成 获得 得到 失去 到达 看见 看着 看看
  一下 一起 一定 一样 一种 一般 一直 一部分 一会儿 一下子 不可能 没什么 什么样
  而是 也是 想要 个人 不知 不会 不能 不要 不用 只有 只要 只是 只得 只怕
  没有 没什么 什么样 为什么 怎么样 那是 这是 可是 还是 总是 老是
  它们 家族 学院 能力 难道 句话 确实 准确 并非 两个人 永远 秒钟 很难 没有人 简单 混血种
  老板 师姐 老爹 元老 惊讶 实在 显然 要是 直接 我这 你这 没人 还没 却又
  也就是 却没有 个男人 明非忽然 更别 按理 按道理 理论上 也可以 委实 毫无疑 且不 慢悠悠 我跟你
  也不能 也不是 一觉睡醒 时候他 让人 不如 简直 无声 比如 不再 前方 秘书 老妈 屏幕上
  舰长 神官 先生 小姐 女士 大人 阁下 神父 修女 骑士 将军 上校 中将 少将 士官 学员
  尔特 格尔
  `
    .split(/\s+/)
    .filter(Boolean),
);

const GLUE_PREFIX = new Set('跟给让把被从向对和与在到以用为连'.split(''));
const GLUE_SUFFIX = new Set(
  '也还都就却又点心在对来不没已正再才并都大小很却笑低冷苦难点头着过知道摇以微'.split(''),
);
const ADVERB_SUFFIX = /(?:忽然|突然|终于|立刻|马上|不禁|差点|猛地|赶紧|随口|还是)$/;
const MANNER_SUFFIX =
  /(?:低声|大声|冷冷|淡淡|微微|轻轻|轻声|沉声|苦笑|微笑|怒|地|缓缓|幽幽|悠悠|慢悠悠)$/;
/** 「某某先生/小姐」里的称呼不是名字的一部分。 */
const TITLE_SUFFIX = /(?:先生|小姐|女士|大人|阁下)$/;
/** 纯虚词拼出来的「人名」（也就是 / 却没有 / 还没）。 */
const FUNCTION_CHARS = new Set(
  '的了是在和与对从不也就都还没却但又而可这那有人说想把被给让个几吗呢吧啊哦嘛以跟'.split(''),
);

const LOCATION_SUFFIX =
  '学院|大学|中学|学校|城堡|庄园|教堂|医院|研究所|实验室|基地|车站|机场|码头|酒馆|旅馆|图书馆|宫殿|神殿|总部|会议室';

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

function isPlausibleLocationBody(body: string): boolean {
  if (body.length < 2 || body.length > 6) return false;
  if (NAME_STOPWORDS.has(body)) return false;
  if (/^[一这那某每你我他她它在从到和与被把让给]/.test(body)) return false;
  if (/[的了着过吗呢吧啊哦嘛和与是能借要开卧躲件还没入再但进]/.test(body)) return false;
  if (/^[一两三四五六七八九十百千]/.test(body)) return false;
  if (/^(整个|代表|不愧|交给|样一|人被|而当|纳粹|里建)/.test(body)) return false;
  return true;
}

/** 从粘连片段里取出真正的地名：「但卡塞尔学院」→「卡塞尔学院」。 */
export function normalizeLocationName(raw: string): string | null {
  const suffixRe = new RegExp(`(?:${LOCATION_SUFFIX})$`);
  const suffixMatch = raw.match(suffixRe);
  if (!suffixMatch?.[0]) return null;
  const suffix = suffixMatch[0];
  let before = raw.slice(0, raw.length - suffix.length);
  before = before.replace(/[的了着过在和与是]+$/g, '');
  for (let n = Math.min(6, before.length); n >= 2; n--) {
    const body = trimLocationBody(before.slice(-n));
    if (body && isPlausibleLocationBody(body)) return body + suffix;
  }
  return null;
}

export function mergeLocationMentions(mentions: Map<string, number>): Map<string, number> {
  const merged = new Map<string, number>();
  for (const [raw, count] of mentions) {
    const place = normalizeLocationName(raw);
    if (!place) continue;
    bump(merged, place, count);
  }
  const names = [...merged.keys()].sort((a, b) => a.length - b.length);
  const remove = new Set<string>();
  for (const shorter of names) {
    if (remove.has(shorter)) continue;
    for (const longer of names) {
      if (longer === shorter || remove.has(longer)) continue;
      if (longer.endsWith(shorter) && longer.length - shorter.length <= 6) {
        bump(merged, shorter, merged.get(longer) ?? 0);
        remove.add(longer);
      }
    }
  }
  for (const name of remove) merged.delete(name);
  return merged;
}

/** 强情节：一人在场也可成事件。开始/发现太常见，不进此列。 */
const STRONG_EVENT_VERBS =
  /杀了|杀死|战死|牺牲|死亡|去世|打败|击败|战胜|战败|决战|开战|背叛|重逢|绑架|失踪|处决|觉醒|签订|入学|毕业|决斗|救出/;
/** 需至少两名角色同场，避免把「开始审讯 / 发现残卷」当成主线。 */
const SUPPORT_EVENT_VERBS =
  /逃跑|逃离|抵达|到达|出发|启程|爆发|相遇|分别|加冕|登基|审判|突破|晋升|比试|比赛|召唤/;

function isPlotEvent(sentence: string, presentCount: number): boolean {
  if (STRONG_EVENT_VERBS.test(sentence) && presentCount >= 1) return true;
  if (SUPPORT_EVENT_VERBS.test(sentence) && presentCount >= 2) return true;
  return false;
}

const TRAIT_PATTERN =
  /([\u4e00-\u9fa5]{2,4})(的性格|为人|脾气|身份|外表|外貌|穿着|擅长|能力|实力|背景)/;

function bump(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function dropContainedFragments(mentions: Map<string, number>) {
  const names = [...mentions.keys()];
  const remove = new Set<string>();
  for (const shorter of names) {
    for (const longer of names) {
      if (shorter === longer || longer.length <= shorter.length) continue;
      if (!longer.includes(shorter)) continue;
      if (gluedVariant(shorter, longer)) {
        remove.add(longer);
      } else {
        remove.add(shorter);
      }
    }
  }
  for (const name of remove) mentions.delete(name);
}

function isLikelyName(candidate: string): boolean {
  if (candidate.length < 2 || candidate.length > 4) return false;
  if (NAME_STOPWORDS.has(candidate)) return false;
  if ([...candidate].every((ch) => FUNCTION_CHARS.has(ch))) return false;
  if (/^[的了是在和与对从向被把这有人那每某各个几俩两]/.test(candidate)) return false;
  if (/[的了着过吗呢吧啊哦嘛之地得]/.test(candidate)) return false;
  if (/^[我你他她它谁这那][是说想有的了在不也就都还这那]/.test(candidate)) return false;
  if (/^[也但而却可就还跟][不有是说他她你我的了没又]$/.test(candidate)) return false;
  if (/^[我你他她它谁]/.test(candidate)) return false;
  if (candidate.length === 2 && GLUE_SUFFIX.has(candidate[1] ?? '')) return false;
  if (/^(时候|一觉|让人|也不是|也不能|没人|有人|个人|男人|女人|大夫|按理)/.test(candidate))
    return false;
  return true;
}

/** 剥掉「跟路明非」「路明非也/心/点」这类句法粘连，保留真名。 */
export function normalizeCharacterName(raw: string): string | null {
  let name = raw;
  // 只剥四字以上的介词前缀（「跟路明非」），避免「对子航」变成「子航」。
  if (name.length >= 4 && GLUE_PREFIX.has(name[0] ?? '')) name = name.slice(1);
  for (let i = 0; i < 3; i++) {
    const next = name.replace(MANNER_SUFFIX, '');
    if (next === name) break;
    name = next;
  }
  while (name.length > 2 && GLUE_SUFFIX.has(name[name.length - 1] ?? '')) {
    name = name.slice(0, -1);
  }
  const stripped = name.replace(ADVERB_SUFFIX, '');
  if (stripped.length >= 2) name = stripped;
  const untitled = name.replace(TITLE_SUFFIX, '');
  if (untitled !== name) {
    if (untitled.length < 2) return null;
    name = untitled;
  }
  if (!isLikelyName(name)) return null;
  return name;
}

function gluedVariant(canonical: string, other: string): boolean {
  if (canonical === other) return false;
  if (other.startsWith(canonical)) {
    const extra = other.slice(canonical.length);
    return (
      extra.length <= 2 &&
      (extra.split('').every((ch) => GLUE_SUFFIX.has(ch)) || MANNER_SUFFIX.test(other))
    );
  }
  if (other.endsWith(canonical) && other.length - canonical.length === 1) {
    return GLUE_PREFIX.has(other[0] ?? '');
  }
  return false;
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

  // ① 对话/动作引导词前的名字（中文小说最强人名信号）
  const speechName = new RegExp(`${NAME}${SPEECH_VERB}`, 'g');
  for (const m of content.matchAll(speechName)) {
    const name = normalizeCharacterName(m[1] ?? '');
    if (!name) continue;
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

  dropContainedFragments(characterMentions);

  // ③ 地点（匹配后修剪移动动词前缀：「走进青云学院」→「青云学院」）
  const locationPattern = new RegExp(`([\\u4e00-\\u9fa5]{2,8}(?:${LOCATION_SUFFIX}))`, 'g');
  const locationSuffixPattern = new RegExp(`(?:${LOCATION_SUFFIX})$`);
  for (const m of content.matchAll(locationPattern)) {
    const hit = m[1] ?? '';
    const suffixMatch = hit.match(locationSuffixPattern);
    const suffix = suffixMatch?.[0] ?? '';
    const body = trimLocationBody(hit.slice(0, hit.length - suffix.length));
    if (!body) continue;
    if (/^[一这那某每]/.test(body)) continue;
    const place = normalizeLocationName(body + suffix);
    if (place) bump(locationMentions, place);
  }
  const folded = mergeLocationMentions(locationMentions);
  locationMentions.clear();
  for (const [place, count] of folded) locationMentions.set(place, count);

  // ④ 句级分析：事件句 / 性格句 / 共现
  const sentences = content
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 120);
  for (const sentence of sentences) {
    const present = [...characterMentions.keys()].filter((name) => sentence.includes(name));
    if (isPlotEvent(sentence, present.length) && present.length > 0) {
      events.push({ chapterIndex, text: sentence, characters: present.slice(0, 5) });
    }
    const traitMatch = sentence.match(TRAIT_PATTERN);
    const traitName = traitMatch?.[1] ? normalizeCharacterName(traitMatch[1]) : null;
    if (traitMatch && traitName) {
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

/** 仅同长度、单字替换（「路明非」=「路明飞」）。不加字——那会把「路明非心」粘成别名。 */
function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  if (a.length < 3) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff++;
    if (diff > 1) return false;
  }
  return diff === 1;
}

export interface CharacterAggregate {
  /** 规范名（频次最高的称呼） */
  name: string;
  aliases: string[];
  mentions: number;
  traits: string[];
  chapters: Set<number>;
}

function sameEntity(a: string, b: string): boolean {
  if (a === b) return true;
  if (editDistanceAtMostOne(a, b)) return true;
  if (gluedVariant(a, b) || gluedVariant(b, a)) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // 「子航」只当作「楚子航」的尾缀碎片，不能用任意 includes（会把诺诺和恺撒粘在一起）
  if (short.length >= 2 && long.length - short.length <= 2 && long.endsWith(short)) return true;
  return false;
}

function findGroup(
  groups: Array<{ names: Map<string, number>; traits: string[]; chapters: Set<number> }>,
  name: string,
) {
  return groups.find((group) =>
    [...group.names.keys()].some((existing) => sameEntity(existing, name)),
  );
}

/** 跨章合并：名字聚合 + 同长度错一字消歧；句法粘连并入规范名，不进别名。 */
export function aggregateCharacters(
  perChapter: ChapterExtraction[],
  traitsByChapter: Array<Array<{ name: string; text: string }>> = [],
): CharacterAggregate[] {
  const groups: Array<{ names: Map<string, number>; traits: string[]; chapters: Set<number> }> = [];

  perChapter.forEach((extraction, chapterIndex) => {
    for (const [name, count] of extraction.characterMentions) {
      let group = findGroup(groups, name);
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
      const group = findGroup(groups, trait.name);
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
      const aliases = sorted
        .slice(1)
        .map(([alias]) => alias)
        .filter(
          (alias) =>
            !gluedVariant(name, alias) &&
            !gluedVariant(alias, name) &&
            !name.includes(alias) &&
            !alias.includes(name),
        );
      return {
        name,
        aliases,
        mentions,
        traits: group.traits,
        chapters: group.chapters,
      };
    })
    .filter((aggregate) => aggregate.name && aggregate.mentions >= 2);
}

export function selectImportEvents(
  events: ChapterExtraction['events'],
  fullNames: ReadonlySet<string>,
  maxEvents: number,
  perChapter = 2,
): ChapterExtraction['events'] {
  const seen = new Set<string>();
  const scored = events
    .map((event) => ({
      ...event,
      weight: event.characters.filter((name) => fullNames.has(name)).length,
      key: event.text.replace(/\s+/g, '').slice(0, 48),
    }))
    .filter(
      (event) => event.weight >= 2 || (event.weight >= 1 && STRONG_EVENT_VERBS.test(event.text)),
    )
    .sort((a, b) => b.weight - a.weight || a.chapterIndex - b.chapterIndex);

  const used = new Map<number, number>();
  const picked: ChapterExtraction['events'] = [];
  for (const event of scored) {
    if (seen.has(event.key)) continue;
    const count = used.get(event.chapterIndex) ?? 0;
    if (count >= perChapter) continue;
    seen.add(event.key);
    used.set(event.chapterIndex, count + 1);
    picked.push({
      chapterIndex: event.chapterIndex,
      text: event.text,
      characters: event.characters,
    });
    if (picked.length >= maxEvents) break;
  }
  return picked.sort((a, b) => a.chapterIndex - b.chapterIndex);
}

const TITLE_VERBS =
  /杀了|杀死|战死|牺牲|死亡|去世|打败|击败|战胜|战败|决战|开战|背叛|重逢|绑架|失踪|处决|觉醒|签订|入学|毕业|决斗|救出|逃跑|逃离|抵达|到达|出发|启程|爆发|相遇|分别|加冕|登基|审判|突破|晋升|比试|比赛|召唤/;

const LEADING_ADVERBS = /^(忽然|突然|猛地|一把|还没|缓缓|用力|差点|立刻|马上|终于|不禁)+/;

function pickSubject(text: string, characters: string[]): string {
  const verbMatch = text.match(TITLE_VERBS);
  const before = verbMatch && verbMatch.index !== undefined ? text.slice(0, verbMatch.index) : text;
  const ordered = [...characters]
    .filter((name) => before.includes(name))
    .sort((a, b) => before.indexOf(a) - before.indexOf(b) || b.length - a.length);
  if (ordered.length === 0) {
    const fallback = characters.find((name) => text.includes(name)) ?? characters[0] ?? '';
    return fallback;
  }
  return ordered.slice(0, 2).join('、');
}

function pickPredicate(text: string, characters: string[]): string {
  const match = text.match(TITLE_VERBS);
  if (match && match.index !== undefined) {
    const verb = match[0];
    const tail = text.slice(match.index + verb.length);
    const firstClause = (tail.split(/[，。！？、；：]/)[0] ?? '').replace(/^[了着过的地得\s]+/, '');
    const named = [...characters]
      .sort((a, b) => b.length - a.length)
      .find((name) => firstClause.startsWith(name) || firstClause.includes(name));
    if (named && firstClause.includes(named)) return `${verb}${named}`.slice(0, 10);
    if (/^(两人|三人|大家|他们|她们|我们|你们)/.test(firstClause)) return verb;
    const object = firstClause.replace(/[^一-龥0-9]/g, '').slice(0, 4);
    return `${verb}${object}`.slice(0, 10);
  }
  let rest = text;
  for (const name of [...characters].sort((a, b) => b.length - a.length)) {
    rest = rest.split(name).join('');
  }
  rest = rest.replace(/[，。！？、；：\s]/g, '').replace(LEADING_ADVERBS, '');
  rest = rest.replace(/^(的|了|着|过|地|得|也|又|却|就|都|还)/, '');
  return rest.slice(0, 8) || '关键节点';
}

/** 时间轴可读标题：「林澈 · 打败对手」，不用原句前 30 字。 */
export function formatEventTitle(text: string, characters: string[]): string {
  const who = pickSubject(text, characters);
  const what = pickPredicate(text, characters);
  const title = who ? `${who} · ${what}` : what;
  return title.slice(0, 18);
}
