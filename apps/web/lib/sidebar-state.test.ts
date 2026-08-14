/// <reference types="vitest/globals" />
import { collapsedFromStorage } from './sidebar-state';

describe('collapsedFromStorage', () => {
  it('treats only "1" as collapsed', () => {
    expect(collapsedFromStorage('1')).toBe(true);
    expect(collapsedFromStorage('0')).toBe(false);
    expect(collapsedFromStorage(null)).toBe(false);
  });
});
