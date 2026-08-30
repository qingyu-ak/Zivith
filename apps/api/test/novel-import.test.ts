import { describe, expect, it } from 'vitest';
import {
  aggregateCharacters,
  extractFromChapter,
} from '../src/contexts/novel-import/novel-extract.js';
import { splitChapters } from '../src/contexts/novel-import/chapter-splitter.js';
import { decodeNovelBuffer } from '../src/contexts/novel-import/decode-text.js';

const SAMPLE = `第一章 踏入学院

林澈背着行囊走进青云学院的大门。他渴望成仙。艾拉说，新弟子要先通过入门考核。
林澈点了点头。突然，凯撒出现在广场上，宣布比试开始。

第二章 首次比试

林澈打败了对手，获得第一名。艾拉笑了。凯撒说，你很不错。
在藏经阁中，林澈发现了一本残卷。他决心变强。`;

describe('splitChapters', () => {
  it('splits by 第X章 title lines', () => {
    const chapters = splitChapters(SAMPLE);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]?.title).toContain('第一章');
    expect(chapters[1]?.title).toContain('第二章');
    expect(chapters[0]?.content).toContain('青云学院');
  });

  it('falls back to chunking without titles', () => {
    const text = '这是一段没有任何章节标题的文本。'.repeat(600);
    const chunks = splitChapters(text, 2000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.title).toBeNull();
  });
});

describe('extractFromChapter + aggregateCharacters', () => {
  it('detects characters, locations, events and cooccurrence', () => {
    const chapters = splitChapters(SAMPLE);
    const extractions = chapters.map((chapter) =>
      extractFromChapter(chapter.index, chapter.content),
    );
    const characters = aggregateCharacters(extractions);
    const names = characters.map((c) => c.name);
    expect(names).toContain('林澈');
    expect(names).toContain('艾拉');
    expect(names).toContain('凯撒');

    const merged = extractions[1]!;
    expect(merged.events.some((e) => e.text.includes('打败'))).toBe(true);

    const locationHit = extractions[0]?.locationMentions.has('青云学院');
    expect(locationHit).toBe(true);
  });

  it('merges near-identical names (路明非 = 路明飞)', () => {
    const chapters = splitChapters(
      '第一章\n路明非说了一句话。\n路明非说了第二句话。\n路明飞说了第三句话。\n路明非说了第四句话。',
    );
    const extractions = chapters.map((chapter) =>
      extractFromChapter(chapter.index, chapter.content),
    );
    const characters = aggregateCharacters(extractions);
    const mains = characters.map((c) => c.name);
    expect(mains).toContain('路明非');
    expect(mains).not.toContain('路明飞');
    const lu = characters.find((c) => c.name === '路明非');
    expect(lu?.aliases).toContain('路明飞');
  });

  it('does not treat common adverbs as character names', () => {
    const chapter = extractFromChapter(
      0,
      '没有说出口。忽然出现一个人。甚至知道答案。电梯出现故障。喜欢看热闹。林澈说了一句话。林澈说了第二句话。',
    );
    const names = [...chapter.characterMentions.keys()];
    expect(names).toContain('林澈');
    expect(names).not.toContain('没有');
    expect(names).not.toContain('忽然');
    expect(names).not.toContain('甚至');
    expect(names).not.toContain('电梯');
    expect(names).not.toContain('喜欢');
  });
});

describe('decodeNovelBuffer', () => {
  it('keeps utf-8 and strips nulls', () => {
    expect(decodeNovelBuffer(Buffer.from('林澈', 'utf8'))).toBe('林澈');
    expect(decodeNovelBuffer(Buffer.from('a\0b', 'utf8'))).toBe('ab');
  });

  it('decodes gb18030 when the bytes are not valid utf-8', () => {
    const buffer = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]);
    expect(decodeNovelBuffer(buffer)).toBe('中文');
  });
});
