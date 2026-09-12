import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import { NovelImportService } from '../src/contexts/novel-import/service.js';

function lightReport() {
  return {
    characters: [
      {
        id: 'a-light',
        name: '路鸣泽',
        aliases: [],
        mentions: 7,
        // idempotent 用例会把 tier 改写为 'full'，不能收窄成 const。
        tier: 'light' as 'light' | 'full',
      },
    ],
    locations: [],
    events: [],
    relationships: [],
    memoryCoreIds: [],
    memoryAtomIds: [],
    skipped: [],
    worldviewHighlights: [],
  };
}

describe('NovelImportService.upgrade', () => {
  it('promotes a light import character to a full card with persona', async () => {
    const report = lightReport();
    const asset = {
      id: 'a-light',
      projectId: 'p1',
      type: 'character',
      state: 'draft',
      name: '路鸣泽',
      description: '次要角色（出场 3 章）',
      aliases: ['小魔鬼'],
      data: { source: 'novel_import', importId: 'imp1', tier: 'light' },
      deletedAt: null,
    };
    const assetUpdate = vi.fn().mockResolvedValue({});
    const coreCreate = vi.fn().mockResolvedValue({ id: 'core-1' });
    const importUpdate = vi.fn().mockResolvedValue({});
    const db = {
      novelImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'imp1',
          projectId: 'p1',
          report,
        }),
        update: importUpdate,
      },
      asset: {
        findFirst: vi.fn().mockResolvedValue(asset),
        update: assetUpdate,
      },
      memoryCore: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: coreCreate,
      },
    } as unknown as PrismaClient;

    const result = await new NovelImportService(db).upgrade('imp1', 'a-light');

    expect(result.reused).toBe(false);
    expect(result.character.tier).toBe('full');
    expect(assetUpdate).toHaveBeenCalledWith({
      where: { id: 'a-light' },
      data: {
        state: 'active',
        data: expect.objectContaining({ tier: 'full', upgraded: true }),
      },
    });
    expect(coreCreate).toHaveBeenCalled();
    const persona = (coreCreate.mock.calls[0]?.[0] as { data: { content: string } }).data.content;
    expect(persona).toContain('路鸣泽');
    expect(persona).toContain('小魔鬼');
    expect(importUpdate).toHaveBeenCalled();
  });

  it('is idempotent when the card is already full', async () => {
    const report = lightReport();
    report.characters[0]!.tier = 'full';
    const db = {
      novelImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'imp1',
          projectId: 'p1',
          report,
        }),
      },
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'a-light',
          projectId: 'p1',
          type: 'character',
          data: { source: 'novel_import', importId: 'imp1', tier: 'full' },
          deletedAt: null,
          name: '路鸣泽',
          aliases: [],
        }),
        update: vi.fn(),
      },
      memoryCore: { findFirst: vi.fn(), create: vi.fn() },
    } as unknown as PrismaClient;

    const result = await new NovelImportService(db).upgrade('imp1', 'a-light');
    expect(result.reused).toBe(true);
    expect(db.asset.update).not.toHaveBeenCalled();
  });

  it('rejects characters that are not from this import', async () => {
    const db = {
      novelImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'imp1',
          projectId: 'p1',
          report: lightReport(),
        }),
      },
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'a-light',
          projectId: 'p1',
          type: 'character',
          data: { source: 'studio' },
          deletedAt: null,
          name: '路鸣泽',
          aliases: [],
        }),
      },
    } as unknown as PrismaClient;

    await expect(new NovelImportService(db).upgrade('imp1', 'a-light')).rejects.toMatchObject({
      code: 'NOT_IMPORT_CHARACTER',
    });
  });
});
