import type {
  AppearanceVariant,
  Character,
  CharacterAppearance,
  InheritableContext,
  Location,
  Project,
  Scene,
  Shot,
  ShotCharacter,
  Story,
  VisualAssetRequirement,
} from './types.js';
import type { MediaId } from './ids.js';
import { DomainError } from './shot-state.js';

export const DEFAULT_APPEARANCE_VARIANT_KEY = 'default';
export const DEFAULT_APPEARANCE_VARIANT_TITLE = '默认形象';

/**
 * Scenes belonging to a segment must form a contiguous block in story-global order
 * (ADR-0006 single source of truth — no separate segment-local order).
 */
export function assertSegmentSceneOrderConsistent(
  scenesInGlobalOrder: readonly { id: string; order: number; segment_id?: string | null }[],
  segmentId: string,
): void {
  const sorted = [...scenesInGlobalOrder].sort((a, b) => a.order - b.order);
  const flags = sorted.map((scene) => scene.segment_id === segmentId);
  const first = flags.indexOf(true);
  const last = flags.lastIndexOf(true);
  if (first === -1) return;
  for (let index = first; index <= last; index += 1) {
    if (!flags[index]) {
      throw new DomainError(
        'SEGMENT_SCENE_ORDER_INCONSISTENT',
        '段落内场景必须在故事全局 order 中连续，且与全局顺序一致',
        { segment_id: segmentId },
      );
    }
  }
}

type PlainObject = Record<string, unknown>;

function isObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merges objects while treating null and undefined as inherited values. */
export function mergeInherited<T>(...layers: readonly (T | null | undefined)[]): T {
  const merge = (base: unknown, local: unknown): unknown => {
    if (local === null || local === undefined) return base;
    if (!isObject(base) || !isObject(local)) return local;
    const result: PlainObject = { ...base };
    for (const [key, value] of Object.entries(local)) result[key] = merge(result[key], value);
    return result;
  };
  return layers.reduce<unknown>((resolved, layer) => merge(resolved, layer), {}) as T;
}

export interface ResolvedShotContext extends InheritableContext {
  camera?: Shot['camera'];
  composition?: Shot['composition'];
  characters: Shot['characters'];
}

export function resolveShotContext(
  project: Project,
  story: Story,
  scene: Scene,
  shot: Shot,
): ResolvedShotContext {
  if (shot.state === 'approved') {
    if (!shot.approved_snapshot || !isObject(shot.approved_snapshot)) {
      throw new DomainError('APPROVED_SNAPSHOT_MISSING', '已批准镜头缺少冻结快照');
    }
    const snapshot = isObject(shot.approved_snapshot.context)
      ? shot.approved_snapshot.context
      : shot.approved_snapshot;
    return snapshot as unknown as ResolvedShotContext;
  }
  const local: InheritableContext = {};
  if (shot.style !== undefined) local.style = shot.style;
  if (shot.mood !== undefined) local.mood = shot.mood;
  if (shot.lighting !== undefined) local.lighting = shot.lighting;
  if (shot.color !== undefined) local.color = shot.color;
  const inherited = mergeInherited<InheritableContext>(
    project.defaults,
    story.overrides,
    scene.overrides,
    local,
  );
  const result: ResolvedShotContext = {
    ...inherited,
    characters: shot.characters,
  };
  if (shot.camera !== undefined) result.camera = shot.camera;
  if (shot.composition !== undefined) result.composition = shot.composition;
  return result;
}

export function resolveCharacter(
  character: Character,
  getCharacter: (id: Character['id']) => Character | undefined,
  visited = new Set<string>(),
): Character {
  if (!character.base_character_id) return character;
  if (visited.has(character.id))
    throw new DomainError('CHARACTER_CYCLE', '角色基础外观存在循环引用');
  visited.add(character.id);
  const base = getCharacter(character.base_character_id);
  if (!base || base.project_id !== character.project_id) {
    throw new DomainError('ASSET_NOT_FOUND', '基础角色不存在或不属于当前项目');
  }
  const resolvedBase = resolveCharacter(base, getCharacter, visited);
  const resolved: Character = {
    ...character,
    appearance: mergeInherited<CharacterAppearance>(resolvedBase.appearance, character.appearance),
    reference_images: character.reference_images.length
      ? character.reference_images
      : resolvedBase.reference_images,
  };
  const outfit = character.default_outfit ?? resolvedBase.default_outfit;
  if (outfit !== undefined) resolved.default_outfit = outfit;
  return resolved;
}

