import type { Prisma } from '@zivith/database';

/**
 * ADR-0013 local single-user mode: no login, no auth.
 *
 * `Project.ownerId` is a required FK to `User`, so the creator layer resolves a
 * stable local owner record (get-or-create) instead of a signed-in identity.
 * The password hash is a sentinel — local mode never authenticates.
 */
const LOCAL_OWNER_EMAIL = 'local@zivith.local';
const LOCAL_OWNER_DISPLAY_NAME = 'Local Creator';

export async function resolveLocalOwner(
  db: Prisma.TransactionClient,
): Promise<string> {
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
