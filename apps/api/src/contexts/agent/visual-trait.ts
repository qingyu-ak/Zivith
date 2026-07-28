import { z } from 'zod';
import type { LLMAdapter } from '../../ports/llm.js';
import { loadAgentSystemPrompt } from './prompt-loader.js';

const traitSchema = z.object({
  description: z.string().trim().min(1).max(10_000),
  appearance_summary: z.string().trim().min(1).max(5_000),
  generation_prompt: z.string().trim().min(1).max(5_000),
});

export type VisualTraitDraft = z.infer<typeof traitSchema>;

export type VisualTraitPurpose = 'keyframe' | 'character_sheet' | 'location_sheet';

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
  appearance_bits?: string | undefined;
  /** character_sheet / location_sheet → multi-view single image; else scene keyframe */
  purpose?: VisualTraitPurpose;
}

function resolvePurpose(input: EnrichVisualAssetInput): VisualTraitPurpose {
  if (input.purpose) return input.purpose;
  if (input.variant_key === 'sheet_turnaround' || input.variant_key.startsWith('sheet_')) {
    return 'character_sheet';
  }
  if (input.asset_type === 'location' && input.variant_key === 'default') {
    return 'location_sheet';
  }
  return 'keyframe';
}

/** Build a deterministic fallback when LLM is unavailable or fails. */
export function buildFallbackVisualTrait(input: EnrichVisualAssetInput): VisualTraitDraft {
  const kind = input.asset_type === 'character' ? '角色' : '地点';
  const purpose = resolvePurpose(input);
  const description =
    input.existing_description?.trim() ||
    `${kind}“${input.asset_name}”，出现在场景“${input.scene_title}”。`;
  const appearance_summary =
    input.appearance_bits?.trim() ||
    (input.asset_type === 'character'
      ? `实体角色 ${input.asset_name}，与故事气质一致，服装与材质清晰可读`
      : `场景地点 ${input.asset_name}，空间层次清楚，光影符合变体 ${input.variant_key}`);

  let generation_prompt: string;
  if (purpose === 'character_sheet') {
    generation_prompt = [
      'character model sheet on ONE image, strict 2x2 four-panel layout',
      'panel 1 full-body front view',
      'panel 2 full-body side profile',
      'panel 3 full-body back view',
      'panel 4 large head-and-shoulders face close-up portrait panel with detailed facial features, eyes nose mouth expression, filling the whole panel not a tiny crop',
      'identical identity outfit and colors across all four panels',
      input.asset_name,
      appearance_summary,
      description.slice(0, 400),
      input.story_title ? `story: ${input.story_title}` : '',
      'clean white background, even studio lighting, consistent proportions, no text, no labels, no watermark',
    ]
      .filter(Boolean)
      .join(', ');
  } else if (purpose === 'location_sheet') {
    generation_prompt = [
      'single environment design sheet on ONE image',
      'main establishing view plus complementary angles of the same place',
      input.asset_name,
      appearance_summary,
      description.slice(0, 400),
      `scene: ${input.scene_title}`,
      'consistent architecture and materials, cinematic lighting, no text, no watermark',
    ]
      .filter(Boolean)
      .join(', ');
  } else {
    generation_prompt = [
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
  }
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
        system_prompt: loadAgentSystemPrompt('visual_trait', 'en', { knowledge_context: '' }),
        user_prompt: JSON.stringify({ ...input, purpose: resolvePurpose(input) }),
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
