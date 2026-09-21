/** Keep-talking / named-speak beats: the reader is silent; speakers find the next beat themselves. */

import { formatAvoidedDirections } from './character-voice.js';

const REPEAT_NGRAM = 4;
const REPEAT_OVERLAP = 0.28;

export function isGroupContinueBeat(input: {
  isGroup: boolean;
  userMessageContent?: string | null;
  lastLiveRole?: string | null;
}): boolean {
  if (!input.isGroup) return false;
  if (input.userMessageContent?.trim()) return false;
  if (input.lastLiveRole === 'user') return false;
  return true;
}

export function looksStuckRepeating(texts: string[]): boolean {
  const recent = texts
    .map((text) => text.replace(/\s+/g, ''))
    .filter((text) => text.length >= REPEAT_NGRAM)
    .slice(-4);
  if (recent.length < 2) return false;
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];
  if (!last || !prev) return false;
  const a = ngrams(last, REPEAT_NGRAM);
  const b = ngrams(prev, REPEAT_NGRAM);
  const denom = Math.min(a.size, b.size);
  if (denom === 0) return false;
  let hits = 0;
  for (const gram of a) {
    if (b.has(gram)) hits += 1;
  }
  return hits / denom >= REPEAT_OVERLAP;
}

/** Drop consecutive assistant beats that are the same loop, keep the latest of each streak. */
export function collapseRepeatedAssistantBeats<T extends { role: string; content: string }>(
  messages: T[],
): T[] {
  const out: T[] = [];
  for (const message of messages) {
    const prev = out[out.length - 1];
    if (
      message.role === 'assistant' &&
      prev?.role === 'assistant' &&
      looksStuckRepeating([prev.content, message.content])
    ) {
      out[out.length - 1] = message;
      continue;
    }
    out.push(message);
  }
  return out;
}

export function pickContinueTopicSeed(input: {
  relations: string[];
  experiences: string[];
  traits: string[];
  companions: string[];
  recentAssistantTexts: string[];
  beatSalt: number;
}): string | null {
  const pool = [...input.traits, ...input.relations, ...input.experiences]
    .map((item) => item.replace(/^·\s*/, '').trim())
    .filter((item) => item.length > 0);
  const recent = input.recentAssistantTexts.join('');
  const unused = pool.filter((item) => {
    const key = item.slice(0, 8);
    return key.length < 4 || !recent.includes(key);
  });
  const choices = unused.length > 0 ? unused : pool;
  if (choices.length > 0) {
    const short = choices.filter((item) => item.length <= 40);
    const pickFrom = short.length > 0 ? short : choices;
    const index = Math.abs(input.beatSalt) % pickFrom.length;
    return pickFrom[index] ?? null;
  }
  const companion = input.companions[0];
  if (companion) {
    return `跟「${companion}」把眼前这件事往下聊，不要重新打招呼。`;
  }
  return null;
}

export function buildGroupContinueCue(input: {
  speakerName: string;
  userLabel: string;
  companions: string[];
  topicSeed: string | null;
  stuckRepeating: boolean;
  avoidDirections?: string[];
}): string {
  const others = input.companions.filter(Boolean).join('、') || '在场的人';
  const lines = [
    `此刻「${input.userLabel}」没有开口，只是在听。不要对他们道别、挥手、报回数，也不要问他们还在不在。`,
    `你是「${input.speakerName}」。对着「${others}」把场面往下推一个节拍：接上一句，或从你们的交情、共同经历里另起一个自然的话头。`,
    '已经说过的道别到此为止。不要编造未发生的主线，也不要总结全场，也不要把亲历讲成说明书。',
  ];
  if (input.stuckRepeating) {
    lines.push('刚才几句已经在重复同一套动作和口头禅，必须换一件你们之间会发生的小事。');
  }
  appendAvoidedDirections(lines, input.avoidDirections);
  if (input.topicSeed) {
    lines.push(`可以从这件事里找话头（当作气氛，不要照念、不要上课）：${input.topicSeed}`);
  }
  return lines.join('\n');
}

/** The human handed this character to the model for one spoken beat. */
export function buildGhostwriteCue(input: {
  speakerName: string;
  companions: string[];
  topicSeed: string | null;
  stuckRepeating: boolean;
  avoidDirections?: string[];
}): string {
  const others = input.companions.filter(Boolean).join('、') || '在场的人';
  const lines = [
    `创作者把「${input.speakerName}」交给你接着演。这一拍由你开口。`,
    `你是「${input.speakerName}」。对着「${others}」把场面往下推一个节拍：接上一句，或从你们的交情、共同经历里另起一个自然的话头。`,
    '不要解释你在代打，不要问创作者想说什么，不要对读者说话，不要编造未发生的主线，也不要把亲历讲成说明书。',
  ];
  if (input.stuckRepeating) {
    lines.push('刚才几句已经在重复同一套动作和口头禅，必须换一件你们之间会发生的小事。');
  }
  appendAvoidedDirections(lines, input.avoidDirections);
  if (input.topicSeed) {
    lines.push(`可以从这件事里找话头（当作气氛，不要照念、不要上课）：${input.topicSeed}`);
  }
  return lines.join('\n');
}

function appendAvoidedDirections(lines: string[], avoidDirections?: string[]): void {
  const line = formatAvoidedDirections(avoidDirections);
  if (line) lines.push(line);
}

export function resolveContinueRetrieveQuery(input: {
  lastAssistantText: string | null;
  topicSeed: string | null;
  stuckRepeating: boolean;
  fallback: string;
}): string {
  if (input.stuckRepeating) {
    return (input.topicSeed || input.lastAssistantText || input.fallback).slice(0, 500);
  }
  const joined = [input.lastAssistantText, input.topicSeed].filter(Boolean).join('\n');
  return (joined || input.fallback).slice(0, 500);
}

function ngrams(text: string, size: number): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i <= text.length - size; i += 1) {
    grams.add(text.slice(i, i + size));
  }
  return grams;
}
