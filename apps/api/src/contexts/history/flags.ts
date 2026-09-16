import { HISTORY_ENTITY_TYPES, type HistoryEntityType } from '@zivith/domain';

export type HistoryWriteMode = 'off' | 'shadow' | 'dual';

const ENV_KEYS: Record<HistoryEntityType, string> = {
  shot: 'HISTORY_ENTITY_SHOT',
  prompt_version: 'HISTORY_ENTITY_PROMPT_VERSION',
  output: 'HISTORY_ENTITY_OUTPUT',
  appearance_variant: 'HISTORY_ENTITY_APPEARANCE_VARIANT',
  visual_requirement: 'HISTORY_ENTITY_VISUAL_REQUIREMENT',
  world_event: 'HISTORY_ENTITY_WORLD_EVENT',
  relationship: 'HISTORY_ENTITY_RELATIONSHIP',
  character: 'HISTORY_ENTITY_CHARACTER',
  location: 'HISTORY_ENTITY_LOCATION',
};

/** Character/location State history is the product path; default dual so Inspector/roleplay see stages. */
const PRODUCT_DUAL_DEFAULT: ReadonlySet<HistoryEntityType> = new Set(['character', 'location']);

function parseMode(raw: string | undefined): HistoryWriteMode | undefined {
  const value = raw?.trim().toLowerCase();
  if (value === 'off' || value === 'shadow' || value === 'dual') return value;
  return undefined;
}

/**
 * Per-Entity history write mode. Defaults to **off**, except character/location (**dual**).
 *
 * Env:
 * - `HISTORY_WRITE_DEFAULT=off|shadow|dual` (default off)
 * - `HISTORY_ENTITY_SHOT` / `_PROMPT_VERSION` / `_OUTPUT` / `_APPEARANCE_VARIANT` / `_VISUAL_REQUIREMENT` / `_WORLD_EVENT` / `_CHARACTER` / `_LOCATION`
 *   override the default for one Entity type.
 */
export function historyWriteModeFor(entityType: HistoryEntityType): HistoryWriteMode {
  const perEntity = parseMode(process.env[ENV_KEYS[entityType]]);
  if (perEntity) return perEntity;
  const fallback = parseMode(process.env.HISTORY_WRITE_DEFAULT);
  if (fallback) return fallback;
  if (PRODUCT_DUAL_DEFAULT.has(entityType)) return 'dual';
  return 'off';
}

export function historyWriteModesSnapshot(): Record<HistoryEntityType, HistoryWriteMode> {
  const out = {} as Record<HistoryEntityType, HistoryWriteMode>;
  for (const type of HISTORY_ENTITY_TYPES) {
    out[type] = historyWriteModeFor(type);
  }
  return out;
}
