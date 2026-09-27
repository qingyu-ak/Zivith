import type { WorldResourcesDTO } from '../types';

const RING_HINT = /星环|光环|尘环|冰环|行星环|环带矿|土星环|碎冰带|ice[\s-]?ring|planet[\s-]?ring/;

/** 世界是否有行星环：由设定文本/地点标签推断，没有就不画。 */
export function worldHasPlanetRings(resources: WorldResourcesDTO): boolean {
  const chunks = [
    resources.project.name,
    resources.project.description ?? '',
    resources.project.worldview?.genre ?? '',
    resources.project.worldview?.premise ?? '',
    ...resources.entities.locations.flatMap((loc) => [
      loc.name,
      loc.description,
      ...(loc.tags ?? []),
    ]),
  ];
  return chunks.some((text) => RING_HINT.test(String(text)));
}
