/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStudioEntity, nextUntitledName, resolveCreateName } from './studio-entity-create';
import type { WorldResourcesDTO } from './types';

const { createWorldCharacterMock, copyWorldCharacterMock, importWorldCharacterMock } = vi.hoisted(
  () => ({
    createWorldCharacterMock: vi.fn(),
    copyWorldCharacterMock: vi.fn(),
    importWorldCharacterMock: vi.fn(),
  }),
);

vi.mock('./create-world-character', () => ({
  createWorldCharacter: createWorldCharacterMock,
  copyWorldCharacter: copyWorldCharacterMock,
  importWorldCharacter: importWorldCharacterMock,
}));

vi.mock('./api', () => ({
  api: vi.fn(),
}));

beforeEach(() => {
  createWorldCharacterMock.mockReset();
  copyWorldCharacterMock.mockReset();
  importWorldCharacterMock.mockReset();
});

function emptyResources(): WorldResourcesDTO {
  return {
    project: { id: 'p1', name: '雾城', worldview: {} },
    stage: 'bootstrap',
    entities: {
      stories: [],
      characters: [],
      locations: [],
      scenes: [],
      world_events: [],
      relationships: [],
    },
  } as WorldResourcesDTO;
}

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

describe('createStudioEntity character', () => {
  it('does not create a character without a name', async () => {
    createWorldCharacterMock.mockRejectedValue(new Error('请填写角色名称'));
    await expect(createStudioEntity('p1', emptyResources(), 'character')).rejects.toThrow(
      '请填写角色名称',
    );
  });

  it('passes the typed name through', async () => {
    createWorldCharacterMock.mockResolvedValue({ id: 'c1', name: '林夕' });
    await expect(
      createStudioEntity('p1', emptyResources(), 'character', { name: '林夕' }),
    ).resolves.toEqual({ kind: 'character', id: 'c1' });
    expect(createWorldCharacterMock).toHaveBeenCalledWith({
      projectId: 'p1',
      name: '林夕',
      description: undefined,
      existingNames: [],
    });
  });

  it('imports from another world instead of creating blank', async () => {
    importWorldCharacterMock.mockResolvedValue({ id: 'c-import', name: '林晚' });
    await expect(
      createStudioEntity('p1', emptyResources(), 'character', {
        importFrom: { sourceProjectId: 'fog', sourceCharacterId: 'c-lin' },
      }),
    ).resolves.toEqual({ kind: 'character', id: 'c-import' });
    expect(createWorldCharacterMock).not.toHaveBeenCalled();
    expect(importWorldCharacterMock).toHaveBeenCalledWith({
      targetProjectId: 'p1',
      sourceProjectId: 'fog',
      sourceCharacterId: 'c-lin',
      existingNames: [],
    });
  });
});
