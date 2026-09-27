/**
 * Zivith 世界资源类型的实验子集，字段与 apps/web/lib/types.ts 保持一致（只取所需）。
 * 连接真实 API 时直接消费 GET /api/v1/projects/:projectId/resources 的返回。
 */

export interface MediaDTO {
  id: string;
  url: string;
  thumbnail_url?: string;
  name?: string;
  media_type?: string;
  mime_type?: string;
  source?: string;
  tags?: string[];
  created_at?: string;
}

/** 角色与地点共用 Asset（type: 'character' | 'location'） */
export interface AssetDTO {
  id: string;
  project_id: string;
  asset_type?: string;
  type?: string;
  name: string;
  description: string;
  aliases?: string[];
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
  tags?: string[];
  reference_images?: Array<string | MediaDTO>;
  cover_image?: MediaDTO | null;
  tier?: string;
  created_at?: string;
}

export interface SceneDTO {
  id: string;
  story_id: string;
  segment_id?: string | null;
  order: number;
  title: string;
  summary?: string | null;
  description?: string | null;
  location_id?: string | null;
  time_of_day?: string | null;
  time?: string | null;
  weather?: string | null;
  mood?: string | null;
  shot_count?: number;
  state?: string;
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
  status?: string;
  order?: number;
  scene_count?: number;
}

export interface WorldEventDTO {
  id: string;
  project_id: string;
  anchor_story_id?: string | null;
  title: string;
  description?: string | null;
  state: string;
  character_ids?: string[];
  scene_ids?: string[];
  created_at: string;
}

export interface WorldRelationshipDTO {
  id: string;
  project_id: string;
  kind: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  direction?: string | null;
  label?: string | null;
  description?: string | null;
  state: string;
  created_at: string;
}

export interface WorldResourcesDTO {
  project: {
    id: string;
    name: string;
    description?: string | null;
    worldview?: {
      genre?: string;
      premise?: string;
      rules?: string[];
      notes?: string;
    };
  };
  stage?: string;
  entities: {
    stories: StoryDTO[];
    characters: AssetDTO[];
    locations: AssetDTO[];
    scenes: SceneDTO[];
    world_events: WorldEventDTO[];
    relationships: WorldRelationshipDTO[];
    shots?: unknown[];
  };
}
