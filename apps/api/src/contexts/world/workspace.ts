import fs from 'node:fs';
import path from 'node:path';
import type { Prisma, PrismaClient } from '@zivith/database';
import { ApiError } from '../../errors.js';
import { resolveLocalOwner } from './local-user.js';

/** Placeholder name for a world opened as an empty Cursor-style folder. */
export const WORKSPACE_SEED_NAME = '新世界';

type Db = PrismaClient | Prisma.TransactionClient;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isWorkspaceSeed(project: { settings?: unknown }): boolean {
  return asRecord(project.settings)?.workspace_seed === true;
}

/** Stable identity for a user-selected absolute folder (Windows drive letter uppercased). */
export function normalizeWorkspacePath(raw: string): string {
  const trimmed = raw.trim().replace(/\0/g, '');
  if (!trimmed) throw new ApiError(400, 'FOLDER_PATH_REQUIRED', '请选择一个文件夹');
  if (!path.isAbsolute(trimmed)) {
    throw new ApiError(400, 'FOLDER_PATH_REQUIRED', '请提供文件夹的绝对路径');
  }
  const normalized = path.normalize(trimmed);
  let real: string;
  try {
    if (!fs.existsSync(normalized)) {
      throw new ApiError(400, 'FOLDER_NOT_FOUND', '文件夹不存在');
    }
    if (!fs.statSync(normalized).isDirectory()) {
      throw new ApiError(400, 'FOLDER_NOT_FOUND', '请选择一个文件夹');
    }
    real = fs.realpathSync.native(normalized);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(403, 'WORKSPACE_NOT_ACCESSIBLE', '无法读取该文件夹，请检查权限');
  }
  if (process.platform === 'win32') {
    return real.replace(/^([a-zA-Z]):/, (_match, letter: string) => `${letter.toUpperCase()}:`);
  }
  return real;
}

// ---------------------------------------------------------------------------
// .zivith/workspace.json（V1 世界身份标记）
//
// 格式（V1 规范）：
// {
//   "format": "zivith-workspace",
//   "formatVersion": 1,
//   "worldId": "<Project.id>",
//   "name": "...",
//   "createdAt": "ISO-8601",
//   "zivith": { "minVersion": "0.1.0" }
// }
// 兼容读取 Track W1 旧格式 { version, id, name }，写入始终用新格式。
// ---------------------------------------------------------------------------

export const WORKSPACE_MARKER_DIR = '.zivith';
export const WORKSPACE_FORMAT = 'zivith-workspace';
export const WORKSPACE_FORMAT_VERSION = 1;
export const WORKSPACE_MIN_VERSION = '0.1.0';

/** V1 只负责工程结构；目录内容随后续版本逐步文件化（不要求立即写入文件）。 */
export const WORKSPACE_BASE_DIRS = [
  'world',
  'characters',
  'locations',
  'stories',
  'scenes',
  'sources',
  'assets/images',
  'assets/audio',
  'assets/video',
] as const;

export interface WorkspaceMarker {
  formatVersion: number;
  worldId: string;
  name: string;
  createdAt: string | null;
}

function workspaceMarkerPath(workspacePath: string): string {
  return path.join(workspacePath, WORKSPACE_MARKER_DIR, 'workspace.json');
}

