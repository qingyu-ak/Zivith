/** Keep each speaker sounding like themselves, not a shared narrator. */

const STAGE_DIR = /[（(]([^）)]{2,36})[）)]/g;
const PERSONALITY_LINE = /^个性[：:](.+)$/m;
const PARTICLE = /[的了着过在把从向上下里外地得没不又再这那你我他她它]/g;

export function personalityFromPersonaBlock(persona: string | null | undefined): string | null {
  if (!persona) return null;
  const match = persona.match(PERSONALITY_LINE);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

export function buildVoiceLock(input: {
  name: string;
  personality?: string | null;
  persona?: string | null;
  avoidDirections?: string[];
}): string {
  const personality = input.personality?.trim() || personalityFromPersonaBlock(input.persona) || '';
  const lines = [
    `你是「${input.name}」，不是旁白，也不是在场的其他人。`,
    personality
      ? `按这个性说话（口吻、句长、用词都要像，不要写成说明书）：${personality.slice(0, 360)}`
      : `用「${input.name}」自己会说的话，不要用所有角色共用的书面腔。`,
    '这一拍：对白一两句就够；括号动作最多一个；不要分析剧情给别人上课。',
  ];
  const avoided = formatAvoidedDirections(input.avoidDirections);
  if (avoided) lines.push(avoided);
  return lines.join('\n');
}

export function formatAvoidedDirections(avoidDirections?: string[]): string | null {
  const avoided = (avoidDirections ?? []).map((item) => item.trim()).filter(Boolean);
  if (avoided.length === 0) return null;
  return `刚才已经用过这些动作，这一拍不要再写同类动作（换一件这个人自己会做的小事）：${avoided.slice(0, 8).join('、')}。`;
}

export function collectRecentStageDirections(texts: string[], limit = 8): string[] {
  const found: string[] = [];
  const seenTokens = new Set<string>();
  for (const text of texts.slice(-10)) {
    for (const match of text.matchAll(STAGE_DIR)) {
      const body = match[1]?.trim();
      if (!body) continue;
      const tokens = distinctiveTokens(body);
      if (tokens.some((token) => seenTokens.has(token))) continue;
      for (const token of tokens) seenTokens.add(token);
      found.push(body);
      if (found.length >= limit) return found;
    }
  }
  return found;
}

function distinctiveTokens(body: string): string[] {
  const compact = body.replace(/[，。、；：,.!\s]/g, '').replace(PARTICLE, '');
  if (compact.length < 2) return compact ? [compact] : [];
  const tokens: string[] = [];
  for (let i = 0; i <= compact.length - 2; i += 1) {
    tokens.push(compact.slice(i, i + 2));
  }
  return tokens;
}

/** Group beats: keep at most one parenthetical action. */
export function clampStageDirections(text: string): string {
  let seen = 0;
  const clipped = text.replace(STAGE_DIR, (full) => {
    seen += 1;
    return seen === 1 ? full : '';
  });
  return clipped
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
