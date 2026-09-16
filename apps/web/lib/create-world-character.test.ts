/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWorldCharacter,
  isPlayableCharacter,
  openRoleplayForCharacter,
  playableCharacters,
  requireCharacterName,
} from './create-world-character';

const { apiMock, createRoleplayThreadMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  createRoleplayThreadMock: vi.fn(),
}));

vi.mock('./api', () => ({
  api: apiMock,
  createRoleplayThread: createRoleplayThreadMock,
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
