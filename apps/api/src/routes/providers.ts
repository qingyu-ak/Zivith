import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listProviderCatalog,
  loadProviderModels,
  loadProviderSelection,
  type ProviderModels,
  type ProviderSelection,
} from '../providers/config.js';
import { authenticate } from './auth.js';

const providerId = z.enum(['mock', 'deepseek', 'siliconflow']);
const selectionBody = z
  .object({
    llm: providerId.optional(),
    image: providerId.optional(),
    video: providerId.optional(),
    audio: providerId.optional(),
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
}

export function registerProviderRoutes(app: FastifyInstance): void {
  app.addHook('preHandler', authenticate);

  app.get('/providers', () => {
    const catalog = listProviderCatalog();
    return {
      ...catalog,
      selection: loadProviderSelection(runtimeSelection),
      models: { ...loadProviderModels(), ...runtimeModels },
      runtime_override: {
        selection: runtimeSelection,
        models: runtimeModels,
      },
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
      note: '进程内覆盖；重启 API 后恢复为环境变量默认。项目级 BYOK 将在后续迭代落地。',
    };
  });
}
