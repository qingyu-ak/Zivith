// M2 小说导入服务（设计 §5.2–§5.6）
// 导入 = 显式用户动作 = 批量预授权：产物直接写世界层（Asset/WorldEvent/Relationship）
// + 记忆层（MemoryAtom trait / MemoryCore persona 卡），报告记录全部产物 ID 支持整体撤销。
import type { PrismaClient, Prisma } from '@zivith/database';
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
  constructor(private readonly db: PrismaClient) {}

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
        config: jsonValue(config),
      },
    });

    try {
      const report = await this.process(record.id, params.projectId, chapters, config);
      await this.db.novelImport.update({
        where: { id: record.id },
        data: { status: 'done', processedChapters: chapters.length, report: jsonValue(report) },
      });
      return { importId: record.id, report };
    } catch (error) {
      await this.db.novelImport.update({
        where: { id: record.id },
        data: { status: 'failed', report: jsonValue({ error: String(error) }) },
      });
      throw error;
    }
  }

  private async process(
    importId: string,
    projectId: string,
    chapters: ChapterText[],
    config: Required<NovelImportConfig>,
  ): Promise<NovelImportReport> {
    // ① 逐章规则提取（已知名字累积增强跨章召回）
    const known = new Set<string>();
    const extractions: ChapterExtraction[] = [];
    for (const chapter of chapters) {
      const extraction = extractFromChapter(chapter.index, chapter.content, known);
      extractions.push(extraction);
      for (const name of extraction.characterMentions.keys()) known.add(name);
      await this.db.novelImportChapter.create({
        data: {
          importId,
          chapterIndex: chapter.index,
          title: chapter.title,
          status: 'done',
          extractedEntityCount:
            extraction.characterMentions.size + extraction.locationMentions.size,
        },
      });
    }

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
    return this.db.novelImport.findUnique({ where: { id: importId } });
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
