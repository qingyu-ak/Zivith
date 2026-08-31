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

function emptyExtraction(): ChapterExtraction {
  return {
    characterMentions: new Map(),
    locationMentions: new Map(),
    events: [],
    traits: [],
    cooccurrences: new Map(),
  };
}

function emptyReport() {
  return {
    characters: [],
    locations: [],
    events: [],
    relationships: [],
    memoryCoreIds: [],
    memoryAtomIds: [],
    skipped: [],
    worldviewHighlights: [],
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
        data: Array<{ importId: string; chapterIndex: number; title: string | null; status: string }>;
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

describe('NovelImportService chapter retry', () => {
  it('marks the failed chapter and does not write the world layer', async () => {
    const rows: ChapterRow[] = [];
    const assetCreate = vi.fn();
    const db = {
      novelImport: {
        create: vi.fn().mockResolvedValue({ id: 'imp1' }),
        update: vi.fn().mockResolvedValue({}),
      },
      novelImportChapter: chapterDb(rows),
      asset: { create: assetCreate },
    } as unknown as PrismaClient;
    const extract = vi.fn((index: number) => {
      if (index === 1) throw new Error('parse fail');
      return emptyExtraction();
    });

    await expect(
      new NovelImportService(db, extract).start({
        projectId: 'p1',
        filename: 'novel.txt',
        text: SAMPLE,
      }),
    ).rejects.toMatchObject({
      code: 'IMPORT_CHAPTER_FAILED',
      details: expect.objectContaining({ import_id: 'imp1', chapter_index: 1 }),
    });

    expect(assetCreate).not.toHaveBeenCalled();
    expect(rows[0]?.status).toBe('done');
    expect(rows[1]?.status).toBe('failed');
    expect(rows[1]?.lastError).toBe('parse fail');
    expect(rows[1]?.attempts).toBe(1);
    const created = (db.novelImport.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      data: { config: { sourceText?: string } };
    };
    expect(created.data.config.sourceText).toContain('第一章');
  });

  it('retries from the failed chapter and then writes the world layer', async () => {
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
        status: 'failed',
        attempts: 1,
        lastError: 'parse fail',
        extractedEntityCount: 0,
      },
    ];
    const importUpdate = vi.fn().mockResolvedValue({});
    const db = {
      novelImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'imp1',
          projectId: 'p1',
          status: 'failed',
          config: { sourceText: SAMPLE, maxFullCards: 15, maxLocations: 30, maxEvents: 60 },
          chapters: rows,
          report: { error: 'parse fail' },
        }),
        update: importUpdate,
      },
      novelImportChapter: chapterDb(rows),
      asset: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
      memoryCore: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
      memoryAtom: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      worldEvent: { create: vi.fn() },
      relationship: { create: vi.fn() },
    } as unknown as PrismaClient;
    const extract = vi.fn(() => emptyExtraction());

    const result = await new NovelImportService(db, extract).retry('imp1');

    expect(result.importId).toBe('imp1');
    expect(extract).toHaveBeenCalledTimes(2);
    expect(rows[1]?.status).toBe('done');
    expect(rows[1]?.attempts).toBe(2);
    expect(rows[0]?.attempts).toBe(1);
    expect(importUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'imp1' },
        data: expect.objectContaining({ status: 'done' }),
      }),
    );
  });

  it('refuses retry when the original text was not kept', async () => {
    const db = {
      novelImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'imp1',
          projectId: 'p1',
          status: 'failed',
          config: {},
          chapters: [],
        }),
      },
    } as unknown as PrismaClient;

    await expect(new NovelImportService(db).retry('imp1')).rejects.toMatchObject({
      code: 'SOURCE_NOT_KEPT',
    });
  });

  it('returns the existing report when the import is already done', async () => {
    const report = emptyReport();
    const extract = vi.fn();
    const db = {
      novelImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'imp1',
          status: 'done',
          report,
          chapters: [],
        }),
      },
    } as unknown as PrismaClient;

    const result = await new NovelImportService(db, extract).retry('imp1');
    expect(result.report).toEqual(report);
    expect(extract).not.toHaveBeenCalled();
  });

  it('stops after three failed attempts on the same chapter', async () => {
    const rows: ChapterRow[] = [
      {
        importId: 'imp1',
        chapterIndex: 0,
        title: '第一章',
        status: 'failed',
        attempts: 3,
        lastError: 'parse fail',
        extractedEntityCount: 0,
      },
    ];
    const extract = vi.fn(() => emptyExtraction());
    const db = {
      novelImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'imp1',
          projectId: 'p1',
          status: 'failed',
          config: { sourceText: '第一章 只有一章\n\n林澈走进学院大门，开始新的生活。后面还有很长很长的正文。' },
          chapters: rows,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      novelImportChapter: chapterDb(rows),
    } as unknown as PrismaClient;

    await expect(new NovelImportService(db, extract).retry('imp1')).rejects.toMatchObject({
      code: 'IMPORT_CHAPTER_FAILED',
    });
    expect(extract).not.toHaveBeenCalled();
    expect(rows[0]?.attempts).toBe(3);
  });
});
