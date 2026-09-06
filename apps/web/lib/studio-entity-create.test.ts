/// <reference types="vitest/globals" />
import { nextUntitledName } from './studio-entity-create';

describe('nextUntitledName', () => {
  it('uses the base name when it is free', () => {
    expect(nextUntitledName(['韩立'], '未命名角色')).toBe('未命名角色');
  });

  it('increments when the base name is taken', () => {
    expect(nextUntitledName(['未命名角色', '未命名角色 2'], '未命名角色')).toBe('未命名角色 3');
  });
});