function parseWorkspaceMarker(raw: string): WorkspaceMarker | null {
  const parsed = asRecord(safeJsonParse(raw));
  if (!parsed) return null;
  const worldId =
    typeof parsed.worldId === 'string' && parsed.worldId
      ? parsed.worldId
      : typeof parsed.id === 'string'
        ? parsed.id
        : null;
  if (!worldId) return null;
  const formatVersion =
    typeof parsed.formatVersion === 'number'
      ? parsed.formatVersion
      : typeof parsed.version === 'number'
        ? parsed.version
        : WORKSPACE_FORMAT_VERSION;
  return {
    formatVersion,
    worldId,
    name: typeof parsed.name === 'string' ? parsed.name : '',
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : null,
  };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export type WorkspaceFolderInspect =
  { state: 'ok'; marker: WorkspaceMarker } | { state: 'corrupt' } | { state: 'not_a_world' };

/**
 * Distinguish "not a world" (no marker) from "corrupt world" (unreadable
 * marker) — MD §18.1/§18.2 need different dialogs, never a silent fallback.
 */
export function inspectWorkspaceFolder(workspacePath: string): WorkspaceFolderInspect {
  const markerFile = workspaceMarkerPath(workspacePath);
  let raw: string;
  try {
    raw = fs.readFileSync(markerFile, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === 'ENOENT') {
      // .zivith/ 存在但 workspace.json 缺失：半个世界工程，按损坏处理。
      return fs.existsSync(path.join(workspacePath, WORKSPACE_MARKER_DIR))
        ? { state: 'corrupt' }
        : { state: 'not_a_world' };
    }
    if (code === 'EISDIR') return { state: 'corrupt' };
    throw new ApiError(403, 'WORKSPACE_NOT_ACCESSIBLE', '无法读取该文件夹，请检查权限');
  }
  const marker = parseWorkspaceMarker(raw);
  return marker ? { state: 'ok', marker } : { state: 'corrupt' };
}

/** Missing or unreadable markers are not errors here: callers decide the fallback. */
export function readWorkspaceMarker(workspacePath: string): WorkspaceMarker | null {
  const inspect = inspectWorkspaceFolder(workspacePath);
  return inspect.state === 'ok' ? inspect.marker : null;
}

/**
 * Best effort refresh (open/rename): the database stays authoritative and the
 * next open rewrites the marker. Strict writes go through initializeWorldFolder.
 */
export function writeWorkspaceMarker(
  workspacePath: string,
  marker: { id: string; name: string },
): void {
  try {
    if (!fs.existsSync(workspacePath)) return;
    initializeWorldFolder(workspacePath, { worldId: marker.id, name: marker.name });
  } catch {
    return;
  }
}

/**
 * Create `.zivith/` + V1 base directories and write workspace.json.
 * Strict: any filesystem failure throws (创建/恢复必须成功或明确报错，MD §18/§20).
 * Idempotent: existing directories are kept; an existing readable marker keeps
 * its createdAt so recovery does not rewrite world history.
 */
export function initializeWorldFolder(
  workspacePath: string,
  world: { worldId: string; name: string },
): WorkspaceMarker {
  try {
    if (!fs.existsSync(workspacePath)) {
      throw new ApiError(400, 'FOLDER_NOT_FOUND', '文件夹不存在');
    }
    fs.mkdirSync(path.join(workspacePath, WORKSPACE_MARKER_DIR), { recursive: true });
    for (const dir of WORKSPACE_BASE_DIRS) {
      fs.mkdirSync(path.join(workspacePath, dir), { recursive: true });
    }
    const previous = readWorkspaceMarker(workspacePath);
    const marker: WorkspaceMarker = {
      formatVersion: WORKSPACE_FORMAT_VERSION,
      worldId: world.worldId,
      name: world.name,
      createdAt: previous?.createdAt ?? new Date().toISOString(),
    };
    const payload = {
      format: WORKSPACE_FORMAT,
      ...marker,
      zivith: { minVersion: WORKSPACE_MIN_VERSION },
    };
    fs.writeFileSync(
      workspaceMarkerPath(workspacePath),
      `${JSON.stringify(payload, null, 2)}\n`,
      'utf8',
    );
    return marker;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      'WORKSPACE_WRITE_FAILED',
      '无法写入世界文件夹，请检查磁盘空间与文件夹权限',
      String(error),
    );
  }
}

/** Keep the marker's display name in sync after renaming a project bound to a folder. */
export function syncWorkspaceMarkerName(project: {
  id: string;
  name: string;
  workspacePath: string | null;
}): void {
  if (!project.workspacePath) return;
  writeWorkspaceMarker(project.workspacePath, { id: project.id, name: project.name });
}

