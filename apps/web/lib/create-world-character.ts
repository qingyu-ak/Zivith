import { api, createRoleplayThread } from './api';
import { nextUntitledName } from './unique-name';
import type { AssetDTO } from './types';

export const USER_SELF_TAG = 'user_self';

export function isPlayableCharacter(item: { tags?: string[] | null }): boolean {
  return !item.tags?.includes(USER_SELF_TAG);
}

export function playableCharacters<T extends { tags?: string[] | null }>(items: T[]): T[] {
  return items.filter(isPlayableCharacter);
}

export function requireCharacterName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('请填写角色名称');
  return trimmed.slice(0, 200);
}

export async function createWorldCharacter(input: {
  projectId: string;
  name: string;
  description?: string | null;
  existingNames?: string[];
}): Promise<AssetDTO> {
  const name = nextUntitledName(input.existingNames ?? [], requireCharacterName(input.name));
  const intro = input.description?.trim() ?? '';
  const created = await api<AssetDTO>(`/projects/${input.projectId}/assets`, {
    method: 'POST',
    body: {
      asset_type: 'character',
      name,
      description: intro || '（待补充）',
      ...(intro ? { personality: intro } : {}),
      state: 'active',
    },
  });
  if (!created?.id) throw new Error('无法创建角色');
  return created;
}

/** 在同一个世界里复制一张角色卡。不带扮演线程，名字加「副本」。 */
export async function copyWorldCharacter(input: {
  projectId: string;
  source: AssetDTO;
  existingNames?: string[];
}): Promise<AssetDTO> {
  const base = input.source.name.trim() || '未命名角色';
  const name = nextUntitledName(input.existingNames ?? [], `${base} 副本`);
  const description = input.source.description?.trim() || '（待补充）';
  const personality = input.source.personality?.trim();
  const created = await api<AssetDTO>(`/projects/${input.projectId}/assets`, {
    method: 'POST',
    body: {
      asset_type: 'character',
      name,
      description,
      ...(personality ? { personality } : {}),
      state: 'active',
    },
  });
  if (!created?.id) throw new Error('无法复制角色');
  return created;
}

export async function openRoleplayForCharacter(
  projectId: string,
  characterId: string,
): Promise<string> {
  const created = await createRoleplayThread(projectId, characterId);
  if (!created.thread_id) {
    throw new Error('角色已创建，但没能打开对话。请从角色列表再试。');
  }
  return created.thread_id;
}
