import type { Prisma, PrismaClient } from '@zivith/database';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Atomically allocate the next ChangeEvent.sequence for a Project.
 * Uses INSERT … ON CONFLICT so concurrent callers never share a value.
 */
export async function allocateProjectSequence(db: Db, projectId: string): Promise<bigint> {
  const rows = await db.$queryRaw<Array<{ last_value: bigint }>>`
    INSERT INTO project_sequences (project_id, last_value)
    VALUES (${projectId}, 1)
    ON CONFLICT (project_id)
    DO UPDATE SET last_value = project_sequences.last_value + 1
    RETURNING last_value
  `;
  const value = rows[0]?.last_value;
  if (value === undefined) {
    throw new Error(`Failed to allocate project sequence for ${projectId}`);
  }
  return value;
}
