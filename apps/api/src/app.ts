import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { S3Client } from '@aws-sdk/client-s3';
import { prisma, type PrismaClient } from '@zivith/database';
import { S3StorageAdapter } from './adapters/s3.js';
import { GenerationService } from './contexts/generation/service.js';
import { MockWorkflowRunner } from './contexts/workflow/mock-runner.js';
import { WorkflowOrchestrator } from './contexts/workflow/orchestrator.js';
import { registerErrorHandler } from './errors.js';
import type { StoragePort } from './ports/index.js';
import { createProviderBundle } from './providers/registry.js';
import { registerAudioRoutes } from './routes/audio.js';
import { authenticate, registerAuthRoutes } from './routes/auth.js';
import { registerGenerationRoutes } from './routes/generation.js';
import {
  getRuntimeModelOverride,
  getRuntimeProviderOverride,
  registerProviderRoutes,
} from './routes/providers.js';
import { registerResourceRoutes } from './routes/resources.js';
import { registerShotPromptRoutes } from './routes/shot-prompts.js';
import { registerStubRoutes } from './routes/stubs.js';
import { registerVisualRequirementRoutes } from './routes/visual-requirements.js';
import { registerWorkflowEventRoutes } from './routes/workflow-events.js';
import { registerWorkflowRoutes } from './routes/workflows.js';

export interface BuildAppOptions {
  db?: PrismaClient;
  storage?: StoragePort;
  jwtSecret?: string;
  logger?: boolean;
  generationService?: GenerationService;
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

function resolveVideoAdapter() {
  return createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()).video;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 2 * 1024 * 1024 });
  const db = options.db ?? prisma;
  const generationService =
    options.generationService ?? new GenerationService(db, resolveVideoAdapter);
  const jwtSecret = options.jwtSecret ?? process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters');

  await app.register(jwt, { secret: jwtSecret });
  await app.register(cors, {
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim()),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 10 },
  });
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
      createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()),
    );

  app.get('/health', () => ({ status: 'ok' }));
  app.register(
    (api, _options, done) => {
      registerAuthRoutes(api, db);
      api.register((protectedApi, _protectedOptions, protectedDone) => {
        protectedApi.addHook('preHandler', authenticate);
        registerGenerationRoutes(protectedApi, db, generationService);
        registerResourceRoutes(protectedApi, db, storage);
        registerShotPromptRoutes(protectedApi, db);
        registerVisualRequirementRoutes(protectedApi, db);
        registerWorkflowRoutes(protectedApi, db, orchestrator, createRunner);
        registerWorkflowEventRoutes(protectedApi, db);
        registerProviderRoutes(protectedApi);
        registerAudioRoutes(protectedApi, db, storage);
        protectedDone();
      });
      registerStubRoutes(api);
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
