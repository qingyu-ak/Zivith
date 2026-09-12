const LIVE_MODEL_FETCH_CAP = 80;
const SILICONFLOW_CHAT_LIST_CAP = 16;

export type LlmProviderId = 'mock' | 'deepseek' | 'siliconflow';

export interface CatalogLlmModel {
  id: string;
  label: string;
}

/** 官方对话模型；未知 id 仍可通过 GET /models 或当前选择补进列表。 */
export const KNOWN_LLM_MODELS: Record<LlmProviderId, CatalogLlmModel[]> = {
  mock: [{ id: 'mock-text-v1', label: 'mock-text-v1' }],
  deepseek: [
    { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
    { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
  ],
  siliconflow: [],
};

export function labelFromModelId(id: string): string {
  return id;
}

export function isChatLlmId(provider: string, id: string): boolean {
  const lower = id.toLowerCase();
  if (!id.trim()) return false;
  if (
    /(embedding|rerank|whisper|tts|audio|image|video|vision|flux|wan[-/]|stable-diffusion|kolors|bge[-/]|embed)/.test(
      lower,
    )
  ) {
    return false;
  }
  if (provider === 'deepseek') return lower.startsWith('deepseek');
  if (provider === 'mock') return lower.startsWith('mock');
  return true;
}

export function listLlmModelsForProvider(
  provider: string,
  liveIds: string[] = [],
  selectedId?: string,
  extraIds: string[] = [],
): CatalogLlmModel[] {
  const known = KNOWN_LLM_MODELS[provider as LlmProviderId] ?? [];
  const order: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | undefined) => {
    const trimmed = id?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    order.push(trimmed);
  };
  for (const row of known) add(row.id);
  for (const id of liveIds) {
    if (isChatLlmId(provider, id)) add(id);
  }
  for (const id of extraIds) add(id);
  add(selectedId);
  if (provider === 'siliconflow' && order.length > SILICONFLOW_CHAT_LIST_CAP) {
    const keepAlways = new Set(
      [...known.map((row) => row.id), ...extraIds, selectedId?.trim()].filter(Boolean) as string[],
    );
    const kept: string[] = [];
    for (const id of order) {
      if (keepAlways.has(id)) {
        kept.push(id);
        continue;
      }
      if (kept.length < SILICONFLOW_CHAT_LIST_CAP) kept.push(id);
    }
    order.length = 0;
    order.push(...kept);
  }
  return order.map((id) => ({ id, label: id }));
}

export async function fetchOpenAiModelIds(
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
    return (payload.data ?? [])
      .map((item) => (typeof item.id === 'string' ? item.id : ''))
      .filter(Boolean)
      .slice(0, LIVE_MODEL_FETCH_CAP);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
