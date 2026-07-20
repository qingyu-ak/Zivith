import {
  validAgentInput,
  type Agent,
  type AgentContext,
  type AgentResult,
  type CostEstimate,
  type ShotAction,
  type ShotCamera,
  type ShotCharacter,
  type ShotColor,
  type ShotComposition,
  type ShotDialogue,
  type ShotLighting,
  type ValidationResult,
} from '@zivith/domain';

export interface ShotAgentCharacter {
  id: string;
  name: string;
}

export interface ShotAgentScene {
  id: string;
  title: string;
  description: string;
  time_of_day?: string | null;
  weather?: string | null;
  mood?: string | null;
  location_name?: string | null;
  characters: ShotAgentCharacter[];
}

export interface ShotAgentInput {
  scenes: ShotAgentScene[];
}

export interface GeneratedShot {
  scene_id: string;
  order: number;
  label: string;
  narrative_mode: 'present';
  location_area: string | null;
  camera: ShotCamera;
  composition: ShotComposition;
  lighting: ShotLighting;
  color: ShotColor;
  mood: string;
  characters: ShotCharacter[];
  dialogue: ShotDialogue | null;
  action: ShotAction;
  audio: { ambience: string; volume_music: number; volume_sfx: number };
  prompt: { source: 'auto'; generation_prompt: string };
}

export interface ShotAgentOutput {
  shots: GeneratedShot[];
}

export class ShotAgent implements Agent<ShotAgentInput, ShotAgentOutput> {
  readonly id = 'shot';
  readonly name = 'Shot Agent';

  validate(input: ShotAgentInput, _context: AgentContext): ValidationResult {
    if (input.scenes.length === 0) {
      return {
        valid: false,
        issues: [{ code: 'SCENES_REQUIRED', message: '镜头拆分至少需要一个场景', path: 'scenes' }],
      };
    }
    return validAgentInput();
  }

  estimate(input: ShotAgentInput, _context: AgentContext): CostEstimate {
    return { model: 'mock-shot-v1', estimated_tokens: input.scenes.length * 400 };
  }

  async execute(
    input: ShotAgentInput,
    _context: AgentContext,
  ): Promise<AgentResult<ShotAgentOutput>> {
    const shots = input.scenes.flatMap((scene) => this.sceneShots(scene));
    return {
      status: 'success',
      data: { shots },
      warnings: [],
      metadata: {
        agent_id: this.id,
        model_used: 'mock-shot-v1',
        tokens_used: 0,
        duration_ms: 0,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private sceneShots(scene: ShotAgentScene): GeneratedShot[] {
    const characterShots: ShotCharacter[] = scene.characters.map((character) => ({
      character_id: character.id as ShotCharacter['character_id'],
      presence: 'physical',
      action: '观察环境并向画面纵深移动',
      emotion: scene.mood ?? '专注',
      pose: '自然站立',
      expression: '克制',
      position: '画面中部',
    }));
    const lead = scene.characters[0];
    const environment = [
      scene.location_name ?? scene.title,
      scene.time_of_day,
      scene.weather,
    ]
      .filter(Boolean)
      .join('，');

    return [
      {
        scene_id: scene.id,
        order: 1,
        label: `${scene.title} · 环境建立`,
        narrative_mode: 'present',
        location_area: null,
        camera: {
          shot_type: 'wide_shot',
          angle: 'eye_level',
          movement: 'dolly_in',
          focal_length: '24mm',
          depth_of_field: 'deep',
        },
        composition: {
          framing: '电影宽画幅建立构图',
          focus_subject: scene.location_name ?? scene.title,
          foreground: '具有空间层次的环境细节',
          background: environment,
        },
        lighting: {
          type: scene.time_of_day?.includes('夜') ? 'neon' : 'natural',
          direction: 'side',
          intensity: 'moderate',
          color_temperature: scene.time_of_day?.includes('黄昏') ? '暖色 4200K' : '中性 5600K',
        },
        color: {
          palette: ['环境主色', '低饱和辅助色'],
          saturation: 'natural',
          contrast: 'medium',
        },
        mood: scene.mood ?? '电影感',
        characters: characterShots,
        dialogue: null,
        action: {
          description: scene.description || `建立${scene.title}的空间与氛围`,
          duration_hint: 5,
        },
        audio: { ambience: `${environment}环境声`, volume_music: 0.35, volume_sfx: 0.65 },
        prompt: {
          source: 'auto',
          generation_prompt: '根据镜头结构生成电影级视频提示词，保留环境连续性。',
        },
      },
      {
        scene_id: scene.id,
        order: 2,
        label: `${scene.title} · 叙事推进`,
        narrative_mode: 'present',
        location_area: null,
        camera: {
          shot_type: lead ? 'medium_shot' : 'wide_shot',
          angle: 'eye_level',
          movement: lead ? 'tracking' : 'pan_right',
          focal_length: lead ? '50mm' : '35mm',
          depth_of_field: lead ? 'shallow' : 'deep',
        },
        composition: {
          framing: lead ? '主体位于三分线，保留行动方向空间' : '环境引导线构图',
          focus_subject: lead?.name ?? scene.title,
          foreground: '轻微运动视差',
          background: environment,
        },
        lighting: {
          type: 'dramatic',
          direction: 'back',
          intensity: 'high_contrast',
          color_temperature: '暖冷对比',
        },
        color: {
          palette: ['叙事强调色', '环境互补色'],
          saturation: 'natural',
          contrast: 'high',
        },
        mood: scene.mood ?? '紧张',
        characters: characterShots,
        dialogue: lead
          ? {
              text: `继续推进${scene.title}中的行动。`,
              speaker_id: lead.id as ShotDialogue['speaker_id'],
              style: 'on_screen',
            }
          : null,
        action: {
          description: lead
            ? `${lead.name}完成关键动作，推动场景叙事`
            : `镜头沿环境线索推进，揭示新的叙事信息`,
          duration_hint: 5,
        },
        audio: { ambience: `${environment}持续环境声`, volume_music: 0.45, volume_sfx: 0.7 },
        prompt: {
          source: 'auto',
          generation_prompt: '根据主体动作、摄影机运动与灯光生成连续的电影视频提示词。',
        },
      },
    ];
  }
}
