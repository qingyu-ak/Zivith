import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@zivith/database';
import { ApiError } from '../src/errors.js';
import {
  archiveWorldWorkspace,
  archiveCreatorChat,
  createWorldInFolder,
  allocateWorldFolder,
  initializeWorldFolder,
  inspectWorkspaceFolder,
  normalizeWorkspacePath,
  openWorldFolder,
  readWorkspaceMarker,
  syncWorkspaceMarkerName,
  WORKSPACE_BASE_DIRS,
  WORKSPACE_FORMAT,
  WORKSPACE_FORMAT_VERSION,
  WORKSPACE_MARKER_DIR,
  writeWorkspaceMarker,
} from '../src/contexts/world/workspace.js';

function makeTempFolder(prefix = 'zivith-ws-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeRawMarker(folder: string, payload: unknown): void {
  fs.mkdirSync(path.join(folder, WORKSPACE_MARKER_DIR), { recursive: true });
  fs.writeFileSync(
    path.join(folder, WORKSPACE_MARKER_DIR, 'workspace.json'),
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
    'utf8',
  );
}

describe('allocateWorldFolder', () => {
  it('creates a same-name folder and skips one that is already a world', () => {
    const root = makeTempFolder('zivith-root-');
    const first = allocateWorldFolder('雾城', root);
    expect(first).toBe(path.join(root, '雾城'));
    expect(fs.statSync(first).isDirectory()).toBe(true);
    initializeWorldFolder(first, { worldId: 'world-1', name: '雾城' });
    const second = allocateWorldFolder('雾城', root);
    expect(second).toBe(path.join(root, '雾城 2'));
    expect(fs.existsSync(path.join(second, WORKSPACE_MARKER_DIR))).toBe(false);
  });
});

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
      roleplayThread: { updateMany: vi.fn() },
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
      roleplayThread: { updateMany: vi.fn() },
    } as unknown as PrismaClient;

    await expect(archiveWorldWorkspace(db, 'missing')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('archiveCreatorChat', () => {
  it('archives an active thread', async () => {
    const update = vi.fn();
    const closeRoleplay = vi.fn();
    const db = {
      creatorChatThread: {
        findFirst: vi.fn().mockResolvedValue({ id: 't1', projectId: 'p1' }),
        update,
      },
      roleplayThread: { updateMany: closeRoleplay },
    } as unknown as PrismaClient;

    await expect(archiveCreatorChat(db, 't1')).resolves.toEqual({ id: 't1', projectId: 'p1' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { state: 'archived' },
    });
    expect(closeRoleplay).toHaveBeenCalledWith({
      where: { threadId: 't1', status: 'active' },
      data: { status: 'closed' },
    });
  });

  it('404s when the thread is missing', async () => {
    const db = {
      creatorChatThread: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
      roleplayThread: { updateMany: vi.fn() },
    } as unknown as PrismaClient;

    await expect(archiveCreatorChat(db, 'missing')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('normalizeWorkspacePath', () => {
  it('returns the real absolute directory', () => {
    const folder = makeTempFolder();
    try {
      const normalized = normalizeWorkspacePath(folder);
      expect(path.isAbsolute(normalized)).toBe(true);
      expect(fs.statSync(normalized).isDirectory()).toBe(true);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('rejects a relative path and a missing directory', () => {
    expect(() => normalizeWorkspacePath('  ')).toThrow(ApiError);
    expect(() => normalizeWorkspacePath('relative-folder')).toThrow(ApiError);
    expect(() =>
      normalizeWorkspacePath(path.join(os.tmpdir(), `zivith-missing-${Date.now()}`)),
    ).toThrow(ApiError);
  });
});

describe('initializeWorldFolder', () => {
  it('writes the V1 workspace.json and the base directory skeleton', () => {
    const folder = makeTempFolder();
    try {
      const marker = initializeWorldFolder(folder, { worldId: 'p1', name: '龙族' });
      expect(marker).toMatchObject({ formatVersion: 1, worldId: 'p1', name: '龙族' });
      for (const dir of WORKSPACE_BASE_DIRS) {
        expect(fs.statSync(path.join(folder, dir)).isDirectory()).toBe(true);
      }
      const parsed = JSON.parse(
        fs.readFileSync(path.join(folder, WORKSPACE_MARKER_DIR, 'workspace.json'), 'utf8'),
      ) as Record<string, unknown>;
      expect(parsed.format).toBe(WORKSPACE_FORMAT);
      expect(parsed.formatVersion).toBe(WORKSPACE_FORMAT_VERSION);
      expect(parsed.worldId).toBe('p1');
      expect(typeof parsed.createdAt).toBe('string');
      expect(parsed.zivith).toMatchObject({ minVersion: expect.any(String) });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('is idempotent and keeps the original createdAt', () => {
    const folder = makeTempFolder();
    try {
      const first = initializeWorldFolder(folder, { worldId: 'p1', name: '龙族' });
      const second = initializeWorldFolder(folder, { worldId: 'p1', name: '龙族·改' });
      expect(second.createdAt).toBe(first.createdAt);
      expect(second.name).toBe('龙族·改');
      expect(readWorkspaceMarker(folder)?.worldId).toBe('p1');
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it(
    'fails loudly when the folder is not writable (POSIX)',
    { skip: process.platform === 'win32' },
    () => {
      const folder = makeTempFolder();
      try {
        fs.chmodSync(folder, 0o555);
        expect(() => initializeWorldFolder(folder, { worldId: 'p1', name: '龙族' })).toThrow(
          ApiError,
        );
      } finally {
        fs.chmodSync(folder, 0o755);
        fs.rmSync(folder, { recursive: true, force: true });
      }
    },
  );
});

describe('inspectWorkspaceFolder', () => {
  it('distinguishes missing, corrupt, and valid worlds', () => {
    const folder = makeTempFolder();
    try {
      expect(inspectWorkspaceFolder(folder)).toEqual({ state: 'not_a_world' });
      fs.mkdirSync(path.join(folder, WORKSPACE_MARKER_DIR));
      // .zivith/ 存在但 workspace.json 缺失：半个世界工程，按损坏处理。
      expect(inspectWorkspaceFolder(folder)).toEqual({ state: 'corrupt' });
      writeRawMarker(folder, '{ not json');
      expect(inspectWorkspaceFolder(folder)).toEqual({ state: 'corrupt' });
      writeRawMarker(folder, { format: WORKSPACE_FORMAT, worldId: '' });
      expect(inspectWorkspaceFolder(folder)).toEqual({ state: 'corrupt' });
      // Track W1 旧格式仍然可以读取（向后兼容）。
      writeRawMarker(folder, { version: 1, id: 'p-legacy', name: '旧世界' });
      expect(inspectWorkspaceFolder(folder)).toEqual({
        state: 'ok',
        marker: {
          formatVersion: 1,
          worldId: 'p-legacy',
          name: '旧世界',
          createdAt: null,
        },
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('reads the new spec format', () => {
    const folder = makeTempFolder();
    try {
      initializeWorldFolder(folder, { worldId: 'p1', name: '龙族' });
      const marker = readWorkspaceMarker(folder);
      expect(marker).toMatchObject({
        formatVersion: WORKSPACE_FORMAT_VERSION,
        worldId: 'p1',
        name: '龙族',
      });
      expect(marker?.createdAt).toEqual(expect.any(String));
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('createWorldInFolder', () => {
  function createDb(
    overrides: {
      findFirst?: ReturnType<typeof vi.fn>;
      create?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    const create =
      overrides.create ??
      vi.fn().mockImplementation(async ({ data }) => ({
        id: 'p-new',
        name: data.name,
        workspacePath: data.workspacePath,
        settings: data.settings,
      }));
    return {
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'owner-1' }) },
      project: {
        findFirst: overrides.findFirst ?? vi.fn().mockResolvedValue(null),
        create,
        delete: vi.fn(),
      },
      projectTimeline: { create: vi.fn() },
      creatorChatThread: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 't1', projectId: 'p-new' }),
      },
    } as unknown as PrismaClient;
  }

  it('creates the folder world and the database world with the same worldId', async () => {
    const folder = makeTempFolder();
    try {
      const db = createDb();
      const { project, thread } = await createWorldInFolder(db, {
        folderPath: folder,
        name: '龙族',
      });
      expect(project.id).toBe('p-new');
      expect(project.workspacePath).toBe(normalizeWorkspacePath(folder));
      expect(thread).toMatchObject({ id: 't1' });
      // 文件标记里的 worldId 与数据库 World 一致（MD §5.1）。
      expect(readWorkspaceMarker(folder)).toMatchObject({
        worldId: 'p-new',
        name: '龙族',
      });
      for (const dir of WORKSPACE_BASE_DIRS) {
        expect(fs.existsSync(path.join(folder, dir))).toBe(true);
      }
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('defaults the world name to the folder name', async () => {
    const folder = makeTempFolder('zivith-雾城-');
    try {
      const create = vi.fn().mockImplementation(async ({ data }) => ({
        id: 'p-new',
        name: data.name,
        workspacePath: data.workspacePath,
      }));
      const db = createDb({ create });
      await createWorldInFolder(db, { folderPath: folder });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: path.basename(normalizeWorkspacePath(folder)) }),
        }),
      );
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('refuses a folder that is already a world instead of reinitializing it', async () => {
    const folder = makeTempFolder();
    try {
      initializeWorldFolder(folder, { worldId: 'p1', name: '龙族' });
      const db = createDb();
      await expect(createWorldInFolder(db, { folderPath: folder })).rejects.toMatchObject({
        code: 'WORKSPACE_ALREADY_WORLD',
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('refuses a folder with a corrupt marker', async () => {
    const folder = makeTempFolder();
    try {
      writeRawMarker(folder, '{ broken');
      const db = createDb();
      await expect(createWorldInFolder(db, { folderPath: folder })).rejects.toMatchObject({
        code: 'WORKSPACE_CORRUPT',
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('refuses a folder already bound to another project (including archived ones)', async () => {
    const folder = makeTempFolder();
    try {
      const db = createDb({
        findFirst: vi.fn().mockResolvedValue({ id: 'p-old', workspacePath: folder }),
      });
      await expect(createWorldInFolder(db, { folderPath: folder })).rejects.toMatchObject({
        code: 'WORLD_PATH_CONFLICT',
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('compensates the database row when the folder cannot be initialized', async () => {
    const folder = makeTempFolder();
    try {
      const db = createDb();
      const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('EACCES: mocked write failure');
      });
      try {
        await expect(createWorldInFolder(db, { folderPath: folder })).rejects.toMatchObject({
          code: 'WORKSPACE_WRITE_FAILED',
        });
      } finally {
        spy.mockRestore();
      }
      expect(db.project.delete).toHaveBeenCalledWith({ where: { id: 'p-new' } });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('openWorldFolder', () => {
  function openDb(
    overrides: {
      findById?: (id: string, where: Record<string, unknown>) => unknown;
      findByPath?: (workspacePath: string) => unknown;
      update?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    const update =
      overrides.update ??
      vi.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        name: '世界',
        workspacePath: data.workspacePath,
      }));
    return {
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'owner-1' }) },
      project: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          const whereRecord = where as {
            id?: string;
            workspacePath?: string;
            NOT?: unknown;
          };
          if (whereRecord.id && overrides.findById) {
            return overrides.findById(whereRecord.id, whereRecord);
          }
          if (whereRecord.workspacePath && overrides.findByPath) {
            return overrides.findByPath(whereRecord.workspacePath);
          }
          return null;
        }),
        create: vi.fn().mockImplementation(async ({ data }) => ({
          id: data.id ?? 'p-new',
          name: data.name,
          workspacePath: data.workspacePath,
        })),
        update,
      },
      projectTimeline: { create: vi.fn() },
      creatorChatThread: {
        findFirst: vi.fn().mockResolvedValue({ id: 't1', projectId: 'p1' }),
        create: vi.fn().mockResolvedValue({ id: 't1', projectId: 'p-new' }),
      },
    } as unknown as PrismaClient;
  }

  it('reclaims an existing path-bound project when the marker is missing', async () => {
    const folder = makeTempFolder();
    try {
      const normalized = normalizeWorkspacePath(folder);
      // 数据库里有路径绑定，但文件夹里的 .zivith 丢失（例如被手动清理）。
      const db = openDb({
        findByPath: () => ({ id: 'p1', name: '学年论文x', workspacePath: normalized }),
      });

      // 默认拒绝，绝不静默当世界；用户确认后收回原绑定并补写标记。
      await expect(openWorldFolder(db, folder)).rejects.toMatchObject({
        code: 'NOT_A_ZIVITH_WORLD',
      });
      const { project } = await openWorldFolder(db, folder, { onMissing: 'import' });
      expect(project).toMatchObject({ id: 'p1', name: '学年论文x', workspacePath: normalized });
      expect(db.project.create).not.toHaveBeenCalled();
      expect(readWorkspaceMarker(folder)).toMatchObject({ worldId: 'p1', name: '学年论文x' });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('imports a plain folder as a new world only when explicitly asked', async () => {
    const folder = makeTempFolder();
    try {
      const db = openDb();
      // §18.1：默认拒绝，不把普通文件夹静默当世界。
      await expect(openWorldFolder(db, folder)).rejects.toMatchObject({
        code: 'NOT_A_ZIVITH_WORLD',
      });
      const { project } = await openWorldFolder(db, folder, { onMissing: 'import' });
      expect(project).toMatchObject({ id: 'p-new' });
      expect(readWorkspaceMarker(folder)).toMatchObject({
        worldId: 'p-new',
        name: path.basename(normalizeWorkspacePath(folder)),
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('rebinds a moved folder to the same project via the marker worldId', async () => {
    const oldFolder = makeTempFolder('zivith-ws-old-');
    const newFolder = makeTempFolder('zivith-ws-new-');
    try {
      const normalizedNew = normalizeWorkspacePath(newFolder);
      // 文件夹（连同标记）从 oldFolder 挪到 newFolder 后重新打开。
      writeWorkspaceMarker(newFolder, { id: 'p1', name: '雾城' });
      const update = vi.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        name: '雾城',
        workspacePath: data.workspacePath,
      }));
      const db = openDb({
        findById: (id) =>
          id === 'p1' ? { id: 'p1', name: '雾城', workspacePath: oldFolder } : null,
        update,
      });

      const { project } = await openWorldFolder(db, newFolder);
      expect(update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { workspacePath: normalizedNew },
      });
      expect(project.workspacePath).toBe(normalizedNew);
      expect(readWorkspaceMarker(newFolder)).toMatchObject({ worldId: 'p1', name: '雾城' });
    } finally {
      fs.rmSync(oldFolder, { recursive: true, force: true });
      fs.rmSync(newFolder, { recursive: true, force: true });
    }
  });

  it('keeps world identity after a folder rename', async () => {
    const folder = makeTempFolder('zivith-rename-');
    try {
      const normalized = normalizeWorkspacePath(folder);
      writeWorkspaceMarker(folder, { id: 'p1', name: '雾城' });
      const renamed = `${folder}-renamed`;
      fs.renameSync(folder, renamed);
      const db = openDb({
        findById: (id) =>
          id === 'p1' ? { id: 'p1', name: '雾城', workspacePath: normalized } : null,
        update: vi.fn().mockImplementation(async ({ where, data }) => ({
          id: where.id,
          name: '雾城',
          workspacePath: data.workspacePath,
        })),
      });

      const { project } = await openWorldFolder(db, renamed);
      // 实体、对话、时间线都在同一个 project 上，不因改名丢失。
      expect(project).toMatchObject({ id: 'p1', name: '雾城' });
      expect(db.creatorChatThread.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ projectId: 'p1' }) }),
      );
    } finally {
      fs.rmSync(`${folder}-renamed`, { recursive: true, force: true });
    }
  });

  it('rejects a corrupt marker by default and recovers via path when asked', async () => {
    const folder = makeTempFolder();
    try {
      const normalized = normalizeWorkspacePath(folder);
      writeRawMarker(folder, '{ broken');
      const db = openDb({
        findByPath: () => ({ id: 'p1', name: '雾城', workspacePath: normalized }),
      });

      // §18.2：默认明确报错，绝不静默覆盖。
      await expect(openWorldFolder(db, folder)).rejects.toMatchObject({
        code: 'WORKSPACE_CORRUPT',
      });
      const { project } = await openWorldFolder(db, folder, { onCorrupt: 'recover' });
      expect(project).toMatchObject({ id: 'p1' });
      expect(readWorkspaceMarker(folder)).toMatchObject({ worldId: 'p1', name: '雾城' });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('cannot recover a corrupt marker when no project owns the path', async () => {
    const folder = makeTempFolder();
    try {
      writeRawMarker(folder, '{ broken');
      const db = openDb();
      await expect(openWorldFolder(db, folder, { onCorrupt: 'recover' })).rejects.toMatchObject({
        code: 'WORKSPACE_CORRUPT',
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('rejects an orphan worldId by default and creates a runtime copy when asked', async () => {
    const folder = makeTempFolder();
    try {
      writeWorkspaceMarker(folder, { id: 'p-gone', name: '消失的世界' });
      const db = openDb();

      // §18.3：文件存在但本机没有运行数据 → 明确提示，不得静默创建同名世界。
      await expect(openWorldFolder(db, folder)).rejects.toMatchObject({
        code: 'WORLD_NOT_FOUND',
      });
      // 运行副本沿用文件里的稳定 worldId，不改写 workspace.json 身份。
      const { project } = await openWorldFolder(db, folder, { onOrphan: 'create' });
      expect(project).toMatchObject({ id: 'p-gone', name: '消失的世界' });
      expect(db.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: 'p-gone' }),
        }),
      );
      expect(readWorkspaceMarker(folder)).toMatchObject({ worldId: 'p-gone' });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('refuses to open a copied folder while the original still holds the same worldId', async () => {
    const original = makeTempFolder('zivith-copy-a-');
    const copy = makeTempFolder('zivith-copy-b-');
    try {
      // 复制整个文件夹：两处都有同一 worldId 的标记，original 仍是数据库绑定。
      writeWorkspaceMarker(original, { id: 'p1', name: '雾城' });
      writeWorkspaceMarker(copy, { id: 'p1', name: '雾城' });
      const db = openDb({
        findById: (id) =>
          id === 'p1' ? { id: 'p1', name: '雾城', workspacePath: original } : null,
      });
      // 「当前位置」漂移需要用户显式选择，不静默改绑到副本。
      await expect(openWorldFolder(db, copy)).rejects.toMatchObject({
        code: 'WORLD_IDENTITY_CONFLICT',
        details: { reason: 'duplicate_folder' },
      });
    } finally {
      fs.rmSync(original, { recursive: true, force: true });
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });

  it('switches to the copy via explicit rebind while the original still exists', async () => {
    const original = makeTempFolder('zivith-copy-a-');
    const copy = makeTempFolder('zivith-copy-b-');
    try {
      writeWorkspaceMarker(original, { id: 'p1', name: '雾城' });
      writeWorkspaceMarker(copy, { id: 'p1', name: '雾城' });
      const normalizedCopy = normalizeWorkspacePath(copy);
      const update = vi.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        name: '雾城',
        workspacePath: data.workspacePath,
      }));
      const db = openDb({
        findById: (id) =>
          id === 'p1' ? { id: 'p1', name: '雾城', workspacePath: original } : null,
        update,
      });

      await expect(openWorldFolder(db, copy)).rejects.toMatchObject({
        code: 'WORLD_IDENTITY_CONFLICT',
      });
      const { project } = await openWorldFolder(db, copy, { rebindProjectId: 'p1' });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { workspacePath: normalizedCopy },
      });
      expect(project.workspacePath).toBe(normalizedCopy);
      expect(readWorkspaceMarker(copy)).toMatchObject({ worldId: 'p1' });
    } finally {
      fs.rmSync(original, { recursive: true, force: true });
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });

  it('reports a world identity conflict instead of auto-merging (§18.4)', async () => {
    const folder = makeTempFolder();
    try {
      writeWorkspaceMarker(folder, { id: 'p1', name: '文件世界' });
      const db = openDb({
        findById: (id) =>
          id === 'p1' ? { id: 'p1', name: '文件世界', workspacePath: null } : null,
        findByPath: () => ({ id: 'p2', name: '数据库世界', workspacePath: folder }),
      });
      await expect(openWorldFolder(db, folder)).rejects.toMatchObject({
        code: 'WORLD_IDENTITY_CONFLICT',
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('rebinds the folder to a user-chosen project (重新定位)', async () => {
    const folder = makeTempFolder();
    try {
      const normalized = normalizeWorkspacePath(folder);
      const update = vi.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        name: '选中的世界',
        workspacePath: data.workspacePath,
      }));
      const db = openDb({
        findById: (id) =>
          id === 'p-target' ? { id: 'p-target', name: '选中的世界', workspacePath: null } : null,
        update,
      });

      const { project } = await openWorldFolder(db, folder, { rebindProjectId: 'p-target' });
      expect(project).toMatchObject({ id: 'p-target', workspacePath: normalized });
      expect(readWorkspaceMarker(folder)).toMatchObject({ worldId: 'p-target' });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('404s when the rebind target does not exist', async () => {
    const folder = makeTempFolder();
    try {
      const db = openDb();
      await expect(
        openWorldFolder(db, folder, { rebindProjectId: 'p-missing' }),
      ).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('refuses rebinding onto a folder owned by another local world (§19 via worldId)', async () => {
    const folder = makeTempFolder();
    try {
      // 目标文件夹是另一个本地存活世界的副本/正本：绝不覆盖其身份。
      writeWorkspaceMarker(folder, { id: 'p-other', name: '别人的世界' });
      const db = openDb({
        findById: (id) => {
          if (id === 'p-target') return { id: 'p-target', name: '选中的世界', workspacePath: null };
          if (id === 'p-other') return { id: 'p-other', name: '别人的世界', workspacePath: null };
          return null;
        },
      });
      await expect(
        openWorldFolder(db, folder, { rebindProjectId: 'p-target' }),
      ).rejects.toMatchObject({ code: 'WORLD_IDENTITY_CONFLICT' });
      expect(readWorkspaceMarker(folder)).toMatchObject({ worldId: 'p-other' });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('allows rebinding onto an orphan foreign marker (§18.3 重新绑定)', async () => {
    const folder = makeTempFolder();
    try {
      const normalized = normalizeWorkspacePath(folder);
      // 文件夹带的外来 worldId 在本机没有运行数据：显式重绑允许改写。
      writeWorkspaceMarker(folder, { id: 'p-foreign', name: '外来身份' });
      const db = openDb({
        findById: (id) =>
          id === 'p-target' ? { id: 'p-target', name: '选中的世界', workspacePath: null } : null,
      });
      const { project } = await openWorldFolder(db, folder, { rebindProjectId: 'p-target' });
      expect(project).toMatchObject({ id: 'p-target', workspacePath: normalized });
      expect(readWorkspaceMarker(folder)).toMatchObject({
        worldId: 'p-target',
        name: '选中的世界',
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('refuses rebinding onto a corrupt marker instead of overwriting it', async () => {
    const folder = makeTempFolder();
    try {
      writeRawMarker(folder, '{ broken');
      const db = openDb({
        findById: (id) =>
          id === 'p-target' ? { id: 'p-target', name: '选中的世界', workspacePath: null } : null,
      });
      await expect(
        openWorldFolder(db, folder, { rebindProjectId: 'p-target' }),
      ).rejects.toMatchObject({ code: 'WORKSPACE_CORRUPT' });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('restores an archived project matched by marker id', async () => {
    const folder = makeTempFolder();
    try {
      writeWorkspaceMarker(folder, { id: 'p-archived', name: '旧世界' });
      const update = vi.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        name: '旧世界',
        ...(data.workspacePath !== undefined ? { workspacePath: data.workspacePath } : {}),
        ...(data.deletedAt !== undefined ? { deletedAt: data.deletedAt } : {}),
      }));
      const db = openDb({
        // 归档项目只应被 NOT { deletedAt: null } 查询命中。
        findById: (id, where) =>
          id === 'p-archived' && 'NOT' in where
            ? { id: 'p-archived', name: '旧世界', deletedAt: 1 }
            : null,
        update,
      });
      const { project } = await openWorldFolder(db, folder);
      expect(update).toHaveBeenCalledWith({
        where: { id: 'p-archived' },
        data: { deletedAt: null },
      });
      expect(project).toMatchObject({ id: 'p-archived' });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('syncWorkspaceMarkerName', () => {
  it('rewrites the marker name for a bound folder and ignores unbound projects', () => {
    const folder = makeTempFolder();
    try {
      writeWorkspaceMarker(folder, { id: 'p1', name: '旧名' });
      syncWorkspaceMarkerName({ id: 'p1', name: '新名', workspacePath: folder });
      expect(readWorkspaceMarker(folder)).toMatchObject({ worldId: 'p1', name: '新名' });
      expect(() =>
        syncWorkspaceMarkerName({ id: 'p2', name: '未绑定', workspacePath: null }),
      ).not.toThrow();
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
