import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import type { ChapterExtraction } from '../src/contexts/novel-import/novel-extract.js';
import { NovelImportService } from '../src/contexts/novel-import/service.js';

const SAMPLE = `第一章 踏入学院

林澈背着行囊走进青云学院的大门。他渴望成仙。艾拉说，新弟子要先通过入门考核。
林澈点了点头。突然，凯撒出现在广场上，宣布比试开始。

第二章 首次比试

林澈打败了对手，获得第一名。艾拉笑了。凯撒说，你很不错。
在藏经阁中，林澈发现了一本残卷。他决心变强。`;

function namedExtraction(names: string[]): ChapterExtraction {
  return {
    characterMentions: new Map(names.map((name) => [name, 8])),
    locationMentions: new Map(),
    events: [],
    traits: [],
    cooccurrences: new Map(),
  };
}

type ChapterRow = {
  importId: string;
  chapterIndex: number;
  title: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  extractedEntityCount: number;
};

function chapterDb(rows: ChapterRow[]) {
  return {
    createMany: vi.fn(
      async ({
        data,
      }: {
        data: Array<{
          importId: string;
          chapterIndex: number;
          title: string | null;
          status: string;
        }>;
      }) => {
        rows.push(
          ...data.map((row) => ({
            importId: row.importId,
            chapterIndex: row.chapterIndex,
            title: row.title,
            status: row.status,
            attempts: 0,
            lastError: null,
            extractedEntityCount: 0,
          })),
        );
      },
    ),
    findMany: vi.fn(async () => rows),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { importId_chapterIndex: { chapterIndex: number } };
        data: {
          status?: string;
          lastError?: string | null;
          extractedEntityCount?: number;
          attempts?: { increment: number };
        };
      }) => {
        const row = rows.find(
          (item) => item.chapterIndex === where.importId_chapterIndex.chapterIndex,
        );
        if (!row) throw new Error('chapter missing');
        if (data.attempts?.increment) row.attempts += data.attempts.increment;
        if (data.status !== undefined) row.status = data.status;
        if (data.lastError !== undefined) row.lastError = data.lastError;
        if (data.extractedEntityCount !== undefined) {
          row.extractedEntityCount = data.extractedEntityCount;
        }
        return row;
      },
    ),
  };
}

describe('NovelImportService world-write failure', () => {
  it('keeps already written character ids in the report when create fails', async () => {
    const rows: ChapterRow[] = [];
    const reports: unknown[] = [];
    let created = 0;
    const db = {
      novelImport: {
        create: vi.fn().mockResolvedValue({ id: 'imp1' }),
        findUnique: vi.fn().mockResolvedValue({ report: null }),
        update: vi.fn(async ({ data }: { data: { report?: unknown; status?: string } }) => {
          if (data.report !== undefined) reports.push(data.report);
          return {};
        }),
      },
      novelImportChapter: chapterDb(rows),
      asset: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }: { data: { name: string } }) => {
          created += 1;
          if (created === 2) throw new Error('db down');
          return { id: `asset-${created}`, name: data.name };
        }),
      },
      memoryCore: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'core-1' }),
      },
      memoryAtom: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    } as unknown as PrismaClient;

    await expect(
      new NovelImportService(db, () => namedExtraction(['林澈', '艾拉'])).start({
        projectId: 'p1',
        filename: 'novel.txt',
        text: SAMPLE,
      }),
    ).rejects.toMatchObject({
      code: 'WORLD_WRITE_FAILED',
      details: expect.objectContaining({ import_id: 'imp1' }),
    });

    const failed = [...reports]
      .reverse()
      .find(
        (value): value is Record<string, unknown> =>
          value !== null && typeof value === 'object' && !Array.isArray(value) && 'error' in value,
      );
    expect(failed).toBeDefined();
    const characters = failed!.characters as Array<{ name: string }> | undefined;
    expect(characters?.map((character) => character.name)).toContain('林澈');
    expect(characters?.some((character) => character.name === '艾拉')).toBe(false);
    expect(String(failed!.error)).toContain('db down');
    expect(failed!.failed_stage).toBe('world_write');
    expect(created).toBe(2);
  });

  it('reuses the first character on retry instead of creating a duplicate', async () => {
    const rows: ChapterRow[] = [
      {
        importId: 'imp1',
        chapterIndex: 0,
        title: '第一章',
        status: 'done',
        attempts: 1,
        lastError: null,
        extractedEntityCount: 0,
      },
      {
        importId: 'imp1',
        chapterIndex: 1,
        title: '第二章',
        status: 'done',
        attempts: 1,
        lastError: null,
        extractedEntityCount: 0,
      },
    ];
    const createdNames: string[] = [];
    const db = {
      novelImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'imp1',
          projectId: 'p1',
          status: 'failed',
          config: { sourceText: SAMPLE, maxFullCards: 15, maxLocations: 30, maxEvents: 60 },
          chapters: rows,
          report: {
            characters: [{ id: 'a-lin', name: '林澈', aliases: [], mentions: 16, tier: 'full' }],
            locations: [],
            events: [],
            relationships: [],
            memoryCoreIds: ['core-1'],
            memoryAtomIds: [],
            skipped: [],
            worldviewHighlights: [],
            error: 'db down',
            failed_stage: 'world_write',
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      novelImportChapter: chapterDb(rows),
      asset: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }: { data: { name: string } }) => {
          createdNames.push(data.name);
          return { id: `new-${data.name}`, name: data.name };
        }),
      },
      memoryCore: {
        findFirst: vi.fn(async ({ where }: { where: { topic: string } }) =>
          where.topic === '林澈' ? { id: 'core-1' } : null,
        ),
        create: vi.fn().mockResolvedValue({ id: 'core-2' }),
      },
      memoryAtom: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
      worldEvent: { create: vi.fn() },
      relationship: { create: vi.fn() },
    } as unknown as PrismaClient;

    const result = await new NovelImportService(db, () => namedExtraction(['林澈', '艾拉'])).retry(
      'imp1',
    );

    expect(createdNames).toEqual(['艾拉']);
    expect(result.report.characters.map((character) => character.id)).toContain('a-lin');
    expect(result.report.characters.map((character) => character.name)).toEqual(
      expect.arrayContaining(['林澈', '艾拉']),
    );
  });

  it('undo soft-deletes assets tagged with importId even when the report has no ids', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const deleteManyCore = vi.fn().mockResolvedValue({ count: 1 });
    const deleteManyAtom = vi.fn().mockResolvedValue({ count: 0 });
    const db = {
      novelImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'imp1',
          projectId: 'p1',
          report: { error: 'db down', failed_stage: 'world_write' },
        }),
        delete: vi.fn().mockResolvedValue({}),
      },
      asset: {
        findMany: vi.fn().mockResolvedValue([{ id: 'orphan-1', name: '林澈', type: 'character' }]),
        updateMany,
      },
      worldEvent: { updateMany: vi.fn() },
      relationship: { updateMany: vi.fn() },
      memoryCore: {
        findMany: vi.fn().mockResolvedValue([{ id: 'core-1' }]),
        deleteMany: deleteManyCore,
      },
      memoryAtom: { findMany: vi.fn().mockResolvedValue([]), deleteMany: deleteManyAtom },
      roleplayThread: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as PrismaClient;

    const ok = await new NovelImportService(db).undo('imp1');
    expect(ok).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['orphan-1'] } },
      data: { deletedAt: expect.any(Date) },
    });
    expect(deleteManyCore).toHaveBeenCalledWith({ where: { id: { in: ['core-1'] } } });
  });
});
