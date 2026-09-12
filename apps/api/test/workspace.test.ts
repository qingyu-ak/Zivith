import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@zivith/database';
import { ApiError } from '../src/errors.js';
import {
  archiveWorldWorkspace,
  archiveCreatorChat,
  normalizeWorkspacePath,
  openWorldFolder,
  readWorkspaceMarker,
  syncWorkspaceMarkerName,
  WORKSPACE_MARKER_DIR,
  writeWorkspaceMarker,
} from '../src/contexts/world/workspace.js';

describe('archiveWorldWorkspace', () => {
  it('soft-deletes the project and archives its chat threads', async () => {
    const update = vi.fn();
    const updateMany = vi.fn();
    const db = {
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: 'p1', name: '新世界' }),
        update,
      },
      creatorChatThread: { updateMany },
    } as unknown as PrismaClient;

    await expect(archiveWorldWorkspace(db, 'p1')).resolves.toEqual({
      id: 'p1',
      name: '新世界',
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { projectId: 'p1' },
      data: { state: 'archived' },
    });
  });

  it('404s when the project is already gone', async () => {
    const db = {
      project: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
      creatorChatThread: { updateMany: vi.fn() },
    } as unknown as PrismaClient;

    await expect(archiveWorldWorkspace(db, 'missing')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('archiveCreatorChat', () => {
  it('archives an active thread', async () => {
    const update = vi.fn();
    const db = {
      creatorChatThread: {
        findFirst: vi.fn().mockResolvedValue({ id: 't1', projectId: 'p1' }),
        update,
      },
    } as unknown as PrismaClient;

    await expect(archiveCreatorChat(db, 't1')).resolves.toEqual({ id: 't1', projectId: 'p1' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { state: 'archived' },
    });
  });

  it('404s when the thread is missing', async () => {
    const db = {
      creatorChatThread: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    } as unknown as PrismaClient;

    await expect(archiveCreatorChat(db, 'missing')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('openWorldFolder', () => {
  it('reuses an existing project by absolute path, not by name', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'zivith-ws-'));
    try {
      const create = vi.fn();
      const normalized = normalizeWorkspacePath(folder);
      const db = {
        user: { findFirst: vi.fn().mockResolvedValue({ id: 'owner-1' }) },
        project: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'p1',
            name: '学年论文x',
            workspacePath: normalized,
          }),
        },
        creatorChatThread: {
          findFirst: vi.fn().mockResolvedValue({ id: 't1', projectId: 'p1' }),
          create,
        },
      } as unknown as PrismaClient;

      await expect(openWorldFolder(db, folder)).resolves.toEqual({
        project: { id: 'p1', name: '学年论文x', workspacePath: normalized },
        thread: { id: 't1', projectId: 'p1' },
      });
      expect(create).not.toHaveBeenCalled();
      expect(db.project.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspacePath: normalized, deletedAt: null }),
        }),
      );
      expect(readWorkspaceMarker(folder)).toEqual({
        version: 1,
        id: 'p1',
        name: '学年论文x',
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('writes a marker when a folder opens as a new project', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'zivith-ws-'));
    try {
      const normalized = normalizeWorkspacePath(folder);
      const create = vi.fn().mockResolvedValue({
        id: 'p-new',
        name: path.basename(normalized),
        workspacePath: normalized,
      });
      const db = {
        user: { findFirst: vi.fn().mockResolvedValue({ id: 'owner-1' }) },
        project: { findFirst: vi.fn().mockResolvedValue(null), create },
        projectTimeline: { create: vi.fn() },
        creatorChatThread: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 't1', projectId: 'p-new' }),
        },
      } as unknown as PrismaClient;

      const { project } = await openWorldFolder(db, folder, 'member-1');
      expect(project.id).toBe('p-new');
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workspacePath: normalized }),
        }),
      );
      expect(readWorkspaceMarker(folder)).toEqual({
        version: 1,
        id: 'p-new',
        name: path.basename(normalized),
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('rebinds a moved folder to the same project via the marker id', async () => {
    const oldFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'zivith-ws-old-'));
    const newFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'zivith-ws-new-'));
    try {
      const normalizedOld = normalizeWorkspacePath(oldFolder);
      const normalizedNew = normalizeWorkspacePath(newFolder);
      // 文件夹（连同标记）从 oldFolder 挪到 newFolder 后重新打开。
      writeWorkspaceMarker(newFolder, { id: 'p1', name: '雾城' });
      const update = vi
        .fn()
        .mockImplementation(async ({ data }: { data: { workspacePath: string } }) => ({
          id: 'p1',
          name: '雾城',
          workspacePath: data.workspacePath,
        }));
      const db = {
        user: { findFirst: vi.fn().mockResolvedValue({ id: 'owner-1' }) },
        project: {
          findFirst: vi
            .fn()
            .mockImplementation(async ({ where }: { where: { id?: string } }) =>
              where.id === 'p1' ? { id: 'p1', name: '雾城', workspacePath: normalizedOld } : null,
            ),
          update,
        },
        creatorChatThread: {
          findFirst: vi.fn().mockResolvedValue({ id: 't1', projectId: 'p1' }),
        },
      } as unknown as PrismaClient;

      const { project } = await openWorldFolder(db, newFolder);
      expect(db.project.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'p1' }) }),
      );
      expect(update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { workspacePath: normalizedNew },
      });
      expect(project.workspacePath).toBe(normalizedNew);
      expect(readWorkspaceMarker(newFolder)).toEqual({
        version: 1,
        id: 'p1',
        name: '雾城',
      });
    } finally {
      fs.rmSync(oldFolder, { recursive: true, force: true });
      fs.rmSync(newFolder, { recursive: true, force: true });
    }
  });

  it('rejects a relative path and a missing directory', async () => {
    const db = { user: { findFirst: vi.fn() } } as unknown as PrismaClient;
    await expect(openWorldFolder(db, '  ')).rejects.toBeInstanceOf(ApiError);
    await expect(openWorldFolder(db, 'relative-folder')).rejects.toBeInstanceOf(ApiError);
    await expect(
      openWorldFolder(db, path.join(os.tmpdir(), `zivith-missing-${Date.now()}`)),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('normalizeWorkspacePath', () => {
  it('returns the real absolute directory', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'zivith-ws-'));
    try {
      const normalized = normalizeWorkspacePath(folder);
      expect(path.isAbsolute(normalized)).toBe(true);
      expect(fs.statSync(normalized).isDirectory()).toBe(true);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('readWorkspaceMarker', () => {
  it('returns null for a missing or malformed marker', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'zivith-ws-'));
    try {
      expect(readWorkspaceMarker(folder)).toBeNull();
      fs.mkdirSync(path.join(folder, WORKSPACE_MARKER_DIR));
      fs.writeFileSync(path.join(folder, WORKSPACE_MARKER_DIR, 'workspace.json'), '{ not json');
      expect(readWorkspaceMarker(folder)).toBeNull();
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('syncWorkspaceMarkerName', () => {
  it('rewrites the marker name for a bound folder and ignores unbound projects', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'zivith-ws-'));
    try {
      writeWorkspaceMarker(folder, { id: 'p1', name: '旧名' });
      syncWorkspaceMarkerName({ id: 'p1', name: '新名', workspacePath: folder });
      expect(readWorkspaceMarker(folder)).toEqual({ version: 1, id: 'p1', name: '新名' });
      expect(() =>
        syncWorkspaceMarkerName({ id: 'p2', name: '未绑定', workspacePath: null }),
      ).not.toThrow();
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
