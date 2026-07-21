import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { z } from 'zod';
import { ApiError } from '../errors.js';

const runParams = z.object({ runId: z.string().uuid() });

function snapshot(run: {
  id: string;
  status: string;
  state: unknown;
  updatedAt: Date;
  steps: Array<{
    id: string;
    name: string;
    status: string;
    order: number;
    startedAt: Date | null;
    completedAt: Date | null;
  }>;
}) {
  return {
    type: 'workflow_snapshot',
    run_id: run.id,
    status: run.status,
    state: run.state,
    updated_at: run.updatedAt.toISOString(),
    steps: run.steps.map((step) => ({
      id: step.id,
      name: step.name,
      status: step.status,
      order: step.order,
      started_at: step.startedAt?.toISOString() ?? null,
      completed_at: step.completedAt?.toISOString() ?? null,
    })),
  };
}

export function registerWorkflowEventRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.get('/workflows/:runId/events', async (request, reply) => {
    const { runId } = runParams.parse(request.params);
    const run = await db.workflowRun.findUnique({
      where: { id: runId },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    if (!run) throw new ApiError(404, 'WORKFLOW_NOT_FOUND', '工作流不存在');
    const member = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: run.projectId, userId: request.user.sub } },
    });
    if (!member) throw new ApiError(403, 'FORBIDDEN', '你无权访问该项目');

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let closed = false;
    let lastFingerprint = '';
    const writeEvent = (event: string, data: unknown) => {
      if (closed) return;
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const tick = async () => {
      const current = await db.workflowRun.findUnique({
        where: { id: runId },
        include: { steps: { orderBy: { order: 'asc' } } },
      });
      if (!current || closed) return;
      const payload = snapshot(current);
      const fingerprint = JSON.stringify(payload);
      if (fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        writeEvent('workflow', payload);
      }
      if (['completed', 'failed', 'cancelled'].includes(current.status)) {
        writeEvent('done', { run_id: runId, status: current.status });
        cleanup();
      }
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      request.raw.off('close', cleanup);
      try {
        reply.raw.end();
      } catch {
        // stream already closed
      }
    };

    writeEvent('connected', { run_id: runId });
    await tick();
    const timer = setInterval(() => {
      void tick().catch(() => cleanup());
    }, 1000);
    request.raw.on('close', cleanup);
  });
}
