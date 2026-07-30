import {
  HISTORY_ENTITY_TYPES,
  type HistoryEntityType,
} from '@zivith/domain';

export type HistoryWriteMode = 'off' | 'shadow' | 'dual';

const ENV_KEYS: Record<HistoryEntityType, string> = {
  shot: 'HISTORY_ENTITY_SHOT',
  prompt_version: 'HISTORY_ENTITY_PROMPT_VERSION',
  output: 'HISTORY_ENTITY_OUTPUT',
  appearance_variant: 'HISTORY_ENTITY_APPEARANCE_VARIANT',
  visual_requirement: 'HISTORY_ENTITY_VISUAL_REQUIREMENT',
};

function parseMode(raw: string | undefined): HistoryWriteMode | undefined {
  const value = raw?.trim().toLowerCase();
  if (value === 'off' || value === 'shadow' || value === 'dual') return value;
  return undefined;
}

/**
 * Per-Entity history write mode. Defaults to **off**.
 *
 * Env:
 * - `HISTORY_WRITE_DEFAULT=off|shadow|dual` (default off)
 * - `HISTORY_ENTITY_SHOT` / `_PROMPT_VERSION` / `_OUTPUT` / `_APPEARANCE_VARIANT` / `_VISUAL_REQUIREMENT`
 *   override the default for one Entity type.
 */
export function historyWriteModeFor(entityType: HistoryEntityType): HistoryWriteMode {
  const perEntity = parseMode(process.env[ENV_KEYS[entityType]]);
  if (perEntity) return perEntity;
  return parseMode(process.env.HISTORY_WRITE_DEFAULT) ?? 'off';
}

export function historyWriteModesSnapshot(): Record<HistoryEntityType, HistoryWriteMode> {
  const out = {} as Record<HistoryEntityType, HistoryWriteMode>;
  for (const type of HISTORY_ENTITY_TYPES) {
    out[type] = historyWriteModeFor(type);
  }
  return out;
}
