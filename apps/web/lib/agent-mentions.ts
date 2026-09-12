import {
  CHAT_FOCUS_LABEL,
  type ChatFocus,
  type ChatFocusKind,
} from './creator-chat-nav';
import type { WorldResourcesDTO } from './types';

/** 输入 @ 时弹出的实体候选，选中后作为这一轮 focus。 */
export function listFocusableEntities(resources: WorldResourcesDTO): ChatFocus[] {
  const items: ChatFocus[] = [
    {
      kind: 'project',
      id: resources.project.id,
      name: resources.project.name.trim() || '当前项目',
    },
    ...resources.entities.characters.map((item) => ({
      kind: 'character' as const,
      id: item.id,
      name: item.name,
    })),
    ...resources.entities.locations.map((item) => ({
      kind: 'location' as const,
      id: item.id,
      name: item.name,
    })),
    ...resources.entities.scenes.map((item) => ({
      kind: 'scene' as const,
      id: item.id,
      name: item.title,
    })),
    ...resources.entities.world_events.map((item) => ({
      kind: 'world_event' as const,
      id: item.id,
      name: item.title,
    })),
    ...resources.entities.stories.map((item) => ({
      kind: 'story' as const,
      id: item.id,
      name: item.title,
    })),
    ...resources.entities.relationships.map((item) => ({
      kind: 'relationship' as const,
      id: item.id,
      name: item.label?.trim() || item.kind || '关系',
    })),
  ];
  return items.filter((item) => item.name.trim().length > 0);
}

export function filterFocusableEntities(items: ChatFocus[], query: string): ChatFocus[] {
  const needle = query.trim().toLowerCase();
  const matched = needle
    ? items.filter((item) => {
        const label = CHAT_FOCUS_LABEL[item.kind as ChatFocusKind] ?? item.kind;
        return item.name.toLowerCase().includes(needle) || label.toLowerCase().includes(needle);
      })
    : items;
  return matched.slice(0, 8);
}

/**
 * 光标前最近一次未闭合的 @ 查询。@ 须在开头或空白后，查询不含空格或换行。
 */
export function mentionQueryAt(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  if (cursor < 0 || cursor > text.length) return null;
  const head = text.slice(0, cursor);
  const at = head.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(head[at - 1] ?? '')) return null;
  const query = head.slice(at + 1);
  if (/[\s\n]/.test(query)) return null;
  return { start: at, query };
}

export function insertMention(
  text: string,
  cursor: number,
  start: number,
  name: string,
): { text: string; cursor: number } {
  const inserted = `@${name} `;
  const after = text.slice(cursor).replace(/^\s+/, '');
  const next = `${text.slice(0, start)}${inserted}${after}`;
  return { text: next, cursor: start + inserted.length };
}

/** 工具栏「@」：在光标处插入触发符，必要时前面补空格。 */
export function insertAtTrigger(text: string, cursor: number): { text: string; cursor: number } {
  const at = Math.max(0, Math.min(cursor, text.length));
  const needsSpace = at > 0 && !/\s/.test(text[at - 1] ?? '');
  const inserted = needsSpace ? ' @' : '@';
  return { text: `${text.slice(0, at)}${inserted}${text.slice(at)}`, cursor: at + inserted.length };
}

export const INCOMPLETE_MENTION_HINT = '先选一个实体，或按 Esc 取消 @';
export const NO_MATCH_MENTION_HINT = '没有匹配的实体，改几个字或按 Esc 取消 @';

/** 光标还停在未闭合的 @ 查询里时，不应把残缺查询当正文发出。 */
export function incompleteMentionHint(
  text: string,
  cursor: number,
  matchCount: number,
): string | null {
  if (!mentionQueryAt(text, cursor)) return null;
  return matchCount > 0 ? INCOMPLETE_MENTION_HINT : NO_MATCH_MENTION_HINT;
}
