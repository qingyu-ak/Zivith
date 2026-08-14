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
import { loadAgentSystemPrompt } from './prompt-loader.js';

export const generatedScenesSchema = z
  .object({
    scenes: z
      .array(
        z
          .object({
            order: z.number().int().positive(),
            segment_order: z.number().int().positive().optional(),
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
  /** Approved story segments (ADR-0006); when present, scenes should carry segment_order. */
  segments?: Array<{ order: number; title: string; synopsis?: string | null; draft: string }>;
  max_scenes?: number;
}

export class SceneAgent implements Agent<SceneAgentInput, GeneratedScenes> {
  readonly id = 'scene';
  readonly name = 'Scene Agent';

  constructor(
    private readonly llm: LLMAdapter,
    private readonly model = 'mock-text-v1',
  ) {}

  validate(input: SceneAgentInput, context: AgentContext): ValidationResult {
    void context;
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

  estimate(input: SceneAgentInput, context: AgentContext): CostEstimate {
    void context;
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
        system_prompt: loadAgentSystemPrompt('scene', 'en', { knowledge_context: '' }),
        user_prompt: JSON.stringify({
          story: input.story,
          segments: input.segments,
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
