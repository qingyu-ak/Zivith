import { createHash } from 'node:crypto';
import type { Prisma} from '@zivith/database';
import { type PrismaClient } from '@zivith/database';

export type RecomputeKind = 'visual_prep' | 'prompt' | 'video';
export type RecomputeEntityType = 'scene' | 'shot';

export function stableInputHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function scopedLockKey(
  kind: RecomputeKind,
  entityType: RecomputeEntityType,
  entityId: string,
): string {
  return `${kind}:${entityType}:${entityId}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Mark non-approved visual requirements pending; leave approved untouched. */
export async function markSceneVisualsStale(
  db: PrismaClient | Prisma.TransactionClient,
  sceneId: string,
): Promise<number> {
  const result = await db.visualAssetRequirement.updateMany({
    where: {
      sceneId,
      deletedAt: null,
      status: { not: 'approved' },
    },
    data: {
      status: 'pending',
      approvedMediaId: null,
    },
  });
  return result.count;
}

/**
 * For Scene visual recompute: clear unapproved prompt approvals on shots in the scene
 * and move non-approved shots back to prompting (downstream stale per §4.1).
 */
export async function markSceneDownstreamPromptsStale(
  db: PrismaClient | Prisma.TransactionClient,
  sceneId: string,
): Promise<number> {
  const shots = await db.shot.findMany({
    where: { sceneId, deletedAt: null, state: { not: 'approved' } },
    select: { id: true },
  });
  if (shots.length === 0) return 0;
  const shotIds = shots.map((shot) => shot.id);
  await db.promptVersion.updateMany({
    where: { shotId: { in: shotIds } },
    data: { approvedAt: null },
  });
  const updated = await db.shot.updateMany({
    where: { id: { in: shotIds }, state: { not: 'approved' } },
    data: { state: 'prompting' },
  });
  return updated.count;
}

/** Shot prompt recompute: non-approved shots → prompting; approved shots untouched. */
export async function markShotPromptStale(
  db: PrismaClient | Prisma.TransactionClient,
  shotId: string,
): Promise<boolean> {
  const shot = await db.shot.findFirst({
    where: { id: shotId, deletedAt: null },
    select: { id: true, state: true },
  });
  if (!shot || shot.state === 'approved') return false;
  await db.shot.update({
    where: { id: shotId },
    data: { state: 'prompting' },
  });
  return true;
}

export function sceneVisualInputSnapshot(scene: {
  id: string;
  title: string;
  description: string | null;
  time: string | null;
  weather: string | null;
  mood: string | null;
  locationId: string | null;
  characterIds: string[];
  overrides?: unknown;
}): unknown {
  const overrides = record(scene.overrides);
  return {
    scene_id: scene.id,
    title: scene.title,
    description: scene.description,
    time: scene.time,
    weather: scene.weather,
    mood: scene.mood,
    location_id: scene.locationId,
    character_ids: [...scene.characterIds].sort(),
    time_of_day: overrides.time_of_day ?? scene.time ?? null,
  };
}

export function shotPromptInputSnapshot(shot: {
  id: string;
  camera: unknown;
  composition: unknown;
  lighting: unknown;
  color: unknown;
  mood: string | null;
  characters: unknown;
  dialogue: unknown;
  action: unknown;
  style: unknown;
  prompt: unknown;
}): unknown {
  return {
    shot_id: shot.id,
    camera: shot.camera,
    composition: shot.composition,
    lighting: shot.lighting,
    color: shot.color,
    mood: shot.mood,
    characters: shot.characters,
    dialogue: shot.dialogue,
    action: shot.action,
    style: shot.style,
    custom_prompt: record(shot.prompt).custom ?? null,
  };
}

export function shotVideoInputSnapshot(shot: {
  id: string;
  prompt: unknown;
}): unknown {
  const prompt = record(shot.prompt);
  return {
    shot_id: shot.id,
    positive: prompt.positive ?? null,
    negative: prompt.negative ?? null,
  };
}
