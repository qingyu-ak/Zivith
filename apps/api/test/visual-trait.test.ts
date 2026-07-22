import { describe, expect, it } from 'vitest';
import {
  buildFallbackVisualTrait,
  mergeVisualPromptIntoAssetData,
  readVisualPromptFromAssetData,
} from '../src/contexts/agent/visual-trait.js';

describe('visual-trait helpers', () => {
  it('builds a usable fallback prompt', () => {
    const draft = buildFallbackVisualTrait({
      asset_type: 'character',
      asset_name: '园丁七号',
      variant_key: 'default',
      scene_title: '废土旷野',
      story_title: '最后的园丁',
    });
    expect(draft.description).toContain('园丁七号');
    expect(draft.generation_prompt).toContain('character key visual');
  });

  it('stores and reads generation prompts on asset data', () => {
    const merged = mergeVisualPromptIntoAssetData({}, 'day_lonely', 'neon rain street', '荒凉');
    expect(readVisualPromptFromAssetData(merged, 'day_lonely')).toBe('neon rain street');
    expect((merged.visual as { appearance_summary?: string }).appearance_summary).toBe('荒凉');
  });
});
