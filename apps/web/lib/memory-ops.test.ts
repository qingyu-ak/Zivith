/// <reference types="vitest/globals" />
import { formatMemoryOps } from './memory-ops';

describe('formatMemoryOps', () => {
  it('always includes archive count', () => {
    expect(formatMemoryOps({})).toBe('记忆：归档 0');
    expect(formatMemoryOps({ added: 2 })).toBe('记忆：归档 2');
  });

  it('appends merge, duplicate, and conflict hints', () => {
    expect(
      formatMemoryOps({
        added: 1,
        updated: 2,
        noop: 3,
        conflicts: [{ content: '性格冷静但暴怒时会失控' }],
      }),
    ).toBe('记忆：归档 1 · 合并 2 · 重复 3 · 冲突 1（待确认：性格冷静但暴怒时会失控）');
  });

  it('falls back when conflict has no preview text', () => {
    expect(formatMemoryOps({ added: 0, conflicts: [{}] })).toBe(
      '记忆：归档 0 · 冲突 1（待确认）',
    );
  });
});
