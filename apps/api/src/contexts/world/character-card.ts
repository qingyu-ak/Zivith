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

/** 卡在前（用户刚改的字段优先），导入/记忆档案在后。 */
export function composeCharacterPersona(card: string, archive: string | null | undefined): string {
  const trimmedArchive = archive?.trim() ?? '';
  if (!trimmedArchive) return card;
  if (trimmedArchive === card || trimmedArchive.includes(card)) return trimmedArchive;
  return `${card}\n\n档案（补充；与上文冲突时以角色卡为准）：\n${trimmedArchive}`;
}
