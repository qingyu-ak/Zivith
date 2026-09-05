export type ApiFormat = 'openai_chat' | 'anthropic_messages';

export interface CustomProviderPublic {
  id: string;
  name: string;
  base_url: string;
  api_format: ApiFormat;
  models: string[];
  has_key: boolean;
}

interface CustomProviderRecord extends CustomProviderPublic {
  api_key: string;
}

const extraLlmModels = new Map<string, string[]>();
let customs: CustomProviderRecord[] = [];
const credentialOverrides: {
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  siliconflowApiKey?: string;
  siliconflowBaseUrl?: string;
} = {};

export function isCustomProviderId(id: string): boolean {
  return id.startsWith('custom_');
}

export function listCustomProviders(): CustomProviderPublic[] {
  return customs.map(({ api_key: _key, ...rest }) => rest);
}

export function getCustomProvider(id: string): CustomProviderRecord | undefined {
  return customs.find((item) => item.id === id);
}

export function extraModelsFor(providerId: string): string[] {
  return extraLlmModels.get(providerId) ?? [];
}

export function addExtraModel(providerId: string, modelId: string): string[] {
  const id = modelId.trim();
  if (!id) return extraModelsFor(providerId);
  const current = extraLlmModels.get(providerId) ?? [];
  if (!current.includes(id)) extraLlmModels.set(providerId, [...current, id]);
  return extraModelsFor(providerId);
}

export function removeExtraModel(providerId: string, modelId: string): string[] {
  const current = extraLlmModels.get(providerId) ?? [];
  extraLlmModels.set(
    providerId,
    current.filter((item) => item !== modelId),
  );
  return extraModelsFor(providerId);
}

export function createCustomProvider(input: {
  name: string;
  base_url: string;
  api_key: string;
  api_format: ApiFormat;
  models: string[];
}): CustomProviderPublic {
  const models = uniqueModels(input.models);
  const record: CustomProviderRecord = {
    id: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: input.name.trim(),
    base_url: input.base_url.replace(/\/$/, ''),
    api_key: input.api_key.trim(),
    api_format: input.api_format,
    models,
    has_key: Boolean(input.api_key.trim()),
  };
  customs = [...customs, record];
  return toPublic(record);
}

export function updateCustomProvider(
  id: string,
  // zod 解析产物在 exactOptionalPropertyTypes 下键值可为 undefined；下方逐字段守卫。
  patch: {
    name?: string | undefined;
    base_url?: string | undefined;
    api_key?: string | undefined;
    api_format?: ApiFormat | undefined;
    models?: string[] | undefined;
  },
): CustomProviderPublic | null {
  const current = getCustomProvider(id);
  if (!current) return null;
  if (patch.name !== undefined) current.name = patch.name.trim();
  if (patch.base_url !== undefined) current.base_url = patch.base_url.replace(/\/$/, '');
  if (patch.api_key !== undefined && patch.api_key.trim()) {
    current.api_key = patch.api_key.trim();
    current.has_key = true;
  }
  if (patch.api_format !== undefined) current.api_format = patch.api_format;
  if (patch.models !== undefined) current.models = uniqueModels(patch.models);
  return toPublic(current);
}

export function deleteCustomProvider(id: string): boolean {
  const next = customs.filter((item) => item.id !== id);
  if (next.length === customs.length) return false;
  customs = next;
  extraLlmModels.delete(id);
  return true;
}

export function getCredentialOverrides() {
  return { ...credentialOverrides };
}

export function setCredentialOverride(patch: {
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  siliconflowApiKey?: string;
  siliconflowBaseUrl?: string;
}) {
  if (patch.deepseekApiKey !== undefined) credentialOverrides.deepseekApiKey = patch.deepseekApiKey;
  if (patch.deepseekBaseUrl !== undefined) {
    credentialOverrides.deepseekBaseUrl = patch.deepseekBaseUrl.replace(/\/$/, '');
  }
  if (patch.siliconflowApiKey !== undefined) {
    credentialOverrides.siliconflowApiKey = patch.siliconflowApiKey;
  }
  if (patch.siliconflowBaseUrl !== undefined) {
    credentialOverrides.siliconflowBaseUrl = patch.siliconflowBaseUrl.replace(/\/$/, '');
  }
}

export function resetCustomProviders(): void {
  customs = [];
  extraLlmModels.clear();
  delete credentialOverrides.deepseekApiKey;
  delete credentialOverrides.deepseekBaseUrl;
  delete credentialOverrides.siliconflowApiKey;
  delete credentialOverrides.siliconflowBaseUrl;
}

function uniqueModels(models: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of models) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function toPublic(record: CustomProviderRecord): CustomProviderPublic {
  return {
    id: record.id,
    name: record.name,
    base_url: record.base_url,
    api_format: record.api_format,
    models: [...record.models],
    has_key: Boolean(record.api_key),
  };
}
