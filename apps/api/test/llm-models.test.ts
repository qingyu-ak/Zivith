import { describe, expect, it } from 'vitest';
import { isChatLlmId, listLlmModelsForProvider } from '../src/providers/llm-models.js';

describe('listLlmModelsForProvider', () => {
  it('lists DeepSeek Flash and Pro by API model id', () => {
    const models = listLlmModelsForProvider('deepseek');
    expect(models.map((item) => item.id)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro']);
    expect(models.map((item) => item.label)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro']);
  });

  it('keeps the current alias when it is not in the known list', () => {
    const models = listLlmModelsForProvider('deepseek', [], 'deepseek-chat');
    expect(models.map((item) => item.id)).toEqual([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'deepseek-chat',
    ]);
    expect(models.at(-1)?.label).toBe('deepseek-chat');
  });

  it('merges live ids from the provider API', () => {
    const models = listLlmModelsForProvider('deepseek', ['deepseek-v4-flash', 'deepseek-v4-pro']);
    expect(models).toHaveLength(2);
    const extra = listLlmModelsForProvider('siliconflow', [
      'Qwen/Qwen2.5-7B-Instruct',
      'Wan-AI/Wan2.2-T2V-A14B',
      'BAAI/bge-m3',
    ]);
    expect(extra.map((item) => item.id)).toEqual(['Qwen/Qwen2.5-7B-Instruct']);
  });

  it('rejects vision and media model ids for chat', () => {
    expect(isChatLlmId('deepseek', 'deepseek-v4-flash-vision-exp')).toBe(false);
    expect(isChatLlmId('siliconflow', 'FunAudioLLM/CosyVoice2-0.5B')).toBe(false);
  });
});
