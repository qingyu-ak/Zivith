import { describe, expect, it, vi } from 'vitest';
import { applyProposal, mergeAssetData } from '../src/contexts/world/proposal-applier.js';

vi.mock('../src/contexts/history/record-asset-change.js', () => ({
  ensureAssetBaseline: vi.fn(async () => undefined),
  recordAssetHistory: vi.fn(async () => undefined),
}));

describe('mergeAssetData', () => {
  it('keeps existing keys and only overrides what the patch names', () => {
    const merged = mergeAssetData(
      { personality: '冷静', default_outfit: '黑袍', age: 23 },
      { age: 24 },
    ) as Record<string, unknown>;
    expect(merged).toEqual({ personality: '冷静', default_outfit: '黑袍', age: 24 });
  });

  it('removes a key when the patch sets it to null and ignores undefined', () => {
    const merged = mergeAssetData(
      { personality: '冷静', default_outfit: '黑袍' },
      { default_outfit: null, personality: undefined },
    ) as Record<string, unknown>;
    expect(merged).toEqual({ personality: '冷静' });
  });

  it('starts from an empty object when current data is not an object', () => {
    expect(mergeAssetData(null, { a: 1 })).toEqual({ a: 1 });
    expect(mergeAssetData(['x'], { a: 1 })).toEqual({ a: 1 });
  });
});

describe('applyProposal update_entity(character)', () => {
  function fakeTx(existing: Record<string, unknown>) {
    const updates: unknown[] = [];
    const tx = {
      asset: {
        findFirst: vi.fn(async () => existing),
        update: vi.fn(async (args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
          return { ...existing, ...args.data, updatedAt: new Date() };
        }),
      },
    };
    return { tx: tx as never, updates };
  }

  it('merges fields.data into the stored data instead of replacing it', async () => {
    const existing = {
      id: 'c1',
      projectId: 'p1',
      type: 'character',
      name: '艾琳',
      description: '',
      aliases: [],
      tags: [],
      data: { personality: '冷静', default_outfit: '黑袍', age: 23 },
      updatedAt: new Date(),
    };
    const { tx, updates } = fakeTx(existing);
    await applyProposal(
      tx,
      {
        kind: 'update_entity',
        project_id: 'p1',
        payload: { type: 'character', id: 'c1', fields: { data: { age: 24 } } },
      },
      'p1',
    );
    expect(updates).toHaveLength(1);
    expect((updates[0] as { data: unknown }).data).toEqual({
      personality: '冷静',
      default_outfit: '黑袍',
      age: 24,
    });
  });
});
