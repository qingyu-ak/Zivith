import type { WorldContext } from './world-context.js';

/**
 * Lore Keeper v1 — deterministic world-consistency checks (H9 / ADR-0010).
 *
 * Findings are advisory only: never write, never auto-resolve. The creator
 * confirms any repair via the existing proposal → apply path.
 */

export const WORLD_CONFLICT_KINDS = [
  'duplicate_name',
  'name_type_clash',
  'self_relationship',
  'duplicate_relationship',
  'asymmetric_cycle',
  'event_order_collision',
  'event_title_duplicate',
  'genre_mismatch',
  'internal_fact_clash',
  'incoming_name_clash',
  'incoming_fact_clash',
] as const;

export type WorldConflictKind = (typeof WORLD_CONFLICT_KINDS)[number];

export interface WorldConflictEntityRef {
  type: 'character' | 'location' | 'world_event' | 'relationship' | 'story' | 'project';
  id: string;
}

export interface WorldConflict {
  id: string;
  kind: WorldConflictKind;
  summary: string;
  entity_refs: WorldConflictEntityRef[];
}

const CONFLICT_LIMIT = 12;

/** Directed kinds that cannot legally run both ways between the same pair. */
const ASYMMETRIC_KINDS = new Set([
  'mentor',
  'teacher',
  'parent',
  'child',
  'successor',
  'owns',
  'serves',
  '师徒',
  '师生',
  '父子',
  '父女',
  '母子',
  '母女',
  '上下级',
]);

const POLAR_FACTS: Array<{ a: RegExp; b: RegExp; label: string }> = [
  { a: /已死|死去|身亡|死亡|去世|阵亡/, b: /活着|在世|存活|未死/, label: '生死' },
  { a: /失明|瞎了|看不见/, b: /看见|阅读|看书|视力完好/, label: '视力' },
  { a: /男性|男人|少男/, b: /女性|女人|少女/, label: '性别' },
];

export function normalizeEntityName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s·・.。]/g, '');
}

export function wantsConflictCheck(text: string): boolean {
  return /检查(一下)?(设定)?(冲突|矛盾)|设定(有没有|是否有)?(冲突|矛盾)|有没有矛盾|核对(一下)?设定|世界自洽|冲突检测/.test(
    text,
  );
}

function conflictId(kind: WorldConflictKind, refs: WorldConflictEntityRef[]): string {
  const keys = refs.map((ref) => `${ref.type}:${ref.id}`).sort();
  return `${kind}:${keys.join('|')}`;
}

function pushUnique(findings: WorldConflict[], next: WorldConflict): void {
  if (findings.some((item) => item.id === next.id)) return;
  findings.push(next);
}

function nameKey(name: string): string | null {
  const normalized = normalizeEntityName(name);
  return normalized.length >= 1 ? normalized : null;
}

function relationKindKey(kind: string, label: string | null): string {
  const fromLabel = label ? normalizeEntityName(label) : '';
  const fromKind = normalizeEntityName(kind);
  return fromLabel || fromKind;
}

function isAsymmetricKind(kind: string, label: string | null): boolean {
  const key = relationKindKey(kind, label);
  return ASYMMETRIC_KINDS.has(key) || ASYMMETRIC_KINDS.has(kind.trim().toLowerCase());
}

function endpointKey(type: string, id: string): string {
  return `${type}:${id}`;
}

function namedInText(text: string, name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && text.includes(trimmed);
}

function polarClash(text: string): string | null {
  for (const fact of POLAR_FACTS) {
    if (fact.a.test(text) && fact.b.test(text)) return fact.label;
  }
  return null;
}

function oppositePole(existing: string, incoming: string): string | null {
  for (const fact of POLAR_FACTS) {
    if (
      (fact.a.test(existing) && fact.b.test(incoming)) ||
      (fact.b.test(existing) && fact.a.test(incoming))
    ) {
      return fact.label;
    }
  }
  return null;
}

