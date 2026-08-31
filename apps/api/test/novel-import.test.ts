import { describe, expect, it } from 'vitest';
import {
  aggregateCharacters,
  extractFromChapter,
  formatEventTitle,
  mergeLocationMentions,
  normalizeCharacterName,
  normalizeLocationName,
  selectImportEvents,
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

  it('keeps text before the first heading as 开篇', () => {
    const chapters = splitChapters(
      [
        '封面题记。这是一段足够长的开场白，用来交代故事从哪一页真正开始，',
        '免得被切章程序丢掉。再补一句人物尚未登场的气氛描写，凑过五十字。',
        '',
        '第2章 全民公敌 1',
        '',
        '路明非说了一句话。楚子航站在他身后，两个人谁也没有再开口。',
      ].join('\n'),
    );
    expect(chapters[0]?.title).toBe('开篇');
    expect(chapters[0]?.content).toContain('封面题记');
    expect(chapters[1]?.title).toContain('第2章');
  });

  it('splits a single 第N章 heading instead of falling back to chunks', () => {
    const chapters = splitChapters(
      '第一章 只有一章\n\n林澈走进学院大门，开始新的生活。后面还有很长很长的正文。',
    );
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.title).toContain('第一章');
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

  it('does not promote function words or glued suffixes into character cards', () => {
    const chapters = splitChapters(`第一章
路明非说了一句话。路明非也知道这件事。路明非心里明白。跟路明非说一声。
就是说没关系。或者说明天。世界出现裂缝。一个说好。或者问一句。
路鸣泽说了一句话。路鸣泽说了第二句话。路鸣泽知道答案。
`);
    const extractions = chapters.map((chapter) =>
      extractFromChapter(chapter.index, chapter.content),
    );
    const characters = aggregateCharacters(extractions);
    const names = characters.map((c) => c.name);
    expect(names).toContain('路明非');
    expect(names).toContain('路鸣泽');
    expect(names).not.toContain('一个');
    expect(names).not.toContain('就是');
    expect(names).not.toContain('世界');
    expect(names).not.toContain('或者');
    expect(names).not.toContain('路明非心');
    const lu = characters.find((c) => c.name === '路明非');
    expect(lu?.aliases ?? []).not.toContain('路明非心');
    expect(lu?.aliases ?? []).not.toContain('路明非也');
    expect(lu?.aliases ?? []).not.toContain('跟路明非');
  });

  it('drops leftover function-word name fragments', () => {
    const chapter = extractFromChapter(
      0,
      [
        '没人说得清。你这说的是什么。还没说完。也就是说。却没有说。却又说。',
        '个男人说了一句话。我跟你说一声。路明非轻声说。路明非摇头。',
        '路明非忽然知道答案。路明非说了一句话。路明非说了第二句话。',
      ].join(''),
    );
    const names = [...chapter.characterMentions.keys()];
    expect(names).toContain('路明非');
    expect(names).not.toContain('没人');
    expect(names).not.toContain('你这');
    expect(names).not.toContain('还没');
    expect(names).not.toContain('也就是');
    expect(names).not.toContain('却没有');
    expect(names).not.toContain('却又');
    expect(names).not.toContain('个男人');
    expect(names).not.toContain('明非忽然');
    expect(names).not.toContain('明非轻声');
    expect(names).not.toContain('我跟你');
    expect(names).not.toContain('路明非摇');
  });

  it('drops rank titles and 先生 fragments', () => {
    expect(normalizeCharacterName('舰长')).toBeNull();
    expect(normalizeCharacterName('神官')).toBeNull();
    expect(normalizeCharacterName('尔特先生')).toBeNull();
    expect(normalizeCharacterName('芬格尔特先生')).toBe('芬格尔特');
    const chapter = extractFromChapter(
      0,
      '舰长说，开炮。神官问道，为何。尔特先生出现了。芬格尔说了一句话。芬格尔说了第二句话。',
    );
    const names = [...chapter.characterMentions.keys()];
    expect(names).toContain('芬格尔');
    expect(names).not.toContain('舰长');
    expect(names).not.toContain('神官');
    expect(names).not.toContain('先生');
    expect(names).not.toContain('尔特');
    expect(names).not.toContain('尔特先生');
  });

  it('does not split a longer name into a contained fragment', () => {
    const chapter = extractFromChapter(
      0,
      '楚子航说了一句话。楚子航说了第二句话。阿巴斯说了一句话。阿巴斯说了第二句话。',
    );
    const names = [...chapter.characterMentions.keys()];
    expect(names).toContain('楚子航');
    expect(names).toContain('阿巴斯');
    expect(names).not.toContain('子航');
    expect(names).not.toContain('巴斯');
  });

  it('does not merge unrelated two-character names', () => {
    const chapters = splitChapters(`第一章
诺诺说了一句话。诺诺说了第二句话。恺撒说了一句话。恺撒说了第二句话。布宁说了一句话。布宁说了第二句话。
`);
    const names = aggregateCharacters(
      chapters.map((chapter) => extractFromChapter(chapter.index, chapter.content)),
    ).map((c) => c.name);
    expect(names).toContain('诺诺');
    expect(names).toContain('恺撒');
    expect(names).toContain('布宁');
    const nono = aggregateCharacters(
      chapters.map((chapter) => extractFromChapter(chapter.index, chapter.content)),
    ).find((c) => c.name === '诺诺');
    expect(nono?.aliases ?? []).not.toContain('恺撒');
    expect(nono?.aliases ?? []).not.toContain('布宁');
  });
});

