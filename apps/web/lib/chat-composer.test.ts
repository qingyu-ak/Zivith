/// <reference types="vitest/globals" />
import {
  asChatEffort,
  CHAT_EFFORT_TOKEN_CAP,
  displayModelId,
  estimateMessageTokens,
  filterLlmChoices,
  formatTokenCompact,
  formatTokenCount,
  formatContextMeter,
  formatContextRatio,
  contextUsagePercent,
  CHAT_EFFORT_LABEL,
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

  it('formats compact k counts for the context footer', () => {
    expect(formatTokenCompact(12_400)).toBe('12.4k');
    expect(formatTokenCompact(24_000)).toBe('24k');
    expect(formatTokenCompact(8000)).toBe('8k');
    expect(formatTokenCompact(320)).toBe('320');
  });

  it('labels effort as 快速 / 均衡 / 深度', () => {
    expect(CHAT_EFFORT_LABEL.fast).toBe('快速');
    expect(CHAT_EFFORT_LABEL.balanced).toBe('均衡');
    expect(CHAT_EFFORT_LABEL.deep).toBe('深度');
  });

  it('builds a shared Chinese context meter line', () => {
    expect(formatContextRatio(12_400, 24_000)).toBe('12.4k/24k (52%)');
    expect(formatContextMeter(12_400, 24_000)).toBe('上下文 12.4k/24k (52%)');
    expect(formatContextMeter(800, 8_000, { approximate: true, llmCalls: 3 })).toBe(
      '上下文 约 800/8k (10%) · LLM 3 次',
    );
    expect(contextUsagePercent(23_000, 24_000)).toBeGreaterThanOrEqual(90);
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
