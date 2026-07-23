import { z } from 'zod';

const nullableString = z.string().trim().max(10_000).nullable().optional();
const assetId = z.string().min(1).max(128);
const volume = z.number().min(0).max(1);

export const styleSchema = z
  .object({
    reference: assetId.nullable().optional(),
    aspect_ratio: z.enum(['16:9', '9:16', '1:1', '4:3', '21:9']).nullable().optional(),
    fps: z.number().int().min(1).max(240).nullable().optional(),
    rendering: z
      .enum([
        'photorealistic',
        'anime',
        '3d_cgi',
        'stop_motion',
        'hand_drawn',
        'oil_painting',
        'pixel_art',
      ])
      .nullable()
      .optional(),
  })
  .strict();

export const cameraSchema = z
  .object({
    shot_type: z
      .enum([
        'close_up',
        'medium_shot',
        'wide_shot',
        'extreme_close_up',
        'full_shot',
        'over_the_shoulder',
        'pov',
        'aerial',
        'dutch_angle',
      ])
      .nullable()
      .optional(),
    angle: z
      .enum(['eye_level', 'low_angle', 'high_angle', 'birds_eye', 'worms_eye'])
      .nullable()
      .optional(),
    movement: z
      .enum([
        'static',
        'pan_left',
        'pan_right',
        'tilt_up',
        'tilt_down',
        'dolly_in',
        'dolly_out',
        'tracking',
        'handheld',
      ])
      .nullable()
      .optional(),
    focal_length: nullableString,
    depth_of_field: z.enum(['shallow', 'deep']).nullable().optional(),
    custom: nullableString,
  })
  .strict();

export const compositionSchema = z
  .object({
    framing: nullableString,
    focus_subject: nullableString,
    foreground: nullableString,
    background: nullableString,
    custom: nullableString,
  })
  .strict();

export const lightingSchema = z
  .object({
    type: z
      .enum([
        'natural',
        'studio',
        'dramatic',
        'silhouette',
        'neon',
        'golden_hour',
        'overcast',
        'practical',
      ])
      .nullable()
      .optional(),
    direction: z.enum(['front', 'side', 'back', 'top', 'bottom', 'ambient']).nullable().optional(),
    intensity: z.enum(['bright', 'moderate', 'low', 'high_contrast']).nullable().optional(),
    color_temperature: nullableString,
    custom: nullableString,
  })
  .strict();

export const colorSchema = z
  .object({
    palette: z.array(z.string().trim().min(1).max(100)).max(32).nullable().optional(),
    saturation: z.enum(['desaturated', 'natural', 'vibrant', 'hyper_real']).nullable().optional(),
    contrast: z.enum(['low', 'medium', 'high']).nullable().optional(),
  })
  .strict();

export const shotCharacterSchema = z
  .object({
    character_id: assetId,
    presence: z.enum(['physical', 'voice_only', 'implied']).default('physical'),
    action: nullableString,
    emotion: nullableString,
    pose: nullableString,
    expression: nullableString,
    outfit_override: nullableString,
    position: nullableString,
  })
  .strict();

export const dialogueSchema = z
  .object({
    text: nullableString,
    speaker_id: assetId.nullable().optional(),
    style: z
      .enum(['voice_over', 'on_screen', 'off_screen', 'internal_monologue'])
      .nullable()
      .optional(),
  })
  .strict();

export const actionSchema = z
  .object({
    description: nullableString,
    duration_hint: z.number().positive().max(120).nullable().optional(),
  })
  .strict();

export const audioSchema = z
  .object({
    music_id: assetId.nullable().optional(),
    sfx: z.array(assetId).max(64).nullable().optional(),
    ambience: nullableString,
    volume_music: volume.nullable().optional(),
    volume_sfx: volume.nullable().optional(),
  })
  .strict();

export const promptSchema = z
  .object({
    positive: nullableString,
    negative: nullableString,
    source: z.enum(['auto', 'manual', 'hybrid']).default('auto'),
    generation_prompt: nullableString,
    custom: nullableString,
  })
  .strict();

