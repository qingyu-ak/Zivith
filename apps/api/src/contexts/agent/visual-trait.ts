import { z } from 'zod';
import type { LLMAdapter } from '../../ports/llm.js';

const traitSchema = z.object({
  description: z.string().trim().min(1).max(10_000),
  appearance_summary: z.string().trim().min(1).max(5_000),
  generation_prompt: z.string().trim().min(1).max(5_000),
});

export type VisualTraitDraft = z.infer<typeof traitSchema>;

export interface EnrichVisualAssetInput {
  asset_type: 'character' | 'location';
  asset_name: string;
  variant_key: string;
  scene_title: string;
  scene_context?: string | undefined;
  story_title?: string | undefined;
  story_synopsis?: string | undefined;
  story_screenplay_excerpt?: string | undefined;
  existing_description?: string | undefined;
}

/** Build a deterministic fallback when LLM is unavailable or fails. */
export function buildFallbackVisualTrait(input: EnrichVisualAssetInput): VisualTraitDraft {
  const kind = input.asset_type === 'character' ? '角色' : '地点';
  const description =
    input.existing_description?.trim() ||
    `${kind}“${input.asset_name}”，出现在场景“${input.scene_title}”。`;
  const appearance_summary =
    input.asset_type === 'character'
      ? `实体角色 ${input.asset_name}，与故事气质一致，服装与材质清晰可读`
      : `场景地点 ${input.asset_name}，空间层次清楚，光影符合变体 ${input.variant_key}`;
  const generation_prompt = [
    input.asset_type === 'character'
      ? 'character key visual portrait'
      : 'environment establishing key visual',
    input.asset_name,
    appearance_summary,
    `scene: ${input.scene_title}`,
    `variant: ${input.variant_key}`,
    input.story_title ? `story: ${input.story_title}` : '',
    'cinematic, high detail, consistent design, film still',
  ]
    .filter(Boolean)
    .join(', ');
  return { description, appearance_summary, generation_prompt };
}

export async function enrichVisualAssetTraits(
  llm: LLMAdapter,
  model: string,
  requestId: string,
  input: EnrichVisualAssetInput,
): Promise<VisualTraitDraft> {
  try {
    const completion = await llm.completeStructured(
      {
        request_id: requestId,
        model,
        system_prompt: `You are VISUAL_TRAIT_AGENT for a film studio.
Return ONLY JSON with keys: description, appearance_summary, generation_prompt (all strings).
- description: short Chinese asset bible text
- appearance_summary: concrete visual traits for consistency
- generation_prompt: English (or bilingual) image prompt for a key visual, no markdown`,
        user_prompt: JSON.stringify(input),
        temperature: 0.5,
        max_tokens: 1_200,
      },
      traitSchema,
    );
    return completion.data;
  } catch {
    return buildFallbackVisualTrait(input);
  }
}

export function readVisualPromptFromAssetData(
  data: unknown,
  variantKey: string,
): string | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const visual = (data as Record<string, unknown>).visual;
  if (!visual || typeof visual !== 'object' || Array.isArray(visual)) return undefined;
  const prompts = (visual as Record<string, unknown>).generation_prompts;
  if (!prompts || typeof prompts !== 'object' || Array.isArray(prompts)) return undefined;
  const value = (prompts as Record<string, unknown>)[variantKey];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function mergeVisualPromptIntoAssetData(
  data: unknown,
  variantKey: string,
  prompt: string,
  appearanceSummary?: string,
): Record<string, unknown> {
  const base =
    data && typeof data === 'object' && !Array.isArray(data)
      ? { ...(data as Record<string, unknown>) }
      : {};
  const visual =
    base.visual && typeof base.visual === 'object' && !Array.isArray(base.visual)
      ? { ...(base.visual as Record<string, unknown>) }
      : {};
  const prompts =
    visual.generation_prompts &&
    typeof visual.generation_prompts === 'object' &&
    !Array.isArray(visual.generation_prompts)
      ? { ...(visual.generation_prompts as Record<string, unknown>) }
      : {};
  prompts[variantKey] = prompt;
  visual.generation_prompts = prompts;
  if (appearanceSummary) visual.appearance_summary = appearanceSummary;
  base.visual = visual;
  return base;
}
