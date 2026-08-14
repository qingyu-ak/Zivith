/**
 * SiliconFlow Wan video guide: single narrative paragraph, ≤200 words,
 * start from the main action — not a structured camera/lighting dump.
 */

const SECTION_LABELS =
  'Cinematography|Composition|Lighting|Color|Mood|Characters|Action|Dialogue(?: context)?|Environment|Style';

function extractSection(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}:\\s*([\\s\\S]*?)(?=\\s+(?:${SECTION_LABELS}):|$)`, 'i');
  return text.match(re)?.[1]?.trim() ?? '';
}

const MULTI_WORD_KEYS = [
  'shot type',
  'focal length',
  'depth of field',
  'color temperature',
  'duration hint',
  'dialogue context',
] as const;

/** Parse "key value, key2 value2" pairs from a section body. */
function parsePairs(section: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!section.trim()) return result;
  // Split on ", <key>" where key is words/underscores before a value token.
  const parts = section.split(/,\s*(?=[a-z][a-z0-9_ ]{0,40}\s+)/i);
  for (const part of parts) {
    const trimmed = part.trim();
    const lower = trimmed.toLowerCase();
    const multi = MULTI_WORD_KEYS.find((key) => lower.startsWith(`${key} `));
    if (multi) {
      result[multi] = trimmed.slice(multi.length).trim();
      continue;
    }
    const match = trimmed.match(/^([a-z][a-z0-9_]*)\s+(.+)$/i);
    if (!match) continue;
    result[match[1]!.toLowerCase()] = match[2]!.trim();
  }
  return result;
}

function cameraPhrase(cinema: string): string {
  const pairs = parsePairs(cinema);
  const bits = [pairs['shot type'], pairs.angle, pairs.movement]
    .filter(Boolean)
    .map((value) => value!.replaceAll('_', ' '));
  return bits.length > 0 ? `Camera: ${bits.join(', ')}` : '';
}

function characterNames(characters: string): string {
  if (!characters) return '';
  const names = characters
    .split(';')
    .map((part) => part.split(',')[0]?.trim())
    .filter(Boolean);
  return names.length > 0 ? `Featuring ${names.join(' and ')}` : '';
}

function clampWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(' ')}…`;
}

/** Convert Studio structured prompt → Wan-friendly narrative paragraph. */
export function toWanVideoPrompt(positive: string, maxWords = 180): string {
  const trimmed = positive.trim();
  if (!trimmed) return trimmed;

  const looksStructured = /(?:Cinematography|Action|Environment|Composition):/i.test(trimmed);
  if (!looksStructured) {
    return clampWords(trimmed.replace(/\s+/g, ' '), maxWords);
  }

  const actionPairs = parsePairs(extractSection(trimmed, 'Action'));
  const environment = extractSection(trimmed, 'Environment');
  const mood = extractSection(trimmed, 'Mood');
  const cinema = extractSection(trimmed, 'Cinematography');
  const characters = extractSection(trimmed, 'Characters');

  const actionDescription = (actionPairs.description ?? extractSection(trimmed, 'Action'))
    .replace(/,?\s*duration hint\s+\d+/i, '')
    .trim();

  const parts = [
    actionDescription.replace(/\s+/g, ' ').replace(/[。.]$/, ''),
    characterNames(characters),
    environment ? `Setting: ${environment.replace(/\s+/g, ' ')}` : '',
    mood ? `Mood: ${mood.replace(/\s+/g, ' ')}` : '',
    cameraPhrase(cinema),
  ]
    .filter(Boolean)
    .map((part) => part.replace(/\s+/g, ' ').trim());

  const paragraph = parts.join('. ').replace(/\.\./g, '.').trim();
  if (!paragraph) {
    return clampWords(trimmed.replace(/\s+/g, ' '), maxWords);
  }
  return clampWords(paragraph.endsWith('.') ? paragraph : `${paragraph}.`, maxWords);
}
