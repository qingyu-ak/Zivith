import type { ZodType } from 'zod';
import type {
  CompletionRequest,
  CompletionResult,
  LLMAdapter,
  StructuredCompletionResult,
} from '../ports/llm.js';

export interface DeepSeekLLMAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  fetchImpl?: typeof fetch;
}

export class DeepSeekLLMAdapter implements LLMAdapter {
  readonly provider = 'deepseek';
  readonly supportedModels;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DeepSeekLLMAdapterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.deepseek.com').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    const model = options.defaultModel ?? 'deepseek-v4-flash';
    this.supportedModels = [
      { id: 'deepseek-v4-flash', name: 'DeepSeek Flash', version: '4' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek Pro', version: '4' },
      ...(model === 'deepseek-v4-flash' || model === 'deepseek-v4-pro'
        ? []
        : [{ id: model, name: model, version: '1' }]),
    ];
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const payload = await this.chat(request, false);
    const text = payload.choices?.[0]?.message?.content ?? '';
    return {
      text,
      model: payload.model ?? request.model,
      input_tokens: Number(payload.usage?.prompt_tokens ?? 0),
      output_tokens: Number(payload.usage?.completion_tokens ?? 0),
      metadata: { provider: 'deepseek', request_id: request.request_id },
    };
  }

  async completeStructured<T>(
    request: CompletionRequest,
    schema: ZodType<T>,
  ): Promise<StructuredCompletionResult<T>> {
    const withJsonInstruction: CompletionRequest = {
      ...request,
      system_prompt: `${request.system_prompt}\n\nReturn ONLY valid JSON. No markdown fences.`,
    };
    const payload = await this.chat(withJsonInstruction, true);
    const text = payload.choices?.[0]?.message?.content ?? '';
    const parsed = this.extractJson(text);
    const data = schema.parse(parsed);
    return {
      data,
      text: JSON.stringify(data),
      model: payload.model ?? request.model,
      input_tokens: Number(payload.usage?.prompt_tokens ?? 0),
      output_tokens: Number(payload.usage?.completion_tokens ?? 0),
      metadata: { provider: 'deepseek', request_id: request.request_id },
    };
  }

  private async chat(request: CompletionRequest, jsonObject: boolean) {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? 4096,
        ...(jsonObject ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: request.system_prompt },
          { role: 'user', content: request.user_prompt },
        ],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`DeepSeek API ${response.status}: ${body.slice(0, 500)}`);
    }
    return (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
  }

  private extractJson(text: string): unknown {
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      }
      throw new Error('DeepSeek did not return valid JSON');
    }
  }
}
