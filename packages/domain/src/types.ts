import type {
  AppearanceVariantId,
  AssetId,
  CharacterId,
  ImageGenerationJobId,
  LocationId,
  MediaId,
  OutputId,
  ProjectId,
  SceneId,
  ShotId,
  StoryId,
  StyleId,
  UserId,
  VisualAssetRequirementId,
  VideoGenerationJobId,
} from './ids.js';

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ApprovalState = 'draft' | 'review' | 'approved';
export type ShotState = 'draft' | 'prompting' | 'generating' | 'review' | 'approved';
export type AssetState = 'draft' | 'active' | 'archived';

export interface StyleFields {
  reference?: StyleId | null;
  aspect_ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '21:9' | null;
  fps?: number | null;
  rendering?:
    | 'photorealistic'
    | 'anime'
    | '3d_cgi'
    | 'stop_motion'
    | 'hand_drawn'
    | 'oil_painting'
    | 'pixel_art'
    | null;
}

export interface InheritableContext {
  style?: StyleFields | null;
  mood?: string | null;
  lighting?: ShotLighting | null;
  color?: ShotColor | null;
}

export interface Project {
  id: ProjectId;
  owner_id: UserId;
  name: string;
  description?: string | null;
  defaults: InheritableContext & { negative_prompt?: string | null };
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface Story {
  id: StoryId;
  project_id: ProjectId;
  title: string;
  logline?: string | null;
  synopsis?: string | null;
  genre?: string | null;
  theme?: string | null;
  target_audience?: string | null;
  tone?: string | null;
  target_duration_seconds?: number | null;
  language?: string | null;
  screenplay?: string | null;
  state: ApprovalState;
  overrides?: InheritableContext | null;
  order: number;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface Scene {
  id: SceneId;
  story_id: StoryId;
  project_id: ProjectId;
  title: string;
  summary?: string | null;
  description?: string | null;
  order: number;
  state: ApprovalState;
  location_id?: LocationId | null;
  time?: string | null;
  time_of_day?: string | null;
  weather?: string | null;
  mood?: string | null;
  character_ids: CharacterId[];
  overrides?: InheritableContext | null;
  approved_snapshot?: InheritableContext | null;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface ShotCamera {
  shot_type?:
    | 'close_up'
    | 'medium_shot'
    | 'wide_shot'
    | 'extreme_close_up'
    | 'full_shot'
    | 'over_the_shoulder'
    | 'pov'
    | 'aerial'
    | 'dutch_angle'
    | null;
  angle?: 'eye_level' | 'low_angle' | 'high_angle' | 'birds_eye' | 'worms_eye' | null;
  movement?:
    | 'static'
    | 'pan_left'
    | 'pan_right'
    | 'tilt_up'
    | 'tilt_down'
    | 'dolly_in'
    | 'dolly_out'
    | 'tracking'
    | 'handheld'
    | null;
  focal_length?: string | null;
  depth_of_field?: 'shallow' | 'deep' | null;
  custom?: string | null;
}

export interface ShotComposition {
  framing?: string | null;
  focus_subject?: string | null;
  foreground?: string | null;
  background?: string | null;
  custom?: string | null;
}

export interface ShotLighting {
  type?:
    | 'natural'
    | 'studio'
    | 'dramatic'
    | 'silhouette'
    | 'neon'
    | 'golden_hour'
    | 'overcast'
    | 'practical'
    | null;
  direction?: 'front' | 'side' | 'back' | 'top' | 'bottom' | 'ambient' | null;
  intensity?: 'bright' | 'moderate' | 'low' | 'high_contrast' | null;
  color_temperature?: string | null;
  custom?: string | null;
}

export interface ShotColor {
  palette?: string[] | null;
  saturation?: 'desaturated' | 'natural' | 'vibrant' | 'hyper_real' | null;
  contrast?: 'low' | 'medium' | 'high' | null;
}

export interface ShotCharacter {
  character_id: CharacterId;
  presence?: 'physical' | 'voice_only' | 'implied';
  action?: string | null;
  emotion?: string | null;
  pose?: string | null;
  expression?: string | null;
  outfit_override?: string | null;
  position?: string | null;
}

export interface ShotDialogue {
  text?: string | null;
  speaker_id?: CharacterId | null;
  style?: 'voice_over' | 'on_screen' | 'off_screen' | 'internal_monologue' | null;
}

export interface ShotAction {
  description?: string | null;
  duration_hint?: number | null;
}

export interface ShotAudio {
  music_id?: AssetId | null;
  sfx?: AssetId[] | null;
  ambience?: string | null;
  volume_music?: number | null;
  volume_sfx?: number | null;
}

export interface ShotPrompt {
  positive?: string | null;
  negative?: string | null;
  source: 'auto' | 'manual' | 'hybrid';
  generation_prompt?: string | null;
  custom?: string | null;
}

export type OutputStatus = 'queued' | 'generating' | 'completed' | 'failed';
export interface Output {
  id: OutputId;
  shot_id: ShotId;
  video_url: string;
  thumbnail_url?: string | null;
  model: string;
  model_version?: string | null;
  parameters: JsonValue;
  duration_seconds?: number | null;
  resolution?: string | null;
  file_size_bytes?: number | null;
  generated_at: Date;
  is_active: boolean;
  status: OutputStatus;
  prompt_snapshot: JsonValue;
  context_snapshot: JsonValue;
  visual_media_ids: MediaId[];
}

export interface Shot {
  id: ShotId;
  scene_id: SceneId;
  project_id: ProjectId;
  order: number;
  label?: string | null;
  state: ShotState;
  narrative_mode?: 'present' | 'flashback' | 'memory' | 'dream' | 'fantasy';
  location_area?: string | null;
  camera?: ShotCamera | null;
  composition?: ShotComposition | null;
  lighting?: ShotLighting | null;
  color?: ShotColor | null;
  mood?: string | null;
  style?: StyleFields | null;
  characters: ShotCharacter[];
  dialogue?: ShotDialogue | null;
  action?: ShotAction | null;
  audio?: ShotAudio | null;
  prompt: ShotPrompt;
  outputs: Output[];
  approved_snapshot?: JsonValue | null;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface CharacterAppearance {
  gender?: string | null;
  age_range?: string | null;
  height?: string | null;
  build?: string | null;
  skin_tone?: string | null;
  hair?: string | null;
  eyes?: string | null;
  distinguishing_features?: string | null;
  custom?: string | null;
}

/** Character × narrative appearance state (V0.4 W2). */
export interface AppearanceVariant {
  id: AppearanceVariantId;
  asset_id: AssetId;
  key: string;
  title: string;
  change_reason?: string | null;
  description?: string | null;
  anchor_media_id?: MediaId | null;
  candidate_media_ids: MediaId[];
  state: 'draft' | 'review' | 'approved';
  order: number;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface Character {
  id: CharacterId;
  project_id: ProjectId;
  name: string;
  aliases: string[];
  description: string;
  state: AssetState;
  base_character_id?: CharacterId | null;
  appearance: CharacterAppearance;
  personality?: string | null;
  default_outfit?: string | null;
  reference_images: MediaId[];
  voice_profile_id?: AssetId | null;
  tags: string[];
  metadata?: JsonValue | null;
  deleted_at?: Date | null;
}

export interface Location {
  id: LocationId;
  project_id: ProjectId;
  name: string;
  description: string;
  state: AssetState;
  type?:
    'interior' | 'exterior' | 'fantasy' | 'scifi' | 'modern' | 'historical' | 'abstract' | null;
  time_period?: string | null;
  weather_default?: string | null;
  lighting_default?: string | null;
  mood_default?: string | null;
  reference_images: MediaId[];
  floor_plan_url?: string | null;
  tags: string[];
  deleted_at?: Date | null;
}

export interface Media {
  id: MediaId;
  project_id: ProjectId;
  name: string;
  media_type: 'image' | 'video' | 'audio' | '3d_model' | 'document';
  mime_type: string;
  url: string;
  thumbnail_url?: string | null;
  file_size_bytes?: number | null;
  resolution?: string | null;
  duration_seconds?: number | null;
  source: 'uploaded' | 'generated' | 'imported';
  generation_metadata?: JsonValue | null;
  tags: string[];
  deleted_at?: Date | null;
}

export interface VisualAssetRequirement {
  id: VisualAssetRequirementId;
  scene_id: SceneId;
  asset_type: 'character' | 'location';
  asset_id: AssetId;
  variant_key: string;
  required: boolean;
  reason: string;
  status: 'pending' | 'generating' | 'review' | 'approved' | 'rejected';
  candidate_media_ids: MediaId[];
  approved_media_id?: MediaId | null;
  generation_job_id?: ImageGenerationJobId | null;
  version: number;
}

export interface ImageGenerationJob {
  id: ImageGenerationJobId;
  project_id: ProjectId;
  requirement_id: VisualAssetRequirementId;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  provider: string;
  model: string;
  provider_job_id?: string | null;
  idempotency_key: string;
  parameters: JsonValue;
  error_code?: string | null;
}

export interface VideoGenerationJob {
  id: VideoGenerationJobId;
  project_id: ProjectId;
  shot_id: ShotId;
  output_id: OutputId;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  provider: string;
  model: string;
  provider_job_id?: string | null;
  idempotency_key: string;
  parameters: JsonValue;
  error_code?: string | null;
}
