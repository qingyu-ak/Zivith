import { describe, expect, it } from 'vitest';
import {
  extractPendingConflicts,
  mergeConflictCards,
  removeConflictCard,
} from './memory-conflicts';

describe('extractPendingConflicts', () => {
  it('抽 SSE memory_ops 里带 id 的待确认冲突，跳过缺 id 的项', () => {
    const cards = extractPendingConflicts({
      added: 0,
      conflicts: [
        {
          id: 'c1',
          content: '林澈性格开朗。',
          existing_content: '林澈性格阴郁。',
          antonym: ['开朗', '阴郁'],
        },
        { content: '没有 id 的冲突', existing_content: '旧卡', antonym: ['开朗', '阴郁'] },
      ],
    });
    expect(cards).toEqual([
      {
        id: 'c1',
        content: '林澈性格开朗。',
        existing_content: '林澈性格阴郁。',
        antonym: ['开朗', '阴郁'],
      },
    ]);
  });

  it('兼容 REST incoming_content 形状并跳过已裁决的冲突', () => {
    const cards = extractPendingConflicts({
      conflicts: [
        { id: 'c2', incoming_content: '新卡', existing_content: '旧卡', antonym: [], status: 'pending' },
        { id: 'c3', incoming_content: '新3', existing_content: '旧3', antonym: [], status: 'resolved' },
      ],
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: 'c2', content: '新卡', antonym: ['', ''] });
  });

  it('antonym 非法时回退空对；非数组输入返回空', () => {
    expect(
      extractPendingConflicts({
        conflicts: [{ id: 'c4', content: '新', existing_content: '旧', antonym: '开朗' }],
      }),
    ).toEqual([{ id: 'c4', content: '新', existing_content: '旧', antonym: ['', ''] }]);
    expect(extractPendingConflicts(null)).toEqual([]);
    expect(extractPendingConflicts({})).toEqual([]);
    expect(extractPendingConflicts({ conflicts: 'nope' })).toEqual([]);
  });
});

describe('mergeConflictCards / removeConflictCard', () => {
  const pair: [string, string] = ['', ''];
  const a = { id: 'c1', content: 'a', existing_content: '旧', antonym: pair };
  const b = { id: 'c2', content: 'b', existing_content: '旧', antonym: pair };

  it('按 id 去重合并，保持已有顺序', () => {
    expect(mergeConflictCards([a], [a, b])).toEqual([a, b]);
    expect(mergeConflictCards([], [])).toEqual([]);
  });

  it('移除指定 id；不存在时原样返回', () => {
    expect(removeConflictCard([a, b], 'c1')).toEqual([b]);
    expect(removeConflictCard([a], 'zz')).toEqual([a]);
  });
});
