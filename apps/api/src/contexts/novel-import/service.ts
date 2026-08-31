// M2 小说导入服务（设计 §5.2–§5.6）
// 导入 = 显式用户动作 = 批量预授权：产物直接写世界层（Asset/WorldEvent/Relationship）
// + 记忆层（MemoryAtom trait / MemoryCore persona 卡），报告记录全部产物 ID 支持整体撤销。
import type { PrismaClient, Prisma } from '@zivith/database';
import { ApiError } from '../../errors.js';
import { computeDedupHash } from '../memory/fingerprint.js';
import { splitChapters, type ChapterText } from './chapter-splitter.js';
import {
  aggregateCharacters,
  extractFromChapter,
  mergeLocationMentions,
  selectImportEvents,
  formatEventTitle,
  type ChapterExtraction,
} from './novel-extract.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asReport(raw: unknown): NovelImportReport {
  const value = isRecord(raw) ? raw : {};
  return {
    characters: Array.isArray(value.characters)
      ? (value.characters as NovelImportReport['characters'])
      : [],
    locations: Array.isArray(value.locations)
      ? (value.locations as NovelImportReport['locations'])
      : [],
    events: Array.isArray(value.events) ? (value.events as NovelImportReport['events']) : [],
    relationships: Array.isArray(value.relationships)
      ? (value.relationships as NovelImportReport['relationships'])
      : [],
    memoryCoreIds: Array.isArray(value.memoryCoreIds) ? (value.memoryCoreIds as string[]) : [],
    memoryAtomIds: Array.isArray(value.memoryAtomIds) ? (value.memoryAtomIds as string[]) : [],
    skipped: Array.isArray(value.skipped) ? (value.skipped as string[]) : [],
    worldviewHighlights: Array.isArray(value.worldviewHighlights)
      ? (value.worldviewHighlights as string[])
      : [],
  };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export interface NovelImportConfig {
  maxFullCards?: number;
  maxLocations?: number;
  maxEvents?: number;
}

const DEFAULTS: Required<NovelImportConfig> = {
  maxFullCards: 15,
  maxLocations: 30,
  maxEvents: 60,
};

const MAX_CHAPTER_ATTEMPTS = 3;

type ExtractChapterFn = (
  chapterIndex: number,
  content: string,
  knownNames?: ReadonlySet<string>,
) => ChapterExtraction;

export interface NovelImportReport {
  characters: Array<{
    id: string;
    name: string;
    aliases: string[];
    mentions: number;
    tier: 'full' | 'light';
  }>;
  locations: Array<{ id: string; name: string }>;
  events: Array<{ id: string; title: string; chapterIndex: number }>;
  relationships: Array<{ id: string; source: string; target: string }>;
  memoryCoreIds: string[];
  memoryAtomIds: string[];
  skipped: string[];
  worldviewHighlights: string[];
}

export class NovelImportService {
  constructor(
    private readonly db: PrismaClient,
    private readonly extractChapter: ExtractChapterFn = extractFromChapter,
  ) {}

