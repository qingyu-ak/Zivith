import { normalizeEntityName } from './conflict-detector.js';

/**
 * 规则起草共用的文本抽取（世界构建 mock 与扮演世界变化起草器共用）。
 *
 * 只做「认出已存在的实体」和「把一句话变成标题」两件事；不臆造名字，不产生自指关系。
 */

export interface NamedCharacter {
  id: string;
  name: string;
  aliases?: string[] | undefined;
}

/** 文本里按出现顺序认出的已存在角色（去重；按名字或别名匹配，忽略单字名以免误命中）。 */
export function mentionedCharacters<T extends NamedCharacter>(text: string, characters: T[]): T[] {
  const haystack = normalizeEntityName(text);
  if (!haystack) return [];
  const hits: Array<{ index: number; character: T }> = [];
  for (const character of characters) {
    const names = [character.name, ...(character.aliases ?? [])]
      .map((name) => normalizeEntityName(name))
      .filter((name) => name.length >= 2);
    let best = -1;
    for (const name of names) {
      const index = haystack.indexOf(name);
      if (index >= 0 && (best < 0 || index < best)) best = index;
    }
    if (best >= 0) hits.push({ index: best, character });
  }
  hits.sort((left, right) => left.index - right.index);
  const seen = new Set<string>();
  const result: T[] = [];
  for (const hit of hits) {
    if (seen.has(hit.character.id)) continue;
    seen.add(hit.character.id);
    result.push(hit.character);
  }
  return result;
}

const RELATIONSHIP_KINDS: Array<{
  pattern: RegExp;
  kind: string;
  label: string;
  direction: 'directed' | 'undirected';
}> = [
  {
    pattern: /师徒|师父|师傅|徒弟|拜师|授业/,
    kind: 'mentor',
    label: '师徒',
    direction: 'directed',
  },
  {
    pattern: /父|母|兄|弟|姐|妹|儿|女|家人|亲人|血亲|叔|姑|舅/,
    kind: 'family',
    label: '家人',
    direction: 'undirected',
  },
  {
    pattern: /恋人|情人|相爱|爱上|结婚|夫妻|定情|心上人|喜欢/,
    kind: 'romance',
    label: '恋人',
    direction: 'undirected',
  },
  {
    pattern: /仇|敌|对手|宿敌|死敌|背叛|决裂|反目|杀了|恨/,
    kind: 'rival',
    label: '对手',
    direction: 'undirected',
  },
  {
    pattern: /盟友|结盟|同盟|合作|联手|效忠|从属|主仆|上司|下属/,
    kind: 'ally',
    label: '盟友',
    direction: 'undirected',
  },
  {
    pattern: /朋友|好友|挚友|伙伴|同伴|结识|认识|相遇|战友/,
    kind: 'bond',
    label: '伙伴',
    direction: 'undirected',
  },
];

/** 从文本推断关系类型；认不出就是「关联」。 */
export function inferRelationshipKind(text: string): {
  kind: string;
  label: string;
  direction: 'directed' | 'undirected';
} {
  for (const entry of RELATIONSHIP_KINDS) {
    if (entry.pattern.test(text)) {
      return { kind: entry.kind, label: entry.label, direction: entry.direction };
    }
  }
  return { kind: 'bond', label: '关联', direction: 'undirected' };
}

/** 是否在说关系（两人之间的称谓 / 相处变化）。 */
export function mentionsRelationship(text: string): boolean {
  return /关系|和|与|跟/.test(text) && RELATIONSHIP_KINDS.some((entry) => entry.pattern.test(text));
}

/** 世界里「发生了什么」的动作信号（扮演起草用）。 */
const EVENT_SIGNAL =
  /告诉|决定|答应|承诺|约定|离开|出发|前往|到达|回到|抵达|杀|死|受伤|相遇|遇见|结婚|背叛|加入|逃|发现|得到|失去|战|打败|烧|毁|签|收到|送给|救|夺|被|发生|结束|开始|爆发|宣布|带走|抵抗|降临|崩塌/;

export function hasEventSignal(text: string): boolean {
  return EVENT_SIGNAL.test(text);
}

/** 疑问句 / 纯闲聊不当作世界变化。 */
export function isQuestionOrSmallTalk(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 6) return true;
  if (/[?？]\s*$/.test(trimmed)) return true;
  if (/还记得|记不记得|认不认|当时说了什么/.test(trimmed)) return true;
  if (/^(什么|为什么|怎么|如何|是谁|在哪|哪里|吗|呢)/.test(trimmed)) return true;
  if (/(什么|为什么|怎么|如何|是谁|在哪|哪里|吗|呢|么)\s*[?？。!！]?\s*$/.test(trimmed))
    return true;
  if (/^(你好|嗨|哈喽|早|晚安|谢谢|再见|嗯|哦|好的|好吧|哈哈)/.test(trimmed)) return true;
  return false;
}

/**
 * 把一句话压成事件标题：取第一句、去掉引导词、限长；太短则返回 null。
 * 可选把「你 / 我」替换成具体的人名，让标题脱离对话语境也能读。
 */
export function eventTitleFromText(
  text: string,
  pronouns?: { you?: string | null; me?: string | null },
): string | null {
  const first = text
    .trim()
    .split(/[。！？!?\n]/)[0]
    ?.trim();
  if (!first) return null;
  // 只取到第一个「说完整了」的分句：累积逗号分句直到不短于 8 字，避免标题拖着后半句。
  const clauses = first
    .split(/[，,；;]/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  let picked = '';
  for (const clause of clauses) {
    picked = picked ? `${picked}，${clause}` : clause;
    if (picked.length >= 8) break;
  }
  let title = picked
    .replace(
      /^(?:请|帮我|我想|让我们|我们来|我要|记录|补充|设定|然后|接着|于是|结果|后来)[，,：:]?\s*/,
      '',
    )
    .replace(/[，,]$/, '')
    .trim();
  if (pronouns?.you)
    title = title.replace(/^你/, pronouns.you).replace(/([，,、])你/g, `$1${pronouns.you}`);
  if (pronouns?.me)
    title = title.replace(/^我/, pronouns.me).replace(/([，,、])我/g, `$1${pronouns.me}`);
  if (title.length < 4) return null;
  return title.length > 60 ? `${title.slice(0, 59)}…` : title;
}
