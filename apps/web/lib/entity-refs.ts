import type { WorldResourcesDTO } from './types';
import type { RelationshipCreateInput } from './studio-entity-create';

export type EntityRefType = RelationshipCreateInput['source']['type'];

export interface NamedEntityRef {
  type: EntityRefType;
  id: string;
  label: string;
}

export function relationshipRefOptions(resources: WorldResourcesDTO): NamedEntityRef[] {
  return [
    ...resources.entities.characters.map((item) => ({
      type: 'asset' as const,
      id: item.id,
      label: `角色 · ${item.name}`,
    })),
    ...resources.entities.locations.map((item) => ({
      type: 'asset' as const,
      id: item.id,
      label: `地点 · ${item.name}`,
    })),
    ...resources.entities.scenes.map((item) => ({
      type: 'scene' as const,
      id: item.id,
      label: `场景 · ${item.title}`,
    })),
    ...resources.entities.world_events.map((item) => ({
      type: 'world_event' as const,
      id: item.id,
      label: `事件 · ${item.title}`,
    })),
    ...resources.entities.stories.map((item) => ({
      type: 'story' as const,
      id: item.id,
      label: `故事 · ${item.title}`,
    })),
  ];
}

export function refKey(ref: { type: string; id: string }): string {
  return `${ref.type}:${ref.id}`;
}

export function parseRefKey(key: string, options: NamedEntityRef[]): NamedEntityRef | undefined {
  return options.find((item) => refKey(item) === key);
}

const DRAFT_REF_TYPES = [
  'asset',
  'scene',
  'world_event',
  'story',
  'project',
  'relationship',
] as const;

export function parseDraftRef(
  key: string,
  options: NamedEntityRef[],
): { type: EntityRefType | 'project' | 'relationship'; id: string } | undefined {
  const fromOptions = parseRefKey(key, options);
  if (fromOptions) return { type: fromOptions.type, id: fromOptions.id };
  const idx = key.indexOf(':');
  if (idx <= 0) return undefined;
  const type = key.slice(0, idx);
  const id = key.slice(idx + 1);
  if ((DRAFT_REF_TYPES as readonly string[]).includes(type) && id) {
    return { type: type as EntityRefType | 'project' | 'relationship', id };
  }
  return undefined;
}

export function namedRefLabel(resources: WorldResourcesDTO, type: string, id: string): string {
  const match = relationshipRefOptions(resources).find(
    (item) => item.type === type && item.id === id,
  );
  return match?.label ?? `${type}:${id}`;
}

export function characterName(resources: WorldResourcesDTO, id: string): string {
  return resources.entities.characters.find((item) => item.id === id)?.name ?? id;
}

export function sceneTitle(resources: WorldResourcesDTO, id: string): string {
  return resources.entities.scenes.find((item) => item.id === id)?.title ?? id;
}

export function locationName(resources: WorldResourcesDTO, id: string): string {
  return resources.entities.locations.find((item) => item.id === id)?.name ?? id;
}
