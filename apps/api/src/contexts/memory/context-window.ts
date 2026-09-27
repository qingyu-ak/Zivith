import { normalizeForFingerprint } from '@zivith/domain';
import type { LLMAdapter } from '../../ports/llm.js';
import { detectFactType, splitStatements } from './extract.js';
import { MEMORY_SUMMARY_SYSTEM_PROMPT, memorySummarySchema } from './pipeline.js';

export interface ContextMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** 中文 ≈1.5 字/token、其他 ≈4 字符/token 的启发式估算（无分词器依赖）。 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const rest = text.length - cjk;
  return Math.ceil(cjk / 1.5) + Math.ceil(rest / 4);
}

export function estimateMessagesTokens(messages: ContextMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
}

export interface ContextWindowInput {
  history: ContextMessage[];
  previousSummary: string;
  /** 分配给「摘要 + 最近原文」的 token 预算。 */
  tokenBudget: number;
  /** 保留最近 N 条原文（默认 8）。 */
  keepRecentMessages: number;
  /** 已折进摘要的最后一条；再淘汰时从其后开始，避免每轮重压同一段。 */
  summarizedUntilMessageId?: string | null;
}

export interface ContextWindowResult {
  window: ContextMessage[];
  /** 本轮被淘汰进摘要的消息（older 全量 + recent 溢出部分）。 */
  evicted: ContextMessage[];
  tokenEstimate: number;
}

/** 预算分配：③滚动摘要 + ④最近K条原文；older 一律不进 prompt。 */
export function buildBudgetedHistory(input: ContextWindowInput): ContextWindowResult {
  const keep = Math.max(2, input.keepRecentMessages);
  const older = input.history.slice(0, Math.max(0, input.history.length - keep));
  const recent = input.history.slice(-keep);
  const summarizedUntil = input.summarizedUntilMessageId ?? null;
  let evictFrom = 0;
  if (summarizedUntil) {
    const summarizedIndex = older.findIndex((message) => message.id === summarizedUntil);
    if (summarizedIndex >= 0) evictFrom = summarizedIndex + 1;
  }
  const evicted: ContextMessage[] = older.slice(evictFrom);
  const summaryTokens = estimateTokens(input.previousSummary);
  let used = summaryTokens + estimateMessagesTokens(recent);
  const window = [...recent];
  while (used > input.tokenBudget && window.length > 2) {
    const removed = window.shift();
    if (!removed) break;
    evicted.push(removed);
    used = summaryTokens + estimateMessagesTokens(window);
  }
  return { window, evicted, tokenEstimate: used };
}

/** 规则降级摘要：关键句抽取 + 与已有摘要行去重合并（≤12 行）。 */
export function ruleSummarize(evicted: ContextMessage[], previousSummary: string): string {
  const existingLines = previousSummary
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set(existingLines.map((line) => normalizeForFingerprint(line)));
  const lines = [...existingLines];
  for (const message of evicted) {
    for (const statement of splitStatements(message.content)) {
      // 关键句 = 事实类型可归类（trait/relation/desire/…）；寒暄与纯叙事不进摘要。
      if (detectFactType(statement) === 'episodic') continue;
      const key = normalizeForFingerprint(statement);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      lines.push(statement.slice(0, 200));
      if (lines.length >= 12) return lines.join('\n');
    }
  }
  return lines.join('\n');
}

/** 摘要压缩：有密钥走 LLM 合并，否则规则降级。 */
export async function compressHistory(options: {
  llm?: LLMAdapter | null | undefined;
  llmModel?: string | undefined;
  evicted: ContextMessage[];
  previousSummary: string;
}): Promise<string> {
  if (options.evicted.length === 0) return options.previousSummary;
  if (options.llm && options.llm.provider !== 'mock') {
    const result = await options.llm.completeStructured(
      {
        request_id: `memory-summary:${Date.now()}`,
        model: options.llmModel ?? 'deepseek-chat',
        system_prompt: MEMORY_SUMMARY_SYSTEM_PROMPT,
        user_prompt: JSON.stringify({
          previous_summary: options.previousSummary,
          evicted: options.evicted.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
        temperature: 0.2,
        max_tokens: 800,
      },
      memorySummarySchema,
    );
    return clipRollingSummary(result.data.summary);
  }
  return clipRollingSummary(ruleSummarize(options.evicted, options.previousSummary));
}

export const CONTEXT_TOKEN_BUDGET_DEFAULT = 24_000;
export const ROLLING_SUMMARY_MAX_TOKENS = 1_000;

export function contextTokenBudget(): number {
  const value = Number(process.env.MEMORY_CONTEXT_TOKEN_BUDGET ?? CONTEXT_TOKEN_BUDGET_DEFAULT);
  return Number.isFinite(value) && value > 1_000 ? value : CONTEXT_TOKEN_BUDGET_DEFAULT;
}

/** 滚动摘要只服务当下窗口，不当档案越积越长。 */
export function clipRollingSummary(
  text: string,
  maxTokens = ROLLING_SUMMARY_MAX_TOKENS,
): string {
  const trimmed = text.trim();
  if (!trimmed || estimateTokens(trimmed) <= maxTokens) return trimmed;
  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (let index = lines.length - 1; index >= 0; index--) {
    const next = [lines[index]!, ...kept];
    if (estimateTokens(next.join('\n')) > maxTokens) break;
    kept.unshift(lines[index]!);
  }
  if (kept.length > 0) return kept.join('\n');
  let cut = trimmed;
  while (cut.length > 24 && estimateTokens(cut) > maxTokens) {
    cut = cut.slice(0, Math.floor(cut.length * 0.8));
  }
  return cut;
}
