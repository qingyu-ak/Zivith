/// <reference types="vitest/globals" />
import { clampPx } from './workspace-layout';

describe('clampPx', () => {
  it('rounds and clamps to the inclusive range', () => {
    expect(clampPx(12.6, 10, 20)).toBe(13);
    expect(clampPx(4, 10, 20)).toBe(10);
    expect(clampPx(99, 10, 20)).toBe(20);
    expect(clampPx(Number.NaN, 10, 20)).toBe(10);
  });
});
