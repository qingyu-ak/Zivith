import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertAllPromptTemplatesValid,
  clearPromptCache,
  fillPromptTemplate,
  listPlaceholders,
  loadAgentSystemPrompt,
  resolvePromptsRoot,
} from '../src/contexts/agent/prompt-loader.js';

describe('agent prompt loader (W6)', () => {
  it('validates all registered zh/en templates at boot', () => {
    clearPromptCache();
    expect(() => assertAllPromptTemplatesValid()).not.toThrow();
  });

  it('loads story/scene/visual_trait English prompts behavior-equivalently', () => {
    clearPromptCache();
    const root = resolvePromptsRoot();
    for (const agent of ['story', 'scene', 'visual_trait'] as const) {
      const fromDisk = readFileSync(join(root, agent, 'system.en.md'), 'utf8').trimEnd();
      const expected = fillPromptTemplate(fromDisk, { knowledge_context: '' }).trimEnd();
      const loaded = loadAgentSystemPrompt(agent, 'en', { knowledge_context: '' });
      expect(loaded).toBe(expected);
      expect(listPlaceholders(loaded)).toEqual([]);
      expect(loaded).toContain(
        agent === 'story'
          ? 'STORY_AGENT'
          : agent === 'scene'
            ? 'SCENE_AGENT'
            : 'VISUAL_TRAIT_AGENT',
      );
    }
  });

  it('keeps knowledge_context slot and fills empty by default', () => {
    clearPromptCache();
    const withContext = loadAgentSystemPrompt('story', 'en', {
      knowledge_context: 'MEMORY: prior project style is noir.',
    });
    expect(withContext).toContain('MEMORY: prior project style is noir.');
    const empty = loadAgentSystemPrompt('story', 'en');
    expect(empty).not.toContain('{knowledge_context}');
  });

  it('exposes zh templates with the same placeholders and markers', () => {
    clearPromptCache();
    for (const agent of ['story', 'scene', 'visual_trait'] as const) {
      const zh = loadAgentSystemPrompt(agent, 'zh', { knowledge_context: '' });
      expect(listPlaceholders(zh)).toEqual([]);
      expect(zh).toContain(
        agent === 'story'
          ? 'STORY_AGENT'
          : agent === 'scene'
            ? 'SCENE_AGENT'
            : 'VISUAL_TRAIT_AGENT',
      );
    }
  });
});
