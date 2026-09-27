import { resolve } from 'node:path';
import { config } from 'dotenv';
import { prisma } from '@zivith/database';
import { buildApp } from './app.js';
import { createGenerationQueueRuntime } from './contexts/generation/queue-runtime.js';
import { GenerationService } from './contexts/generation/service.js';
import { WorkflowOrchestrator } from './contexts/workflow/orchestrator.js';
import { createProviderBundle } from './providers/registry.js';
import { getRuntimeModelOverride, getRuntimeProviderOverride } from './routes/providers.js';
import { instrumentProviderBundle } from './contexts/usage/instrument.js';
import { LocalVectorStore } from './adapters/memory/local-vector-store.js';
import { MockEmbeddingAdapter } from './adapters/memory/mock-embedding.js';
import { MemoryService } from './contexts/memory/service.js';
import { PrismaMemoryStore } from './contexts/memory/prisma-store.js';
import { createMemoryQueueRuntime } from './contexts/memory/queue-runtime.js';
import { NovelImportService } from './contexts/novel-import/service.js';
import { VoiceService } from './contexts/voice/service.js';

config({ path: resolve(process.cwd(), '../../.env') });

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';
const generationService = new GenerationService(
  prisma,
  () => createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()).video,
);
const queueRuntime = createGenerationQueueRuntime(generationService);
const memoryVectorStore = new LocalVectorStore(
  process.env.MEMORY_VECTOR_DIR ?? 'data/memory-vectors',
);
const memoryProviders = instrumentProviderBundle(
  prisma,
  createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()),
);
const memoryService = new MemoryService({
  store: new PrismaMemoryStore(prisma),
  vectorStore: memoryVectorStore,
  embedding: new MockEmbeddingAdapter(),
  llm: memoryProviders.llm,
  llmModel: memoryProviders.llmModel,
});
const memoryRuntime = createMemoryQueueRuntime(memoryService);
// ADR-0017: 语音引擎加载失败不阻塞启动——服务以 available=false 降级,路由返回明确错误。
const voiceService = await VoiceService.create(prisma);
const app = await buildApp({
  logger: true,
  generationService,
  queueWork: queueRuntime.workBridge,
  memory: memoryService,
  novelImport: new NovelImportService(prisma),
  voice: voiceService,
});

const recovered = await new WorkflowOrchestrator(prisma).recoverInterruptedRuns();
if (recovered > 0) {
  app.log.info({ recovered }, 'requeued interrupted workflow runs');
}
const providers = createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride());
app.log.info(
  {
    queueMode: queueRuntime.mode,
    memoryQueueMode: memoryRuntime.mode,
    voice: voiceService.status,
    providers: providers.selection,
    models: {
      llm: providers.llmModel,
      image: providers.imageModel,
      image_i2i: providers.imageI2iModel,
      video: providers.videoModel,
      video_i2v: providers.videoI2vModel,
      audio: providers.audioModel,
    },
  },
  'generation queue and providers ready',
);

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  await queueRuntime.close();
  await memoryRuntime.close();
  memoryVectorStore.close();
  process.exit(1);
}

const shutdown = async () => {
  await app.close();
  voiceService.closeAll();
  await queueRuntime.close();
  await memoryRuntime.close();
  memoryVectorStore.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
