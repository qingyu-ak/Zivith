import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@zivith/database';
import {
  serializeAppearanceVariantSnapshot,
  serializeHistorySnapshot,
  serializeOutputSnapshot,
  serializePromptVersionSnapshot,
  serializeShotSnapshot,
  serializeVisualRequirementSnapshot,
  type HistoryEntityType,
} from '@zivith/domain';
import { allocateProjectSequence } from './project-sequence.js';

type Db = PrismaClient;

export interface BaselineBackfillOptions {
  /** Limit to one Project; default all Projects. */
  projectId?: string;
  /** Dry-run counts without writing. */
  dryRun?: boolean;
}

export interface BaselineBackfillResult {
  scanned: number;
  created: number;
  skipped: number;
  byType: Record<HistoryEntityType, { scanned: number; created: number; skipped: number }>;
}

type Candidate = {
  entityType: HistoryEntityType;
  entityId: string;
  projectId: string;
  row: Record<string, unknown>;
  occurredAt: Date;
};

function emptyCounts(): BaselineBackfillResult['byType'] {
  return {
    shot: { scanned: 0, created: 0, skipped: 0 },
    prompt_version: { scanned: 0, created: 0, skipped: 0 },
    output: { scanned: 0, created: 0, skipped: 0 },
    appearance_variant: { scanned: 0, created: 0, skipped: 0 },
    visual_requirement: { scanned: 0, created: 0, skipped: 0 },
  };
}

async function hasAnyRevision(
  db: Db,
  entityType: HistoryEntityType,
  entityId: string,
): Promise<boolean> {
  const existing = await db.entityRevision.findFirst({
    where: { entityType, entityId },
    select: { id: true },
  });
  return Boolean(existing);
}

async function loadCandidates(db: Db, projectId?: string): Promise<Candidate[]> {
  const out: Candidate[] = [];

  const shots = await db.shot.findMany({
    where: {
      deletedAt: null,
      ...(projectId ? { projectId } : {}),
    },
  });
  for (const shot of shots) {
    out.push({
      entityType: 'shot',
      entityId: shot.id,
      projectId: shot.projectId,
      row: shot as unknown as Record<string, unknown>,
      occurredAt: shot.createdAt,
    });
  }

  const promptVersions = await db.promptVersion.findMany({
    ...(projectId ? { where: { shot: { projectId } } } : {}),
    include: { shot: { select: { projectId: true } } },
  });
  for (const row of promptVersions) {
    out.push({
      entityType: 'prompt_version',
      entityId: row.id,
      projectId: row.shot.projectId,
      row: row as unknown as Record<string, unknown>,
      occurredAt: row.createdAt,
    });
  }

  const outputs = await db.output.findMany({
    ...(projectId ? { where: { shot: { projectId } } } : {}),
    include: { shot: { select: { projectId: true } } },
  });
  for (const row of outputs) {
    out.push({
      entityType: 'output',
      entityId: row.id,
      projectId: row.shot.projectId,
      row: row as unknown as Record<string, unknown>,
      occurredAt: row.createdAt,
    });
  }

  const variants = await db.assetAppearanceVariant.findMany({
    where: {
      deletedAt: null,
      ...(projectId ? { asset: { projectId } } : {}),
    },
    include: { asset: { select: { projectId: true } } },
  });
  for (const row of variants) {
    out.push({
      entityType: 'appearance_variant',
      entityId: row.id,
      projectId: row.asset.projectId,
      row: row as unknown as Record<string, unknown>,
      occurredAt: row.createdAt,
    });
  }

  const requirements = await db.visualAssetRequirement.findMany({
    where: {
      deletedAt: null,
      ...(projectId ? { scene: { projectId } } : {}),
    },
    include: { scene: { select: { projectId: true } } },
  });
  for (const row of requirements) {
    out.push({
      entityType: 'visual_requirement',
      entityId: row.id,
      projectId: row.scene.projectId,
      row: row as unknown as Record<string, unknown>,
      occurredAt: row.createdAt,
    });
  }

  return out;
}

function serializeCandidate(candidate: Candidate) {
  switch (candidate.entityType) {
    case 'shot':
      return serializeShotSnapshot(candidate.row);
    case 'prompt_version':
      return serializePromptVersionSnapshot(candidate.row);
    case 'output':
      return serializeOutputSnapshot(candidate.row);
    case 'appearance_variant':
      return serializeAppearanceVariantSnapshot(candidate.row);
    case 'visual_requirement':
      return serializeVisualRequirementSnapshot(candidate.row);
    default: {
      const _exhaustive: never = candidate.entityType;
      throw new Error(`Unsupported entity type: ${_exhaustive}`);
    }
  }
}

async function writeBaseline(db: Db, candidate: Candidate): Promise<void> {
  const envelope = serializeCandidate(candidate);
  // Keep dispatch aligned with public API (also validates schema_version).
  serializeHistorySnapshot(candidate.entityType, candidate.row);

  const revisionId = randomUUID();
  const eventId = randomUUID();
  const idempotencyKey = `baseline:${candidate.entityType}:${candidate.entityId}`;

  await db.$transaction(async (tx) => {
    const existing = await tx.entityRevision.findFirst({
      where: {
        entityType: candidate.entityType,
        entityId: candidate.entityId,
      },
      select: { id: true },
    });
    if (existing) return;

    const sequence = await allocateProjectSequence(tx, candidate.projectId);
    await tx.entityRevision.create({
      data: {
        id: revisionId,
        projectId: candidate.projectId,
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        revision: 1,
        schemaVersion: envelope.schema_version,
        snapshot: envelope.snapshot as Prisma.InputJsonValue,
        snapshotHash: envelope.snapshot_hash,
        changeKind: 'baseline',
        changedFields: [],
        createdAt: candidate.occurredAt,
      },
    });
    await tx.changeEvent.create({
      data: {
        id: eventId,
        projectId: candidate.projectId,
        sequence,
        eventType: 'entity.created',
        schemaVersion: 1,
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        entityRevisionId: revisionId,
        actorType: 'system',
        sourceType: 'baseline_backfill',
        sourceId: 'track-h-h2',
        idempotencyKey,
        payload: {
          change_kind: 'baseline',
          schema_version: envelope.schema_version,
          snapshot_hash: envelope.snapshot_hash,
        },
        occurredAt: candidate.occurredAt,
      },
    });
  });
}

/**
 * Idempotent baseline backfill for Track H H1 entity types.
 * Does not change business tables or switch any read path.
 */
export async function backfillEntityBaselines(
  db: Db,
  options: BaselineBackfillOptions = {},
): Promise<BaselineBackfillResult> {
  const byType = emptyCounts();
  const candidates = await loadCandidates(db, options.projectId);
  let created = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    byType[candidate.entityType].scanned += 1;
    const exists = await hasAnyRevision(db, candidate.entityType, candidate.entityId);
    if (exists) {
      skipped += 1;
      byType[candidate.entityType].skipped += 1;
      continue;
    }
    if (options.dryRun) {
      created += 1;
      byType[candidate.entityType].created += 1;
      continue;
    }
    await writeBaseline(db, candidate);
    created += 1;
    byType[candidate.entityType].created += 1;
  }

  return {
    scanned: candidates.length,
    created,
    skipped,
    byType,
  };
}
