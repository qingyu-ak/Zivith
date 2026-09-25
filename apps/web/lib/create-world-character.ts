import { api, createRoleplayThread, unwrapList } from './api';
import { nextUntitledName } from './unique-name';
import type { AssetDTO, ProjectDTO, WorldResourcesDTO } from './types';

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

export function importedCharacterName(existingNames: string[], sourceName: string): string {
  const base = sourceName.trim() || '未命名角色';
  const names = new Set(existingNames.map((name) => name.trim()).filter(Boolean));
  if (!names.has(base)) return base;
  return nextUntitledName(existingNames, `${base} 副本`);
}

function appearanceFrom(source: AssetDTO): AssetDTO['appearance'] | undefined {
  const appearance = source.appearance;
  if (!appearance || typeof appearance !== 'object') return undefined;
  const next = {
    ...(appearance.gender ? { gender: appearance.gender } : {}),
    ...(appearance.age_range ? { age_range: appearance.age_range } : {}),
    ...(appearance.height ? { height: appearance.height } : {}),
    ...(appearance.build ? { build: appearance.build } : {}),
    ...(appearance.skin_tone ? { skin_tone: appearance.skin_tone } : {}),
    ...(appearance.hair ? { hair: appearance.hair } : {}),
    ...(appearance.eyes ? { eyes: appearance.eyes } : {}),
    ...(appearance.distinguishing_features
      ? { distinguishing_features: appearance.distinguishing_features }
      : {}),
    ...(appearance.custom ? { custom: appearance.custom } : {}),
  };
  return Object.keys(next).length > 0 ? next : undefined;
}

export function characterCardCreateBody(source: AssetDTO, name: string): Record<string, unknown> {
  const description = source.description?.trim() || '（待补充）';
  const personality = source.personality?.trim();
  const outfit = source.default_outfit?.trim();
  const aliases = (source.aliases ?? []).map((alias) => alias.trim()).filter(Boolean);
  const appearance = appearanceFrom(source);
  return {
    asset_type: 'character',
    name,
    description,
    state: 'active',
    ...(personality ? { personality } : {}),
    ...(outfit ? { default_outfit: outfit } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(appearance ? { appearance } : {}),
  };
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

async function postCharacterCard(
  projectId: string,
  source: AssetDTO,
  name: string,
): Promise<AssetDTO> {
  const created = await api<AssetDTO>(`/projects/${projectId}/assets`, {
    method: 'POST',
    body: characterCardCreateBody(source, name),
  });
  if (!created?.id) throw new Error('无法写入角色卡');
  return created;
}

/** 在同一个世界里复制一张角色卡。不带扮演线程，名字加「副本」。 */
export async function copyWorldCharacter(input: {
  projectId: string;
  source: AssetDTO;
  existingNames?: string[];
}): Promise<AssetDTO> {
  if (!isPlayableCharacter(input.source)) throw new Error('不能复制「我」这张卡');
  const base = input.source.name.trim() || '未命名角色';
  const name = nextUntitledName(input.existingNames ?? [], `${base} 副本`);
  return postCharacterCard(input.projectId, input.source, name);
}

export async function listImportableWorlds(currentProjectId: string): Promise<{
  worlds: Array<{ id: string; name: string; characters: AssetDTO[] }>;
  failedCount: number;
}> {
  const projects = unwrapList(
    await api<ProjectDTO[] | { data?: ProjectDTO[]; items?: ProjectDTO[] }>('/projects'),
  );
  const worlds: Array<{ id: string; name: string; characters: AssetDTO[] }> = [];
  let failedCount = 0;
  for (const project of projects) {
    if (!project.id || project.id === currentProjectId) continue;
    try {
      const resources = await api<WorldResourcesDTO>(`/world/projects/${project.id}/resources`);
      const characters = playableCharacters(resources.entities?.characters ?? []);
      if (characters.length === 0) continue;
      worlds.push({
        id: project.id,
        name: project.name?.trim() || '未命名世界',
        characters,
      });
    } catch {
      failedCount += 1;
    }
  }
  return { worlds, failedCount };
}

/** 从本机另一个世界拷贝角色卡。不搬记忆、事件、关系、对话。 */
export async function importWorldCharacter(input: {
  targetProjectId: string;
  sourceProjectId: string;
  sourceCharacterId: string;
  existingNames?: string[];
}): Promise<AssetDTO> {
  if (input.sourceProjectId === input.targetProjectId) {
    throw new Error('当前世界请用复制');
  }
  const resources = await api<WorldResourcesDTO>(
    `/world/projects/${input.sourceProjectId}/resources`,
  );
  const source = playableCharacters(resources.entities?.characters ?? []).find(
    (item) => item.id === input.sourceCharacterId,
  );
  if (!source) throw new Error('要导入的角色不存在');
  const name = importedCharacterName(input.existingNames ?? [], source.name);
  return postCharacterCard(input.targetProjectId, source, name);
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
