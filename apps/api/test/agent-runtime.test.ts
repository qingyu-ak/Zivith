import { describe, expect, it } from 'vitest';
import { asId, type AgentContext } from '@zivith/domain';
import { mockAgentResponder } from '../src/adapters/mock-agent-responder.js';
import { MockLLMAdapter } from '../src/adapters/mock-llm.js';
import { AssetAgent } from '../src/contexts/agent/asset-agent.js';
import { PromptAgent } from '../src/contexts/agent/prompt-agent.js';
import { AgentRuntime } from '../src/contexts/agent/runtime.js';
import { SceneAgent } from '../src/contexts/agent/scene-agent.js';
import { ShotAgent } from '../src/contexts/agent/shot-agent.js';
import { StoryAgent } from '../src/contexts/agent/story-agent.js';
import { VisualPrepAgent } from '../src/contexts/agent/visual-prep-agent.js';

const context: AgentContext = {
  project_id: asId('project-1'),
  user_id: asId('user-1'),
  workflow_run_id: asId('workflow-1'),
  previous_results: new Map(),
  automation_level: 'assisted',
};

describe('Agent Runtime with mock agents', () => {
  it('runs Story → Scene with schema-validated structured output', async () => {
    const llm = new MockLLMAdapter({ responder: mockAgentResponder });
    const runtime = new AgentRuntime();

    const storyResult = await runtime.execute(
      new StoryAgent(llm),
      { brief: '一台维护机器人在废弃城市中发现最后一颗种子。' },
      context,
    );
    expect(storyResult.status).toBe('success');
    expect(storyResult.data?.screenplay).toContain('第一幕');

    if (!storyResult.data) throw new Error('Expected generated story');
    const sceneResult = await runtime.execute(
      new SceneAgent(llm),
      { story: storyResult.data },
      context,
    );
    expect(sceneResult.status).toBe('success');
    expect(sceneResult.data?.scenes).toHaveLength(3);
    expect(sceneResult.metadata.tokens_used).toBeGreaterThan(0);
  });

  it('returns validation failures without calling the model', async () => {
    const llm = new MockLLMAdapter({
      responder: () => {
        throw new Error('Model should not be called');
      },
    });
    const result = await new AgentRuntime().execute(new StoryAgent(llm), { brief: '太短' }, context);

    expect(result.status).toBe('failed');
    expect(result.warnings[0]?.code).toBe('BRIEF_TOO_SHORT');
  });

  it('creates missing asset drafts and visual requirements', async () => {
    const runtime = new AgentRuntime();
    const asset = await runtime.execute(
      new AssetAgent(),
      { asset_type: 'location', name: '废弃城市', scene_context: '清晨建立镜头' },
      context,
    );
    expect(asset.data).toMatchObject({
      asset_type: 'location',
      name: '废弃城市',
      tags: ['ai-draft', 'mock-generated'],
    });

    const prep = await runtime.execute(
      new VisualPrepAgent(),
      {
        scenes: [
          {
            scene_id: 'scene-1',
            title: '建立',
            location_asset_id: 'location-1',
            character_asset_ids: ['character-1'],
            variant_key: '清晨_克制',
          },
        ],
      },
      context,
    );
    expect(prep.data?.requirements).toHaveLength(2);
    expect(prep.data?.requirements.every((requirement) => requirement.required)).toBe(true);
  });

  it('runs Shot → Prompt with complete cinematic fields', async () => {
    const runtime = new AgentRuntime();
    const shotResult = await runtime.execute(
      new ShotAgent(),
      {
        scenes: [
          {
            id: 'scene-1',
            title: '种子的发现',
            description: '机器人从瓦砾中捧起一颗发光种子。',
            time_of_day: '黄昏',
            weather: '薄雾',
            mood: '希望',
            location_name: '废弃城市',
            characters: [{ id: 'character-1', name: 'R-7' }],
          },
        ],
      },
      context,
    );

    expect(shotResult.data?.shots).toHaveLength(2);
    expect(shotResult.data?.shots[0]).toMatchObject({
      camera: expect.any(Object),
      lighting: expect.any(Object),
      action: expect.any(Object),
      characters: expect.any(Array),
    });
    const shot = shotResult.data?.shots[1];
    if (!shot) throw new Error('Expected generated shot');

    const promptResult = await runtime.execute(
      new PromptAgent(),
      {
        shot_id: 'shot-1',
        label: shot.label,
        camera: shot.camera as Record<string, unknown>,
        composition: shot.composition as Record<string, unknown>,
        lighting: shot.lighting as Record<string, unknown>,
        color: shot.color as Record<string, unknown>,
        mood: shot.mood,
        characters: [
          {
            name: 'R-7',
            action: shot.characters[0]?.action,
            emotion: shot.characters[0]?.emotion,
          },
        ],
        dialogue: shot.dialogue as Record<string, unknown>,
        action: shot.action as Record<string, unknown>,
        scene: {
          title: '种子的发现',
          description: '机器人从瓦砾中捧起一颗发光种子。',
          time: '黄昏',
          weather: '薄雾',
          location_name: '废弃城市',
        },
        style: { rendering: 'photorealistic', aspect_ratio: '16:9' },
        project_negative_prompt: 'overexposed',
      },
      context,
    );

    expect(promptResult.data?.positive).toContain('Cinematography:');
    expect(promptResult.data?.positive).toContain('Characters: R-7');
    expect(promptResult.data?.negative).toContain('overexposed');
  });
});
