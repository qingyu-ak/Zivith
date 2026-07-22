import { describe, expect, it } from 'vitest';
import {
  generatedStorySchema,
  normalizeGeneratedStoryInput,
} from '../src/contexts/agent/story-agent.js';

describe('generatedStorySchema', () => {
  it('accepts canonical story payloads', () => {
    const story = generatedStorySchema.parse({
      title: '最后一颗种子',
      logline: '机器人守护一颗种子。',
      synopsis: '废土中的希望。',
      genre: '科幻',
      theme: '希望与陪伴',
      tone: '温暖克制',
      screenplay: 'INT. 废墟 - 日\n园丁七号醒来。',
    });
    expect(story.title).toBe('最后一颗种子');
  });

  it('normalizes DeepSeek-style alternate keys', () => {
    const normalized = normalizeGeneratedStoryInput({
      title: '园丁七号',
      logline: '一颗种子改变一切。',
      themes: ['希望', '陪伴'],
      scenes: [
        {
          order: 1,
          title: '发现',
          location: '废墟温室',
          summary: '园丁七号发现种子。',
        },
        {
          order: 2,
          title: '守护',
          description: '它决定守护种子。',
        },
      ],
      ending: '种子发芽，废土迎来第一缕绿意。',
    });

    const story = generatedStorySchema.parse(normalized);
    expect(story.theme).toContain('希望');
    expect(story.synopsis).toContain('种子发芽');
    expect(story.screenplay).toContain('Scene 1');
    expect(story.screenplay).toContain('发现');
    expect(story.genre).toBe('剧情');
    expect(story.tone).toBe('克制而温暖');
  });
});
