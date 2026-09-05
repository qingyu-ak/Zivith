import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listProviderCatalog,
  loadProviderCredentials,
  loadProviderModels,
  loadProviderSelection,
  type ProviderModels,
  type ProviderSelection,
} from '../providers/config.js';
import {
  addExtraModel,
  createCustomProvider,
  deleteCustomProvider,
  extraModelsFor,
  getCustomProvider,
  isCustomProviderId,
  listCustomProviders,
  removeExtraModel,
  resetCustomProviders,
  setCredentialOverride,
  updateCustomProvider,
} from '../providers/custom-providers.js';
import { fetchOpenAiModelIds, listLlmModelsForProvider } from '../providers/llm-models.js';
import { authenticate } from './auth.js';
import { ApiError } from '../errors.js';

const builtinProviderId = z.enum(['mock', 'deepseek', 'siliconflow']);
const llmProviderId = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine(
    (value) =>
      value === 'mock' ||
      value === 'deepseek' ||
      value === 'siliconflow' ||
      isCustomProviderId(value),
    '未知提供商',
  );
const selectionBody = z
  .object({
    llm: llmProviderId.optional(),
    image: builtinProviderId.optional(),
    video: builtinProviderId.optional(),
    audio: builtinProviderId.optional(),
    models: z
      .object({
        llm: z.string().trim().min(1).max(200).optional(),
        image: z.string().trim().min(1).max(200).optional(),
        image_i2i: z.string().trim().min(1).max(200).optional(),
        video: z.string().trim().min(1).max(200).optional(),
        video_i2v: z.string().trim().min(1).max(200).optional(),
        audio: z.string().trim().min(1).max(200).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const customBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    base_url: z.string().trim().url().max(500),
    api_key: z.string().min(1).max(500),
    api_format: z.enum(['openai_chat', 'anthropic_messages']),
    models: z.array(z.string().trim().min(1).max(200)).min(1).max(40),
  })
  .strict();

const customPatchBody = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    base_url: z.string().trim().url().max(500).optional(),
    api_key: z.string().min(1).max(500).optional(),
    api_format: z.enum(['openai_chat', 'anthropic_messages']).optional(),
    models: z.array(z.string().trim().min(1).max(200)).min(1).max(40).optional(),
  })
  .strict();

/** Process-local overrides so UI can switch vendors/models without restarting (dev). */
let runtimeSelection: Partial<ProviderSelection> = {};
let runtimeModels: Partial<ProviderModels> = {};

export function getRuntimeProviderOverride(): Partial<ProviderSelection> {
  return { ...runtimeSelection };
}

export function getRuntimeModelOverride(): Partial<ProviderModels> {
  return { ...runtimeModels };
}

export function resetRuntimeProviderState(): void {
  runtimeSelection = {};
  runtimeModels = {};
  resetCustomProviders();
}

function catalogWithLive(
  liveByProvider: Record<string, string[]>,
  selection: ReturnType<typeof loadProviderSelection>,
  models: ProviderModels,
) {
  const catalog = listProviderCatalog();
  const builtins = catalog.providers.map((provider) => ({
    ...provider,
    llm_models: listLlmModelsForProvider(
      provider.id,
      liveByProvider[provider.id] ?? [],
      selection.llm === provider.id ? models.llm : undefined,
      extraModelsFor(provider.id),
    ),
  }));
  const customs = listCustomProviders().map((provider) => ({
    id: provider.id,
    label: provider.name,
    kind: 'custom' as const,
    api_format: provider.api_format,
    modalities: ['llm'] as Array<'llm' | 'image' | 'video' | 'audio'>,
    configured: provider.has_key,
    base_url: provider.base_url,
    llm_models: listLlmModelsForProvider(
      provider.id,
      [],
      selection.llm === provider.id ? models.llm : undefined,
      [...provider.models, ...extraModelsFor(provider.id)],
    ),
  }));
  return [...builtins, ...customs];
}