export async function createWorldProject(
  db: Db,
  input: {
    name?: string;
    description?: string | null;
    memberUserId?: string | null;
    seed?: boolean;
    workspacePath?: string | null;
    worldview?: Prisma.InputJsonValue;
  } = {},
) {
  const ownerId = await resolveLocalOwner(db);
  const seed = input.seed !== false && !input.name;
  const project = await db.project.create({
    data: {
      ownerId,
      name: input.name?.trim() || WORKSPACE_SEED_NAME,
      description: input.description ?? null,
      workspacePath: input.workspacePath ?? null,
      ...(input.worldview ? { worldview: input.worldview } : {}),
      defaults: { language: 'zh-CN' },
      settings: seed ? { creator_layer: true, workspace_seed: true } : { creator_layer: true },
      members: { create: { userId: input.memberUserId ?? ownerId, role: 'owner' } },
    },
  });
  await db.projectTimeline.create({
    data: { projectId: project.id, name: 'World Line' },
  });
  return project;
}

async function ensureActiveThread(db: Db, projectId: string) {
  const existing = await db.creatorChatThread.findFirst({
    where: { projectId, state: 'active' },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) return existing;
  return db.creatorChatThread.create({
    data: { projectId, title: null, state: 'active' },
  });
}

export async function createWorldWorkspace(
  db: Db,
  input: { title?: string | null; memberUserId?: string | null } = {},
) {
  const project = await createWorldProject(db, {
    seed: true,
    memberUserId: input.memberUserId ?? null,
  });
  const thread = await db.creatorChatThread.create({
    data: {
      projectId: project.id,
      title: input.title ?? null,
      state: 'active',
    },
  });
  return { project, thread };
}

// ---------------------------------------------------------------------------
// 打开 / 创建 / 重绑定（MD §7/§8/§9/§18/§19）
// ---------------------------------------------------------------------------

export interface OpenWorldFolderOptions {
  memberUserId?: string | null;
  /** §18.1 文件夹没有 .zivith：'error' 拒绝（默认），'import' 明确导入为新世界。 */
  onMissing?: 'error' | 'import';
  /** §18.2 workspace.json 损坏：'error' 拒绝（默认），'recover' 按路径重绑并重写标记。 */
  onCorrupt?: 'error' | 'recover';
  /** §18.3 worldId 在本机数据库不存在：'error' 拒绝（默认），'create' 创建运行副本。 */
  onOrphan?: 'error' | 'create';
  /** §18.3/§19 把文件夹显式绑定到用户选定的项目（重新定位）。 */
  rebindProjectId?: string;
}

async function findActiveProjectByPath(db: Db, ownerId: string, workspacePath: string) {
  return db.project.findFirst({
    where: { ownerId, workspacePath, deletedAt: null },
  });
}

/** §18.4 / §19：一个文件夹在同一时刻只能属于一个本地世界。 */
async function requireNoOtherPathOwner(
  db: Db,
  ownerId: string,
  workspacePath: string,
  worldId: string,
) {
  const pathOwner = await findActiveProjectByPath(db, ownerId, workspacePath);
  if (pathOwner && pathOwner.id !== worldId) {
    throw new ApiError(
      409,
      'WORLD_IDENTITY_CONFLICT',
      `检测到世界身份冲突：此文件夹在数据库中绑定的是「${pathOwner.name}」，而世界文件指向另一个世界。请先处理冲突，Zivith 不会自动合并。`,
    );
  }
  return pathOwner;
}

export async function openWorldFolder(
  db: Db,
  folderPath: string,
  options: OpenWorldFolderOptions = {},
) {
  const workspacePath = normalizeWorkspacePath(folderPath);
  const ownerId = await resolveLocalOwner(db);
  const inspect = inspectWorkspaceFolder(workspacePath);

  if (options.rebindProjectId) {
    return openWithRebind(db, workspacePath, ownerId, options.rebindProjectId);
  }

  // §18.2 损坏：默认拒绝；'recover' 才按路径尝试重绑并重写标记。
  if (inspect.state === 'corrupt') {
    if (options.onCorrupt !== 'recover') {
      throw new ApiError(409, 'WORKSPACE_CORRUPT', 'Zivith 世界配置文件无法读取。');
    }
    let project = await findActiveProjectByPath(db, ownerId, workspacePath);
    if (!project) {
      const archived = await db.project.findFirst({
        where: { ownerId, workspacePath, NOT: { deletedAt: null } },
        orderBy: { deletedAt: 'desc' },
      });
      if (archived) {
        project = await db.project.update({
          where: { id: archived.id },
          data: { deletedAt: null },
        });
      }
    }
    if (!project) {
      throw new ApiError(
        409,
        'WORKSPACE_CORRUPT',
        'Zivith 世界配置文件无法读取，也无法按文件夹路径恢复。',
      );
    }
    await requireNoOtherPathOwner(db, ownerId, workspacePath, project.id);
    initializeWorldFolder(workspacePath, { worldId: project.id, name: project.name });
    if (project.workspacePath !== workspacePath) {
      project = await db.project.update({
        where: { id: project.id },
        data: { workspacePath },
      });
    }
    const thread = await ensureActiveThread(db, project.id);
    return { project, thread };
  }

  // §18.1 不是 Zivith 世界：默认拒绝，绝不静默把普通文件夹当世界。
  // 用户明确选择导入后：路径已被本机项目绑定时收回原绑定（§18.1 [打开]），
  // 否则创建新世界（§18.1 [导入为新世界]）——两种情况都补写 workspace.json。
  if (inspect.state === 'not_a_world') {
    if (options.onMissing !== 'import') {
      throw new ApiError(409, 'NOT_A_ZIVITH_WORLD', '这不是一个 Zivith 世界。');
    }
    let project = await findActiveProjectByPath(db, ownerId, workspacePath);
    if (!project) {
      const archived = await db.project.findFirst({
        where: { ownerId, workspacePath, NOT: { deletedAt: null } },
        orderBy: { deletedAt: 'desc' },
      });
      if (archived) {
        project = await db.project.update({
          where: { id: archived.id },
          data: { deletedAt: null },
        });
      }
    }
    if (!project) {
      project = await createWorldProject(db, {
        name: path.basename(workspacePath) || WORKSPACE_SEED_NAME,
        memberUserId: options.memberUserId ?? null,
        seed: false,
        workspacePath,
      });
    }
    initializeWorldFolder(workspacePath, { worldId: project.id, name: project.name });
    const thread = await ensureActiveThread(db, project.id);
    return { project, thread };
  }

  // 标记有效：worldId 优先于路径（移动 / 改名 / 换盘符后仍然识别，MD §9）。
  const marker = inspect.marker;
  let project = await db.project.findFirst({
    where: { id: marker.worldId, ownerId, deletedAt: null },
  });
  if (!project) {
    const archived = await db.project.findFirst({
      where: { id: marker.worldId, ownerId, NOT: { deletedAt: null } },
    });
    if (archived) {
      project = await db.project.update({
        where: { id: archived.id },
        data: { deletedAt: null },
      });
    }
  }

  if (project) {
    await requireNoOtherPathOwner(db, ownerId, workspacePath, project.id);
    if (project.workspacePath !== workspacePath) {
      project = await db.project.update({
        where: { id: project.id },
        data: { workspacePath },
      });
    }
    writeWorkspaceMarker(workspacePath, { id: project.id, name: project.name });
    const thread = await ensureActiveThread(db, project.id);
    return { project, thread };
  }

  // §18.3 worldId 在本机没有运行数据：明确提示，不得静默创建同名世界。
  if (options.onOrphan !== 'create') {
    throw new ApiError(404, 'WORLD_NOT_FOUND', '这个世界文件存在，但当前本机没有对应的运行数据。');
  }
  project = await createWorldProject(db, {
    name: marker.name || path.basename(workspacePath) || WORKSPACE_SEED_NAME,
    memberUserId: options.memberUserId ?? null,
    seed: false,
    workspacePath,
  });
  // 运行副本获得新的本地 worldId，标记随之改写以保持文件与数据库一致。
  initializeWorldFolder(workspacePath, { worldId: project.id, name: project.name });
  const thread = await ensureActiveThread(db, project.id);
  return { project, thread };
}

/** §18.3 [重新绑定] / §19 [重新定位]：把文件夹显式绑到用户选定的项目。 */
async function openWithRebind(
  db: Db,
  workspacePath: string,
  ownerId: string,
  rebindProjectId: string,
) {
  let project = await db.project.findFirst({
    where: { id: rebindProjectId, ownerId, deletedAt: null },
  });
  if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在');
  await requireNoOtherPathOwner(db, ownerId, workspacePath, project.id);
  initializeWorldFolder(workspacePath, { worldId: project.id, name: project.name });
  if (project.workspacePath !== workspacePath) {
    project = await db.project.update({
      where: { id: project.id },
      data: { workspacePath },
    });
  }
  const thread = await ensureActiveThread(db, project.id);
  return { project, thread };
}

/**
 * §7 新建世界：文件夹 → 检查 → 初始化 .zivith/ + 基础目录 → 数据库 World，
 * 两侧使用同一个 worldId（= Project.id）。数据库行先建、文件夹初始化失败时
 * 补偿删除，避免留下无文件夹的半成品。
 */
export async function createWorldInFolder(
  db: Db,
  input: {
    folderPath: string;
    name?: string;
    description?: string | null;
    memberUserId?: string | null;
  },
) {
  const workspacePath = normalizeWorkspacePath(input.folderPath);
  const inspect = inspectWorkspaceFolder(workspacePath);
  if (inspect.state === 'ok') {
    throw new ApiError(
      409,
      'WORKSPACE_ALREADY_WORLD',
      '该文件夹已经是一个 Zivith 世界，请直接打开',
    );
  }
  if (inspect.state === 'corrupt') {
    throw new ApiError(
      409,
      'WORKSPACE_CORRUPT',
      '该文件夹存在无法读取的 Zivith 配置，请先恢复或选择其他文件夹',
    );
  }
  const ownerId = await resolveLocalOwner(db);
  const existing = await db.project.findFirst({ where: { ownerId, workspacePath } });
  if (existing) {
    throw new ApiError(
      409,
      'WORLD_PATH_CONFLICT',
      '该文件夹已绑定过世界项目，请先打开或移除旧绑定',
    );
  }
  const project = await createWorldProject(db, {
    name: input.name?.trim() || path.basename(workspacePath) || WORKSPACE_SEED_NAME,
    description: input.description ?? null,
    memberUserId: input.memberUserId ?? null,
    seed: false,
    workspacePath,
  });
  try {
    initializeWorldFolder(workspacePath, { worldId: project.id, name: project.name });
  } catch (error) {
    await db.project.delete({ where: { id: project.id } });
    throw error;
  }
  const thread = await ensureActiveThread(db, project.id);
  return { project, thread };
}

export async function archiveWorldWorkspace(db: Db, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在');

  await db.project.update({
    where: { id: projectId },
    data: { deletedAt: new Date() },
  });
  await db.creatorChatThread.updateMany({
    where: { projectId },
    data: { state: 'archived' },
  });
  return project;
}

export async function archiveCreatorChat(db: Db, threadId: string) {
  const thread = await db.creatorChatThread.findFirst({
    where: { id: threadId, state: 'active' },
    select: { id: true, projectId: true },
  });
  if (!thread) throw new ApiError(404, 'THREAD_NOT_FOUND', '对话不存在');
  await db.creatorChatThread.update({
    where: { id: threadId },
    data: { state: 'archived' },
  });
  return thread;
}

export async function claimWorkspaceSeed(
  db: Db,
  projectId: string,
  input: {
    name: string;
    description: string | null;
    worldview?: Prisma.InputJsonValue;
  },
) {
  return db.project.update({
    where: { id: projectId },
    data: {
      name: input.name,
      description: input.description,
      ...(input.worldview ? { worldview: input.worldview } : {}),
      settings: { creator_layer: true },
    },
  });
}
