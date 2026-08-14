/**
 * One-shot Track H H2 baseline backfill.
 *
 * Usage:
 *   pnpm --filter @zivith/api exec tsx scripts/backfill-entity-baselines.ts
 *   pnpm --filter @zivith/api exec tsx scripts/backfill-entity-baselines.ts --dry-run
 *   pnpm --filter @zivith/api exec tsx scripts/backfill-entity-baselines.ts --project <uuid>
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { prisma } from '@zivith/database';
import { backfillEntityBaselines } from '../src/contexts/history/index.js';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const projectId = argValue('--project');
  const result = await backfillEntityBaselines(prisma, {
    dryRun,
    ...(projectId ? { projectId } : {}),
  });
  console.log(JSON.stringify({ dryRun, projectId: projectId ?? null, ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
