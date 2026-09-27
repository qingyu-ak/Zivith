import type { ProviderCatalogDTO, ProviderId } from './types';

export type ChatEffort = 'fast' | 'balanced' | 'deep';

export const CHAT_EFFORT_KEY = 'zivith.chatEffort';
export const CHAT_EFFORT_STOP_KEY = 'zivith.chatEffortStop';
export const CHAT_FAST_KEY = 'zivith.chatFast';
export const CHAT_THINKING_KEY = 'zivith.chatThinking';
export const CHAT_CONTEXT_WINDOW_KEY = 'zivith.chatContextWindow';
export const CHAT_EFFORT_STOPS: ChatEffort[] = ['fast', 'balanced', 'deep'];

export const CHAT_EFFORT_LABEL: Record<ChatEffort, string> = {
  fast: '快速',
  balanced: '均衡',
  deep: '深度',
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

export function readStoredStopIndex(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(CHAT_EFFORT_STOP_KEY);
  if (raw == null || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function writeStoredStopIndex(index: number) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CHAT_EFFORT_STOP_KEY, String(index));
}

export function asChatFast(value: unknown): boolean {
  return value === '1' || value === 'true';
}

export function readStoredFast(): boolean {
  if (typeof window === 'undefined') return false;
  return asChatFast(window.localStorage.getItem(CHAT_FAST_KEY));
}

export function writeStoredFast(fast: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CHAT_FAST_KEY, fast ? '1' : '0');
}

export function asChatThinking(value: unknown): boolean {
  return value === '1' || value === 'true';
}

export function readStoredThinking(): boolean {
  if (typeof window === 'undefined') return false;
  return asChatThinking(window.localStorage.getItem(CHAT_THINKING_KEY));
}

export function writeStoredThinking(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CHAT_THINKING_KEY, enabled ? '1' : '0');
}

export function asContextWindow(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function readStoredContextWindow(): number | null {
  if (typeof window === 'undefined') return null;
  return asContextWindow(window.localStorage.getItem(CHAT_CONTEXT_WINDOW_KEY));
}

export function writeStoredContextWindow(tokens: number | null) {
  if (typeof window === 'undefined') return;
  if (tokens == null) {
    window.localStorage.removeItem(CHAT_CONTEXT_WINDOW_KEY);
    return;
  }
  window.localStorage.setItem(CHAT_CONTEXT_WINDOW_KEY, String(tokens));
}

export function effortIndex(effort: ChatEffort): number {
  const index = CHAT_EFFORT_STOPS.indexOf(effort);
  return index < 0 ? 1 : index;
}

export function effortFromIndex(index: number): ChatEffort {
  const clamped = Math.min(CHAT_EFFORT_STOPS.length - 1, Math.max(0, Math.round(index)));
  return CHAT_EFFORT_STOPS[clamped] ?? 'balanced';
}

export function formatModelEffortTrigger(modelLabel: string, effort: ChatEffort): string {
  return `${modelLabel} ${CHAT_EFFORT_LABEL[effort]}`;
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

/** Cursor 式页脚：12.4k / 24k。 */
export function formatTokenCompact(count: number): string {
  if (count >= 1000) {
    const k = count / 1000;
    if (k >= 100) return `${Math.round(k)}k`;
    return `${k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(Math.round(count));
}

export function contextUsagePercent(used: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.max(0, (used / cap) * 100);
}

/** 用量弹层右侧：12.4k/24k (52%) */
export function formatContextRatio(
  used: number,
  cap: number,
  options?: { approximate?: boolean },
): string {
  const pct = contextUsagePercent(used, cap);
  const approx = options?.approximate ? '约 ' : '';
  return `${approx}${formatTokenCompact(used)}/${formatTokenCompact(cap)} (${pct.toFixed(0)}%)`;
}

/** Chat / Studio 共用页脚：上下文 12.4k/24k (51%) · LLM 3 次 */
export function formatContextMeter(
  used: number,
  cap: number,
  options?: { approximate?: boolean; llmCalls?: number | null },
): string {
  const meter = `上下文 ${formatContextRatio(used, cap, { approximate: options?.approximate })}`;
  if (options?.llmCalls == null) return meter;
  return `${meter} · LLM ${options.llmCalls} 次`;
}

export function llmChoices(catalog: ProviderCatalogDTO | null): LlmChoice[] {
  if (!catalog) return [];
  // 设置页可隐藏模型；当前正在用的那条即使被隐藏也先留着，直到用户另选。
  const hidden = new Set(
    (catalog.hidden_models ?? []).map((item) => `${item.provider}\n${item.model}`),
  );
  const currentKey = `${catalog.selection.llm}\n${catalog.models.llm}`;
  return catalog.providers
    .filter((provider) => provider.modalities.includes('llm'))
    .flatMap((provider) => {
      const models =
        provider.llm_models && provider.llm_models.length > 0 ? provider.llm_models : [];
      return models
        .filter((item) => {
          const key = `${provider.id}\n${item.id}`;
          return !hidden.has(key) || key === currentKey;
        })
        .map((item) => ({
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
