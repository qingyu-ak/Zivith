import type { MemoryEntityType, MemoryFactType } from '@zivith/domain';
import type { WorldContext } from '../world-builder/world-context.js';
import { normalizeEntityName } from '../world-builder/conflict-detector.js';

/** 按中英文句读切句，过滤过短片段，上限 40 句。 */
export function splitStatements(text: string): string[] {
  return text
    .split(/(?<=[。！？!?；;\n])/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && part.length <= 500)
    .slice(0, 40);
}

const FACT_TYPE_RULES: Array<{ type: MemoryFactType; pattern: RegExp }> = [
  {
    type: 'relation',
    pattern: /(师徒|恋人|情侣|宿敌|敌人|挚友|同伴|兄弟|姐妹|父子|母女|夫妇|夫妻|师兄弟|结拜|关系)/,
  },
  { type: 'rule', pattern: /(规则|力量体系|世界法则|设定上|必须|禁止|修炼需要|魔法需要)/ },
  { type: 'desire', pattern: /(目标|想要|渴望|希望|梦想|立志|目的是|为了成为)/ },
  {
    type: 'event',
    pattern: /(发生了|爆发|战争|大战|事件|事故|去世|死了|诞生|成立|毁灭|背叛|叛乱|大典)/,
  },
  { type: 'preference', pattern: /(喜欢|讨厌|偏爱|最爱|不爱|忌口|习惯于)/ },
  { type: 'constraint', pattern: /(限制|上限|代价|副作用|弱点|克星|禁忌)/ },
  {
    type: 'trait',
    pattern:
      /(性格|脾气|外貌|长相|身份|职业|身高|年龄|冷静|热血|善良|邪恶|开朗|阴郁|沉默|幽默|认真|是一名|是个)/,
  },
];

/** 规则事实分类（M1 规则路径；异步 LLM 深加工会修正）。 */
export function detectFactType(statement: string): MemoryFactType {
  for (const rule of FACT_TYPE_RULES) {
    if (rule.pattern.test(statement)) return rule.type;
  }
  return 'episodic';
}

export interface LinkedEntity {
  entityType: MemoryEntityType;
  entityId: string;
  name: string;
  hits: number;
}

function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

/** 实体链接：命中名字次数最多者为该原子主实体（平局取名字更长者）。 */
export function linkEntities(text: string, world: WorldContext | null): LinkedEntity | null {
  if (!world) return null;
  const candidates: LinkedEntity[] = [];
  const consider = (entityType: MemoryEntityType, entityId: string, name: string) => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    const hits = countOccurrences(text, trimmed);
    if (hits > 0) candidates.push({ entityType, entityId, name: trimmed, hits });
  };
  for (const character of world.characters) consider('character', character.id, character.name);
  for (const location of world.locations) consider('location', location.id, location.name);
  for (const event of world.worldEvents) consider('world_event', event.id, event.title);
  for (const story of world.stories) consider('story', story.id, story.title);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.hits - a.hits || b.name.length - a.name.length);
  return candidates[0] ?? null;
}

const STATEMENT_PREDICATE = /(是|有|叫|为|会|能|属于|发生|位于|喜欢|想要|成为|在)/;

export interface CandidateAtom {
  content: string;
  factType: MemoryFactType;
  linked: LinkedEntity | null;
}

/** 同步快速路径的规则抽取：切句 → 分类 → 实体链接。 */
export function extractCandidateAtoms(text: string, world: WorldContext | null): CandidateAtom[] {
  const atoms: CandidateAtom[] = [];
  for (const statement of splitStatements(text)) {
    const linked = linkEntities(statement, world);
    if (!linked && !STATEMENT_PREDICATE.test(statement)) continue;
    atoms.push({ content: statement, factType: detectFactType(statement), linked });
  }
  return atoms;
}

export const IMPORTANT_CHAT_MAX_CHARS = 80;
const ROLEPLAY_ATOM_CAP = 4;
const CHAT_FILLER = /^(嗯+|啊+|哦+|额+|好的?|是啊?|哈哈+|呵呵+|谢谢|没事|继续|然后呢|知道了)[。！？!?…\s]*$/;

export function condenseImportantChat(content: string, maxChars = IMPORTANT_CHAT_MAX_CHARS): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).replace(/[，。；、,.!?！？\s]*$/, '')}…`;
}

export function isChatFiller(text: string): boolean {
  return CHAT_FILLER.test(text.trim());
}

/** 扮演中间态：只收重要段并收成短句。World Builder 仍走 extractCandidateAtoms。 */
export function extractRoleplayImportantAtoms(
  text: string,
  world: WorldContext | null,
): CandidateAtom[] {
  const picked: CandidateAtom[] = [];
  for (const candidate of extractCandidateAtoms(text, world)) {
    if (isChatFiller(candidate.content)) continue;
    if (candidate.factType === 'episodic' && !candidate.linked) continue;
    const content = condenseImportantChat(candidate.content);
    if (!content) continue;
    picked.push({ ...candidate, content });
    if (picked.length >= ROLEPLAY_ATOM_CAP) break;
  }
  return picked;
}

/** 实体名 → id 解析（LLM 精炼回填实体链接用）。 */
export function resolveEntityByName(name: string, world: WorldContext | null): LinkedEntity | null {
  if (!world) return null;
  const target = normalizeEntityName(name);
  if (!target) return null;
  const pools: Array<{ items: Array<{ id: string; name: string }>; type: MemoryEntityType }> = [
    { items: world.characters, type: 'character' },
    { items: world.locations, type: 'location' },
    {
      items: world.worldEvents.map((event) => ({ id: event.id, name: event.title })),
      type: 'world_event',
    },
  ];
  for (const pool of pools) {
    for (const item of pool.items) {
      if (normalizeEntityName(item.name) === target) {
        return { entityType: pool.type, entityId: item.id, name: item.name, hits: 1 };
      }
    }
  }
  return null;
}
