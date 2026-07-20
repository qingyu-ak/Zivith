import { PrismaClient } from '@prisma/client';

const globalDatabase = globalThis as unknown as { prisma?: PrismaClient };
const nodeEnvironment = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env;

export const prisma = globalDatabase.prisma ?? new PrismaClient();

if (nodeEnvironment?.NODE_ENV !== 'production') globalDatabase.prisma = prisma;

export * from '@prisma/client';
