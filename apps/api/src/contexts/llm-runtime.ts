import type { PrismaClient } from '@zivith/database';
import { createProviderBundle } from '../providers/registry.js';
import { getRuntimeModelOverride, getRuntimeProviderOverride } from '../routes/providers.js';
import { instrumentProviderBundle } from './usage/instrument.js';
import type { LLMAdapter } from '../ports/llm.js';

/** 按当前进程内的提供商/模型选择组装 LLM。每轮对话调用一次，使 PUT /providers/selection 立即生效。 */
export function resolveRuntimeLlm(db: PrismaClient): { llm: LLMAdapter; model: string } {
  const bundle = instrumentProviderBundle(
    db,
    createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()),
  );
  return { llm: bundle.llm, model: bundle.llmModel };
}