function genresDiverge(left: string, right: string): boolean {
  const a = normalizeEntityName(left);
  const b = normalizeEntityName(right);
  if (a.length < 2 || b.length < 2) return false;
  return a !== b && !a.includes(b) && !b.includes(a);
}

function detectDuplicateNames(world: WorldContext, findings: WorldConflict[]): void {
  const groups: Array<{
    type: 'character' | 'location';
    items: Array<{ id: string; name: string }>;
  }> = [
    { type: 'character', items: world.characters },
    { type: 'location', items: world.locations },
  ];
  for (const group of groups) {
    const byName = new Map<string, Array<{ id: string; name: string }>>();
    for (const item of group.items) {
      const key = nameKey(item.name);
      if (!key) continue;
      const list = byName.get(key) ?? [];
      list.push(item);
      byName.set(key, list);
    }
    for (const list of byName.values()) {
      if (list.length < 2) continue;
      const refs = list.map((item) => ({ type: group.type, id: item.id }));
      pushUnique(findings, {
        id: conflictId('duplicate_name', refs),
        kind: 'duplicate_name',
        summary: `${group.type === 'character' ? '角色' : '地点'}「${list[0]?.name}」出现了 ${list.length} 次同名档案`,
        entity_refs: refs,
      });
    }
  }
}

function detectNameTypeClash(world: WorldContext, findings: WorldConflict[]): void {
  const locations = new Map<string, { id: string; name: string }>();
  for (const location of world.locations) {
    const key = nameKey(location.name);
    if (key) locations.set(key, location);
  }
  for (const character of world.characters) {
    const key = nameKey(character.name);
    if (!key) continue;
    const location = locations.get(key);
    if (!location) continue;
    const refs: WorldConflictEntityRef[] = [
      { type: 'character', id: character.id },
      { type: 'location', id: location.id },
    ];
    pushUnique(findings, {
      id: conflictId('name_type_clash', refs),
      kind: 'name_type_clash',
      summary: `「${character.name}」同时是角色和地点，容易在引用时混淆`,
      entity_refs: refs,
    });
  }
}

function detectRelationships(world: WorldContext, findings: WorldConflict[]): void {
  const seenPairs = new Map<string, string>();
  for (const relation of world.relationships) {
    if (relation.sourceType === relation.targetType && relation.sourceId === relation.targetId) {
      const refs: WorldConflictEntityRef[] = [{ type: 'relationship', id: relation.id }];
      pushUnique(findings, {
        id: conflictId('self_relationship', refs),
        kind: 'self_relationship',
        summary: `关系「${relation.label ?? relation.kind}」的两端指向同一实体`,
        entity_refs: refs,
      });
      continue;
    }

    const left = endpointKey(relation.sourceType, relation.sourceId);
    const right = endpointKey(relation.targetType, relation.targetId);
    const kindKey = relationKindKey(relation.kind, relation.label);
    const undirected = relation.direction === 'undirected';
    const pair = undirected ? [left, right].sort().join('~') : `${left}>${right}`;
    const duplicateKey = `${kindKey}|${pair}`;
    const previous = seenPairs.get(duplicateKey);
    if (previous) {
      const refs: WorldConflictEntityRef[] = [
        { type: 'relationship', id: previous },
        { type: 'relationship', id: relation.id },
      ];
      pushUnique(findings, {
        id: conflictId('duplicate_relationship', refs),
        kind: 'duplicate_relationship',
        summary: `关系「${relation.label ?? relation.kind}」在同一对实体上重复出现`,
        entity_refs: refs,
      });
    } else {
      seenPairs.set(duplicateKey, relation.id);
    }
  }

  for (let i = 0; i < world.relationships.length; i += 1) {
    const a = world.relationships[i];
    if (!a || a.direction === 'undirected') continue;
    if (!isAsymmetricKind(a.kind, a.label)) continue;
    for (let j = i + 1; j < world.relationships.length; j += 1) {
      const b = world.relationships[j];
      if (!b || b.direction === 'undirected') continue;
      if (relationKindKey(a.kind, a.label) !== relationKindKey(b.kind, b.label)) continue;
      const reverse =
        a.sourceType === b.targetType &&
        a.sourceId === b.targetId &&
        a.targetType === b.sourceType &&
        a.targetId === b.sourceId;
      if (!reverse) continue;
      const refs: WorldConflictEntityRef[] = [
        { type: 'relationship', id: a.id },
        { type: 'relationship', id: b.id },
      ];
      pushUnique(findings, {
        id: conflictId('asymmetric_cycle', refs),
        kind: 'asymmetric_cycle',
        summary: `「${a.label ?? a.kind}」关系双向成立，通常只能有一个方向`,
        entity_refs: refs,
      });
    }
  }
}

