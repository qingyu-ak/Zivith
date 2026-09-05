/// <reference types="vitest/globals" />
import {
  asChatEffort,
  CHAT_EFFORT_TOKEN_CAP,
  displayModelId,
  estimateMessageTokens,
  filterLlmChoices,
  formatTokenCount,
  isLlmDegraded,
  llmChoices,
  selectedLlmLabel,
} from './chat-composer';
import type { ProviderCatalogDTO } from './types';

const catalog: ProviderCatalogDTO = {
  selection: { llm: 'deepseek', image: 'mock', video: 'mock', audio: 'mock' },
  models: {
    llm: 'deepseek-v4-flash',
    image: '',
    image_i2i: '',
    video: '',
    video_i2v: '',
    audio: '',
  },
  providers: [
    {
      id: 'mock',
      label: 'Mock（本地占位）',
      modalities: ['llm', 'image', 'video', 'audio'],
      configured: true,
      llm_models: [{ id: 'mock-text-v1', label: 'mock-text-v1' }],
    },
    {
      id: 'deepseek',
      label: 'DeepSeek',
      modalities: ['llm'],
      configured: true,
      llm_models: [
        { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
        { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
      ],
    },
    {
      id: 'siliconflow',
      label: 'SiliconFlow',
      modalities: ['llm', 'image', 'video', 'audio'],
      configured: true,
      llm_models: [],
    },
  ],
};

describe('chat composer helpers', () => {
  it('defaults unknown effort to balanced', () => {
    expect(asChatEffort('deep')).toBe('deep');
    expect(asChatEffort('nope')).toBe('balanced');
  });

  it('aligns context caps with the chat-v1 effort schedule', () => {
    expect(CHAT_EFFORT_TOKEN_CAP.fast).toBe(8_000);
    expect(CHAT_EFFORT_TOKEN_CAP.balanced).toBe(24_000);
    expect(CHAT_EFFORT_TOKEN_CAP.deep).toBe(40_000);
    expect(CHAT_EFFORT_TOKEN_CAP.fast).toBeLessThan(CHAT_EFFORT_TOKEN_CAP.deep);
  });

  it('estimates CJK-heavy tokens and formats 万', () => {
    expect(estimateMessageTokens(['你好世界'])).toBe(2);
    expect(formatTokenCount(97_000)).toBe('9.7万');
    expect(formatTokenCount(1_000_000)).toBe('100万');
    expect(formatTokenCount(320)).toBe('320');
  });

  it('lists each provider model by API id', () => {
    const choices = llmChoices(catalog);
    expect(choices.map((item) => `${item.provider}:${item.model}`)).toEqual([
      'mock:mock-text-v1',
      'deepseek:deepseek-v4-flash',
      'deepseek:deepseek-v4-pro',
    ]);
    expect(selectedLlmLabel(catalog)).toBe('deepseek-v4-flash');
  });

  it('shortens org/model ids and filters the picker', () => {
    expect(displayModelId('Qwen/Qwen3.6-27B')).toBe('Qwen3.6-27B');
    expect(displayModelId('deepseek-v4-flash')).toBe('deepseek-v4-flash');
    const choices = llmChoices(catalog);
    expect(filterLlmChoices(choices, 'pro').map((item) => item.model)).toEqual(['deepseek-v4-pro']);
    expect(filterLlmChoices(choices, 'DeepSeek')).toHaveLength(2);
  });

  it('flags mock or unconfigured chat providers as degraded', () => {
    expect(isLlmDegraded(catalog)).toBe(false);
    expect(isLlmDegraded({ ...catalog, selection: { ...catalog.selection, llm: 'mock' } })).toBe(
      true,
    );
  });

  it('drops hidden models from the picker but keeps the current selection', () => {
    const hidden = {
      ...catalog,
      hidden_models: [
        { provider: 'deepseek' as const, model: 'deepseek-v4-pro' },
        { provider: 'mock' as const, model: 'mock-text-v1' },
      ],
    };
    expect(
      llmChoices(hidden).map((item) => `${item.provider}:${item.model}`),
    ).toEqual(['deepseek:deepseek-v4-flash']);
    // 当前在用的 deepseek-v4-flash 即使被隐藏也保留；mock 未被隐藏照常出现。
    const currentHidden = {
      ...catalog,
      hidden_models: [{ provider: 'deepseek' as const, model: 'deepseek-v4-flash' }],
    };
    const choices = llmChoices(currentHidden);
    expect(choices.map((item) => item.model)).toEqual([
      'mock-text-v1',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ]);
    expect(selectedLlmLabel(currentHidden)).toBe('deepseek-v4-flash');
  });
});
