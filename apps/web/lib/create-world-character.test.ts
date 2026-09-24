/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWorldCharacter,
  importedCharacterName,
  importWorldCharacter,
  isPlayableCharacter,
  openRoleplayForCharacter,
  playableCharacters,
  requireCharacterName,
  copyWorldCharacter,
  characterCardCreateBody,
  listImportableWorlds,
} from './create-world-character';

const { apiMock, createRoleplayThreadMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  createRoleplayThreadMock: vi.fn(),
}));

vi.mock('./api', () => ({
  api: apiMock,
  createRoleplayThread: createRoleplayThreadMock,
  unwrapList: (payload: unknown) =>
    Array.isArray(payload) ? payload : ((payload as { items?: unknown[] })?.items ?? []),
}));

beforeEach(() => {
  apiMock.mockReset();
  createRoleplayThreadMock.mockReset();
});

describe('requireCharacterName', () => {
  it('rejects a blank name without calling the API', () => {
    expect(() => requireCharacterName('  ')).toThrow('请填写角色名称');
  });
});

describe('playableCharacters', () => {
  it('drops the user speaker card', () => {
    const items = [
      { id: 'a', tags: ['user_self'] },
      { id: 'b', tags: [] },
    ];
    expect(playableCharacters(items).map((item) => item.id)).toEqual(['b']);
    expect(isPlayableCharacter(items[0]!)).toBe(false);
  });
});

describe('createWorldCharacter', () => {
  it('does not post when the name is empty', async () => {
    await expect(createWorldCharacter({ projectId: 'p1', name: ' ' })).rejects.toThrow(
      '请填写角色名称',
    );
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('creates an active character with the typed name', async () => {
    apiMock.mockResolvedValue({ id: 'c1', name: '林夕' });
    const created = await createWorldCharacter({
      projectId: 'p1',
      name: '林夕',
      description: '冷静的北境斥候',
    });
    expect(created.id).toBe('c1');
    expect(apiMock).toHaveBeenCalledWith('/projects/p1/assets', {
      method: 'POST',
      body: {
        asset_type: 'character',
        name: '林夕',
        description: '冷静的北境斥候',
        personality: '冷静的北境斥候',
        state: 'active',
      },
    });
  });

  it('renames when the name is already taken', async () => {
    apiMock.mockResolvedValue({ id: 'c2', name: '林夕 2' });
    await createWorldCharacter({
      projectId: 'p1',
      name: '林夕',
      existingNames: ['林夕'],
    });
    expect(apiMock.mock.calls[0]?.[1]).toMatchObject({
      body: expect.objectContaining({ name: '林夕 2', description: '（待补充）' }),
    });
  });
});

describe('character card copy and import', () => {
  const source = {
    id: 'c-lin',
    project_id: 'fog',
    name: '林晚',
    description: '雾城信使',
    personality: '话少',
    default_outfit: '青衫',
    aliases: ['晚姐'],
    appearance: { hair: '黑发', eyes: '深褐' },
    tags: [] as string[],
  };

  it('copies appearance and voice notes, not just the name', async () => {
    apiMock.mockResolvedValue({ id: 'c-copy', name: '林晚 副本' });
    await copyWorldCharacter({ projectId: 'fog', source, existingNames: ['林晚'] });
    expect(apiMock.mock.calls[0]?.[1]).toMatchObject({
      body: expect.objectContaining({
        name: '林晚 副本',
        description: '雾城信使',
        personality: '话少',
        default_outfit: '青衫',
        aliases: ['晚姐'],
        appearance: { hair: '黑发', eyes: '深褐' },
      }),
    });
  });

  it('does not copy the user speaker card', async () => {
    await expect(
      copyWorldCharacter({
        projectId: 'fog',
        source: { ...source, tags: ['user_self'] },
      }),
    ).rejects.toThrow(/不能复制/);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('keeps the original name when importing into an empty world', () => {
    expect(importedCharacterName([], '林晚')).toBe('林晚');
    expect(importedCharacterName(['林晚'], '林晚')).toBe('林晚 副本');
  });

  it('does not create when import is cancelled (no API until importWorldCharacter)', () => {
    expect(characterCardCreateBody(source, '林晚').asset_type).toBe('character');
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('imports from another world and skips user_self cards', async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (String(path).includes('/resources')) {
        return {
          entities: {
            characters: [{ ...source, tags: ['user_self'] }, source],
          },
        };
      }
      return { id: 'c-new', name: '林晚' };
    });
    const created = await importWorldCharacter({
      targetProjectId: 'open',
      sourceProjectId: 'fog',
      sourceCharacterId: 'c-lin',
      existingNames: [],
    });
    expect(created.id).toBe('c-new');
    expect(apiMock.mock.calls.at(-1)?.[0]).toBe('/projects/open/assets');
    expect(apiMock.mock.calls.at(-1)?.[1]).toMatchObject({
      body: expect.objectContaining({ name: '林晚', personality: '话少' }),
    });
  });

  it('refuses to import into the same world', async () => {
    await expect(
      importWorldCharacter({
        targetProjectId: 'fog',
        sourceProjectId: 'fog',
        sourceCharacterId: 'c-lin',
      }),
    ).rejects.toThrow(/复制/);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('lists other worlds that have playable characters', async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path === '/projects') {
        return [
          { id: 'open', name: '开折' },
          { id: 'fog', name: '走查雾城信' },
          { id: 'empty', name: '空世界' },
        ];
      }
      if (String(path).includes('fog')) {
        return { entities: { characters: [source, { ...source, id: 'me', tags: ['user_self'] }] } };
      }
      if (String(path).includes('empty')) {
        return { entities: { characters: [] } };
      }
      throw new Error('unreachable');
    });
    await expect(listImportableWorlds('open')).resolves.toEqual([
      { id: 'fog', name: '走查雾城信', characters: [source] },
    ]);
  });
});

describe('openRoleplayForCharacter', () => {
  it('returns the roleplay thread id', async () => {
    createRoleplayThreadMock.mockResolvedValue({ id: 'r1', thread_id: 't1', reused: false });
    await expect(openRoleplayForCharacter('p1', 'c1')).resolves.toBe('t1');
    expect(createRoleplayThreadMock).toHaveBeenCalledWith('p1', 'c1');
  });

  it('explains when the thread cannot open', async () => {
    createRoleplayThreadMock.mockResolvedValue({ id: 'r1', thread_id: '', reused: false });
    await expect(openRoleplayForCharacter('p1', 'c1')).rejects.toThrow(/没能打开对话/);
  });
});
