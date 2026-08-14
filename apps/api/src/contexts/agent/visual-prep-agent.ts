import {
  validAgentInput,
  type Agent,
  type AgentContext,
  type AgentResult,
  type CostEstimate,
  type ValidationResult,
} from '@zivith/domain';

export interface VisualPrepScene {
  scene_id: string;
  title: string;
  location_asset_id: string;
  character_asset_ids: string[];
  variant_key: string;
}

export interface VisualPrepAgentInput {
  scenes: VisualPrepScene[];
}

export interface VisualRequirementDraft {
  scene_id: string;
  asset_type: 'character' | 'location';
  asset_id: string;
  variant_key: string;
  required: true;
  reason: string;
}

export interface VisualPrepOutput {
  requirements: VisualRequirementDraft[];
}

export class VisualPrepAgent implements Agent<VisualPrepAgentInput, VisualPrepOutput> {
  readonly id = 'visual_prep';
  readonly name = 'Visual Prep Agent';

  validate(input: VisualPrepAgentInput, context: AgentContext): ValidationResult {
    void context;
    if (input.scenes.length === 0) {
      return {
        valid: false,
        issues: [{ code: 'SCENES_REQUIRED', message: '视觉准备至少需要一个场景', path: 'scenes' }],
      };
    }
    return validAgentInput();
  }

  estimate(input: VisualPrepAgentInput, context: AgentContext): CostEstimate {
    void context;
    return { model: 'mock-visual-prep-v1', estimated_tokens: input.scenes.length * 100 };
  }

  execute(
    input: VisualPrepAgentInput,
    context: AgentContext,
  ): Promise<AgentResult<VisualPrepOutput>> {
    void context;
    const requirements = input.scenes.flatMap((scene) => [
      {
        scene_id: scene.scene_id,
        asset_type: 'location' as const,
        asset_id: scene.location_asset_id,
        variant_key: scene.variant_key,
        required: true as const,
        reason: `场景“${scene.title}”需要统一的环境视觉参考`,
      },
      ...scene.character_asset_ids.map((assetId) => ({
        scene_id: scene.scene_id,
        asset_type: 'character' as const,
        asset_id: assetId,
        variant_key: 'default',
        required: true as const,
        reason: `场景“${scene.title}”中的实体角色需要已审核关键图`,
      })),
    ]);
    return Promise.resolve({
      status: 'success',
      data: { requirements },
      warnings: [],
      metadata: {
        agent_id: this.id,
        model_used: 'mock-visual-prep-v1',
        tokens_used: 0,
        duration_ms: 0,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
