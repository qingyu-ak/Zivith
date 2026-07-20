import {
  validAgentInput,
  type Agent,
  type AgentContext,
  type AgentResult,
  type CostEstimate,
  type ValidationResult,
} from '@zivith/domain';

type PromptRecord = Record<string, unknown>;

export interface PromptAgentCharacter {
  name: string;
  presence?: string;
  action?: string | null;
  emotion?: string | null;
  pose?: string | null;
  expression?: string | null;
  outfit?: string | null;
}

export interface PromptAgentInput {
  shot_id: string;
  label?: string | null;
  camera?: PromptRecord | null;
  composition?: PromptRecord | null;
  lighting?: PromptRecord | null;
  color?: PromptRecord | null;
  mood?: string | null;
  characters: PromptAgentCharacter[];
  dialogue?: PromptRecord | null;
  action?: PromptRecord | null;
  scene: {
    title: string;
    description?: string | null;
    time?: string | null;
    weather?: string | null;
    location_name?: string | null;
  };
  style?: PromptRecord | null;
  project_negative_prompt?: string | null;
  shot_negative_prompt?: string | null;
  custom_prompt?: string | null;
}

export interface GeneratedPrompt {
  positive: string;
  negative: string;
  source: 'auto' | 'manual';
  generation_prompt: string;
}

export class PromptAgent implements Agent<PromptAgentInput, GeneratedPrompt> {
  readonly id = 'prompt';
  readonly name = 'Prompt Agent';

  validate(input: PromptAgentInput, _context: AgentContext): ValidationResult {
    if (!input.action && input.characters.length === 0 && !input.scene.description) {
      return {
        valid: false,
        issues: [
          {
            code: 'SHOT_CONTENT_REQUIRED',
            message: '构建提示词前，镜头至少需要动作、角色或场景描述',
            path: 'shot',
          },
        ],
      };
    }
    return validAgentInput();
  }

  estimate(input: PromptAgentInput, _context: AgentContext): CostEstimate {
    return {
      model: 'mock-prompt-v1',
      estimated_tokens: JSON.stringify(input).length / 4 + 300,
    };
  }

  async execute(
    input: PromptAgentInput,
    _context: AgentContext,
  ): Promise<AgentResult<GeneratedPrompt>> {
    const custom = input.custom_prompt?.trim();
    const positive = custom || this.constructPositive(input);
    const negative = [
      input.project_negative_prompt,
      input.shot_negative_prompt,
      'low quality, blurry, distorted anatomy, inconsistent character, text, subtitles, watermark',
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => value.trim())
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(', ');

    return {
      status: 'success',
      data: {
        positive,
        negative,
        source: custom ? 'manual' : 'auto',
        generation_prompt:
          'Cinematic default: Camera → Composition → Lighting → Color & Mood → Characters → Action → Dialogue → Environment → Style',
      },
      warnings: [],
      metadata: {
        agent_id: this.id,
        model_used: 'mock-prompt-v1',
        tokens_used: 0,
        duration_ms: 0,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private constructPositive(input: PromptAgentInput): string {
    const sections = [
      this.section('Cinematography', input.camera),
      this.section('Composition', input.composition),
      this.section('Lighting', input.lighting),
      this.section('Color', input.color),
      input.mood ? `Mood: ${input.mood}` : '',
      this.characters(input.characters),
      this.section('Action', input.action),
      this.section('Dialogue context', input.dialogue),
      `Environment: ${[
        input.scene.location_name,
        input.scene.title,
        input.scene.description,
        input.scene.time,
        input.scene.weather,
      ]
        .filter(Boolean)
        .join(', ')}`,
      this.section('Style', input.style),
    ];
    return sections.filter(Boolean).join('. ');
  }

  private section(label: string, value?: PromptRecord | null): string {
    if (!value) return '';
    const content = Object.entries(value)
      .filter(([, item]) => item !== null && item !== undefined && item !== '')
      .map(([key, item]) => `${key.replaceAll('_', ' ')} ${this.value(item)}`)
      .join(', ');
    return content ? `${label}: ${content}` : '';
  }

  private characters(characters: PromptAgentCharacter[]): string {
    if (characters.length === 0) return '';
    return `Characters: ${characters
      .map((character) =>
        [
          character.name,
          character.presence,
          character.action,
          character.emotion,
          character.pose,
          character.expression,
          character.outfit,
        ]
          .filter(Boolean)
          .join(', '),
      )
      .join('; ')}`;
  }

  private value(value: unknown): string {
    return Array.isArray(value) ? value.join('/') : String(value);
  }
}