function detectEvents(world: WorldContext, findings: WorldConflict[]): void {
  const byOrder = new Map<number, Array<{ id: string; title: string }>>();
  const byTitle = new Map<string, Array<{ id: string; title: string }>>();
  for (const event of world.worldEvents) {
    if (event.order !== null && event.order !== undefined) {
      const list = byOrder.get(event.order) ?? [];
      list.push(event);
      byOrder.set(event.order, list);
    }
    const titleKey = nameKey(event.title);
    if (titleKey) {
      const list = byTitle.get(titleKey) ?? [];
      list.push(event);
      byTitle.set(titleKey, list);
    }
  }
  for (const [order, list] of byOrder) {
    if (list.length < 2) continue;
    const refs = list.map((item) => ({ type: 'world_event' as const, id: item.id }));
    pushUnique(findings, {
      id: conflictId('event_order_collision', refs),
      kind: 'event_order_collision',
      summary: `世界事件「${list.map((item) => item.title).join(' / ')}」共用呈现顺序 ${order}`,
      entity_refs: refs,
    });
  }
  for (const list of byTitle.values()) {
    if (list.length < 2) continue;
    const refs = list.map((item) => ({ type: 'world_event' as const, id: item.id }));
    pushUnique(findings, {
      id: conflictId('event_title_duplicate', refs),
      kind: 'event_title_duplicate',
      summary: `世界事件标题「${list[0]?.title}」重复 ${list.length} 次`,
      entity_refs: refs,
    });
  }
}

function detectGenreMismatch(world: WorldContext, findings: WorldConflict[]): void {
  const genre = world.worldview.genre?.trim();
  if (!genre) return;
  for (const story of world.stories) {
    const storyGenre = story.genre?.trim();
    if (!storyGenre || !genresDiverge(genre, storyGenre)) continue;
    const refs: WorldConflictEntityRef[] = [
      { type: 'project', id: world.projectId },
      { type: 'story', id: story.id },
    ];
    pushUnique(findings, {
      id: conflictId('genre_mismatch', refs),
      kind: 'genre_mismatch',
      summary: `世界观题材是「${genre}」，故事「${story.title}」却标成「${storyGenre}」`,
      entity_refs: refs,
    });
  }
}

function detectInternalFacts(world: WorldContext, findings: WorldConflict[]): void {
  for (const character of world.characters) {
    const description = character.description ?? '';
    const label = polarClash(description);
    if (!label) continue;
    const refs: WorldConflictEntityRef[] = [{ type: 'character', id: character.id }];
    pushUnique(findings, {
      id: conflictId('internal_fact_clash', refs),
      kind: 'internal_fact_clash',
      summary: `角色「${character.name}」的设定在「${label}」上自相矛盾`,
      entity_refs: refs,
    });
  }
}

