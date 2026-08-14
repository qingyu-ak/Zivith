import type { ZodType } from 'zod';
import type {
  CompletionRequest,
  CompletionResult,
  LLMAdapter,
  StructuredCompletionResult,
} from '../ports/llm.js';

export type MockLLMResponder = (request: CompletionRequest) => unknown;

export interface MockLLMAdapterOptions {
  responder: MockLLMResponder;
  delayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class MockLLMAdapter implements LLMAdapter {
  readonly provider = 'mock';
  readonly supportedModels = [{ id: 'mock-text-v1', name: 'Mock Text Generator', version: '1' }];

  private readonly delayMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: MockLLMAdapterOptions) {
    this.delayMs = options.delayMs ?? 0;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    this.assertModel(request.model);
    await this.sleep(this.delayMs);
    const response = await this.options.responder(request);
    const text = typeof response === 'string' ? response : JSON.stringify(response);
    return {
      text,
      model: request.model,
      input_tokens: this.estimateTokens(request.system_prompt + request.user_prompt),
      output_tokens: this.estimateTokens(text),
      metadata: { is_mock: true, request_id: request.request_id },
    };
  }

  async completeStructured<T>(
    request: CompletionRequest,
    schema: ZodType<T>,
  ): Promise<StructuredCompletionResult<T>> {
    this.assertModel(request.model);
    await this.sleep(this.delayMs);
    const response = await this.options.responder(request);
    const data = schema.parse(
      typeof response === 'string' ? (JSON.parse(response) as unknown) : response,
    );
    const text = JSON.stringify(data);
    return {
      data,
      text,
      model: request.model,
      input_tokens: this.estimateTokens(request.system_prompt + request.user_prompt),
      output_tokens: this.estimateTokens(text),
      metadata: { is_mock: true, request_id: request.request_id },
    };
  }

  private assertModel(model: string): void {
    if (!this.supportedModels.some((candidate) => candidate.id === model)) {
      throw new Error(`Unsupported mock text model: ${model}`);
    }
  }

  private estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }
}
