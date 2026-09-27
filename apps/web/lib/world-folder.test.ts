/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import {
  apiErrorCode,
  apiErrorConflictReason,
  createWorldInFolderRequest,
  FolderFlowCancelled,
  NotAZivithWorldError,
  openExistingZivithWorldFolder,
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

function makeDialogs(confirm: boolean): FolderFlowDialogs {
  return {
    confirm: vi.fn(() => confirm),
  };
}

function errorWithCode(code: string, details?: unknown): ApiError {
  return new ApiError('x', 409, { error: { code, ...(details !== undefined ? { details } : {}) } });
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('apiErrorCode', () => {
  it('extracts the backend code and ignores other errors', () => {
    expect(apiErrorCode(errorWithCode('WORLD_NOT_FOUND'))).toBe('WORLD_NOT_FOUND');
    expect(apiErrorCode(new Error('boom'))).toBeNull();
  });

  it('reads duplicate_folder from error details', () => {
    expect(
      apiErrorConflictReason(
        errorWithCode('WORLD_IDENTITY_CONFLICT', { reason: 'duplicate_folder' }),
      ),
    ).toBe('duplicate_folder');
    expect(apiErrorConflictReason(errorWithCode('WORLD_IDENTITY_CONFLICT'))).toBeNull();
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

  it('reclaims or imports a plain folder via on_missing=import after confirmation', async () => {
    apiMock
      .mockResolvedValueOnce({ path: 'D:\\W', state: 'not_a_world', world_id: null, name: null })
      .mockResolvedValueOnce({ id: 't1', project_id: 'p-reclaimed' });
    const dialogs = makeDialogs(true);
    await openWorldFromFolder('D:\\W', { dialogs });
    expect(dialogs.confirm).toHaveBeenCalledOnce();
    // 走 open 的 import 分支而不是 create：数据库仍绑着该路径（含归档）时由服务端
    // 收回原绑定，否则导入为新世界 —— 避免 WORLD_PATH_CONFLICT 卡死。
    expect(apiMock).toHaveBeenLastCalledWith(
      '/world/folders/open',
      expect.objectContaining({ body: { path: 'D:\\W', on_missing: 'import' } }),
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

  it('rethrows path-owner identity conflicts instead of showing a dialog', async () => {
    apiMock
      .mockResolvedValueOnce({ path: 'D:\\W', state: 'ok', world_id: 'p1', name: 'x' })
      .mockRejectedValueOnce(errorWithCode('WORLD_IDENTITY_CONFLICT'));
    const dialogs = makeDialogs(true);
    await expect(openWorldFromFolder('D:\\W', { dialogs })).rejects.toMatchObject({
      message: 'x',
    });
    expect(dialogs.confirm).not.toHaveBeenCalled();
  });

  it('offers to switch currentPath when opening a duplicate folder copy', async () => {
    apiMock
      .mockResolvedValueOnce({ path: 'D:\\W', state: 'ok', world_id: 'p1', name: '雾城' })
      .mockRejectedValueOnce(
        errorWithCode('WORLD_IDENTITY_CONFLICT', { reason: 'duplicate_folder' }),
      )
      .mockResolvedValueOnce({ id: 't1', project_id: 'p1' });
    const dialogs = makeDialogs(true);
    await openWorldFromFolder('D:\\W', { dialogs });
    expect(dialogs.confirm).toHaveBeenCalledOnce();
    expect(apiMock).toHaveBeenLastCalledWith(
      '/world/folders/open',
      expect.objectContaining({
        body: { path: 'D:\\W', rebind_project_id: 'p1' },
      }),
    );
  });

  it('cancels switching to a duplicate folder copy', async () => {
    apiMock
      .mockResolvedValueOnce({ path: 'D:\\W', state: 'ok', world_id: 'p1', name: '雾城' })
      .mockRejectedValueOnce(
        errorWithCode('WORLD_IDENTITY_CONFLICT', { reason: 'duplicate_folder' }),
      );
    const dialogs = makeDialogs(false);
    await expect(openWorldFromFolder('D:\\W', { dialogs })).rejects.toBeInstanceOf(
      FolderFlowCancelled,
    );
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it('sends name and description when creating a world in a folder', async () => {
    apiMock.mockResolvedValue({ id: 't1' });
    await createWorldInFolderRequest('D:\\W', { name: '龙族', description: '现代与龙族共存' });
    expect(apiMock).toHaveBeenCalledWith(
      '/world/folders/create',
      expect.objectContaining({
        body: { path: 'D:\\W', name: '龙族', description: '现代与龙族共存' },
      }),
    );
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

describe('openExistingZivithWorldFolder', () => {
  it('rejects a folder without .zivith/ and does not import it as a new world', async () => {
    apiMock.mockResolvedValueOnce({
      path: 'D:\\Notes',
      state: 'not_a_world',
      world_id: null,
      name: null,
    });
    const dialogs = makeDialogs(true);
    await expect(openExistingZivithWorldFolder('D:\\Notes', { dialogs })).rejects.toBeInstanceOf(
      NotAZivithWorldError,
    );
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(dialogs.confirm).not.toHaveBeenCalled();
  });

  it('opens a valid .zivith world without extra dialogs', async () => {
    apiMock
      .mockResolvedValueOnce({
        path: 'D:\\Worlds\\雾城',
        state: 'ok',
        world_id: 'p1',
        name: '雾城',
      })
      .mockResolvedValueOnce({ id: 't1', project_id: 'p1' });
    const dialogs = makeDialogs(false);
    const opened = await openExistingZivithWorldFolder('D:\\Worlds\\雾城', { dialogs });
    expect(opened).toMatchObject({ project_id: 'p1' });
    expect(apiMock).toHaveBeenNthCalledWith(
      2,
      '/world/folders/open',
      expect.objectContaining({ body: { path: 'D:\\Worlds\\雾城' } }),
    );
    expect(dialogs.confirm).not.toHaveBeenCalled();
  });
});
