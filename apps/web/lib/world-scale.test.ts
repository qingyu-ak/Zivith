/// <reference types="vitest/globals" />
import { createOrderScale, integerTicks, interpolateOrders } from './world-scale';

describe('createOrderScale (线性 domain→range 映射 + clamp)', () => {
  it('maps domain midpoint to range midpoint', () => {
    const scale = createOrderScale([0, 100], [0, 1000]);
    expect(scale(50)).toBe(500);
    expect(scale(0)).toBe(0);
    expect(scale(100)).toBe(1000);
  });

  it('clamps order to range bounds', () => {
    const scale = createOrderScale([10, 20], [0, 100]);
    expect(scale(5)).toBe(0);
    expect(scale(25)).toBe(100);
  });

  it('invert round-trips within the domain', () => {
    const scale = createOrderScale([10, 20], [50, 350]);
    for (const order of [10, 12.5, 15, 17.5, 20]) {
      expect(scale.invert(scale(order))).toBeCloseTo(order, 10);
    }
  });

  it('invert clamps px to domain bounds', () => {
    const scale = createOrderScale([10, 20], [0, 100]);
    expect(scale.invert(-50)).toBe(10);
    expect(scale.invert(150)).toBe(20);
  });

  it('degenerate domain collapses to the range start without NaN', () => {
    const scale = createOrderScale([5, 5], [0, 100]);
    expect(scale(5)).toBe(0);
    expect(scale(5)).not.toBeNaN();
    expect(scale.invert(0)).toBe(5);
  });
});

describe('interpolateOrders (无显式 order 时的均匀插入)', () => {
  it('returns empty for count <= 0', () => {
    expect(interpolateOrders(0, 0, 100)).toEqual([]);
    expect(interpolateOrders(-2, 0, 100)).toEqual([]);
  });

  it('single entity lands at the midpoint', () => {
    expect(interpolateOrders(1, 0, 100)).toEqual([50]);
  });

  it('spreads n entities uniformly inside [min, max]', () => {
    expect(interpolateOrders(3, 0, 100)).toEqual([25, 50, 75]);
    expect(interpolateOrders(4, 10, 50)).toEqual([18, 26, 34, 42]);
  });

  it('handles degenerate min === max', () => {
    expect(interpolateOrders(2, 10, 10)).toEqual([10, 10]);
  });
});

describe('integerTicks (整数刻度轴)', () => {
  it('covers every integer in [min, max]', () => {
    expect(integerTicks(2, 5)).toEqual([2, 3, 4, 5]);
    expect(integerTicks(0.5, 3.2)).toEqual([1, 2, 3]);
  });

  it('falls back to a single rounded tick when range is empty', () => {
    expect(integerTicks(5.5, 2.1)).toEqual([6]);
    expect(integerTicks(3, 3)).toEqual([3]);
  });
});
