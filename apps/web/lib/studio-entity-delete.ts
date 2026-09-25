import { isPlayableCharacter } from './create-world-character';
import type { WorldResourcesDTO, WorldSelection } from './types';

export type StudioDeletableKind = 'character' | 'location' | 'world_event' | 'relationship';

export function studioDeleteTarget(
  selection: WorldSelection,
  resources: WorldResourcesDTO,
): { kind: StudioDeletableKind; path: string; confirm: string } | null {
  if (!selection) return null;
  if (selection.kind === 'character') {
    const character = resources.entities.characters.find((item) => item.id === selection.id);
    if (!character || !isPlayableCharacter(character)) return null;
    const title = character.name.trim() || '这个角色';
    return {
      kind: 'character',
      path: `/assets/${selection.id}`,
      confirm: `删除角色「${title}」？角色卡会从本世界去掉，与 TA 有关的扮演（含 TA 在场的群聊）会关掉。已写入的事件还在。`,
    };
  }
  if (selection.kind === 'location') {
    const location = resources.entities.locations.find((item) => item.id === selection.id);
    const title = location?.name?.trim() || '这个地点';
    return {
      kind: 'location',
      path: `/assets/${selection.id}`,
      confirm: `删除地点「${title}」？它会从世界里去掉。`,
    };
  }
  if (selection.kind === 'world_event') {
    const event = resources.entities.world_events.find((item) => item.id === selection.id);
    const title = event?.title?.trim() || '这条事件';
    return {
      kind: 'world_event',
      path: `/world/world-events/${selection.id}`,
      confirm: `删除事件「${title}」？它会从时间线和相关角色的亲历里消失。`,
    };
  }
  if (selection.kind === 'relationship') {
    const relation = resources.entities.relationships.find((item) => item.id === selection.id);
    const title = relation?.label?.trim() || relation?.kind || '这条关系';
    return {
      kind: 'relationship',
      path: `/world/relationships/${selection.id}`,
      confirm: `删除关系「${title}」？角色卡上的认识谁会一起去掉。`,
    };
  }
  return null;
}
