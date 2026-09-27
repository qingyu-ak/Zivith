/** Studio 角色卡：Asset 可编辑字段是权威；MemoryCore 档案是补充。扮演与世界构建对话读同一份。 */

export type CharacterCardInput = {
  name: string;
  description?: string | null;
  personality?: string | null;
  aliases?: string[] | null;
};

export function personalityFromAssetData(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = (data as Record<string, unknown>).personality;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formatCharacterCard(input: CharacterCardInput): string {
  const aliases = (input.aliases ?? []).map((alias) => alias.trim()).filter(Boolean);
  const lines = [`姓名：${input.name.trim() || '未命名'}`];
  if (aliases.length > 0) lines.push(`又称：${aliases.join('、')}`);
  const description = input.description?.trim();
  if (description) lines.push(`简介：${description}`);
  const personality = input.personality?.trim();
  if (personality) lines.push(`个性：${personality}`);
  return lines.join('\n');
}

export function cardFromAssetSnapshot(
  snapshot: Record<string, unknown>,
  fallbackName: string,
): CharacterCardInput {
  const aliases = Array.isArray(snapshot.aliases)
    ? snapshot.aliases.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    name: typeof snapshot.name === 'string' && snapshot.name.trim() ? snapshot.name : fallbackName,
    description: typeof snapshot.description === 'string' ? snapshot.description : null,
    personality: personalityFromAssetData(snapshot.data),
    aliases,
  };
}

/** 卡在前（用户刚改的字段优先），导入/记忆档案在后。 */
export function composeCharacterPersona(card: string, archive: string | null | undefined): string {
  const trimmedArchive = archive?.trim() ?? '';
  if (!trimmedArchive) return card;
  if (trimmedArchive === card || trimmedArchive.includes(card)) return trimmedArchive;
  return `${card}\n\n档案（补充；与上文冲突时以角色卡为准）：\n${trimmedArchive}`;
}

export const READER_SPEAKER_LABEL = '读者';

/** 扮演时用户是谁：默认读者，或一张 Studio 角色卡。 */
export function formatUserSpeakerPrompt(input: { name: string; card: string } | null): {
  label: string;
  section: string;
} {
  if (!input) {
    return {
      label: READER_SPEAKER_LABEL,
      section:
        '## 用户身份\n用户是读者，没有固定角色。不要替用户决定扮演谁，也不要用某个小说角色的口吻代替用户说话。',
    };
  }
  const name = input.name.trim() || '用户角色';
  return {
    label: name,
    section: `## 用户身份\n用户正在扮演「${name}」。把用户的每句话当成这个人在说。\n${input.card}`,
  };
}
