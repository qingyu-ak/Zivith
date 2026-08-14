import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import { allocateProjectSequence } from '../src/contexts/history/project-sequence.js';
import { backfillEntityBaselines } from '../src/contexts/history/baseline-backfill.js';

describe('allocateProjectSequence', () => {
  it('returns last_value from atomic upsert', async () => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ last_value: 3n }]),
    } as unknown as PrismaClient;
    await expect(allocateProjectSequence(db, 'project-1')).resolves.toBe(3n);
    expect(db.$queryRaw).toHaveBeenCalledOnce();
  });

  it('throws when allocator returns no row', async () => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaClient;
    await expect(allocateProjectSequence(db, 'project-1')).rejects.toThrow(/allocate/);
  });
});

describe('backfillEntityBaselines', () => {
  it('dry-run counts missing baselines without writing', async () => {
    const shot = {
      id: 'shot-1',
      projectId: 'project-1',
      sceneId: 'scene-1',
      order: 1,
      label: 'A',
      state: 'draft',
      narrativeMode: 'present',
      locationArea: null,
      camera: null,
      composition: null,
      lighting: null,
      color: null,
      mood: null,
      style: null,
      characters: [],
      dialogue: null,
      action: null,
      audio: null,
      prompt: { source: 'auto' },
      approvedSnapshot: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      deletedAt: null,
    };

    const entityRevision = {
      findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'rev-existing' }),
    };

    const db = {
      shot: { findMany: vi.fn().mockResolvedValue([shot, { ...shot, id: 'shot-2' }]) },
      promptVersion: { findMany: vi.fn().mockResolvedValue([]) },
      output: { findMany: vi.fn().mockResolvedValue([]) },
      assetAppearanceVariant: { findMany: vi.fn().mockResolvedValue([]) },
      visualAssetRequirement: { findMany: vi.fn().mockResolvedValue([]) },
      worldEvent: { findMany: vi.fn().mockResolvedValue([]) },
      relationship: { findMany: vi.fn().mockResolvedValue([]) },
      entityRevision,
      $transaction: vi.fn(),
    } as unknown as PrismaClient;

    const result = await backfillEntityBaselines(db, { dryRun: true });
    expect(result.scanned).toBe(2);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.byType.shot).toEqual({ scanned: 2, created: 1, skipped: 1 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('writes baseline revision + ChangeEvent when missing', async () => {
    const shot = {
      id: 'shot-1',
      projectId: 'project-1',
      sceneId: 'scene-1',
      order: 1,
      label: 'A',
      state: 'draft',
      narrativeMode: 'present',
      locationArea: null,
      camera: null,
      composition: null,
      lighting: null,
      color: null,
      mood: null,
      style: null,
      characters: [],
      dialogue: null,
      action: null,
      audio: null,
      prompt: { source: 'auto' },
      approvedSnapshot: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      deletedAt: null,
    };

    const createRevision = vi.fn().mockResolvedValue({});
    const createEvent = vi.fn().mockResolvedValue({});
    const tx = {
      entityRevision: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: createRevision,
      },
      changeEvent: { create: createEvent },
      $queryRaw: vi.fn().mockResolvedValue([{ last_value: 1n }]),
    };

    const db = {
      shot: { findMany: vi.fn().mockResolvedValue([shot]) },
      promptVersion: { findMany: vi.fn().mockResolvedValue([]) },
      output: { findMany: vi.fn().mockResolvedValue([]) },
      assetAppearanceVariant: { findMany: vi.fn().mockResolvedValue([]) },
      visualAssetRequirement: { findMany: vi.fn().mockResolvedValue([]) },
      worldEvent: { findMany: vi.fn().mockResolvedValue([]) },
      relationship: { findMany: vi.fn().mockResolvedValue([]) },
      entityRevision: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
    } as unknown as PrismaClient;

    const result = await backfillEntityBaselines(db);
    expect(result.created).toBe(1);
    expect(createRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'shot',
          entityId: 'shot-1',
          revision: 1,
          changeKind: 'baseline',
          snapshotHash: expect.any(String),
        }),
      }),
    );
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'entity.created',
          sequence: 1n,
          idempotencyKey: 'baseline:shot:shot-1',
          sourceType: 'baseline_backfill',
        }),
      }),
    );
  });
});
