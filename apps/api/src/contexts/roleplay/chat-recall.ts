import { tokenizeForSimilarity } from '@zivith/domain';
import { condenseImportantChat } from '../memory/extract.js';
import { keywordRank } from '../memory/retrieval.js';
import { characterAtomVisibleAtAnchor } from './character-cognition.js';

export const MAX_CATALOG_LINES = 6;
export const MAX_IMPORTANT_LINES = 8;
export const MAX_EXCERPTS = 3;
export const LOG_EXCERPT_MAX_CHARS = 120;

export type RoleplayRecallPack = {
  catalogLines: string[];
  importantLines: string[];
  excerpts: string[];
};

export function roleplayThreadVisibleAtAnchor(input: {
  anchoredWorldEventId: string | null;
  eventOrderById: ReadonlyMap<string, number | null>;
  currentAnchorOrder: number | null;
}): boolean {
  const eventId = input.anchoredWorldEventId;
  let sourceAnchorOrder: number | null = null;
  if (eventId) {
    sourceAnchorOrder = input.eventOrderById.has(eventId)
      ? (input.eventOrderById.get(eventId) ?? null)
      : null;
  }
  return characterAtomVisibleAtAnchor({
    sourceKind: 'roleplay',
    sourceAnchorOrder,
    currentAnchorOrder: input.currentAnchorOrder,
  });
}

export function clipLogExcerpt(content: string, maxChars = LOG_EXCERPT_MAX_CHARS): string {
  return condenseImportantChat(content, maxChars);
}

export function catalogIndexLine(content: string): string {
  return condenseImportantChat(content, 24);
}

export function assembleRoleplayRecall(input: {
  retrieved: Array<{ source: string; id: string }>;
  cores: Array<{ id: string; topic: string; sourceAtomIds: string[] }>;
  atoms: Array<{ id: string; content: string; sourceMessageId: string | null }>;
  visibleAtomIds: ReadonlySet<string>;
  characterName: string;
  query: string;
  logs: Array<{ id: string; content: string }>;
  recentMessageIds: ReadonlySet<string>;
}): RoleplayRecallPack {
  const retrievedCoreIds = new Set(
    input.retrieved.filter((item) => item.source === 'core').map((item) => item.id),
  );
  const catalogLines: string[] = [];
  for (const core of input.cores) {
    if (catalogLines.length >= MAX_CATALOG_LINES) break;
    const linked = core.sourceAtomIds.some((id) => input.visibleAtomIds.has(id));
    const named = core.topic === input.characterName;
    if (!retrievedCoreIds.has(core.id)) continue;
    if (!linked && !named) continue;
    if (catalogLines.includes(core.topic)) continue;
    catalogLines.push(core.topic);
  }

  const importantLines: string[] = [];
  const excerptSourceIds: string[] = [];
  for (const atom of input.atoms) {
    if (!input.visibleAtomIds.has(atom.id)) continue;
    const line = condenseImportantChat(atom.content);
    if (!line || importantLines.includes(line)) continue;
    importantLines.push(line);
    if (atom.sourceMessageId) excerptSourceIds.push(atom.sourceMessageId);
    if (importantLines.length >= MAX_IMPORTANT_LINES) break;
  }

  if (catalogLines.length === 0) {
    for (const line of importantLines) {
      const index = catalogIndexLine(line);
      if (!index || catalogLines.includes(index)) continue;
      catalogLines.push(index);
      if (catalogLines.length >= MAX_CATALOG_LINES) break;
    }
  }

  const logsById = new Map(input.logs.map((log) => [log.id, log]));
  const excerpts: string[] = [];
  const usedLog = new Set<string>();
  const pushExcerpt = (id: string) => {
    if (excerpts.length >= MAX_EXCERPTS) return;
    if (input.recentMessageIds.has(id) || usedLog.has(id)) return;
    const log = logsById.get(id);
    if (!log) return;
    const clip = clipLogExcerpt(log.content);
    if (!clip) return;
    excerpts.push(clip);
    usedLog.add(id);
  };

  for (const id of excerptSourceIds) pushExcerpt(id);

  if (excerpts.length < MAX_EXCERPTS) {
    const ranked = keywordRank(
      tokenizeForSimilarity(input.query),
      input.logs
        .filter((log) => !input.recentMessageIds.has(log.id) && !usedLog.has(log.id))
        .map((log) => ({ id: log.id, content: log.content })),
      MAX_EXCERPTS - excerpts.length + 2,
    );
    for (const id of ranked) pushExcerpt(id);
  }

  return { catalogLines, importantLines, excerpts };
}

export function formatRoleplayRecall(pack: RoleplayRecallPack): string | null {
  const parts: string[] = [];
  if (pack.catalogLines.length > 0) {
    parts.push(`目录：\n${pack.catalogLines.map((line) => `- ${line}`).join('\n')}`);
  }
  if (pack.importantLines.length > 0) {
    parts.push(`重要聊天：\n${pack.importantLines.map((line) => `- ${line}`).join('\n')}`);
  }
  if (pack.excerpts.length > 0) {
    parts.push(`原文摘录：\n${pack.excerpts.map((line) => `- ${line}`).join('\n')}`);
  }
  return parts.length > 0 ? parts.join('\n') : null;
}
