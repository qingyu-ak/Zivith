import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import { WorkflowOrchestrator } from '../src/contexts/workflow/orchestrator.js';
import { reviewSchema, startWorkflowSchema } from '../src/routes/workflows.js';

describe('workflow API contracts', () => {
  it('accepts a creative brief and per-stage automation', () => {
    const input = startWorkflowSchema.parse({
      project_id: '11111111-1111-4111-8111-111111111111',
      brief: '一台维护机器人在废弃城市中发现最后一颗种子。',
      automation: {
        story: 'assisted',
        prompt: 'full_auto',
      },
    });

    expect(input.automation?.story).toBe('assisted');
    expect(input.automation?.prompt).toBe('full_auto');
  });

  it('requires feedback for retry_with_feedback', () => {
    expect(() =>
      reviewSchema.parse({
        step: 'prompt_review',
        action: 'retry_with_feedback',
      }),
    ).toThrow();
    expect(
      reviewSchema.parse({
        step: 'prompt_review',
        action: 'retry_with_feedback',
        feedback: '强化暖色晨光。',
      }).feedback,
    ).toBe('强化暖色晨光。');
  });

  it('accepts approve_all for the mandatory prompt gate', () => {
    expect(
      reviewSchema.parse({
        step: 'prompt_review',
        action: 'approve_all',
      }).action,
    ).toBe('approve_all');
  });
});

describe('workflow recovery', () => {
  it('requeues interrupted runs and preserves completed steps', async () => {
    const workflowStepUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const workflowRunUpdate = vi.fn().mockResolvedValue({ id: 'run-1' });
    const transaction = vi.fn().mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    const db = {
      workflowRun: {
        findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
        update: workflowRunUpdate,
      },
      workflowStep: { updateMany: workflowStepUpdateMany },
      $transaction: transaction,
    } as unknown as PrismaClient;

    const recovered = await new WorkflowOrchestrator(db).recoverInterruptedRuns();

    expect(recovered).toBe(1);
    expect(workflowStepUpdateMany).toHaveBeenCalledWith({
      where: { workflowRunId: 'run-1', status: 'running' },
      data: { status: 'queued', startedAt: null },
    });
    expect(workflowRunUpdate).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { status: 'queued' },
    });
  });
});
