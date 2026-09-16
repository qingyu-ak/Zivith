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
  workspace_path?: string | null;
  /** §19 路径管理：绑定文件夹在本机是否仍然存在（未绑定时为 null）。 */
  workspace_exists?: boolean | null;
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
  /** 故事在项目内的展示顺序（数据库 order 字段） */
  order?: number;
  scene_count?: number;
  segments?: StorySegmentDTO[];
}

export interface StorySegmentDTO {
  id: string;
  story_id: string;
  order: number;
  title: string;
  synopsis?: string | null;
  draft?: string | null;
  state: 'draft' | 'review' | 'approved';
}

export interface SceneDTO {
  id: string;
  story_id: string;
  segment_id?: string | null;
  order: number;
  title: string;
  summary?: string | null;
  /** Prisma column; world resources may expose this before sceneDto aliasing. */
  description?: string | null;
  location_id?: string | null;
  time_of_day?: string | null;
  time?: string | null;
  weather?: string | null;
  mood?: string | null;
  shot_count?: number;
  state?: 'draft' | 'review' | 'approved';
  created_at?: string;
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
  project_id?: string;
  url: string;
  thumbnail_url?: string;
  name?: string;
  media_type?: string;
  mime_type?: string;
  source?: string;
  tags?: string[];
  created_at?: string;
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
  /** Resolved cover (sheet / first reference) with usable URL */
  cover_image?: MediaDTO | null;
  /** Location design-sheet prompt draft */
  location_sheet_prompt?: string;
  /** Novel-import light card (`data.tier`). */
  tier?: string;
  /** Novel import id when this asset came from an import. */
  import_id?: string;
  state?: string;
  created_at?: string;
}

export interface AppearanceVariantMediaDTO {
  id: string;
  url?: string | null;
  access_url?: string | null;
  thumbnail_url?: string | null;
  generation_metadata?: {
    is_mock?: boolean;
    provider?: string;
    generation_error?: string;
    reference_injection?: string;
  } | null;
}

export interface AppearanceVariantDTO {
  id: string;
  asset_id: string;
  key: string;
  title: string;
  change_reason?: string | null;
  description?: string | null;
  anchor_media_id?: string | null;
  candidate_media_ids: string[];
  state: 'draft' | 'review' | 'approved';
  order: number;
  resolved_appearance?: AssetDTO['appearance'];
  anchor_media?: AppearanceVariantMediaDTO | null;
  candidate_media?: AppearanceVariantMediaDTO[];
}

export interface ApiList<T> {
  data?: T[];
  items?: T[];
  next_cursor?: string | null;
}

// ---------------------------------------------------------------------------
// Creator layer (ADR-0010 revised / ADR-0013): Creator Chat
// ---------------------------------------------------------------------------

export type ChatRole = 'user' | 'assistant' | 'system';

export type CreatorChatKind = 'world' | 'roleplay';

