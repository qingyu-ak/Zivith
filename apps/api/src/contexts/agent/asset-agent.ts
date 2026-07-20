import {
  validAgentInput,
  type Agent,
  type AgentContext,
  type AgentResult,
  type CostEstimate,
  type ValidationResult,
} from '@zivith/domain';

export interface AssetAgentInput {
  asset_type: 'character' | 'location';
  name: string;
  scene_context: string;
}

export interface GeneratedAssetDraft {
  asset_type: 'character' | 'location';
  name: string;
  description: string;
  tags: string[];
  data: Record<string, string>;
}

export class AssetAgent implements Agent<AssetAgentInput, GeneratedAssetDraft> {
  readonly id = 'asset';
  readonly name = 'Asset Agent';

  validate(input: AssetAgentInput, _context: AgentContext): ValidationResult {
    if (!input.name.trim()) {
      return {
        valid: false,
        issues: [{ code: 'ASSET_NAME_REQUIRED', message: '资产名称不能为空', path: 'name' }],
      };
    }
    return validAgentInput();
  }

  estimate(_input: AssetAgentInput, _context: AgentContext): CostEstimate {
    return { model: 'mock-asset-v1', estimated_tokens: 200 };
  }

  async execute(
    input: AssetAgentInput,
    _context: AgentContext,
  ): Promise<AgentResult<GeneratedAssetDraft>> {
    const kind = input.asset_type === 'character' ? '角色' : '地点';
    return {
      status: 'success',
      data: {
        asset_type: input.asset_type,
        name: input.name.trim(),
        description: `${kind}“${input.name.trim()}”，用于${input.scene_context}。`,
        tags: ['ai-draft', 'mock-generated'],
        data:
          input.asset_type === 'location'
            ? { type: 'other', visual_notes: input.scene_context }
            : { personality: '待审核', visual_notes: input.scene_context },
      },
      warnings: [],
      metadata: {
        agent_id: this.id,
        model_used: 'mock-asset-v1',
        tokens_used: 0,
        duration_ms: 0,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