  async start(params: {
    projectId: string;
    filename: string;
    text: string;
    config?: NovelImportConfig;
  }): Promise<{ importId: string; report: NovelImportReport }> {
    const config = { ...DEFAULTS, ...(params.config ?? {}) };
    const chapters = splitChapters(params.text);
    if (chapters.length === 0) {
      throw new Error('NOVEL_EMPTY');
    }
    const record = await this.db.novelImport.create({
      data: {
        projectId: params.projectId,
        status: 'processing',
        sourceFilename: params.filename,
        totalChapters: chapters.length,
        mode: 'rule',
        config: jsonValue({ ...config, sourceText: params.text }),
      },
    });

    try {
      await this.db.novelImportChapter.createMany({
        data: chapters.map((chapter) => ({
          importId: record.id,
          chapterIndex: chapter.index,
          title: chapter.title,
          status: 'pending',
        })),
      });
      const extractions = await this.extractChapters(record.id, chapters);
      const report = await this.process(record.id, params.projectId, extractions, config);
      await this.db.novelImport.update({
        where: { id: record.id },
        data: { status: 'done', processedChapters: chapters.length, report: jsonValue(report) },
      });
      return { importId: record.id, report };
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'IMPORT_CHAPTER_FAILED')) {
        await this.db.novelImport.update({
          where: { id: record.id },
          data: { status: 'failed', report: jsonValue({ error: String(error) }) },
        });
      }
      throw error;
    }
  }

  /** 从首个未完成章继续提取；需要 config.sourceText（本次上传时写入）。 */
  async retry(importId: string): Promise<{ importId: string; report: NovelImportReport }> {
    const record = await this.db.novelImport.findUnique({
      where: { id: importId },
      include: { chapters: { orderBy: { chapterIndex: 'asc' } } },
    });
    if (!record) throw new ApiError(404, 'IMPORT_NOT_FOUND', '导入记录不存在');
    if (record.status === 'done') {
      return { importId, report: asReport(record.report) };
    }
    const stored = isRecord(record.config) ? record.config : {};
    const sourceText = typeof stored.sourceText === 'string' ? stored.sourceText : '';
    if (!sourceText.trim()) {
      throw new ApiError(
        409,
        'SOURCE_NOT_KEPT',
        '这次导入没有保留原文，无法按章重试。请重新上传文件。',
      );
    }
    const config = {
      ...DEFAULTS,
      maxFullCards:
        typeof stored.maxFullCards === 'number' ? stored.maxFullCards : DEFAULTS.maxFullCards,
      maxLocations:
        typeof stored.maxLocations === 'number' ? stored.maxLocations : DEFAULTS.maxLocations,
      maxEvents: typeof stored.maxEvents === 'number' ? stored.maxEvents : DEFAULTS.maxEvents,
    };
    const chapters = splitChapters(sourceText);
    if (chapters.length === 0) throw new ApiError(400, 'NOVEL_EMPTY', '文本没有可用章节');
    if (record.chapters.length === 0) {
      await this.db.novelImportChapter.createMany({
        data: chapters.map((chapter) => ({
          importId,
          chapterIndex: chapter.index,
          title: chapter.title,
          status: 'pending',
        })),
      });
    }
    await this.db.novelImport.update({
      where: { id: importId },
      data: { status: 'processing' },
    });
    try {
      const extractions = await this.extractChapters(importId, chapters);
      const report = await this.process(importId, record.projectId, extractions, config);
      await this.db.novelImport.update({
        where: { id: importId },
        data: { status: 'done', processedChapters: chapters.length, report: jsonValue(report) },
      });
      return { importId, report };
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'IMPORT_CHAPTER_FAILED')) {
        await this.db.novelImport.update({
          where: { id: importId },
          data: { status: 'failed', report: jsonValue({ error: String(error) }) },
        });
      }
      throw error;
    }
  }

  private async extractChapters(
    importId: string,
    chapters: ChapterText[],
  ): Promise<ChapterExtraction[]> {
    const rows = await this.db.novelImportChapter.findMany({
      where: { importId },
      orderBy: { chapterIndex: 'asc' },
    });
    const rowByIndex = new Map(rows.map((row) => [row.chapterIndex, row]));
    const known = new Set<string>();
    const extractions: ChapterExtraction[] = [];
    for (const chapter of chapters) {
      const row = rowByIndex.get(chapter.index);
      const alreadyDone = row?.status === 'done';
      if (!alreadyDone && (row?.attempts ?? 0) >= MAX_CHAPTER_ATTEMPTS) {
        await this.db.novelImport.update({
          where: { id: importId },
          data: {
            status: 'failed',
            processedChapters: extractions.length,
            report: jsonValue({
              error: `第 ${chapter.index + 1} 章已重试 ${MAX_CHAPTER_ATTEMPTS} 次`,
              failed_chapter_index: chapter.index,
            }),
          },
        });
        throw new ApiError(
          422,
          'IMPORT_CHAPTER_FAILED',
          `第 ${chapter.index + 1} 章已重试 ${MAX_CHAPTER_ATTEMPTS} 次，请检查文本后重新上传`,
          {
            import_id: importId,
            chapter_index: chapter.index,
            attempts: row?.attempts ?? 0,
          },
        );
      }
      try {
        if (!alreadyDone) {
          await this.db.novelImportChapter.update({
            where: { importId_chapterIndex: { importId, chapterIndex: chapter.index } },
            data: { status: 'processing', attempts: { increment: 1 }, lastError: null },
          });
        }
        const extraction = this.extractChapter(chapter.index, chapter.content, known);
        extractions.push(extraction);
        for (const name of extraction.characterMentions.keys()) known.add(name);
        if (!alreadyDone) {
          await this.db.novelImportChapter.update({
            where: { importId_chapterIndex: { importId, chapterIndex: chapter.index } },
            data: {
              status: 'done',
              lastError: null,
              extractedEntityCount:
                extraction.characterMentions.size + extraction.locationMentions.size,
            },
          });
        }
        await this.db.novelImport.update({
          where: { id: importId },
          data: { processedChapters: extractions.length },
        });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'IMPORT_CHAPTER_FAILED') throw error;
        const message = error instanceof Error ? error.message : String(error);
        await this.db.novelImportChapter.update({
          where: { importId_chapterIndex: { importId, chapterIndex: chapter.index } },
          data: { status: 'failed', lastError: message.slice(0, 500) },
        });
        await this.db.novelImport.update({
          where: { id: importId },
          data: {
            status: 'failed',
            processedChapters: extractions.length,
            report: jsonValue({
              error: message,
              failed_chapter_index: chapter.index,
              failed_chapter_title: chapter.title,
            }),
          },
        });
        throw new ApiError(
          422,
          'IMPORT_CHAPTER_FAILED',
          `第 ${chapter.index + 1} 章提取失败：${message.slice(0, 80)}`,
          {
            import_id: importId,
            chapter_index: chapter.index,
            last_error: message,
          },
        );
      }
    }
    return extractions;
  }

  private async process(
    importId: string,
    projectId: string,
    extractions: ChapterExtraction[],
    config: Required<NovelImportConfig>,
  ): Promise<NovelImportReport> {
    // ② 跨章消歧聚合 + 重要性分层
    const characters = aggregateCharacters(extractions).sort((a, b) => b.mentions - a.mentions);
    const full = characters.slice(0, config.maxFullCards);
    const light = characters
      .slice(config.maxFullCards)
      .filter((character) => character.mentions >= 5)
      .slice(0, 25);
    const locationTotal = new Map<string, number>();
    for (const extraction of extractions) {
      const folded = mergeLocationMentions(extraction.locationMentions);
      for (const [location, count] of folded) {
        locationTotal.set(location, (locationTotal.get(location) ?? 0) + count);
      }
    }
    const locations = [...mergeLocationMentions(locationTotal).entries()]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, config.maxLocations);

    const report: NovelImportReport = {
      characters: [],
      locations: [],
      events: [],
      relationships: [],
      memoryCoreIds: [],
      memoryAtomIds: [],
      skipped: [],
      worldviewHighlights: [],
    };

    // ③ 角色 Asset + persona 记忆卡 + trait 原子
    const assetIdByName = new Map<string, string>();
    for (const character of full) {
      const asset = await this.db.asset.create({
        data: {
          projectId,
          type: 'character',
          state: 'active',
          name: character.name,
          description:
            character.traits[0]?.slice(0, 120) ??
            `《${'导入角色'}》出场 ${character.chapters.size} 章`,
          aliases: character.aliases,
          data: { source: 'novel_import', importId, mentions: character.mentions },
        },
      });
      assetIdByName.set(character.name, asset.id);
      report.characters.push({
        id: asset.id,
        name: character.name,
        aliases: character.aliases,
        mentions: character.mentions,
        tier: 'full',
      });

      const persona = [
        `姓名：${character.name}${character.aliases.length > 0 ? `（又称：${character.aliases.join('、')}）` : ''}`,
        `出场：${character.chapters.size} 章，提及 ${character.mentions} 次`,
        ...character.traits.slice(0, 6).map((trait, i) => `背景${i + 1}：${trait}`),
      ].join('\n');
      const core = await this.db.memoryCore.create({
        data: {
          projectId,
          kind: 'persona',
          topic: character.name,
          content: persona,
          sourceAtomIds: [],
        },
      });
      report.memoryCoreIds.push(core.id);

      for (const trait of character.traits.slice(0, 8)) {
        const atom = await this.db.memoryAtom.create({
          data: {
            projectId,
            entityType: 'character',
            entityId: asset.id,
            factType: 'trait',
            content: trait.slice(0, 200),
            confidence: 0.6,
            dedupHash: computeDedupHash({
              entityType: 'character',
              entityId: asset.id,
              factType: 'trait',
              content: trait,
            }),
          },
        });
        report.memoryAtomIds.push(atom.id);
      }
    }
    for (const character of light) {
      const asset = await this.db.asset.create({
        data: {
          projectId,
          type: 'character',
          state: 'draft',
          name: character.name,
          description: `次要角色（出场 ${character.chapters.size} 章）`,
          aliases: character.aliases,
          data: { source: 'novel_import', importId, tier: 'light' },
        },
      });
      report.characters.push({
        id: asset.id,
        name: character.name,
        aliases: character.aliases,
        mentions: character.mentions,
        tier: 'light',
      });
    }

    // ④ 场景 Asset
    for (const [name] of locations) {
      const asset = await this.db.asset.create({
        data: {
          projectId,
          type: 'location',
          state: 'active',
          name,
          description: `小说导入场景`,
          data: { source: 'novel_import', importId },
        },
      });
      report.locations.push({ id: asset.id, name });
    }

    // ⑤ 主线事件：每章最多 2 条，优先多名主要角色同场的强情节句。
    const fullNames = new Set(full.map((c) => c.name));
    const selectedEvents = selectImportEvents(
      extractions.flatMap((extraction) => extraction.events),
      fullNames,
      config.maxEvents,
    );
    let presentationOrder = 0;
    for (const event of selectedEvents) {
      const who = event.characters.filter((name) => fullNames.has(name));
      const worldEvent = await this.db.worldEvent.create({
        data: {
          projectId,
          title: formatEventTitle(event.text, who.length > 0 ? who : event.characters),
          description: event.text,
          presentationOrder: presentationOrder++,
          state: 'approved',
          characterIds: event.characters
            .map((name) => assetIdByName.get(name))
            .filter((id): id is string => Boolean(id)),
        },
      });
      report.events.push({
        id: worldEvent.id,
        title: worldEvent.title,
        chapterIndex: event.chapterIndex,
      });
    }

    // ⑥ 共现关系 Relationship（主要角色间共现 ≥3 次）
    const cooccurrence = new Map<string, number>();
    for (const extraction of extractions) {
      for (const [pair, count] of extraction.cooccurrences) {
        cooccurrence.set(pair, (cooccurrence.get(pair) ?? 0) + count);
      }
    }
    const relations = [...cooccurrence.entries()]
      .filter(([pair, count]) => {
        const [a, b] = pair.split('|');
        return count >= 3 && fullNames.has(a ?? '') && fullNames.has(b ?? '');
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
    for (const [pair] of relations) {
      const [a, b] = pair.split('|');
      const sourceId = assetIdByName.get(a ?? '');
      const targetId = assetIdByName.get(b ?? '');
      if (!sourceId || !targetId) continue;
      const relationship = await this.db.relationship.create({
        data: {
          projectId,
          kind: 'companion',
          sourceType: 'character',
          sourceId,
          targetType: 'character',
          targetId,
          label: '小说共现关系',
          description: `在导入文本中共同出场`,
          state: 'approved',
        },
      });
      report.relationships.push({ id: relationship.id, source: a ?? '', target: b ?? '' });
    }

    // ⑦ 世界观要点：高频 trait 句中的规则类句子进报告（不直接覆盖 Project.worldview）
    report.worldviewHighlights = extractions
      .flatMap((extraction) => extraction.traits.map((t) => t.text))
      .slice(0, 8);

    report.skipped = characters
      .slice(config.maxFullCards + 25)
      .map((c) => `${c.name}（提及 ${c.mentions} 次，超出规模上限）`);

    return report;
  }

  async get(importId: string) {
    return this.db.novelImport.findUnique({
      where: { id: importId },
      include: {
        chapters: {
          orderBy: { chapterIndex: 'asc' },
          select: {
            chapterIndex: true,
            title: true,
            status: true,
            attempts: true,
            lastError: true,
          },
        },
      },
    });
  }

  /** 把导入产生的轻量角色升为全量卡（写 persona，state=active）。显式用户动作，可超过 15 张上限。 */
  async upgrade(
    importId: string,
    assetId: string,
  ): Promise<{ character: NovelImportReport['characters'][number]; reused: boolean }> {
    const record = await this.db.novelImport.findUnique({ where: { id: importId } });
    if (!record) throw new ApiError(404, 'IMPORT_NOT_FOUND', '导入记录不存在');
    const report = asReport(record.report);
    const entry = report.characters.find((character) => character.id === assetId);
    if (!entry) throw new ApiError(404, 'CHARACTER_NOT_IN_IMPORT', '该角色不属于这次导入');

    const asset = await this.db.asset.findFirst({
      where: { id: assetId, projectId: record.projectId, type: 'character', deletedAt: null },
    });
    if (!asset) throw new ApiError(404, 'CHARACTER_NOT_FOUND', '角色不存在');
    const data = isRecord(asset.data) ? { ...asset.data } : {};
    if (data.source !== 'novel_import' || data.importId !== importId) {
      throw new ApiError(400, 'NOT_IMPORT_CHARACTER', '只能升级这次导入产生的角色');
    }
    if (entry.tier === 'full' && data.tier === 'full') {
      return { character: entry, reused: true };
    }

    const nextData = { ...data, tier: 'full', upgraded: true };
    await this.db.asset.update({
      where: { id: assetId },
      data: { state: 'active', data: jsonValue(nextData) },
    });

    const existingCore = await this.db.memoryCore.findFirst({
      where: { projectId: record.projectId, kind: 'persona', topic: asset.name },
      orderBy: { version: 'desc' },
    });
    if (!existingCore) {
      const aliases = asset.aliases ?? [];
      const persona = [
        `姓名：${asset.name}${aliases.length > 0 ? `（又称：${aliases.join('、')}）` : ''}`,
        entry.mentions
          ? `提及 ${entry.mentions} 次（由轻量条目升级）`
          : '由轻量条目升级为全量角色卡',
        asset.description ? `简介：${asset.description}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const core = await this.db.memoryCore.create({
        data: {
          projectId: record.projectId,
          kind: 'persona',
          topic: asset.name,
          content: persona,
          sourceAtomIds: [],
        },
      });
      report.memoryCoreIds = [...report.memoryCoreIds, core.id];
    }

    entry.tier = 'full';
    await this.db.novelImport.update({
      where: { id: importId },
      data: { report: jsonValue(report) },
    });
    return { character: entry, reused: false };
  }

  async list(projectId: string) {
    return this.db.novelImport.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        sourceFilename: true,
        totalChapters: true,
        processedChapters: true,
        createdAt: true,
        report: true,
      },
    });
  }

  /** 整体撤销：按报告记录的 ID 级联软删世界层 + 删除记忆层。 */
  async undo(importId: string): Promise<boolean> {
    const record = await this.db.novelImport.findUnique({ where: { id: importId } });
    if (!record) return false;
    const report = (record.report ?? {}) as Partial<NovelImportReport>;
    const now = new Date();
    const assetIds = (report.characters ?? [])
      .map((c) => c.id)
      .concat((report.locations ?? []).map((l) => l.id));
    if (assetIds.length > 0) {
      await this.db.asset.updateMany({ where: { id: { in: assetIds } }, data: { deletedAt: now } });
    }
    const eventIds = (report.events ?? []).map((e) => e.id);
    if (eventIds.length > 0) {
      await this.db.worldEvent.updateMany({
        where: { id: { in: eventIds } },
        data: { deletedAt: now },
      });
    }
    const relationshipIds = (report.relationships ?? []).map((r) => r.id);
    if (relationshipIds.length > 0) {
      await this.db.relationship.updateMany({
        where: { id: { in: relationshipIds } },
        data: { deletedAt: now },
      });
    }
    const coreIds = report.memoryCoreIds ?? [];
    if (coreIds.length > 0) {
      await this.db.memoryCore.deleteMany({ where: { id: { in: coreIds } } });
    }
    const atomIds = report.memoryAtomIds ?? [];
    if (atomIds.length > 0) {
      await this.db.memoryAtom.deleteMany({ where: { id: { in: atomIds } } });
    }
    await this.db.roleplayThread.updateMany({
      where: { characterAssetId: { in: assetIds } },
      data: { status: 'closed' },
    });
    await this.db.novelImport.delete({ where: { id: importId } });
    return true;
  }
}