export interface CreatorChatThreadDTO {
  id: string;
  project_id?: string | null;
  /** Denormalized project name attached by the global list endpoint. */
  project_name?: string | null;
  /** Absolute workspace folder when opened from the desktop app. */
  workspace_path?: string | null;
  title?: string | null;
  state: string;
  /** Derived from RoleplayThread sidecar; omitted/unknown payloads default to world. */
  kind?: CreatorChatKind;
  character_name?: string | null;
  user_character_name?: string | null;
  is_group?: boolean;
  participant_names?: string[];
  active_head_message_id?: string | null;
  /** 该线程未确认提案条数；列表接口附带，缺省按 0。 */
  pending_proposal_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CreatorChatMessageDTO {
  id: string;
  thread_id: string;
  role: ChatRole;
  content: string;
  proposal?: Record<string, unknown> | null;
  proposal_key?: string | null;
  proposal_state?: 'pending' | 'applied' | 'rejected' | (string & {}) | null;
  speaker_asset_id?: string | null;
  speaker_name?: string | null;
  suppressed?: boolean;
  created_at: string;
}

export type ProposalKind =
  | 'create_project'
  | 'create_world_event'
  | 'create_character'
  | 'create_location'
  | 'create_scene'
  | 'create_relationship'
  | 'update_entity';

export interface ApplyProposalResultDTO {
  kind: ProposalKind;
  project_id: string;
  entity_type:
    'project' | 'world_event' | 'asset' | 'scene' | 'relationship' | 'story' | (string & {});
  entity_id: string;
  title: string;
}

export interface WriteLogItemDTO {
  id: string;
  thread_id: string;
  thread_title: string | null;
  created_at: string;
  summary: string;
}

export type WorkflowStepName =
  | 'story'
  | 'story_review'
  | 'scene'
  | 'scene_review'
  | 'visual_prep'
  | 'visual_assets_review'
  | 'shot'
  | 'shot_review'
  | 'prompt'
  | 'prompt_review'
  | 'video'
  | 'video_review';

export type WorkflowStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowStepDTO {
  id: string;
  name: WorkflowStepName;
  status: WorkflowStatus;
  order: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface WorkflowRunDTO {
  id: string;
  project_id: string;
  status: WorkflowStatus;
  input: Record<string, unknown>;
  state: {
    current_step_index: number;
    awaiting_review: WorkflowStepName | null;
    revision: number;
  };
  steps: WorkflowStepDTO[];
  created_at: string;
  updated_at: string;
}

export interface VisualRequirementDTO {
  id: string;
  scene_id: string;
  asset_type: AssetType;
  asset_id: string;
  variant_key: string;
  required: boolean;
  reason: string;
  status: 'pending' | 'generating' | 'review' | 'approved' | 'rejected';
  candidate_media_ids: string[];
  approved_media_id?: string | null;
  generation_prompt?: string | null;
  asset?: {
    id: string;
    name: string;
    description: string;
    appearance_summary?: string | null;
    type?: string;
  } | null;
}

export interface WorkflowMediaDTO {
  id: string;
  access_url?: string | null;
  url?: string | null;
  generation_metadata?: {
    is_mock?: boolean;
    provider?: string;
    model?: string;
    generation_error?: string;
    generation_prompt?: string;
    reference_injection?:
      'none' | 'applied' | 'skipped_unsupported' | 'skipped_error' | (string & {});
    reference_media_ids?: string[];
    reference_labels?: string[];
  } | null;
}

export interface OutputDTO {
  id: string;
  shot_id: string;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  video_url?: string | null;
  thumbnail_url?: string | null;
  is_active: boolean;
  error_code?: string | null;
  provider?: string | null;
  model?: string | null;
}

export interface PromptVersionDTO {
  id: string;
  shot_id: string;
  positive: string;
  negative?: string | null;
  source: string;
  approved_at?: string | null;
  created_at: string;
}

export interface GenerationTaskDTO {
  id: string;
  project_id: string;
  type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  provider?: string | null;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  attempts: number;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error_code?: string | null;
}

export type ProviderId = string;
export type BuiltinProviderId = 'mock' | 'deepseek' | 'siliconflow';
export type ApiFormat = 'openai_chat' | 'anthropic_messages';
export interface ProviderModelsDTO {
  llm: string;
  /** 文生图 T2I */
  image: string;
  /** 文图生图 I2I */
  image_i2i: string;
  /** 文生视频 T2V */
  video: string;
  /** 文图生视频 I2V */
  video_i2v: string;
  audio: string;
}

export interface ProviderCatalogDTO {
  selection: {
    llm: ProviderId;
    image: ProviderId;
    video: ProviderId;
    audio: ProviderId;
  };
  models: ProviderModelsDTO;
  /** 模型选择器里被隐藏的模型（设置页开关；当前在用的由 llmChoices 保留）。 */
  hidden_models?: Array<{ provider: ProviderId; model: string }>;
  providers: Array<{
    id: ProviderId;
    label: string;
    kind?: 'builtin' | 'custom';
    api_format?: ApiFormat;
    modalities: Array<'llm' | 'image' | 'video' | 'audio'>;
    configured: boolean;
    default_model?: string;
    default_models?: Partial<ProviderModelsDTO>;
    llm_models?: Array<{ id: string; label: string }>;
    base_url?: string;
  }>;
  runtime_override?: {
    selection?: Partial<ProviderCatalogDTO['selection']>;
    models?: Partial<ProviderModelsDTO>;
  };
  siliconflow_account?: {
    total_balance?: string;
    charge_balance?: string;
    balance?: string;
    status?: string;
  };
}

// ---------------------------------------------------------------------------
// Stage F — World Line workspace（世界线三栏视图，v1 只读）
// 数据源：GET /world/projects/:projectId/resources（无认证，ADR-0013）
// ---------------------------------------------------------------------------

export interface WorldEventDTO {
  id: string;
  project_id: string;
  anchor_story_id?: string | null;
  title: string;
  description?: string | null;
  world_time_envelope?: Record<string, unknown> | null;
  presentation_order?: number | null;
  state: string;
  character_ids?: string[];
  scene_ids?: string[];
  created_at: string;
}

export interface EntityRevisionDTO {
  id: string;
  revision: number;
  change_kind: string;
  created_at: string;
  stage_label: string | null;
  as_of_world_event_id: string | null;
  as_of_presentation_order: number | null;
  snapshot: Record<string, unknown>;
}

export interface EntityRevisionListDTO {
  entity_type: string;
  entity_id: string;
  revisions: EntityRevisionDTO[];
  at: EntityRevisionDTO | null;
}

export interface TemporalDimensionDTO {
  id: string;
  label: string;
  kind: 'calendar' | 'worldline' | 'dream' | 'simulation' | 'custom';
  parent_dimension_id?: string;
  schema?: unknown;
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

export interface WorldviewDTO {
  genre?: string;
  premise?: string;
  rules?: string[];
  notes?: string;
}

export type WorldStage = 'bootstrap' | 'growing' | 'mature';

export interface WorldLineShotDTO {
  id: string;
  scene_id: string;
  project_id: string;
  order: number;
  label?: string | null;
  state?: string;
  mood?: string | null;
  created_at?: string;
  /** Current Shot camera JSON; derived Camera Track reads this, does not copy it */
  camera?: Record<string, unknown> | null;
  composition?: Record<string, unknown> | null;
  lighting?: Record<string, unknown> | null;
  color?: Record<string, unknown> | null;
  style?: Record<string, unknown> | null;
  prompt?: Record<string, unknown> | null;
  approved_prompt?: {
    id: string;
    positive: string;
    approved_at?: string | null;
  } | null;
  /** Latest/active Output provenance for Model Track */
  output?: {
    provider?: string | null;
    model?: string | null;
    status?: string | null;
    is_active?: boolean;
  } | null;
}

export interface WorldConflictDTO {
  id: string;
  kind: string;
  summary: string;
  entity_refs: Array<{ type: string; id: string }>;
  evidence?: string[];
}

export interface WorldResourcesDTO {
  project: {
    id: string;
    name: string;
    description?: string | null;
    worldview: WorldviewDTO;
    workspace_path?: string | null;
  };
  stage: WorldStage;
  /** Lore Keeper v1 规则发现；只报告不修复 */
  conflicts?: WorldConflictDTO[];
  /** H6 Project-defined time dimensions; core does not interpret calendar values */
  temporal_dimensions?: TemporalDimensionDTO[];
  entities: {
    stories: StoryDTO[];
    characters: AssetDTO[];
    locations: AssetDTO[];
    scenes: SceneDTO[];
    world_events: WorldEventDTO[];
    relationships: WorldRelationshipDTO[];
    shots?: WorldLineShotDTO[];
  };
}

/** 世界线条目（前端从 resources 派生；anchorOrder 用于非均匀刻度定位） */
export type WorldLineEntityType =
  | 'character'
  | 'location'
  | 'scene'
  | 'world_event'
  | 'story'
  | 'shot'
  | 'camera'
  | 'style'
  | 'prompt'
  | 'model';

export interface WorldLineItem {
  id: string;
  entityType: WorldLineEntityType;
  title: string;
  description?: string | null;
  tags?: string[];
  /** 刻度位置：事件=presentation_order，场景=order，角色/地点=事件/场景锚点或插值 */
  anchorOrder: number;
  /** 剪辑块左缘（呈现序）。缺省则围住 anchorOrder。 */
  startOrder?: number;
  /** 剪辑块右缘（呈现序）。 */
  endOrder?: number;
  createdAt: string;
  /** 实体特有属性（Inspector / 时间线提示用） */
  extra?: Record<string, unknown>;
}

export interface WorldLineTrack {
  id: string;
  kind: WorldLineEntityType;
  title: string;
  items: WorldLineItem[];
}

/** 呈现主轴上的命名刻度（事件标题优先；无事件时退到场景） */
export interface WorldLineAxisMark {
  order: number;
  label: string;
  /** 项目提供的世界时间标签（opaque，原样展示） */
  worldTimeLabel?: string | null;
  /** envelope.order 与 presentation_order 不一致时为 true */
  worldTimeDiverges?: boolean;
  /** H6 overlay relation: follow | explicit | crossing | unknown */
  worldTimeRelation?: 'follow' | 'explicit' | 'crossing' | 'unknown';
  worldTimeMode?: string | null;
}

export interface WorldLineRelationship {
  id: string;
  label?: string | null;
  sourceItemId: string | null;
  targetItemId: string | null;
  sourceType: string;
  targetType: string;
  state: string;
}

export interface WorldLineModel {
  projectId: string;
  projectName: string;
  tracks: WorldLineTrack[];
  relationships: WorldLineRelationship[];
  /** 刻度轴锚点（呈现顺序 domain，非真实时间） */
  scaleDomain: { min: number; max: number };
  /** 轴上的命名刻度；空则回退为整数 #n */
  axisMarks: WorldLineAxisMark[];
}

/** 世界线工作区选中项（Explorer / Timeline 联动，Inspector 展示） */
export type WorldSelection = {
  kind:
    | 'character'
    | 'location'
    | 'scene'
    | 'world_event'
    | 'story'
    | 'project'
    | 'dimension'
    | 'relationship'
    | 'shot'
    | 'camera'
    | 'style'
    | 'prompt'
    | 'model';
  id: string;
} | null;
