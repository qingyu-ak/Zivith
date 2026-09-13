import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { S3Client } from '@aws-sdk/client-s3';
import { prisma, type PrismaClient } from '@zivith/database';
import { S3StorageAdapter } from './adapters/s3.js';
import { GenerationService } from './contexts/generation/service.js';
import type { QueueWorkBridge } from './contexts/generation/queue-work-bridge.js';
import { MockWorkflowRunner } from './contexts/workflow/mock-runner.js';
import { WorkflowOrchestrator } from './contexts/workflow/orchestrator.js';
import { registerErrorHandler } from './errors.js';
import type { StoragePort } from './ports/index.js';
import { createProviderBundle } from './providers/registry.js';
import { instrumentProviderBundle } from './contexts/usage/instrument.js';
import { assertAllPromptTemplatesValid } from './contexts/agent/prompt-loader.js';
import { registerAppearanceVariantRoutes } from './routes/appearance-variants.js';
import { registerAudioRoutes } from './routes/audio.js';
import { createAuthenticate, registerAuthRoutes } from './routes/auth.js';
import { registerGenerationRoutes } from './routes/generation.js';
import {
  getRuntimeModelOverride,
  getRuntimeProviderOverride,
  registerProviderRoutes,
} from './routes/providers.js';
import { registerResourceRoutes } from './routes/resources.js';
import { registerShotPromptRoutes } from './routes/shot-prompts.js';
import { registerStorySegmentRoutes } from './routes/story-segments.js';
import { registerStubRoutes } from './routes/stubs.js';
import { registerUsageRoutes } from './routes/usage.js';
import { registerVisualRequirementRoutes } from './routes/visual-requirements.js';
import { registerRecomputeRoutes } from './routes/recompute.js';
import { registerWorkflowEventRoutes } from './routes/workflow-events.js';
import { registerWorkflowRoutes } from './routes/workflows.js';
import { registerWorldRoutes } from './routes/world.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerNovelImportRoutes } from './routes/novel-imports.js';
import { registerRoleplayRoutes } from './routes/roleplay.js';
import { registerVoiceRoutes } from './routes/voice.js';
import type { VoiceService } from './contexts/voice/service.js';
import type { MemoryService } from './contexts/memory/service.js';
import type { NovelImportService } from './contexts/novel-import/service.js';

export interface BuildAppOptions {
  db?: PrismaClient;
  storage?: StoragePort;
  jwtSecret?: string;
  logger?: boolean;
  generationService?: GenerationService;
  queueWork?: QueueWorkBridge;
  memory?: MemoryService;
  novelImport?: NovelImportService;
  voice?: VoiceService;
}

function toSnakeCase(value: unknown): unknown {
  if (value instanceof Date) return value;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(toSnakeCase);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        toSnakeCase(item),
      ]),
    );
  }
  return value;
}

function storageFromEnvironment(): StoragePort | undefined {
  const bucket = process.env.S3_BUCKET ?? process.env.MINIO_BUCKET;
  if (!bucket) return undefined;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_KEY;
  const client = new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    ...(accessKeyId && secretAccessKey
      ? {
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        }
      : {}),
  });
  return new S3StorageAdapter(client, bucket, process.env.S3_PUBLIC_BASE_URL);
}

function resolveVideoAdapter(db: PrismaClient) {
  return instrumentProviderBundle(
    db,
    createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()),
  ).video;
}

export async function buildApp(options: BuildAppOptions = {}) {
  assertAllPromptTemplatesValid();
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 2 * 1024 * 1024 });
  const db = options.db ?? prisma;
  const generationService =
    options.generationService ?? new GenerationService(db, () => resolveVideoAdapter(db));
  const jwtSecret = options.jwtSecret ?? process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters');

  await app.register(jwt, { secret: jwtSecret });
  await app.register(cors, {
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim()),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'Cache-Control'],
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 10 },
  });
  if (options.voice) {
    await app.register(websocket);
  }
  app.addHook('preSerialization', (_request, _reply, payload, done) => {
    done(null, toSnakeCase(payload));
  });
  registerErrorHandler(app);

  const storage = options.storage ?? storageFromEnvironment();
  const orchestrator = new WorkflowOrchestrator(db);
  const createRunner = () =>
    new MockWorkflowRunner(
      db,
      orchestrator,
      generationService,
      instrumentProviderBundle(
        db,
        createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()),
      ),
      options.queueWork,
    );

  app.get('/health', () => ({ status: 'ok' }));
  app.register(
    (api, _options, done) => {
      registerAuthRoutes(api, db);
      api.register((protectedApi, _protectedOptions, protectedDone) => {
        protectedApi.addHook('preHandler', createAuthenticate(db));
        registerGenerationRoutes(protectedApi, db, generationService, storage);
        registerResourceRoutes(protectedApi, db, storage);
        registerStorySegmentRoutes(protectedApi, db);
        registerAppearanceVariantRoutes(protectedApi, db, storage);
        registerShotPromptRoutes(protectedApi, db);
        registerVisualRequirementRoutes(protectedApi, db, storage);
        registerRecomputeRoutes(protectedApi, db, createRunner);
        registerUsageRoutes(protectedApi, db);
        registerWorkflowRoutes(protectedApi, db, orchestrator, createRunner);
        registerWorkflowEventRoutes(protectedApi, db);
        registerProviderRoutes(protectedApi);
        registerAudioRoutes(protectedApi, db, storage);
        protectedDone();
      });
      registerStubRoutes(api);
      // Creator layer (ADR-0013): local single user, no auth on world routes.
      // LLM 每轮按当前 PUT /providers/selection 重建，不闭包启动时的提供商。
      if (options.voice) {
        // ADR-0017: 语音输入与 world 路由同为本地无门禁面,路由内自行校验回环来源。
        registerVoiceRoutes(api, options.voice);
      }
      api.register(
        (worldApi, _worldOptions, worldDone) => {
          registerWorldRoutes(worldApi, db, undefined, undefined, options.memory);
          worldDone();
        },
        { prefix: '/world' },
      );
      if (options.memory) {
        api.register(
          (memoryApi, _memoryOptions, memoryDone) => {
            registerMemoryRoutes(memoryApi, options.memory!);
            memoryDone();
          },
          { prefix: '/memory' },
        );
      }
      api.register((roleplayApi, _roleplayOptions, roleplayDone) => {
        registerRoleplayRoutes(roleplayApi, db, undefined, undefined, options.memory);
        roleplayDone();
      });
      if (options.novelImport) {
        api.register((novelApi, _novelOptions, novelDone) => {
          registerNovelImportRoutes(novelApi, options.novelImport!);
          novelDone();
        });
      }
      done();
    },
    { prefix: '/api/v1' },
  );

  app.decorate('generationService', generationService);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    generationService: GenerationService;
  }
}
