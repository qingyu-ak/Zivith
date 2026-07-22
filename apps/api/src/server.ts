import { resolve } from 'node:path';
import { config } from 'dotenv';
import { prisma } from '@zivith/database';
import { buildApp } from './app.js';
import { createGenerationQueueRuntime } from './contexts/generation/queue-runtime.js';
import { GenerationService } from './contexts/generation/service.js';
import { WorkflowOrchestrator } from './contexts/workflow/orchestrator.js';
import { createProviderBundle } from './providers/registry.js';
import { getRuntimeModelOverride, getRuntimeProviderOverride } from './routes/providers.js';

config({ path: resolve(process.cwd(), '../../.env') });

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';
const generationService = new GenerationService(
  prisma,
  () => createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()).video,
);
const queueRuntime = createGenerationQueueRuntime(generationService);
const app = await buildApp({
  logger: true,
  generationService,
  queueWork: queueRuntime.workBridge,
});

const recovered = await new WorkflowOrchestrator(prisma).recoverInterruptedRuns();
if (recovered > 0) {
  app.log.info({ recovered }, 'requeued interrupted workflow runs');
}
const providers = createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride());
app.log.info(
  {
    queueMode: queueRuntime.mode,
    providers: providers.selection,
    models: {
      llm: providers.llmModel,
      image: providers.imageModel,
      video: providers.videoModel,
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
  process.exit(1);
}

const shutdown = async () => {
  await app.close();
  await queueRuntime.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
