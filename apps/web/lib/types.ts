export type ShotState = 'draft' | 'prompting' | 'generating' | 'review' | 'approved';
export type AssetType = 'character' | 'location';

export interface UserDTO {
  id: string;
  email: string;
  name?: string;
}

export interface ProjectDTO {
  id: string;
  name: string;
  description?: string | null;
  thumbnail_url?: string | null;
  story_count?: number;
  asset_count?: number;
  created_at?: string;
}

export interface StoryDTO {
  id: string;
  project_id: string;
  title: string;
  logline?: string | null;
  synopsis?: string | null;
  genre?: string | null;
  theme?: string | null;
  target_audience?: string | null;
  status?: string;
  scene_count?: number;
}

export interface SceneDTO {
  id: string;
  story_id: string;
  order: number;
  title: string;
  summary?: string | null;
  location_id?: string | null;
  time_of_day?: string | null;
  weather?: string | null;
  mood?: string | null;
  shot_count?: number;
}

export interface ShotCharacterDTO {
  character_id: string;
  presence?: 'physical' | 'voice_only' | 'implied';
  action?: string;
  emotion?: string;
  pose?: string;
  expression?: string;
  outfit_override?: string;
  position?: string;
}

export interface ShotDTO {
  id: string;
  scene_id: string;
  order: number;
  label?: string | null;
  state: ShotState;
  narrative_mode?: 'present' | 'flashback' | 'memory' | 'dream' | 'fantasy';
  location_area?: string;
  camera?: {
    shot_type?: string;
    angle?: string;
    movement?: string;
    focal_length?: string;
    depth_of_field?: string;
    custom?: string;
  };
  composition?: {
    framing?: string;
    focus_subject?: string;
    foreground?: string;
    background?: string;
    custom?: string;
  };
  lighting?: {
    type?: string;
    direction?: string;
    intensity?: string;
    color_temperature?: string;
    custom?: string;
  };
  color?: { palette?: string[]; saturation?: string; contrast?: string };
  mood?: string;
  style?: { reference?: string; aspect_ratio?: string; fps?: number; rendering?: string };
  characters?: ShotCharacterDTO[];
  dialogue?: { text?: string; speaker_id?: string; style?: string };
  action?: { description?: string; duration_hint?: number };
  audio?: {
    music_id?: string;
    sfx?: string[];
    ambience?: string;
    volume_music?: number;
    volume_sfx?: number;
  };
  prompt?: {
    positive?: string;
    negative?: string;
    source?: 'auto' | 'manual' | 'hybrid';
    generation_prompt?: string;
    custom?: string;
  };
}

export interface MediaDTO {
  id: string;
  url: string;
  thumbnail_url?: string;
  name?: string;
}

export interface AssetDTO {
  id: string;
  project_id: string;
  asset_type?: AssetType;
  type?: string;
  name: string;
  description: string;
  aliases?: string[];
  base_character_id?: string;
  appearance?: {
    gender?: string;
    age_range?: string;
    height?: string;
    build?: string;
    skin_tone?: string;
    hair?: string;
    eyes?: string;
    distinguishing_features?: string;
    custom?: string;
  };
  personality?: string;
  default_outfit?: string;
  time_period?: string;
  weather_default?: string;
  lighting_default?: string;
  mood_default?: string;
  floor_plan_url?: string;
  tags?: string[];
  reference_images?: Array<string | MediaDTO>;
}

export interface ApiList<T> {
  data?: T[];
  items?: T[];
  next_cursor?: string | null;
}
