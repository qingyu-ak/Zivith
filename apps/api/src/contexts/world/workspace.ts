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
  if (!fs.existsSync(normalized)) {
    throw new ApiError(400, 'FOLDER_NOT_FOUND', '文件夹不存在');
  }
  const stat = fs.statSync(normalized);
  if (!stat.isDirectory()) {
    throw new ApiError(400, 'FOLDER_NOT_FOUND', '请选择一个文件夹');
  }
  const real = fs.realpathSync.native(normalized);
  if (process.platform === 'win32') {
    return real.replace(/^([a-zA-Z]):/, (_match, letter: string) => `${letter.toUpperCase()}:`);
  }
  return real;
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
      settings: seed
        ? { creator_layer: true, workspace_seed: true }
        : { creator_layer: true },
      members: { create: { userId: input.memberUserId ?? ownerId, role: 'owner' } },
    },
  });
  await db.projectTimeline.create({
    data: { projectId: project.id, name: 'World Line' },
  });
  return project;
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

export async function openWorldFolder(
  db: Db,
  folderPath: string,
  memberUserId?: string | null,
) {
  const workspacePath = normalizeWorkspacePath(folderPath);
  const ownerId = await resolveLocalOwner(db);

  let project = await db.project.findFirst({
    where: { ownerId, workspacePath, deletedAt: null },
  });
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
      memberUserId: memberUserId ?? null,
      seed: false,
      workspacePath,
    });
  }

  let thread = await db.creatorChatThread.findFirst({
    where: { projectId: project.id, state: 'active' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!thread) {
    thread = await db.creatorChatThread.create({
      data: {
        projectId: project.id,
        title: null,
        state: 'active',
      },
    });
  }
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