function detectIncoming(world: WorldContext, text: string, findings: WorldConflict[]): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  for (const character of world.characters) {
    if (!namedInText(trimmed, character.name)) continue;
    const existing = character.description ?? '';
    const pole = oppositePole(existing, trimmed);
    if (!pole) continue;
    const refs: WorldConflictEntityRef[] = [{ type: 'character', id: character.id }];
    pushUnique(findings, {
      id: conflictId('incoming_fact_clash', refs),
      kind: 'incoming_fact_clash',
      summary: `新描述与角色「${character.name}」已有设定在「${pole}」上矛盾`,
      entity_refs: refs,
    });
  }

  const creatingCharacter = /角色|人物|主角/.test(trimmed);
  const creatingLocation = /地点|城市/.test(trimmed) && !creatingCharacter;
  if (!creatingCharacter && !creatingLocation) return;

  const nameMatch = trimmed.match(
    /[:：]\s*([\u4e00-\u9fa5A-Za-z0-9·]{1,12})|(?:名叫|名字叫|名为|叫做|叫)([\u4e00-\u9fa5A-Za-z0-9·]{1,12})/,
  );
  const incomingName = (nameMatch?.[1] ?? nameMatch?.[2] ?? '').trim();
  const key = nameKey(incomingName);
  if (!key) return;

  if (creatingCharacter) {
    const location = world.locations.find((item) => nameKey(item.name) === key);
    if (location) {
      const refs: WorldConflictEntityRef[] = [{ type: 'location', id: location.id }];
      pushUnique(findings, {
        id: conflictId('incoming_name_clash', refs),
        kind: 'incoming_name_clash',
        summary: `要把「${incomingName}」记成角色，但世界里已有同名地点`,
        entity_refs: refs,
      });
    }
  }
  if (creatingLocation) {
    const character = world.characters.find((item) => nameKey(item.name) === key);
    if (character) {
      const refs: WorldConflictEntityRef[] = [{ type: 'character', id: character.id }];
      pushUnique(findings, {
        id: conflictId('incoming_name_clash', refs),
        kind: 'incoming_name_clash',
        summary: `要把「${incomingName}」记成地点，但世界里已有同名角色`,
        entity_refs: refs,
      });
    }
  }
}

export function detectWorldConflicts(
  world: WorldContext | null,
  incoming?: { text?: string },
): WorldConflict[] {
  if (!world) return [];
  const findings: WorldConflict[] = [];
  detectDuplicateNames(world, findings);
  detectNameTypeClash(world, findings);
  detectRelationships(world, findings);
  detectEvents(world, findings);
  detectGenreMismatch(world, findings);
  detectInternalFacts(world, findings);
  if (incoming?.text) detectIncoming(world, incoming.text, findings);
  return findings.slice(0, CONFLICT_LIMIT);
}

export function conflictSummaries(conflicts: WorldConflict[], limit = CONFLICT_LIMIT): string[] {
  return conflicts.map((item) => item.summary).slice(0, limit);
}

export function mergeConflictSummaries(
  existing: string[],
  detected: WorldConflict[],
  limit = CONFLICT_LIMIT,
): string[] {
  const merged: string[] = [];
  for (const summary of [...conflictSummaries(detected, limit), ...existing]) {
    const trimmed = summary.trim();
    if (!trimmed || merged.includes(trimmed)) continue;
    merged.push(trimmed);
    if (merged.length >= limit) break;
  }
  return merged;
}

export function formatConflictCheckReply(conflicts: WorldConflict[]): string {
  if (conflicts.length === 0) {
    return '我按当前世界档案做了结构化核对：没有发现同名重复、关系自指/对向循环、事件顺序撞车或明显的生死/性别等极性矛盾。\n\n这只覆盖规则能判定的冲突；更细的剧情逻辑仍请你拍板。我不会自动改任何设定。';
  }
  const lines = conflicts.map((item, index) => `${index + 1}. ${item.summary}`);
  return `我核对了当前世界档案，发现 ${conflicts.length} 处设定冲突。我不会自动修改，请你决定保留哪一则：\n\n${lines.join('\n')}\n\n可以说「改角色××的设定为…」或直接在 Studio Inspector 里编辑。`;
}

export function formatConflictAppendix(conflicts: WorldConflict[]): string {
  if (conflicts.length === 0) return '';
  const lines = conflicts.slice(0, 5).map((item) => `- ${item.summary}`);
  const extra = conflicts.length > 5 ? `\n- …另有 ${conflicts.length - 5} 处` : '';
  return `\n\n发现 ${conflicts.length} 处设定冲突（不会自动修改，请确认后处理）：\n${lines.join('\n')}${extra}`;
}
