/** 世界线角色/地点剪辑块 → 事件出场 / 场景地点 的落库补丁（纯函数）。 */

export type EventForTrack = {
  id: string;
  presentation_order?: number | null;
  character_ids?: string[];
};

export type SceneForTrack = {
  id: string;
  order?: number | null;
  location_id?: string | null;
};

export type CharacterSpanPatch = { id: string; character_ids: string[] };
export type LocationSpanPatch = { id: string; location_id: string | null };

export function persistClipWrites(kind: string): boolean {
  return kind === 'world_event' || kind === 'scene' || kind === 'character' || kind === 'location';
}

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((id, index) => id === b[index]);
}

export function orderInSpan(order: number, start: number, end: number): boolean {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return order >= lo && order <= hi;
}

export function characterSpanPatches(
  events: EventForTrack[],
  characterId: string,
  start: number,
  end: number,
): CharacterSpanPatch[] {
  const patches: CharacterSpanPatch[] = [];
  for (const event of events) {
    const order = event.presentation_order ?? 0;
    const current = event.character_ids ?? [];
    const inside = orderInSpan(order, start, end);
    const next = inside
      ? current.includes(characterId)
        ? current
        : [...current, characterId]
      : current.filter((id) => id !== characterId);
    if (!sameIds(current, next)) {
      patches.push({ id: event.id, character_ids: next });
    }
  }
  return patches;
}

export function locationSpanPatches(
  scenes: SceneForTrack[],
  locationId: string,
  start: number,
  end: number,
): LocationSpanPatch[] {
  const patches: LocationSpanPatch[] = [];
  for (const scene of scenes) {
    const order = scene.order ?? 0;
    const current = scene.location_id ?? null;
    const inside = orderInSpan(order, start, end);
    const next = inside ? locationId : current === locationId ? null : current;
    if (next !== current) {
      patches.push({ id: scene.id, location_id: next });
    }
  }
  return patches;
}