export const shotCreateSchema = z
  .object({
    label: nullableString,
    order: z.number().int().positive().optional(),
    narrative_mode: z
      .enum(['present', 'flashback', 'memory', 'dream', 'fantasy'])
      .default('present'),
    location_area: nullableString,
    camera: cameraSchema.nullable().optional(),
    composition: compositionSchema.nullable().optional(),
    lighting: lightingSchema.nullable().optional(),
    color: colorSchema.nullable().optional(),
    mood: nullableString,
    style: styleSchema.nullable().optional(),
    characters: z.array(shotCharacterSchema).max(100).default([]),
    dialogue: dialogueSchema.nullable().optional(),
    action: actionSchema.nullable().optional(),
    audio: audioSchema.nullable().optional(),
    prompt: promptSchema.default({ source: 'auto' }),
  })
  .strict();

export const shotPatchSchema = shotCreateSchema.partial().strict();

export const characterAppearanceSchema = z
  .object({
    gender: nullableString,
    age_range: nullableString,
    height: nullableString,
    build: nullableString,
    skin_tone: nullableString,
    hair: nullableString,
    eyes: nullableString,
    distinguishing_features: nullableString,
    custom: nullableString,
  })
  .strict();

/** Stable semantic key, e.g. default / wounded / young */
export const appearanceVariantKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/, '形象键须为小写字母开头的 slug（如 default、wounded）');

export const appearanceVariantSchema = z
  .object({
    key: appearanceVariantKeySchema,
    title: z.string().trim().min(1).max(200),
    change_reason: nullableString,
    description: z.string().trim().max(20_000).nullable().optional(),
    anchor_media_id: assetId.nullable().optional(),
    candidate_media_ids: z.array(assetId).max(50).default([]),
    state: z.enum(['draft', 'review', 'approved']).default('draft'),
    order: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const appearanceVariantCreateSchema = appearanceVariantSchema
  .omit({ anchor_media_id: true, candidate_media_ids: true, state: true })
  .strict();

export const appearanceVariantPatchSchema = appearanceVariantCreateSchema.partial().strict();

export const storySegmentSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    synopsis: z.string().trim().max(50_000).nullable().optional(),
    draft: z.string().trim().max(200_000).nullable().optional(),
    order: z.number().int().positive().optional(),
    state: z.enum(['draft', 'review', 'approved']).optional(),
  })
  .strict();

export const storySegmentCreateSchema = storySegmentSchema
  .omit({ state: true })
  .extend({
    title: z.string().trim().min(1).max(300),
  })
  .strict();

export const storySegmentPatchSchema = storySegmentSchema.partial().strict();

export const characterSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    aliases: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    description: z.string().trim().min(1).max(20_000),
    state: z.enum(['draft', 'active', 'archived']).default('draft'),
    base_character_id: assetId.nullable().optional(),
    appearance: characterAppearanceSchema.default({}),
    personality: nullableString,
    default_outfit: nullableString,
    reference_images: z.array(assetId).max(100).default([]),
    voice_profile_id: assetId.nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
    metadata: z.record(z.unknown()).nullable().optional(),
  })
  .strict();

export const locationSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(20_000),
    state: z.enum(['draft', 'active', 'archived']).default('draft'),
    type: z
      .enum(['interior', 'exterior', 'fantasy', 'scifi', 'modern', 'historical', 'abstract'])
      .nullable()
      .optional(),
    time_period: nullableString,
    weather_default: nullableString,
    lighting_default: nullableString,
    mood_default: nullableString,
    reference_images: z.array(assetId).max(100).default([]),
    floor_plan_url: z.preprocess(
      (value) => (value === '' ? null : value),
      z.string().url().nullable().optional(),
    ),
    tags: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  })
  .strict();

export const visualAssetRequirementSchema = z
  .object({
    asset_type: z.enum(['character', 'location']),
    asset_id: assetId,
    variant_key: z.string().trim().min(1).max(200),
    required: z.boolean(),
    reason: z.string().trim().min(1).max(2000),
    status: z.enum(['pending', 'generating', 'review', 'approved', 'rejected']).default('pending'),
    candidate_media_ids: z.array(assetId).default([]),
    approved_media_id: assetId.nullable().optional(),
    generation_job_id: assetId.nullable().optional(),
    version: z.number().int().positive().default(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === 'approved' && !value.approved_media_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approved_media_id'],
        message: '已批准的视觉资产必须选择媒体',
      });
    }
  });