describe('locations and plot events', () => {
  it('peels glued prefixes off real place names and drops fragments', () => {
    expect(normalizeLocationName('青云学院')).toBe('青云学院');
    expect(normalizeLocationName('但卡塞尔学院')).toBe('卡塞尔学院');
    expect(normalizeLocationName('在卡塞尔学院')).toBe('卡塞尔学院');
    expect(normalizeLocationName('走进青云学院')).toBe('青云学院');
    expect(normalizeLocationName('卧槽学院')).toBeNull();
    expect(normalizeLocationName('开了会议室')).toBeNull();
    expect(normalizeLocationName('你是学院')).toBeNull();
    const merged = mergeLocationMentions(
      new Map([
        ['但卡塞尔学院', 3],
        ['在卡塞尔学院', 2],
        ['卡塞尔学院', 10],
        ['卧槽学院', 2],
      ]),
    );
    expect(merged.get('卡塞尔学院')).toBe(15);
    expect(merged.has('但卡塞尔学院')).toBe(false);
    expect(merged.has('卧槽学院')).toBe(false);
  });

  it('keeps fight beats and drops "开始/发现" chatter as plot events', () => {
    const fight = extractFromChapter(
      1,
      '林澈打败了对手，获得第一名。艾拉笑了。凯撒说，你很不错。林澈说要继续变强。',
    );
    expect(fight.events.some((event) => event.text.includes('打败'))).toBe(true);

    const chatter = extractFromChapter(
      2,
      '林澈说，我们开始讨论明天的安排。凯撒说，我发现这件事没那么重要。',
    );
    expect(chatter.events).toHaveLength(0);

    const selected = selectImportEvents(
      [
        { chapterIndex: 1, text: '林澈打败了对手', characters: ['林澈'] },
        { chapterIndex: 1, text: '林澈打败了对手', characters: ['林澈'] },
        { chapterIndex: 1, text: '林澈又打败了一人', characters: ['林澈'] },
        { chapterIndex: 2, text: '林澈发现了一本残卷', characters: ['林澈'] },
      ],
      new Set(['林澈']),
      10,
    );
    expect(selected).toHaveLength(2);
    expect(selected.every((event) => event.text.includes('打败'))).toBe(true);
    expect(selected.some((event) => event.text.includes('发现'))).toBe(false);
  });

  it('titles events as 谁 · 做了什么 instead of a raw sentence prefix', () => {
    expect(formatEventTitle('林澈打败了对手，获得第一名。', ['林澈'])).toBe('林澈 · 打败对手');
    expect(formatEventTitle('艾拉与凯撒在广场重逢，两人都没说话。', ['艾拉', '凯撒'])).toBe(
      '艾拉、凯撒 · 重逢',
    );
    expect(formatEventTitle('路明非忽然从冰窖里救出芬格尔。', ['路明非', '芬格尔'])).toBe(
      '路明非 · 救出芬格尔',
    );
    expect(formatEventTitle('路明非忽然站了起来。', ['路明非'])).not.toContain('忽然');
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
