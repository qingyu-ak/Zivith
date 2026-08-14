import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@zivith/database';
import { type PrismaClient } from '@zivith/database';
import { z } from 'zod';
import { ensureProjectMember } from '../contexts/world/local-user.js';

const projectParams = z.object({ id: z.string().uuid() });

async function requireProjectMember(db: PrismaClient, projectId: string, userId: string) {
  return ensureProjectMember(db, userId, projectId);
}

function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'number' ? value : Number(value);
}

export function registerUsageRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.get('/projects/:id/usage', async (request) => {
    const { id } = projectParams.parse(request.params);
    await requireProjectMember(db, id, request.user.sub);

    const rows = await db.usageRecord.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const byTaskType = new Map<
      string,
      { task_type: string; calls: number; quantity: number; unit: string; estimated_cost: number }
    >();
    const byProvider = new Map<
      string,
      { provider: string; calls: number; quantity: number; estimated_cost: number }
    >();

    let totalCalls = 0;
    let totalEstimatedCost = 0;

    for (const row of rows) {
      totalCalls += 1;
      const quantity = num(row.quantity);
      const cost = num(row.estimatedCost);
      totalEstimatedCost += cost;

      const task = byTaskType.get(row.taskType) ?? {
        task_type: row.taskType,
        calls: 0,
        quantity: 0,
        unit: row.unit,
        estimated_cost: 0,
      };
      task.calls += 1;
      task.quantity += quantity;
      task.estimated_cost += cost;
      byTaskType.set(row.taskType, task);

      const provider = byProvider.get(row.provider) ?? {
        provider: row.provider,
        calls: 0,
        quantity: 0,
        estimated_cost: 0,
      };
      provider.calls += 1;
      provider.quantity += quantity;
      provider.estimated_cost += cost;
      byProvider.set(row.provider, provider);
    }

    return {
      project_id: id,
      total_calls: totalCalls,
      total_estimated_cost: totalEstimatedCost || null,
      by_task_type: [...byTaskType.values()].sort((a, b) => b.calls - a.calls),
      by_provider: [...byProvider.values()].sort((a, b) => b.calls - a.calls),
      recent: rows.slice(0, 20).map((row) => ({
        id: row.id,
        task_type: row.taskType,
        provider: row.provider,
        model: row.model,
        quantity: num(row.quantity),
        unit: row.unit,
        estimated_cost: row.estimatedCost == null ? null : num(row.estimatedCost),
        created_at: row.createdAt,
        metadata: row.metadata,
      })),
    };
  });
}
