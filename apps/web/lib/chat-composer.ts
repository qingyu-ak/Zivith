import type { ProviderCatalogDTO, ProviderId } from './types';

export type ChatEffort = 'fast' | 'balanced' | 'deep';

export const CHAT_EFFORT_KEY = 'zivith.chatEffort';

export const CHAT_EFFORT_LABEL: Record<ChatEffort, string> = {
  fast: '最低',
  balanced: '均衡',
  deep: '最高',
};

/** 与服务端 chat-v1 策略对齐的上下文预算；不是模型窗口上限。 */
export const CHAT_EFFORT_TOKEN_CAP: Record<ChatEffort, number> = {
  fast: 8_000,
  balanced: 24_000,
  deep: 40_000,
};

export const CHAT_EFFORT_HINT: Record<ChatEffort, string> = {
  fast: '窄上下文，跳过自动冲突扫描',
  balanced: '默认范围与定向检查',
  deep: '更广记忆与冲突检查',
};

export const CONTEXT_TOKEN_CAP = CHAT_EFFORT_TOKEN_CAP.balanced;

export interface LlmChoice {
  provider: ProviderId;
  providerLabel: string;
  model: string;
  label: string;
  configured: boolean;
  tag?: string;
}

export function asChatEffort(value: unknown): ChatEffort {
  return value === 'fast' || value === 'deep' ? value : 'balanced';
}

export function readStoredEffort(): ChatEffort {
  if (typeof window === 'undefined') return 'balanced';
  return asChatEffort(window.localStorage.getItem(CHAT_EFFORT_KEY));
}

export function writeStoredEffort(effort: ChatEffort) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CHAT_EFFORT_KEY, effort);
}

export function estimateMessageTokens(texts: string[]): number {
  const chars = texts.reduce((sum, text) => sum + text.length, 0);
  return Math.max(0, Math.round(chars / 2));
}

export function formatTokenCount(count: number): string {
  if (count >= 10_000) {
    const wan = count / 10_000;
    return `${wan >= 10 ? wan.toFixed(0) : wan.toFixed(1).replace(/\.0$/, '')}万`;
  }
  return String(Math.round(count));
}

export function llmChoices(catalog: ProviderCatalogDTO | null): LlmChoice[] {
  if (!catalog) return [];
  return catalog.providers
    .filter((provider) => provider.modalities.includes('llm'))
    .flatMap((provider) => {
      const models =
        provider.llm_models && provider.llm_models.length > 0
          ? provider.llm_models
          : [];
      return models.map((item) => ({
        provider: provider.id,
        providerLabel: provider.label,
        model: item.id,
        label: item.label || item.id,
        configured: provider.configured,
        tag: provider.configured ? undefined : '未配置',
      }));
    });
}

export function displayModelId(id: string): string {
  const slash = id.lastIndexOf('/');
  return slash >= 0 ? id.slice(slash + 1) : id;
}

export function filterLlmChoices(choices: LlmChoice[], query: string): LlmChoice[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return choices;
  return choices.filter(
    (item) =>
      item.model.toLowerCase().includes(needle) ||
      item.providerLabel.toLowerCase().includes(needle) ||
      displayModelId(item.model).toLowerCase().includes(needle),
  );
}

export function selectedLlmLabel(catalog: ProviderCatalogDTO | null): string {
  if (!catalog) return '选择模型';
  const current = llmChoices(catalog).find(
    (item) => item.provider === catalog.selection.llm && item.model === catalog.models.llm,
  );
  const id = current?.model || catalog.models.llm;
  return id ? displayModelId(id) : current?.providerLabel || '选择模型';
}

/** Mock or unconfigured chat provider — roleplay should show 降级模式. */
export function isLlmDegraded(catalog: ProviderCatalogDTO | null): boolean {
  if (!catalog) return false;
  const id = catalog.selection.llm;
  if (id === 'mock') return true;
  const provider = catalog.providers.find((item) => item.id === id);
  return !provider?.configured;
}
