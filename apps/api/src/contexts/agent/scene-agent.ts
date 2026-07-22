import { z } from 'zod';
import {
  validAgentInput,
  type Agent,
  type AgentContext,
  type AgentResult,
  type CostEstimate,
  type ValidationResult,
} from '@zivith/domain';
import type { LLMAdapter } from '../../ports/llm.js';
import type { GeneratedStory } from './story-agent.js';

export const generatedScenesSchema = z
  .object({
    scenes: z
      .array(
        z
          .object({
            order: z.number().int().positive(),
            title: z.string().trim().min(1).max(300),
            summary: z.string().trim().min(1).max(50_000),
            description: z.string().trim().min(1).max(50_000),
            location_name: z.string().trim().min(1).max(300),
            time_of_day: z.string().trim().min(1).max(200),
            weather: z.string().trim().max(200).nullable(),
            mood: z.string().trim().min(1).max(200),
            character_names: z.array(z.string().trim().min(1).max(200)).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export type GeneratedScenes = z.infer<typeof generatedScenesSchema>;

export interface SceneAgentInput {
  story: GeneratedStory;
  max_scenes?: number;
}

const SCENE_SYSTEM_PROMPT = `You are SCENE_AGENT for an AI film studio.
Return ONLY one JSON object. No markdown fences. No extra top-level keys besides "scenes".

Shape:
{
  "scenes": [
    {
      "order": 1,
      "title": "string",
      "summary": "string",
      "description": "string",
      "location_name": "string",
      "time_of_day": "string",
      "weather": "string|null",
      "mood": "string",
      "character_names": ["string"]
    }
  ]
}

Rules:
- scenes must be ordered cinematic units derived from the screenplay
- use the exact key names above
- character_names is an array of character display names`;

export class SceneAgent implements Agent<SceneAgentInput, GeneratedScenes> {
  readonly id = 'scene';
  readonly name = 'Scene Agent';

  constructor(
    private readonly llm: LLMAdapter,
    private readonly model = 'mock-text-v1',
  ) {}

  validate(input: SceneAgentInput, _context: AgentContext): ValidationResult {
    if (!input.story.screenplay.trim()) {
      return {
        valid: false,
        issues: [
          {
            code: 'SCREENPLAY_REQUIRED',
            message: '拆分场景前必须先生成剧本',
            path: 'story.screenplay',
          },
        ],
      };
    }
    return validAgentInput();
  }

  estimate(input: SceneAgentInput, _context: AgentContext): CostEstimate {
    return {
      model: this.model,
      estimated_tokens: Math.ceil(input.story.screenplay.length / 4) + 2_000,
    };
  }

  async execute(
    input: SceneAgentInput,
    context: AgentContext,
  ): Promise<AgentResult<GeneratedScenes>> {
    const completion = await this.llm.completeStructured(
      {
        request_id: `${context.workflow_run_id}:scene`,
        model: this.model,
        system_prompt: SCENE_SYSTEM_PROMPT,
        user_prompt: JSON.stringify({
          story: input.story,
          max_scenes: input.max_scenes ?? 20,
        }),
        temperature: 0.5,
        max_tokens: 8_000,
      },
      generatedScenesSchema,
    );
    return {
      status: 'success',
      data: completion.data,
      warnings: [],
      metadata: {
        agent_id: this.id,
        model_used: completion.model,
        tokens_used: completion.input_tokens + completion.output_tokens,
        duration_ms: 0,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
