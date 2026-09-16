// M2 小说导入服务（设计 §5.2–§5.6）
// 导入 = 显式用户动作 = 批量预授权：产物直接写世界层（Asset/WorldEvent/Relationship）
// + 记忆层（MemoryAtom trait / MemoryCore persona 卡），报告记录全部产物 ID 支持整体撤销。
import type { PrismaClient, Prisma } from '@zivith/database';
import { ApiError } from '../../errors.js';
import { computeDedupHash } from '../memory/fingerprint.js';
import { splitChapters, type ChapterText } from './chapter-splitter.js';
import {
  buildImportPlan,
  serializeImportPreview,
  suggestedWorldName,
  type NovelImportPreview,
} from './import-plan.js';
import { extractFromChapter, type ChapterExtraction } from './novel-extract.js';

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
      if (!(
        error instanceof ApiError &&
        (error.code === 'IMPORT_CHAPTER_FAILED' || error.code === 'WORLD_WRITE_FAILED')
      )) {
        await this.failWorldWrite(record.id, error);
      }
      throw error;
    }
  }

  /** Rule extract only. Does not create Project, NovelImport, assets, or memory. */
  previewFromText(params: {
    filename: string;
    text: string;
    config?: NovelImportConfig;
  }): NovelImportPreview {
    const config = { ...DEFAULTS, ...(params.config ?? {}) };
    const chapters = splitChapters(params.text);
    if (chapters.length === 0) {
      throw new ApiError(400, 'NOVEL_EMPTY', '文本没有可用章节');
    }
    const plan = buildImportPlan(this.extractInMemory(chapters), config);
    return serializeImportPreview(plan, {
      suggestedName: suggestedWorldName(params.filename, chapters[0]?.title),
      chapterCount: chapters.length,
    });
  }

  private extractInMemory(chapters: ChapterText[]): ChapterExtraction[] {
    const known = new Set<string>();
    const extractions: ChapterExtraction[] = [];
    for (const chapter of chapters) {
      const extraction = this.extractChapter(chapter.index, chapter.content, known);
      extractions.push(extraction);
      for (const name of extraction.characterMentions.keys()) known.add(name);
    }
    return extractions;
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
      if (!(
        error instanceof ApiError &&
        (error.code === 'IMPORT_CHAPTER_FAILED' || error.code === 'WORLD_WRITE_FAILED')
      )) {
        await this.failWorldWrite(importId, error);
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

  private importAssetFilter(importId: string): Prisma.JsonFilter {
    return { path: ['importId'], equals: importId };
  }

  private async findImportAsset(
    projectId: string,
    importId: string,
    type: 'character' | 'location',
    name: string,
  ) {
    return this.db.asset.findFirst({
      where: {
        projectId,
        type,
        name,
        deletedAt: null,
        data: this.importAssetFilter(importId),
      },
    });
  }

  private async saveReport(
    importId: string,
    report: NovelImportReport,
    extra?: Record<string, unknown>,
  ) {
    await this.db.novelImport.update({
      where: { id: importId },
      data: { report: jsonValue(extra ? { ...report, ...extra } : report) },
    });
  }

  /** 写入失败时保留已落库的 ID，撤销才能对上；不把报告抹成只有 error。 */
  private async failWorldWrite(importId: string, error: unknown, report?: NovelImportReport) {
    const message = error instanceof Error ? error.message : String(error);
    const stored =
      report ??
      asReport(
        (
          await this.db.novelImport.findUnique({
            where: { id: importId },
            select: { report: true },
          })
        )?.report,
      );
    await this.db.novelImport.update({
      where: { id: importId },
      data: {
        status: 'failed',
        report: jsonValue({
          ...stored,
          error: message.slice(0, 500),
          failed_stage: 'world_write',
        }),
      },
    });
  }

  private async process(
    importId: string,
    projectId: string,
    extractions: ChapterExtraction[],
    config: Required<NovelImportConfig>,
  ): Promise<NovelImportReport> {
    const plan = buildImportPlan(extractions, config);
    const full = plan.full;
    const light = plan.light;

    const stored = await this.db.novelImport.findUnique({
      where: { id: importId },
      select: { report: true },
    });
    const report = asReport(stored?.report);
    const assetIdByName = new Map<string, string>(
      report.characters.map((character) => [character.name, character.id]),
    );

    const rememberId = (list: string[], id: string) => {
      if (!list.includes(id)) list.push(id);
    };

    try {
      // ③ 角色 Asset + persona 记忆卡 + trait 原子
      for (const character of full) {
        const existingId =
          assetIdByName.get(character.name) ??
          (await this.findImportAsset(projectId, importId, 'character', character.name))?.id;
        const asset = existingId
          ? { id: existingId }
          : await this.db.asset.create({
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
        if (!report.characters.some((entry) => entry.id === asset.id)) {
          report.characters.push({
            id: asset.id,
            name: character.name,
            aliases: character.aliases,
            mentions: character.mentions,
            tier: 'full',
          });
        }

        const existingCore = await this.db.memoryCore.findFirst({
          where: { projectId, kind: 'persona', topic: character.name },
          orderBy: { version: 'desc' },
        });
        if (existingCore) {
          rememberId(report.memoryCoreIds, existingCore.id);
        } else {
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
          rememberId(report.memoryCoreIds, core.id);
        }

        const existingAtoms = await this.db.memoryAtom.findMany({
          where: { projectId, entityType: 'character', entityId: asset.id, factType: 'trait' },
          select: { id: true },
        });
        if (existingAtoms.length > 0) {
          for (const atom of existingAtoms) rememberId(report.memoryAtomIds, atom.id);
        } else {
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
            rememberId(report.memoryAtomIds, atom.id);
          }
        }
        await this.saveReport(importId, report);
      }
      for (const character of light) {
        const existingId =
          assetIdByName.get(character.name) ??
          (await this.findImportAsset(projectId, importId, 'character', character.name))?.id;
        const asset = existingId
          ? { id: existingId }
          : await this.db.asset.create({
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
        assetIdByName.set(character.name, asset.id);
        if (!report.characters.some((entry) => entry.id === asset.id)) {
          report.characters.push({
            id: asset.id,
            name: character.name,
            aliases: character.aliases,
            mentions: character.mentions,
            tier: 'light',
          });
        }
        await this.saveReport(importId, report);
      }

      // ④ 场景 Asset
      for (const name of plan.locations) {
        const existing =
          report.locations.find((location) => location.name === name) ??
          (await this.findImportAsset(projectId, importId, 'location', name));
        if (existing) {
          if (!report.locations.some((location) => location.id === existing.id)) {
            report.locations.push({ id: existing.id, name });
          }
          continue;
        }
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
        await this.saveReport(importId, report);
      }

      // ⑤ 主线事件：每章最多 2 条，优先多名主要角色同场的强情节句。
      let presentationOrder = report.events.length;
      for (const event of plan.events) {
        const title = event.title;
        if (
          report.events.some(
            (entry) => entry.chapterIndex === event.chapterIndex && entry.title === title,
          )
        ) {
          continue;
        }
        const worldEvent = await this.db.worldEvent.create({
          data: {
            projectId,
            title,
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
        await this.saveReport(importId, report);
      }

      // ⑥ 共现关系 Relationship（主要角色间共现 ≥3 次）
      for (const relation of plan.relationships) {
        const sourceId = assetIdByName.get(relation.source);
        const targetId = assetIdByName.get(relation.target);
        if (!sourceId || !targetId) continue;
        if (
          report.relationships.some(
            (entry) =>
              (entry.source === relation.source && entry.target === relation.target) ||
              (entry.source === relation.target && entry.target === relation.source),
          )
        ) {
          continue;
        }
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
        report.relationships.push({
          id: relationship.id,
          source: relation.source,
          target: relation.target,
        });
        await this.saveReport(importId, report);
      }

      // ⑦ 世界观要点：高频 trait 句中的规则类句子进报告（不直接覆盖 Project.worldview）
      report.worldviewHighlights = plan.worldviewHighlights;
      report.skipped = plan.skipped;

      await this.saveReport(importId, report);
      return report;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'WORLD_WRITE_FAILED') throw error;
      await this.failWorldWrite(importId, error, report);
      const message = error instanceof Error ? error.message : String(error);
      throw new ApiError(422, 'WORLD_WRITE_FAILED', `写入世界层失败：${message.slice(0, 80)}`, {
        import_id: importId,
      });
    }
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

  /** 整体撤销：报告 ID + 按 importId 扫到的孤儿 Asset / 其记忆，一并清掉。 */
  async undo(importId: string): Promise<boolean> {
    const record = await this.db.novelImport.findUnique({ where: { id: importId } });
    if (!record) return false;
    const report = asReport(record.report);
    const now = new Date();
    const tagged = await this.db.asset.findMany({
      where: {
        projectId: record.projectId,
        deletedAt: null,
        data: this.importAssetFilter(importId),
      },
      select: { id: true, name: true, type: true },
    });
    const assetIds = [
      ...new Set(
        report.characters
          .map((character) => character.id)
          .concat(report.locations.map((location) => location.id))
          .concat(tagged.map((asset) => asset.id)),
      ),
    ];
    const characterNames = [
      ...new Set(
        report.characters
          .map((character) => character.name)
          .concat(tagged.filter((asset) => asset.type === 'character').map((asset) => asset.name)),
      ),
    ];
    if (assetIds.length > 0) {
      await this.db.asset.updateMany({ where: { id: { in: assetIds } }, data: { deletedAt: now } });
    }
    const eventIds = report.events.map((event) => event.id);
    if (eventIds.length > 0) {
      await this.db.worldEvent.updateMany({
        where: { id: { in: eventIds } },
        data: { deletedAt: now },
      });
    }
    const relationshipIds = report.relationships.map((rel) => rel.id);
    if (relationshipIds.length > 0) {
      await this.db.relationship.updateMany({
        where: { id: { in: relationshipIds } },
        data: { deletedAt: now },
      });
    }
    const coreIds = [...report.memoryCoreIds];
    if (characterNames.length > 0) {
      const extraCores = await this.db.memoryCore.findMany({
        where: { projectId: record.projectId, kind: 'persona', topic: { in: characterNames } },
        select: { id: true },
      });
      for (const core of extraCores) {
        if (!coreIds.includes(core.id)) coreIds.push(core.id);
      }
    }
    if (coreIds.length > 0) {
      await this.db.memoryCore.deleteMany({ where: { id: { in: coreIds } } });
    }
    const atomIds = [...report.memoryAtomIds];
    if (assetIds.length > 0) {
      const extraAtoms = await this.db.memoryAtom.findMany({
        where: { projectId: record.projectId, entityId: { in: assetIds } },
        select: { id: true },
      });
      for (const atom of extraAtoms) {
        if (!atomIds.includes(atom.id)) atomIds.push(atom.id);
      }
    }
    if (atomIds.length > 0) {
      await this.db.memoryAtom.deleteMany({ where: { id: { in: atomIds } } });
    }
    if (assetIds.length > 0) {
      await this.db.roleplayThread.updateMany({
        where: { characterAssetId: { in: assetIds } },
        data: { status: 'closed' },
      });
    }
    await this.db.novelImport.delete({ where: { id: importId } });
    return true;
  }
}
