/// <reference types="vitest/globals" />
import { nextUntitledName, resolveCreateName } from './studio-entity-create';

describe('nextUntitledName', () => {
  it('uses the base name when it is free', () => {
    expect(nextUntitledName(['韩立'], '未命名角色')).toBe('未命名角色');
  });

  it('increments when the base name is taken', () => {
    expect(nextUntitledName(['未命名角色', '未命名角色 2'], '未命名角色')).toBe('未命名角色 3');
  });
});

describe('resolveCreateName', () => {
  it('falls back to untitled when the prompt is empty', () => {
    expect(resolveCreateName(['韩立'], '  ', '未命名角色')).toBe('未命名角色');
  });

  it('keeps a unique typed name', () => {
    expect(resolveCreateName(['韩立'], '南宫婉', '未命名角色')).toBe('南宫婉');
  });

  it('increments a typed name that already exists', () => {
    expect(resolveCreateName(['南宫婉'], '南宫婉', '未命名角色')).toBe('南宫婉 2');
  });
});
