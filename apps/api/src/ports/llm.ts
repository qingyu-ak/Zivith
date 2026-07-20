import type { ZodType } from 'zod';
import type { ModelInfo } from './generation.js';

export interface CompletionRequest {
  request_id: string;
  model: string;
  system_prompt: string;
  user_prompt: string;
  temperature?: number;
  max_tokens?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  metadata: Record<string, string | number | boolean>;
}

export interface StructuredCompletionResult<T> extends CompletionResult {
  data: T;
}

export interface LLMAdapter {
  readonly provider: string;
  readonly supportedModels: readonly ModelInfo[];
  complete(request: CompletionRequest): Promise<CompletionResult>;
  completeStructured<T>(
    request: CompletionRequest,
    schema: ZodType<T>,
  ): Promise<StructuredCompletionResult<T>>;
}
