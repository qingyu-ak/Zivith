/// <reference types="vitest/globals" />
import { groupThreadsByRecency } from './chat-history';
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
});