export interface ResolvedCharacterReference {
  character: Character;
  shot: ShotCharacter;
  outfit?: string | null;
  visual_media_id?: MediaId;
}

/**
 * Merges a variant's free-text description over the character's base appearance
 * (variant description wins on `custom`; other appearance fields stay from the base).
 */
export function resolveAppearanceWithVariant(
  appearance: CharacterAppearance,
  variant?: Pick<AppearanceVariant, 'description'> | null,
): CharacterAppearance {
  const description = variant?.description?.trim();
  if (!description) return appearance;
  return mergeInherited<CharacterAppearance>(appearance, { custom: description });
}

/** Prefer matching appearance-variant anchor when `variant_key` hits a known variant. */
export function resolveAppearanceVariantAnchor(
  variants: readonly Pick<AppearanceVariant, 'key' | 'anchor_media_id' | 'deleted_at' | 'state'>[],
  variantKey: string,
): MediaId | undefined {
  const match = variants.find(
    (item) => item.key === variantKey && !item.deleted_at && item.anchor_media_id,
  );
  return match?.anchor_media_id ?? undefined;
}

export function resolveVisualMedia(
  asset: Character | Location,
  requirements: readonly VisualAssetRequirement[],
  options?: {
    variant_key?: string;
    appearance_variants?: readonly Pick<
      AppearanceVariant,
      'key' | 'anchor_media_id' | 'deleted_at' | 'state'
    >[];
  },
): MediaId | undefined {
  const binding = requirements.find(
    (item) =>
      String(item.asset_id) === String(asset.id) &&
      item.status === 'approved' &&
      item.approved_media_id,
  );
  if (binding?.approved_media_id) return binding.approved_media_id;

  const variantKey = options?.variant_key;
  if (variantKey && options?.appearance_variants?.length) {
    const fromVariant = resolveAppearanceVariantAnchor(options.appearance_variants, variantKey);
    if (fromVariant) return fromVariant;
  }

  return asset.reference_images[0];
}

export function resolveCharacterReference(
  ref: ShotCharacter,
  character: Character,
  requirements: readonly VisualAssetRequirement[],
  getCharacter: (id: Character['id']) => Character | undefined,
): ResolvedCharacterReference {
  const resolved = resolveCharacter(character, getCharacter);
  const result: ResolvedCharacterReference = {
    character: resolved,
    shot: ref,
  };
  const outfit = ref.outfit_override ?? resolved.default_outfit;
  if (outfit !== undefined) result.outfit = outfit;
  if (ref.presence !== 'voice_only' && ref.presence !== 'implied') {
    const mediaId = resolveVisualMedia(resolved, requirements);
    if (mediaId) result.visual_media_id = mediaId;
  }
  return result;
}

export function assertVisualAssetsApproved(
  requirements: readonly VisualAssetRequirement[],
  characters: readonly ShotCharacter[],
): void {
  const physicalIds = new Set<string>(
    characters
      .filter((item) => (item.presence ?? 'physical') === 'physical')
      .map((item) => String(item.character_id)),
  );
  const missing = requirements.filter(
    (item) =>
      item.required &&
      (item.asset_type === 'location' || physicalIds.has(String(item.asset_id))) &&
      (item.status !== 'approved' || !item.approved_media_id),
  );
  if (missing.length) {
    throw new DomainError('VISUAL_ASSETS_NOT_APPROVED', '场景所需视觉资产尚未全部批准', {
      requirement_ids: missing.map((item) => item.id),
    });
  }
}
