// Shared aggregation for novel import preview and world write.
// Preview and POST /novel-imports must select the same entities.
import {
  aggregateCharacters,
  formatEventTitle,
  mergeLocationMentions,
  selectImportEvents,
  type ChapterExtraction,
  type CharacterAggregate,
} from './novel-extract.js';

export interface NovelImportLimits {
  maxFullCards: number;
  maxLocations: number;
  maxEvents: number;
}

export interface PlannedEvent {
  chapterIndex: number;
  text: string;
  characters: string[];
  title: string;
}

export interface ImportPlan {
  full: CharacterAggregate[];
  light: CharacterAggregate[];
  locations: string[];
  events: PlannedEvent[];
  relationships: Array<{ source: string; target: string }>;
  worldviewHighlights: string[];
  skipped: string[];
}

export interface NovelImportPreview {
  suggestedName: string;
  chapterCount: number;
  characters: Array<{
    name: string;
    aliases: string[];
    mentions: number;
    tier: 'full' | 'light';
  }>;
  locations: Array<{ name: string }>;
  events: Array<{ title: string; chapterIndex: number }>;
  relationships: Array<{ source: string; target: string }>;
  worldviewHighlights: string[];
  skipped: string[];
  memoryEstimate: number;
}

export function buildImportPlan(
  extractions: ChapterExtraction[],
  config: NovelImportLimits,
): ImportPlan {
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
    .slice(0, config.maxLocations)
    .map(([name]) => name);

  const fullNames = new Set(full.map((character) => character.name));
  const events = selectImportEvents(
    extractions.flatMap((extraction) => extraction.events),
    fullNames,
    config.maxEvents,
  ).map((event) => {
    const who = event.characters.filter((name) => fullNames.has(name));
    return {
      ...event,
      title: formatEventTitle(event.text, who.length > 0 ? who : event.characters),
    };
  });

  const cooccurrence = new Map<string, number>();
  for (const extraction of extractions) {
    for (const [pair, count] of extraction.cooccurrences) {
      cooccurrence.set(pair, (cooccurrence.get(pair) ?? 0) + count);
    }
  }
  const relationships = [...cooccurrence.entries()]
    .filter(([pair, count]) => {
      const [a, b] = pair.split('|');
      return count >= 3 && fullNames.has(a ?? '') && fullNames.has(b ?? '');
    })
    .sort((left, right) => right[1] - left[1])
    .slice(0, 30)
    .map(([pair]) => {
      const [source, target] = pair.split('|');
      return { source: source ?? '', target: target ?? '' };
    })
    .filter((relation) => relation.source && relation.target);

  return {
    full,
    light,
    locations,
    events,
    relationships,
    worldviewHighlights: extractions
      .flatMap((extraction) => extraction.traits.map((trait) => trait.text))
      .slice(0, 8),
    skipped: characters
      .slice(config.maxFullCards + 25)
      .map((character) => `${character.name}（提及 ${character.mentions} 次，超出规模上限）`),
  };
}

export function serializeImportPreview(
  plan: ImportPlan,
  extra: { suggestedName: string; chapterCount: number },
): NovelImportPreview {
  return {
    suggestedName: extra.suggestedName,
    chapterCount: extra.chapterCount,
    characters: [
      ...plan.full.map((character) => ({
        name: character.name,
        aliases: character.aliases,
        mentions: character.mentions,
        tier: 'full' as const,
      })),
      ...plan.light.map((character) => ({
        name: character.name,
        aliases: character.aliases,
        mentions: character.mentions,
        tier: 'light' as const,
      })),
    ],
    locations: plan.locations.map((name) => ({ name })),
    events: plan.events.map((event) => ({
      title: event.title,
      chapterIndex: event.chapterIndex,
    })),
    relationships: plan.relationships,
    worldviewHighlights: plan.worldviewHighlights,
    skipped: plan.skipped,
    memoryEstimate: plan.full.reduce(
      (sum, character) => sum + 1 + Math.min(character.traits.length, 8),
      0,
    ),
  };
}

export function suggestedWorldName(filename: string, firstChapterTitle?: string | null): string {
  const base = filename.replace(/\\/g, '/').split('/').pop() ?? '';
  const stem = base.replace(/\.[Tt][Xx][Tt]$/, '').trim();
  if (stem) return stem.slice(0, 80);
  const title = firstChapterTitle?.trim() ?? '';
  if (title && title !== '开篇') return title.slice(0, 80);
  return '';
}
