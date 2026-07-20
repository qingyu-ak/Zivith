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

export const generatedStorySchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    logline: z.string().trim().min(1).max(10_000),
    synopsis: z.string().trim().min(1).max(50_000),
    genre: z.string().trim().min(1).max(200),
    theme: z.string().trim().min(1).max(2_000),
    tone: z.string().trim().min(1).max(2_000),
    screenplay: z.string().trim().min(1).max(500_000),
  })
  .strict();

export type GeneratedStory = z.infer<typeof generatedStorySchema>;

export interface StoryAgentInput {
  brief: string;
  language?: string;
  target_duration_seconds?: number;
}

export class StoryAgent implements Agent<StoryAgentInput, GeneratedStory> {
  readonly id = 'story';
  readonly name = 'Story Agent';

  constructor(
    private readonly llm: LLMAdapter,
    private readonly model = 'mock-text-v1',
  ) {}

  validate(input: StoryAgentInput, _context: AgentContext): ValidationResult {
    if (input.brief.trim().length < 10) {
      return {
        valid: false,
        issues: [{ code: 'BRIEF_TOO_SHORT', message: '创意简述至少需要 10 个字符', path: 'brief' }],
      };
    }
    return validAgentInput();
  }

  estimate(input: StoryAgentInput, _context: AgentContext): CostEstimate {
    return {
      model: this.model,
      estimated_tokens: Math.ceil(input.brief.length / 4) + 2_000,
    };
  }

  async execute(
    input: StoryAgentInput,
    context: AgentContext,
  ): Promise<AgentResult<GeneratedStory>> {
    const completion = await this.llm.completeStructured(
      {
        request_id: `${context.workflow_run_id}:story`,
        model: this.model,
        system_prompt:
          'You are STORY_AGENT. Return a complete cinematic story as strict JSON matching the requested schema.',
        user_prompt: JSON.stringify({
          creative_brief: input.brief,
          language: input.language ?? 'zh-CN',
          target_duration_seconds: input.target_duration_seconds ?? 180,
        }),
        temperature: 0.8,
        max_tokens: 8_000,
      },
      generatedStorySchema,
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