export function registerProviderRoutes(app: FastifyInstance): void {
  app.addHook('preHandler', authenticate);

  app.get('/providers', async () => {
    const catalog = listProviderCatalog();
    const selection = loadProviderSelection(runtimeSelection);
    const models = { ...loadProviderModels(), ...runtimeModels };
    const credentials = loadProviderCredentials();
    const [deepseekLive, siliconflowLive] = await Promise.all([
      credentials.deepseekApiKey
        ? fetchOpenAiModelIds(credentials.deepseekBaseUrl, credentials.deepseekApiKey)
        : Promise.resolve([] as string[]),
      credentials.siliconflowApiKey
        ? fetchOpenAiModelIds(credentials.siliconflowBaseUrl, credentials.siliconflowApiKey)
        : Promise.resolve([] as string[]),
    ]);
    const liveByProvider: Record<string, string[]> = {
      mock: [],
      deepseek: deepseekLive,
      siliconflow: siliconflowLive,
    };
    let siliconflowAccount:
      | { total_balance?: string; charge_balance?: string; balance?: string; status?: string }
      | undefined;
    if (selection.video === 'siliconflow' || selection.image === 'siliconflow') {
      const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
      const baseUrl = (process.env.SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1').replace(
        /\/$/,
        '',
      );
      if (apiKey) {
        try {
          const response = await fetch(`${baseUrl}/user/info`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (response.ok) {
            const payload = (await response.json()) as {
              data?: {
                totalBalance?: string;
                chargeBalance?: string;
                balance?: string;
                status?: string;
              };
            };
            siliconflowAccount = {
              ...(payload.data?.totalBalance !== undefined
                ? { total_balance: payload.data.totalBalance }
                : {}),
              ...(payload.data?.chargeBalance !== undefined
                ? { charge_balance: payload.data.chargeBalance }
                : {}),
              ...(payload.data?.balance !== undefined ? { balance: payload.data.balance } : {}),
              ...(payload.data?.status !== undefined ? { status: payload.data.status } : {}),
            };
          }
        } catch {
          /* optional probe — ignore network errors */
        }
      }
    }
    return {
      ...catalog,
      selection,
      models,
      providers: catalogWithLive(liveByProvider, selection, models),
      runtime_override: {
        selection: runtimeSelection,
        models: runtimeModels,
      },
      ...(siliconflowAccount ? { siliconflow_account: siliconflowAccount } : {}),
    };
  });

  app.put('/providers/selection', (request) => {
    const body = selectionBody.parse(request.body ?? {});
    runtimeSelection = {
      ...runtimeSelection,
      ...(body.llm ? { llm: body.llm } : {}),
      ...(body.image ? { image: body.image } : {}),
      ...(body.video ? { video: body.video } : {}),
      ...(body.audio ? { audio: body.audio } : {}),
    };
    if (body.models) {
      runtimeModels = {
        ...runtimeModels,
        ...(body.models.llm ? { llm: body.models.llm } : {}),
        ...(body.models.image ? { image: body.models.image } : {}),
        ...(body.models.image_i2i ? { image_i2i: body.models.image_i2i } : {}),
        ...(body.models.video ? { video: body.models.video } : {}),
        ...(body.models.video_i2v ? { video_i2v: body.models.video_i2v } : {}),
        ...(body.models.audio ? { audio: body.models.audio } : {}),
      };
    }
    return {
      selection: loadProviderSelection(runtimeSelection),
      models: { ...loadProviderModels(), ...runtimeModels },
      runtime_override: {
        selection: runtimeSelection,
        models: runtimeModels,
      },
      note: '进程内覆盖；重启 API 后恢复为环境变量默认。',
    };
  });

  app.post('/providers/custom', async (request, reply) => {
    const body = customBody.parse(request.body ?? {});
    const created = createCustomProvider(body);
    return reply.status(201).send(created);
  });

  app.put('/providers/custom/:id', async (request) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = customPatchBody.parse(request.body ?? {});
    const updated = updateCustomProvider(id, body);
    if (!updated) throw new ApiError(404, 'PROVIDER_NOT_FOUND', '自定义供应商不存在');
    return updated;
  });

  app.delete('/providers/custom/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    if (!deleteCustomProvider(id)) throw new ApiError(404, 'PROVIDER_NOT_FOUND', '自定义供应商不存在');
    if (runtimeSelection.llm === id) runtimeSelection.llm = 'mock';
    return reply.status(204).send();
  });

  app.post('/providers/:id/models', async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ model: z.string().trim().min(1).max(200) }).strict().parse(request.body ?? {});
    if (isCustomProviderId(id)) {
      const current = getCustomProvider(id);
      if (!current) throw new ApiError(404, 'PROVIDER_NOT_FOUND', '自定义供应商不存在');
      const updated = updateCustomProvider(id, { models: [...current.models, body.model] });
      return reply.status(201).send({ models: updated?.models ?? [] });
    }
    if (id !== 'deepseek' && id !== 'siliconflow' && id !== 'mock') {
      throw new ApiError(404, 'PROVIDER_NOT_FOUND', '供应商不存在');
    }
    return reply.status(201).send({ models: addExtraModel(id, body.model) });
  });

  app.delete('/providers/:id/models', async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const query = z.object({ model: z.string().trim().min(1).max(200) }).parse(request.query ?? {});
    const decoded = query.model;
    if (isCustomProviderId(id)) {
      const current = getCustomProvider(id);
      if (!current) throw new ApiError(404, 'PROVIDER_NOT_FOUND', '自定义供应商不存在');
      updateCustomProvider(id, { models: current.models.filter((item) => item !== decoded) });
      return reply.status(204).send();
    }
    removeExtraModel(id, decoded);
    return reply.status(204).send();
  });

  app.put('/providers/credentials', async (request) => {
    const body = z
      .object({
        provider: z.enum(['deepseek', 'siliconflow']),
        api_key: z.string().min(1).max(500).optional(),
        base_url: z.string().trim().url().max(500).optional(),
      })
      .strict()
      .parse(request.body ?? {});
    if (body.provider === 'deepseek') {
      setCredentialOverride({
        ...(body.api_key ? { deepseekApiKey: body.api_key } : {}),
        ...(body.base_url ? { deepseekBaseUrl: body.base_url } : {}),
      });
    } else {
      setCredentialOverride({
        ...(body.api_key ? { siliconflowApiKey: body.api_key } : {}),
        ...(body.base_url ? { siliconflowBaseUrl: body.base_url } : {}),
      });
    }
    const credentials = loadProviderCredentials();
    return {
      provider: body.provider,
      configured:
        body.provider === 'deepseek'
          ? Boolean(credentials.deepseekApiKey)
          : Boolean(credentials.siliconflowApiKey),
      base_url:
        body.provider === 'deepseek'
          ? credentials.deepseekBaseUrl
          : credentials.siliconflowBaseUrl,
    };
  });
}
