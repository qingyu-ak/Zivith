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
import { loadAgentSystemPrompt } from './prompt-loader.js';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((item) => asText(item)).filter((item): item is string => Boolean(item));
    if (parts.length > 0) return parts.join('；');
  }
  return undefined;
}

function scenesToScreenplay(scenes: unknown): string | undefined {
  if (!Array.isArray(scenes) || scenes.length === 0) return undefined;
  return scenes
    .map((scene, index) => {
      const item = record(scene);
      const order =
        typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : index + 1;
      const title = asText(item.title) ?? `场景 ${order}`;
      const body =
        asText(item.screenplay) ??
        asText(item.description) ??
        asText(item.summary) ??
        asText(item.content) ??
        asText(item.action) ??
        '';
      const location = asText(item.location_name) ?? asText(item.location);
      const header = location
        ? `## Scene ${order}: ${title}（${location}）`
        : `## Scene ${order}: ${title}`;
      return `${header}\n${body}`.trim();
    })
    .join('\n\n');
}

function segmentsToScreenplay(
  segments: Array<{ title: string; synopsis?: string; draft: string }>,
): string {
  return segments
    .map((segment, index) =>
      `## 第${index + 1}段：${segment.title}\n${segment.synopsis ? `${segment.synopsis}\n\n` : ''}${segment.draft}`.trim(),
    )
    .join('\n\n');
}

const generatedSegmentShape = z
  .object({
    title: z.string().trim().min(1).max(300),
    synopsis: z.string().trim().max(50_000).optional(),
    draft: z.string().trim().min(1).max(200_000),
  })
  .strict();

/** Map common LLM shape variants into the canonical story payload. */
export function normalizeGeneratedStoryInput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  const theme = asText(obj.theme) ?? asText(obj.themes);
  const combinedSynopsis = [asText(obj.logline), asText(obj.ending)].filter(Boolean).join('\n\n');
  const synopsis =
    asText(obj.synopsis) ??
    asText(obj.summary) ??
    asText(obj.overview) ??
    (combinedSynopsis || undefined);
  const rawSegments = Array.isArray(obj.segments) ? obj.segments : undefined;
  const segments = rawSegments
    ?.map((item) => {
      const row = record(item);
      const title = asText(row.title);
      const draft =
        asText(row.draft) ?? asText(row.screenplay) ?? asText(row.content) ?? asText(row.body);
      if (!title || !draft) return null;
      const segmentSynopsis = asText(row.synopsis) ?? asText(row.summary);
      return {
        title,
        ...(segmentSynopsis ? { synopsis: segmentSynopsis } : {}),
        draft,
      };
    })
    .filter((item): item is { title: string; synopsis?: string; draft: string } => Boolean(item));

  const screenplay =
    asText(obj.screenplay) ??
    asText(obj.script) ??
    asText(obj.screen_play) ??
    (segments && segments.length > 0 ? segmentsToScreenplay(segments) : undefined) ??
    scenesToScreenplay(obj.scenes) ??
    synopsis;
  const genre = asText(obj.genre) ?? asText(obj.genres) ?? '剧情';
  const tone = asText(obj.tone) ?? asText(obj.mood) ?? asText(obj.atmosphere) ?? '克制而温暖';
  const title = asText(obj.title) ?? '未命名故事';
  const logline = asText(obj.logline) ?? asText(obj.one_liner) ?? synopsis?.slice(0, 500);

  return {
    title,
    logline,
    synopsis,
    genre,
    theme: theme ?? '待定',
    tone,
    screenplay,
    ...(segments && segments.length > 0 ? { segments } : {}),
  };
}

const generatedStoryShape = z
  .object({
    title: z.string().trim().min(1).max(300),
    logline: z.string().trim().min(1).max(10_000),
    synopsis: z.string().trim().min(1).max(50_000),
    genre: z.string().trim().min(1).max(200),
    theme: z.string().trim().min(1).max(2_000),
    tone: z.string().trim().min(1).max(2_000),
    screenplay: z.string().trim().min(1).max(500_000),
    segments: z.array(generatedSegmentShape).min(1).max(50).optional(),
  })
  .strict();

export const generatedStorySchema = z.preprocess(
  normalizeGeneratedStoryInput,
  generatedStoryShape,
) as z.ZodType<GeneratedStory>;

export type GeneratedStory = z.infer<typeof generatedStoryShape>;
export type GeneratedStorySegment = z.infer<typeof generatedSegmentShape>;

export interface StoryAgentInput {
  brief: string;
  language?: string;
  target_duration_seconds?: number;
  /** When set, rewrite only this segment (by 1-based order) using feedback. */
  rewrite_segment_order?: number;
  rewrite_feedback?: string;
  existing_segments?: GeneratedStorySegment[];
}

export class StoryAgent implements Agent<StoryAgentInput, GeneratedStory> {
  readonly id = 'story';
  readonly name = 'Story Agent';

  constructor(
    private readonly llm: LLMAdapter,
    private readonly model = 'mock-text-v1',
  ) {}

  validate(input: StoryAgentInput, context: AgentContext): ValidationResult {
    void context;
    if (input.brief.trim().length < 10) {
      return {
        valid: false,
        issues: [{ code: 'BRIEF_TOO_SHORT', message: '创意简述至少需要 10 个字符', path: 'brief' }],
      };
    }
    return validAgentInput();
  }

  estimate(input: StoryAgentInput, context: AgentContext): CostEstimate {
    void context;
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
        system_prompt: loadAgentSystemPrompt('story', 'en', { knowledge_context: '' }),
        user_prompt: JSON.stringify({
          creative_brief: input.brief,
          language: input.language ?? 'zh-CN',
          target_duration_seconds: input.target_duration_seconds ?? 180,
          rewrite_segment_order: input.rewrite_segment_order,
          rewrite_feedback: input.rewrite_feedback,
          existing_segments: input.existing_segments,
          required_schema: {
            title: 'string',
            logline: 'string',
            synopsis: 'string',
            genre: 'string',
            theme: 'string',
            tone: 'string',
            screenplay: 'string',
            segments: 'optional array of {title, synopsis?, draft}',
          },
        }),
        temperature: 0.6,
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
