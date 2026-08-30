/// <reference types="vitest/globals" />
import {
  filterThreadsByQuery,
  groupRoleplayByProject,
  groupThreadsByRecency,
  partitionThreadsByKind,
  threadDisplayTitle,
  threadKind,
} from './chat-history';
import type { CreatorChatThreadDTO } from './types';

function thread(
  id: string,
  updatedAt: Date,
  extras: Partial<CreatorChatThreadDTO> = {},
): CreatorChatThreadDTO {
  return {
    id,
    title: extras.title ?? id,
    project_id: extras.project_id ?? null,
    project_name: extras.project_name ?? null,
    state: 'active',
    kind: extras.kind ?? 'world',
    character_name: extras.character_name ?? null,
    updated_at: extras.updated_at ?? updatedAt.toISOString(),
    created_at: extras.created_at ?? updatedAt.toISOString(),
  };
}

describe('groupThreadsByRecency', () => {
  it('buckets threads and drops empty groups', () => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 3 * 86_400_000);
    const old = new Date(now.getTime() - 40 * 86_400_000);
    const groups = groupThreadsByRecency([
      thread('a', now),
      thread('b', weekAgo),
      thread('c', old),
    ]);
    expect(groups.map((group) => group.id)).toEqual(['today', 'week', 'older']);
    expect(groups[0]?.threads.map((item) => item.id)).toEqual(['a']);
    expect(groups[1]?.threads.map((item) => item.id)).toEqual(['b']);
    expect(groups[2]?.threads.map((item) => item.id)).toEqual(['c']);
  });

  it('returns no groups when the payload is not an array', () => {
    expect(groupThreadsByRecency(undefined)).toEqual([]);
    expect(groupThreadsByRecency({ data: [] })).toEqual([]);
  });
});

describe('partitionThreadsByKind', () => {
  it('treats missing kind as world and splits roleplay aside', () => {
    const now = new Date();
    const world = thread('w1', now, { kind: 'world' });
    const legacy = thread('w2', now);
    delete (legacy as { kind?: string }).kind;
    const play = thread('r1', now, { kind: 'roleplay', character_name: '楚子航' });
    expect(threadKind(legacy)).toBe('world');
    expect(partitionThreadsByKind([world, play, legacy])).toEqual({
      world: [world, legacy],
      roleplay: [play],
    });
  });
});

describe('groupRoleplayByProject', () => {
  it('groups by world and keeps recency within each world', () => {
    const now = new Date();
    const later = new Date(now.getTime() + 60_000);
    const earlier = new Date(now.getTime() - 60_000);
    const groups = groupRoleplayByProject([
      thread('r1', earlier, {
        kind: 'roleplay',
        project_id: 'p1',
        project_name: '东方玄幻',
        title: '与「楚子航」对话',
      }),
      thread('r2', now, {
        kind: 'roleplay',
        project_id: 'p2',
        project_name: '魔法世界',
        title: '与「恺撒」对话',
      }),
      thread('r3', later, {
        kind: 'roleplay',
        project_id: 'p1',
        project_name: '东方玄幻',
        title: '与「路明非」对话',
      }),
    ]);
    expect(groups.map((group) => group.label)).toEqual(['东方玄幻', '魔法世界']);
    expect(groups[0]?.threads.map((item) => item.id)).toEqual(['r3', 'r1']);
    expect(groups[1]?.threads.map((item) => item.id)).toEqual(['r2']);
  });
});

describe('filterThreadsByQuery', () => {
  it('matches title, project name, or character name', () => {
    const now = new Date();
    const items = [
      thread('t1', now, { title: '凡人修仙', project_name: '东方玄幻' }),
      thread('t2', now, { title: '都市日常' }),
      thread('t3', now, {
        kind: 'roleplay',
        title: '与「楚子航」对话',
        project_name: '龙族',
        character_name: '楚子航',
      }),
    ];
    expect(filterThreadsByQuery(items, '修仙').map((item) => item.id)).toEqual(['t1']);
    expect(filterThreadsByQuery(items, '玄幻').map((item) => item.id)).toEqual(['t1']);
    expect(filterThreadsByQuery(items, '楚子航').map((item) => item.id)).toEqual(['t3']);
  });
});

describe('threadDisplayTitle', () => {
  it('prefers an explicit title, then the project name', () => {
    expect(threadDisplayTitle({ title: '草稿会话', project_name: '凡人修仙' })).toBe('草稿会话');
    expect(threadDisplayTitle({ title: null, project_name: '凡人修仙' })).toBe('凡人修仙');
    expect(threadDisplayTitle({ title: '  ', project_name: null })).toBe('未命名对话');
  });
});
