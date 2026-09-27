/// <reference types="vitest/globals" />
import {
  clipPlotBox,
  createOrderScale,
  integerTicks,
  interpolateOrders,
  paddedOrderDomain,
  thinByMinGap,
} from './world-scale';

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

describe('paddedOrderDomain / clipPlotBox (第一条不压轨名)', () => {
  it('pads both ends so a single chapter is not a degenerate domain', () => {
    expect(paddedOrderDomain(1, 1)).toEqual([0.5, 1.5]);
    expect(paddedOrderDomain(1, 4, 0.5)).toEqual([0.5, 4.5]);
  });

  it('keeps a default ±0.35 clip at the first chapter inside the plot', () => {
    const [min, max] = paddedOrderDomain(1, 1);
    const scale = createOrderScale([min, max], [108, 508]);
    const box = clipPlotBox({ start: 0.65, end: 1.35 }, scale, 40, {
      minX: 108,
      maxX: 508,
      maxWidth: 120,
    });
    expect(box.x).toBeGreaterThan(108);
    expect(box.x + box.width).toBeLessThan(508);
    expect(box.width).toBe(120);
    expect(scale(1)).toBeCloseTo(308, 5);
    expect(box.x + box.width / 2).toBeCloseTo(308, 5);
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

describe('thinByMinGap (刻度抽稀)', () => {
  it('keeps first and last and drops crowded middle points', () => {
    expect(thinByMinGap([0, 10, 40, 80], 25)).toEqual([true, false, true, true]);
  });

  it('drops the point that collides with the forced last tick', () => {
    expect(thinByMinGap([0, 30, 35], 20)).toEqual([true, false, true]);
  });

  it('keeps a single position', () => {
    expect(thinByMinGap([12], 40)).toEqual([true]);
    expect(thinByMinGap([], 40)).toEqual([]);
  });
});
