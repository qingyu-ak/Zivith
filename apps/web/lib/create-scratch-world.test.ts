/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScratchWorld,
  NEW_WORLD_HREF,
  worldBuilderHref,
  worldStudioHref,
} from './create-scratch-world';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock('./api', () => ({
  api: apiMock,
}));

beforeEach(() => {
  apiMock.mockReset();
});

describe('createScratchWorld', () => {
  it('rejects an empty name without calling the API', async () => {
    await expect(createScratchWorld({ name: '  ' })).rejects.toThrow('请填写世界名称');
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('creates a project then a World Builder thread', async () => {
    apiMock
      .mockResolvedValueOnce({ id: 'p1', name: '雾城' })
      .mockResolvedValueOnce({ id: 't1', project_id: 'p1' });
    const thread = await createScratchWorld({ name: '雾城', description: '港口' });
    expect(thread).toMatchObject({ id: 't1', project_id: 'p1' });
    expect(apiMock).toHaveBeenNthCalledWith(1, '/projects', {
      method: 'POST',
      body: { name: '雾城', description: '港口' },
    });
    expect(apiMock).toHaveBeenNthCalledWith(2, '/world/creator-chats', {
      method: 'POST',
      body: { project_id: 'p1' },
    });
  });

  it('uses folder create when a path is given', async () => {
    apiMock.mockResolvedValue({ id: 't1', project_id: 'p1' });
    const thread = await createScratchWorld({
      name: '雾城',
      folderPath: 'D:\\Worlds\\雾城',
    });
    expect(thread.id).toBe('t1');
    expect(apiMock).toHaveBeenCalledWith(
      '/world/folders/create',
      expect.objectContaining({
        method: 'POST',
        body: { path: 'D:\\Worlds\\雾城', name: '雾城' },
      }),
    );
    expect(apiMock).not.toHaveBeenCalledWith('/projects', expect.anything());
  });
});

describe('new world hrefs', () => {
  it('keeps the hub and success landings stable', () => {
    expect(NEW_WORLD_HREF).toBe('/projects/new');
    expect(worldBuilderHref('t1')).toBe('/creator-chats/t1');
    expect(worldStudioHref('p1')).toBe('/projects/p1/world');
  });
});
