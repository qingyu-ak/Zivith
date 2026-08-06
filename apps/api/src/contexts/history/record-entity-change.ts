import { createHash, randomUUID } from 'node:crypto';
import type { EntityChangeKind, Prisma, PrismaClient } from '@zivith/database';
import {
  serializeHistorySnapshot,
  type ChangeEventType,
  type HistoryEntityType,
} from '@zivith/domain';
import { ApiError } from '../../errors.js';
import { historyWriteModeFor, type HistoryWriteMode } from './flags.js';
import { allocateProjectSequence } from './project-sequence.js';

type Db = PrismaClient | Prisma.TransactionClient;

export interface RecordEntityChangeInput {
  projectId: string;
  entityType: HistoryEntityType;
  entityId: string;
  /** Current business row after the write (Prisma camelCase or snake_case). */
  row: Record<string, unknown>;
  changeKind: EntityChangeKind;
  eventType: ChangeEventType;
  idempotencyKey: string;
  /** When set, must equal the current head revision (0 if none). */
  expectedRevision?: number;
  actorId?: string | null;
  actorType?: 'user' | 'system' | 'agent';
  sourceType?: string;
  sourceId?: string;
  correlationId?: string;
  causationId?: string;
  changedFields?: string[];
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}

export interface RecordEntityChangeResult {
  mode: HistoryWriteMode;
  skipped: boolean;
  reason?: 'flag_off' | 'unchanged_hash' | 'idempotent_replay' | 'shadow_failed';
  revisionId?: string;
  revision?: number;
  changeEventId?: string;
  sequence?: bigint;
  snapshotHash?: string;
}

function payloadFingerprint(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function headRevision(
  db: Db,
  entityType: HistoryEntityType,
  entityId: string,
): Promise<{ id: string; revision: number; snapshotHash: string } | null> {
  const row = await db.entityRevision.findFirst({
    where: { entityType, entityId, branchId: null },
    orderBy: { revision: 'desc' },
    select: { id: true, revision: true, snapshotHash: true },
  });
  return row;
}

/**
 * Append EntityRevision + ChangeEvent according to the Entity's write mode.
 *
 * - `off`: no-op
 * - `shadow` / `dual`: write history (caller should pass the same `tx` for true dual-write)
 *
 * Throws `409 REVISION_CONFLICT` / `409 IDEMPOTENCY_KEY_REUSED` in dual/shadow when checks fail.
 * Use {@link maybeRecordEntityChange} when shadow failures must not fail the business request.
 */
export async function recordEntityChange(
  db: Db,
  input: RecordEntityChangeInput,
  options?: { mode?: HistoryWriteMode },
): Promise<RecordEntityChangeResult> {
  const mode = options?.mode ?? historyWriteModeFor(input.entityType);
  if (mode === 'off') {
    return { mode, skipped: true, reason: 'flag_off' };
  }

  const envelope = serializeHistorySnapshot(input.entityType, input.row);
  const eventPayload = {
    change_kind: input.changeKind,
    schema_version: envelope.schema_version,
    snapshot_hash: envelope.snapshot_hash,
    ...(input.payload ?? {}),
  };
  const fingerprint = payloadFingerprint(eventPayload);

  const existingEvent = await db.changeEvent.findFirst({
    where: {
      projectId: input.projectId,
      idempotencyKey: input.idempotencyKey,
    },
  });
  if (existingEvent) {
    const prior = existingEvent.payload as Record<string, unknown> | null;
    const priorFp =
      prior && typeof prior === 'object'
        ? typeof prior.__fingerprint === 'string'
          ? prior.__fingerprint
          : payloadFingerprint(prior)
        : '';
    if (priorFp && priorFp !== fingerprint) {
      throw new ApiError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        '相同幂等键已用于不同的历史写入载荷',
      );
    }
    return {
      mode,
      skipped: true,
      reason: 'idempotent_replay',
      ...(existingEvent.entityRevisionId
        ? { revisionId: existingEvent.entityRevisionId }
        : {}),
      changeEventId: existingEvent.id,
      sequence: existingEvent.sequence,
      snapshotHash: envelope.snapshot_hash,
    };
  }

  const head = await headRevision(db, input.entityType, input.entityId);
  const currentRevision = head?.revision ?? 0;
  if (input.expectedRevision !== undefined && input.expectedRevision !== currentRevision) {
    throw new ApiError(
      409,
      'REVISION_CONFLICT',
      `期望 revision=${input.expectedRevision}，当前 head=${currentRevision}`,
      { expected_revision: input.expectedRevision, current_revision: currentRevision },
    );
  }

  if (head && head.snapshotHash === envelope.snapshot_hash && input.changeKind !== 'baseline') {
    return {
      mode,
      skipped: true,
      reason: 'unchanged_hash',
      revisionId: head.id,
      revision: head.revision,
      snapshotHash: envelope.snapshot_hash,
    };
  }

  const nextRevision = currentRevision + 1;
  const revisionId = randomUUID();
  const changeEventId = randomUUID();
  const occurredAt = input.occurredAt ?? new Date();
  const sequence = await allocateProjectSequence(db, input.projectId);

  await db.entityRevision.create({
    data: {
      id: revisionId,
      projectId: input.projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      revision: nextRevision,
      parentRevisionId: head?.id ?? null,
      schemaVersion: envelope.schema_version,
      snapshot: envelope.snapshot as Prisma.InputJsonValue,
      snapshotHash: envelope.snapshot_hash,
      changeKind: input.changeKind,
      changedFields: input.changedFields ?? [],
      actorId: input.actorId ?? null,
      createdAt: occurredAt,
    },
  });

  await db.changeEvent.create({
    data: {
      id: changeEventId,
      projectId: input.projectId,
      sequence,
      eventType: input.eventType,
      schemaVersion: 1,
      entityType: input.entityType,
      entityId: input.entityId,
      entityRevisionId: revisionId,
      actorType: input.actorType ?? 'system',
      actorId: input.actorId ?? null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      correlationId: input.correlationId ?? null,
      causationId: input.causationId ?? null,
      idempotencyKey: input.idempotencyKey,
      payload: {
        ...eventPayload,
        __fingerprint: fingerprint,
      },
      occurredAt,
    },
  });

  return {
    mode,
    skipped: false,
    revisionId,
    revision: nextRevision,
    changeEventId,
    sequence,
    snapshotHash: envelope.snapshot_hash,
  };
}

/**
 * Flag-aware helper for route handlers:
 * - `off`: no-op
 * - `dual`: await {@link recordEntityChange} (failures propagate)
 * - `shadow`: best-effort; logs and swallows errors so business writes stay successful
 */
export async function maybeRecordEntityChange(
  db: Db,
  input: RecordEntityChangeInput,
): Promise<RecordEntityChangeResult | undefined> {
  const mode = historyWriteModeFor(input.entityType);
  if (mode === 'off') {
    return { mode, skipped: true, reason: 'flag_off' };
  }
  if (mode === 'dual') {
    return recordEntityChange(db, input, { mode });
  }
  try {
    return await recordEntityChange(db, input, { mode: 'shadow' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      '[history-shadow]',
      input.entityType,
      input.entityId,
      input.idempotencyKey,
      message,
    );
    return {
      mode: 'shadow',
      skipped: true,
      reason: 'shadow_failed',
    };
  }
}
