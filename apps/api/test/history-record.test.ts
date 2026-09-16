import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import {
  historyWriteModeFor,
  maybeRecordEntityChange,
  recordEntityChange,
} from '../src/contexts/history/index.js';

afterEach(() => {
  delete process.env.HISTORY_WRITE_DEFAULT;
  delete process.env.HISTORY_ENTITY_SHOT;
  delete process.env.HISTORY_ENTITY_CHARACTER;
});

describe('historyWriteModeFor', () => {
  it('defaults to off', () => {
    expect(historyWriteModeFor('shot')).toBe('off');
  });

  it('defaults character and location history to dual', () => {
    expect(historyWriteModeFor('character')).toBe('dual');
    expect(historyWriteModeFor('location')).toBe('dual');
  });

  it('uses HISTORY_WRITE_DEFAULT then per-entity override', () => {
    process.env.HISTORY_WRITE_DEFAULT = 'shadow';
    expect(historyWriteModeFor('shot')).toBe('shadow');
    process.env.HISTORY_ENTITY_SHOT = 'dual';
    expect(historyWriteModeFor('shot')).toBe('dual');
    expect(historyWriteModeFor('output')).toBe('shadow');
  });
});

describe('recordEntityChange', () => {
  const row = {
    id: 'shot-1',
    sceneId: 'scene-1',
    projectId: 'project-1',
    order: 1,
    label: 'A',
    state: 'draft',
    narrativeMode: 'present',
    characters: [],
    prompt: { source: 'auto' },
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    deletedAt: null,
  };

  it('no-ops when mode is off', async () => {
    const db = { changeEvent: { findFirst: vi.fn() } } as unknown as PrismaClient;
    const result = await recordEntityChange(
      db,
      {
        projectId: 'project-1',
        entityType: 'shot',
        entityId: 'shot-1',
        row,
        changeKind: 'create',
        eventType: 'entity.created',
        idempotencyKey: 'k1',
      },
      { mode: 'off' },
    );
    expect(result).toEqual({ mode: 'off', skipped: true, reason: 'flag_off' });
    expect(db.changeEvent.findFirst).not.toHaveBeenCalled();
  });

  it('appends revision and change event on dual create', async () => {
    const createRevision = vi.fn().mockResolvedValue({});
    const createEvent = vi.fn().mockResolvedValue({});
    const db = {
      changeEvent: { findFirst: vi.fn().mockResolvedValue(null), create: createEvent },
      entityRevision: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: createRevision,
      },
      $queryRaw: vi.fn().mockResolvedValue([{ last_value: 1n }]),
    } as unknown as PrismaClient;

    const result = await recordEntityChange(
      db,
      {
        projectId: 'project-1',
        entityType: 'shot',
        entityId: 'shot-1',
        row,
        changeKind: 'create',
        eventType: 'entity.created',
        idempotencyKey: 'shot:create:shot-1',
        expectedRevision: 0,
      },
      { mode: 'dual' },
    );

    expect(result.skipped).toBe(false);
    expect(result.revision).toBe(1);
    expect(createRevision).toHaveBeenCalled();
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'entity.created',
          sequence: 1n,
          idempotencyKey: 'shot:create:shot-1',
        }),
      }),
    );
  });

  it('throws REVISION_CONFLICT when expectedRevision mismatches', async () => {
    const db = {
      changeEvent: { findFirst: vi.fn().mockResolvedValue(null) },
      entityRevision: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'rev-1',
          revision: 2,
          snapshotHash: 'abc',
        }),
      },
    } as unknown as PrismaClient;

    await expect(
      recordEntityChange(
        db,
        {
          projectId: 'project-1',
          entityType: 'shot',
          entityId: 'shot-1',
          row,
          changeKind: 'update',
          eventType: 'entity.changed',
          idempotencyKey: 'k2',
          expectedRevision: 1,
        },
        { mode: 'dual' },
      ),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', status: 409 });
  });

  it('maybeRecordEntityChange swallows shadow failures', async () => {
    process.env.HISTORY_ENTITY_SHOT = 'shadow';
    const db = {
      changeEvent: {
        findFirst: vi.fn().mockRejectedValue(new Error('db down')),
      },
    } as unknown as PrismaClient;
    const result = await maybeRecordEntityChange(db, {
      projectId: 'project-1',
      entityType: 'shot',
      entityId: 'shot-1',
      row,
      changeKind: 'update',
      eventType: 'entity.changed',
      idempotencyKey: 'k3',
    });
    expect(result).toEqual({ mode: 'shadow', skipped: true, reason: 'shadow_failed' });
  });
});
