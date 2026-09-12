/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import {
  apiErrorCode,
  FolderFlowCancelled,
  folderNameFromPath,
  openWorldFolderRequest,
  openWorldFromFolder,
  type FolderFlowDialogs,
} from './world-folder';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock('./api', () => ({
  ApiError: class MockedApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public details?: unknown,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
  api: apiMock,
}));

function makeDialogs(confirm: boolean, name: string | null = '龙族'): FolderFlowDialogs {
  return {
    confirm: vi.fn(() => confirm),
    promptName: vi.fn(() => name),
  };
}

function errorWithCode(code: string): ApiError {
  return new ApiError('x', 409, { error: { code } });
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('folderNameFromPath', () => {
  it('works for windows and posix separators', () => {
    expect(folderNameFromPath('D:\\Zivith Worlds\\龙族')).toBe('龙族');
    expect(folderNameFromPath('/home/user/worlds/雾城/')).toBe('雾城');
  });
});

describe('apiErrorCode', () => {
  it('extracts the backend code and ignores other errors', () => {
    expect(apiErrorCode(errorWithCode('WORLD_NOT_FOUND'))).toBe('WORLD_NOT_FOUND');
    expect(apiErrorCode(new Error('boom'))).toBeNull();
  });
});

describe('openWorldFromFolder', () => {
  it('opens a valid world directly without dialogs', async () => {
    apiMock.mockResolvedValue({ id: 't1', project_id: 'p1' });
    const dialogs = makeDialogs(false);
    const created = await openWorldFromFolder('D:\\Worlds\\龙族', { dialogs });
    expect(created).toMatchObject({ project_id: 'p1' });
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(apiMock).toHaveBeenNthCalledWith(1, '/world/folders/inspect', expect.anything());
    expect(apiMock).toHaveBeenNthCalledWith(
      2,
      '/world/folders/open',
      expect.objectContaining({ body: { path: 'D:\\Worlds\\龙族' } }),
    );
    expect(dialogs.confirm).not.toHaveBeenCalled();
  });

  it('imports a plain folder only after explicit confirmation and naming', async () => {
    apiMock
      .mockResolvedValueOnce({ path: 'D:\\W', state: 'not_a_world', world_id: null, name: null })
      .mockResolvedValueOnce({ id: 't1', project_id: 'p-new' });
    const dialogs = makeDialogs(true, '龙族');
    await openWorldFromFolder('D:\\W', { dialogs });
    expect(dialogs.confirm).toHaveBeenCalledOnce();
    expect(apiMock).toHaveBeenLastCalledWith(
      '/world/folders/create',
      expect.objectContaining({ body: { path: 'D:\\W', name: '龙族' } }),
    );
  });

  it('cancels silently when the user declines the import dialog', async () => {
    apiMock.mockResolvedValueOnce({
      path: 'D:\\W',
      state: 'not_a_world',
      world_id: null,
      name: null,
    });
    const dialogs = makeDialogs(false);
    await expect(openWorldFromFolder('D:\\W', { dialogs })).rejects.toBeInstanceOf(
      FolderFlowCancelled,
    );
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('cancels when the user dismisses the naming prompt', async () => {
    apiMock.mockResolvedValueOnce({
      path: 'D:\\W',
      state: 'not_a_world',
      world_id: null,
      name: null,
    });
    const dialogs = makeDialogs(true, null);
    await expect(openWorldFromFolder('D:\\W', { dialogs })).rejects.toBeInstanceOf(
      FolderFlowCancelled,
    );
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('offers recovery for a corrupt marker', async () => {
    apiMock
      .mockResolvedValueOnce({ path: 'D:\\W', state: 'corrupt', world_id: null, name: null })
      .mockResolvedValueOnce({ id: 't1' });
    const dialogs = makeDialogs(true);
    await openWorldFromFolder('D:\\W', { dialogs });
    expect(apiMock).toHaveBeenLastCalledWith(
      '/world/folders/open',
      expect.objectContaining({ body: { path: 'D:\\W', on_corrupt: 'recover' } }),
    );
  });

  it('offers a runtime copy when the worldId is missing locally (§18.3)', async () => {
    apiMock
      .mockResolvedValueOnce({
        path: 'D:\\W',
        state: 'ok',
        world_id: 'p-gone',
        name: '消失的世界',
      })
      .mockRejectedValueOnce(errorWithCode('WORLD_NOT_FOUND'))
      .mockResolvedValueOnce({ id: 't1', project_id: 'p-new' });
    const dialogs = makeDialogs(true);
    await openWorldFromFolder('D:\\W', { dialogs });
    expect(dialogs.confirm).toHaveBeenCalledOnce();
    expect(apiMock).toHaveBeenLastCalledWith(
      '/world/folders/open',
      expect.objectContaining({ body: { path: 'D:\\W', on_orphan: 'create' } }),
    );
  });

  it('rethrows errors it does not handle instead of showing a dialog', async () => {
    apiMock
      .mockResolvedValueOnce({ path: 'D:\\W', state: 'ok', world_id: 'p1', name: 'x' })
      .mockRejectedValueOnce(errorWithCode('WORLD_IDENTITY_CONFLICT'));
    const dialogs = makeDialogs(true);
    await expect(openWorldFromFolder('D:\\W', { dialogs })).rejects.toMatchObject({
      message: 'x',
    });
    expect(dialogs.confirm).not.toHaveBeenCalled();
  });

  it('passes rebind straight through for 重新定位', async () => {
    apiMock.mockResolvedValue({ id: 't1', project_id: 'p-target' });
    await openWorldFromFolder('D:\\W', { rebindProjectId: 'p-target' });
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith(
      '/world/folders/open',
      expect.objectContaining({
        body: { path: 'D:\\W', rebind_project_id: 'p-target' },
      }),
    );
  });

  it('exposes openWorldFolderRequest with options', async () => {
    apiMock.mockResolvedValue({ id: 't1' });
    await openWorldFolderRequest('D:\\W', { on_missing: 'import' });
    expect(apiMock).toHaveBeenCalledWith(
      '/world/folders/open',
      expect.objectContaining({ body: { path: 'D:\\W', on_missing: 'import' } }),
    );
  });
});
