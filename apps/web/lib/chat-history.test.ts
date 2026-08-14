/// <reference types="vitest/globals" />
import { filterThreadsByQuery, groupThreadsByRecency } from './chat-history';
import type { CreatorChatThreadDTO } from './types';

function thread(id: string, updatedAt: Date): CreatorChatThreadDTO {
  return {
    id,
    title: id,
    project_id: null,
    project_name: null,
    state: 'active',
    updated_at: updatedAt.toISOString(),
    created_at: updatedAt.toISOString(),
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

describe('filterThreadsByQuery', () => {
  it('matches title or project name', () => {
    const now = new Date();
    const items = [thread('t1', now), thread('t2', now)];
    items[0]!.title = '凡人修仙';
    items[0]!.project_name = '东方玄幻';
    items[1]!.title = '都市日常';
    expect(filterThreadsByQuery(items, '修仙').map((item) => item.id)).toEqual(['t1']);
    expect(filterThreadsByQuery(items, '玄幻').map((item) => item.id)).toEqual(['t1']);
  });
});
