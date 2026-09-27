import type { EntityRevisionDTO, WorldEventDTO } from './types';

export function snapshotText(snapshot: Record<string, unknown>, key: string): string {
  const value = snapshot[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function snapshotPersonality(snapshot: Record<string, unknown>): string {
  const data = snapshot.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
  const value = (data as Record<string, unknown>).personality;
  return typeof value === 'string' ? value.trim() : '';
}

export function stageCaption(revision: EntityRevisionDTO): string {
  const label = revision.stage_label?.trim();
  if (label) return label;
  if (revision.revision === 1) return '最初';
  return `第 ${revision.revision} 阶段`;
}

export function stageExcerpt(revision: EntityRevisionDTO): string {
  const personality = snapshotPersonality(revision.snapshot);
  if (personality) return personality;
  return snapshotText(revision.snapshot, 'description');
}

export function boundEventTitle(
  revision: EntityRevisionDTO,
  events: WorldEventDTO[],
): string | null {
  const id = revision.as_of_world_event_id;
  if (!id) return null;
  const event = events.find((item) => item.id === id);
  return event?.title?.trim() || '已锚定事件';
}
