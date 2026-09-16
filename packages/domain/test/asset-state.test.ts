import { describe, expect, it } from 'vitest';
import { pickAssetRevisionAtOrder, type AssetRevisionLike } from '../src/history/asset-state.js';

function rev(
  revision: number,
  asOf: number | null,
  extra?: Partial<AssetRevisionLike>,
): AssetRevisionLike {
  return {
    revision,
    snapshot: { as_of_presentation_order: asOf, name: `r${revision}` },
    ...extra,
  };
}

describe('pickAssetRevisionAtOrder', () => {
  it('returns null for empty history', () => {
    expect(pickAssetRevisionAtOrder([], 1)).toBeNull();
  });

  it('uses the latest revision when there is no presentation order (全书读完)', () => {
    const picked = pickAssetRevisionAtOrder([rev(1, null), rev(2, 10), rev(3, null)], null);
    expect(picked?.revision).toBe(3);
  });

  it('uses unbound revision 1 as origin for early world time', () => {
    const history = [
      rev(1, null),
      rev(2, 10, { snapshot: { as_of_presentation_order: 10, name: '觉醒' } }),
    ];
    expect(pickAssetRevisionAtOrder(history, 5)?.revision).toBe(1);
    expect(pickAssetRevisionAtOrder(history, 10)?.revision).toBe(2);
  });

  it('does not let later unbound saves rewrite the past', () => {
    const history = [rev(1, null), rev(2, 8), rev(3, null)];
    expect(pickAssetRevisionAtOrder(history, 20)?.revision).toBe(2);
    expect(pickAssetRevisionAtOrder(history, null)?.revision).toBe(3);
  });

  it('walks bound stages in presentation order', () => {
    const history = [rev(1, null), rev(2, 10), rev(3, 20)];
    expect(pickAssetRevisionAtOrder(history, 9)?.revision).toBe(1);
    expect(pickAssetRevisionAtOrder(history, 10)?.revision).toBe(2);
    expect(pickAssetRevisionAtOrder(history, 15)?.revision).toBe(2);
    expect(pickAssetRevisionAtOrder(history, 20)?.revision).toBe(3);
  });
});
