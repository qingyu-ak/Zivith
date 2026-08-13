import type { Prisma, PrismaClient } from '@zivith/database';
import { ApiError } from '../../errors.js';

/**
 * ADR-0013 local single-user mode: no login, no auth.
 *
 * `Project.ownerId` is a required FK to `User`, so the creator layer resolves a
 * stable local owner record (get-or-create) instead of a signed-in identity.
 * The password hash is a sentinel — local mode never authenticates.
 */
export const LOCAL_OWNER_EMAIL = 'local@zivith.local';
const LOCAL_OWNER_DISPLAY_NAME = 'Local Creator';

type LocalDb = PrismaClient | Prisma.TransactionClient;

export async function resolveLocalOwner(db: LocalDb): Promise<string> {
  const existing = await db.user.findFirst({
    where: { email: LOCAL_OWNER_EMAIL, deletedAt: null },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await db.user.create({
    data: {
      email: LOCAL_OWNER_EMAIL,
      passwordHash: '!local-single-user-disabled-login!',
      displayName: LOCAL_OWNER_DISPLAY_NAME,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Membership stays as a cloud-mode extension point (ADR-0013).
 * v1 auto-grants the local session owner access to any project on this machine.
 */
export async function ensureProjectMember(
  db: LocalDb,
  userId: string,
  projectId: string,
  write = false,
) {
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true },
  });
  if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在');

  const member = await db.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, role: 'owner' },
    update: {},
  });
  if (write && member.role === 'viewer') {
    throw new ApiError(403, 'FORBIDDEN', '你无权修改该项目');
  }
  return member;
}
