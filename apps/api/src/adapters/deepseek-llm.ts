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

type DeepSeekMessage = {
  content?: string | null;
  reasoning_content?: string | null;
};

type DeepSeekChatPayload = {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: DeepSeekMessage;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function messageContent(payload: DeepSeekChatPayload): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') return JSON.stringify(content);
  return '';
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim().replace(/^\uFEFF/, '');
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function sliceBetween(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + close.length);
}

/** Pull a JSON value out of model text (fences, preamble, or truncated wrappers). */
export function extractJsonFromLlmText(text: string): unknown {
  const trimmed = stripMarkdownFence(text);
  if (!trimmed) {
    throw new Error('DeepSeek did not return valid JSON');
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const objectSlice = sliceBetween(trimmed, '{', '}');
    if (objectSlice) {
      try {
        return JSON.parse(objectSlice) as unknown;
      } catch {
        // fall through to array / final error
      }
    }
    const arraySlice = sliceBetween(trimmed, '[', ']');
    if (arraySlice) {
      try {
        return JSON.parse(arraySlice) as unknown;
      } catch {
        // fall through
      }
    }
    throw new Error('DeepSeek did not return valid JSON');
  }
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
    const payload = await this.chat(request, { jsonObject: false });
    const text = messageContent(payload);
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
      system_prompt: `${request.system_prompt}\n\nReturn ONLY valid JSON. No markdown fences. The word json appears in this instruction; output a single JSON object.`,
    };
    const payload = await this.chatJson(withJsonInstruction);
    const parsed = extractJsonFromLlmText(messageContent(payload));
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

  /**
   * JSON mode on DeepSeek V4 can return HTTP 200 with empty `content` when
   * thinking mode consumes the token budget. Disable thinking and retry once.
   */
  private async chatJson(request: CompletionRequest): Promise<DeepSeekChatPayload> {
    const jsonRequest: CompletionRequest = {
      ...request,
      max_tokens: Math.max(request.max_tokens ?? 4_096, 4_096),
    };
    const first = await this.chat(jsonRequest, { jsonObject: true, thinking: 'disabled' });
    if (messageContent(first).trim()) return first;
    return this.chat(jsonRequest, { jsonObject: true, thinking: 'disabled' });
  }

  private async chat(
    request: CompletionRequest,
    options: { jsonObject: boolean; thinking?: 'enabled' | 'disabled' },
  ) {
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
        ...(options.jsonObject ? { response_format: { type: 'json_object' } } : {}),
        ...(options.thinking ? { thinking: { type: options.thinking } } : {}),
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
    return (await response.json()) as DeepSeekChatPayload;
  }
}
