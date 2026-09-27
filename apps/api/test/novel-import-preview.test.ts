import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import { suggestedWorldName } from '../src/contexts/novel-import/import-plan.js';
import { NovelImportService } from '../src/contexts/novel-import/service.js';

const SAMPLE = `第一章 踏入学院

林澈背着行囊走进青云学院的大门。他渴望成仙。艾拉说，新弟子要先通过入门考核。
林澈点了点头。突然，凯撒出现在广场上，宣布比试开始。

第二章 首次比试

林澈打败了对手，获得第一名。艾拉笑了。凯撒说，你很不错。
在藏经阁中，林澈发现了一本残卷。他决心变强。`;

describe('suggestedWorldName', () => {
  it('uses the txt filename stem', () => {
    expect(suggestedWorldName('雾城来信.txt')).toBe('雾城来信');
  });

  it('falls back to the first chapter title when the filename is empty', () => {
    expect(suggestedWorldName('', '第一章 踏入学院')).toBe('第一章 踏入学院');
  });
});

describe('NovelImportService.previewFromText', () => {
  it('returns named entities without writing the database', () => {
    const create = vi.fn();
    const service = new NovelImportService({
      novelImport: { create },
      asset: { create },
    } as unknown as PrismaClient);
    const preview = service.previewFromText({
      filename: '雾城.txt',
      text: SAMPLE,
    });
    expect(create).not.toHaveBeenCalled();
    expect(preview.suggestedName).toBe('雾城');
    expect(preview.chapterCount).toBe(2);
    const names = preview.characters.map((character) => character.name);
    expect(names).toContain('林澈');
    expect(preview.characters.every((character) => !('id' in character))).toBe(true);
  });

  it('rejects text with no usable chapters', () => {
    const service = new NovelImportService({} as PrismaClient);
    expect(() => service.previewFromText({ filename: '空.txt', text: '' })).toThrow(/没有可用章节/);
  });
});
