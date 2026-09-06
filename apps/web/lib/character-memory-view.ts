import type { WorldEventDTO, WorldRelationshipDTO, WorldResourcesDTO } from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function worldEventCharacterIds(event: WorldEventDTO): string[] {
  const record = asRecord(event);
  const snake = stringList(event.character_ids);
  if (snake.length > 0) return snake;
  return stringList(record.characterIds);
}

export function worldEventOrder(event: WorldEventDTO): number {
  const record = asRecord(event);
  return num(event.presentation_order) ?? num(record.presentationOrder) ?? 0;
}

export function worldEventTitle(event: WorldEventDTO): string {
  return event.title?.trim() || '未命名事件';
}

export function worldEventSummary(event: WorldEventDTO): string {
  const record = asRecord(event);
  const text =
    (typeof event.description === 'string' ? event.description : null) ??
    (typeof record.description === 'string' ? record.description : null) ??
    '';
  return text.trim();
}

/** 导入写入的「出场 N 章，提及 M 次」不是剧情记忆。 */
export function isSparseImportArchive(content: string): boolean {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  const body = lines.filter((line) => !/^姓名[：:]/.test(line) && !/^又称/.test(line));
  if (body.length === 0) return true;
  return body.every((line) => /出场/.test(line) || /提及/.test(line));
}

export function eventsExperiencedBy(
  resources: WorldResourcesDTO,
  characterId: string,
): WorldEventDTO[] {
  return resources.entities.world_events
    .filter((event) => worldEventCharacterIds(event).includes(characterId))
    .slice()
    .sort((a, b) => worldEventOrder(a) - worldEventOrder(b) || worldEventTitle(a).localeCompare(worldEventTitle(b), 'zh'));
}

function relationshipEnds(relationship: WorldRelationshipDTO): { sourceId: string; targetId: string } {
  const record = asRecord(relationship);
  return {
    sourceId:
      (typeof relationship.source_id === 'string' && relationship.source_id) ||
      (typeof record.sourceId === 'string' ? record.sourceId : ''),
    targetId:
      (typeof relationship.target_id === 'string' && relationship.target_id) ||
      (typeof record.targetId === 'string' ? record.targetId : ''),
  };
}

function entityName(resources: WorldResourcesDTO, id: string): string {
  const characters = resources.entities.characters.find((item) => item.id === id);
  if (characters) return characters.name;
  const location = resources.entities.locations.find((item) => item.id === id);
  if (location) return location.name;
  const scene = resources.entities.scenes.find((item) => item.id === id);
  if (scene) return scene.title;
  const event = resources.entities.world_events.find((item) => item.id === id);
  if (event) return worldEventTitle(event);
  return '某人';
}

export function relationshipsForCharacter(
  resources: WorldResourcesDTO,
  characterId: string,
): Array<{ id: string; label: string }> {
  return resources.entities.relationships
    .map((relationship) => {
      const { sourceId, targetId } = relationshipEnds(relationship);
      if (sourceId !== characterId && targetId !== characterId) return null;
      const otherId = sourceId === characterId ? targetId : sourceId;
      const other = entityName(resources, otherId);
      const kind = relationship.label?.trim() || relationship.kind || '关系';
      const extra = relationship.description?.trim();
      return {
        id: relationship.id,
        label: extra ? `与「${other}」：${kind}（${extra}）` : `与「${other}」：${kind}`,
      };
    })
    .filter((item): item is { id: string; label: string } => Boolean(item));
}
