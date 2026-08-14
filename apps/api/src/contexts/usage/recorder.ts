import { Prisma, type PrismaClient } from '@zivith/database';
import { getUsageContext } from './context.js';

export interface UsageRecordInput {
  projectId?: string;
  taskType: string;
  provider: string;
  model: string;
  quantity: number;
  unit: string;
  estimatedCost?: number | null;
  metadata?: Record<string, unknown>;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Fire-and-forget safe write — never throws to callers. */
export async function recordUsage(
  db: PrismaClient,
  input: UsageRecordInput,
): Promise<void> {
  const projectId = input.projectId ?? getUsageContext()?.projectId;
  if (!projectId) return;
  try {
    await db.usageRecord.create({
      data: {
        projectId,
        taskType: input.taskType,
        provider: input.provider,
        model: input.model,
        quantity: new Prisma.Decimal(input.quantity),
        unit: input.unit,
        ...(input.estimatedCost != null
          ? { estimatedCost: new Prisma.Decimal(input.estimatedCost) }
          : {}),
        ...(input.metadata ? { metadata: json(input.metadata) } : {}),
      },
    });
  } catch (error) {
    console.warn(
      '[usage] failed to record usage',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function inferLlmTaskType(requestId: string, fallback = 'llm'): string {
  const id = requestId.toLowerCase();
  if (id.includes(':story') || id.endsWith('story')) return 'llm_story';
  if (id.includes(':scene') || id.endsWith('scene')) return 'llm_scene';
  if (id.includes('trait')) return 'llm_visual_trait';
  return fallback;
}
