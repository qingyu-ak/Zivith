import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import { MockWorkflowRunner } from '../src/contexts/workflow/mock-runner.js';
import type { WorkflowOrchestrator } from '../src/contexts/workflow/orchestrator.js';

const run = (steps: Array<Record<string, unknown>>) => ({
  id: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  type: 'story_to_video',
  status: 'queued',
  input: { brief: '一台维护机器人在废弃城市中发现最后一颗种子。' },
  state: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  steps,
});

describe('MockWorkflowRunner', () => {
  it('generates and idempotently persists a draft Story before entering review', async () => {
    const queued = run([
      { name: 'story', order: 0, status: 'queued', output: null },
      { name: 'story_review', order: 1, status: 'queued', output: null },
    ]);
    const generated = run([
      {
        name: 'story',
        order: 0,
        status: 'completed',
        output: { story_id: 'generated-story' },
      },
      { name: 'story_review', order: 1, status: 'queued', output: null },
    ]);
    const awaitingReview = run([
      {
        name: 'story',
        order: 0,
        status: 'completed',
        output: { story_id: 'generated-story' },
      },
      { name: 'story_review', order: 1, status: 'running', output: null },
    ]);

    const storyUpsert = vi.fn().mockResolvedValue({ id: 'generated-story' });
    const db = {
      workflowRun: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(queued)
          .mockResolvedValueOnce(generated)
          .mockResolvedValueOnce(awaitingReview),
      },
      story: {
        count: vi.fn().mockResolvedValue(0),
        upsert: storyUpsert,
      },
    } as unknown as PrismaClient;
    const orchestrator = {
      beginNextStep: vi
        .fn()
        .mockResolvedValueOnce({ kind: 'step', step: { name: 'story', order: 0 } })
        .mockResolvedValueOnce({ kind: 'awaiting_review', step: 'story_review' }),
      completeStep: vi.fn().mockResolvedValue({}),
    } as unknown as WorkflowOrchestrator;

    const result = await new MockWorkflowRunner(db, orchestrator).runUntilGate(
      queued.id,
      '33333333-3333-4333-8333-333333333333',
    );

    expect(result.steps[1]?.status).toBe('running');
    expect(storyUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          state: 'draft',
        }),
        update: expect.objectContaining({ state: 'draft' }),
      }),
    );
    expect(orchestrator.completeStep).toHaveBeenCalledWith(
      queued.id,
      'story',
      expect.objectContaining({
        story_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    );
  });

  it('blocks workflow approval while required visual assets remain unapproved', async () => {
    const visualReview = run([
      {
        name: 'visual_prep',
        order: 4,
        status: 'completed',
        output: { requirement_ids: ['requirement-1'] },
      },
      { name: 'visual_assets_review', order: 5, status: 'running', output: null },
    ]);
    const db = {
      workflowRun: { findUnique: vi.fn().mockResolvedValue(visualReview) },
      visualAssetRequirement: { count: vi.fn().mockResolvedValue(1) },
    } as unknown as PrismaClient;
    const orchestrator = {
      review: vi.fn(),
    } as unknown as WorkflowOrchestrator;

    await expect(
      new MockWorkflowRunner(db, orchestrator).submitReview(
        visualReview.id,
        '33333333-3333-4333-8333-333333333333',
        { step: 'visual_assets_review', action: 'approve' },
      ),
    ).rejects.toMatchObject({ code: 'VISUAL_ASSETS_NOT_APPROVED' });
    expect(orchestrator.review).not.toHaveBeenCalled();
  });

  it('blocks prompt_review approve when prompt versions are not approved', async () => {
    const promptReview = run([
      {
        name: 'prompt',
        order: 8,
        status: 'completed',
        output: {
          shot_ids: ['shot-1'],
          prompt_version_ids: ['prompt-1'],
        },
      },
      { name: 'prompt_review', order: 9, status: 'running', output: null },
    ]);
    const db = {
      workflowRun: { findUnique: vi.fn().mockResolvedValue(promptReview) },
      promptVersion: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'prompt-1',
            positive: 'cinematic sunrise',
            negative: 'blur',
            approvedAt: null,
            shot: { prompt: { positive: 'cinematic sunrise', negative: 'blur' } },
          },
        ]),
      },
    } as unknown as PrismaClient;
    const orchestrator = { review: vi.fn() } as unknown as WorkflowOrchestrator;

    await expect(
      new MockWorkflowRunner(db, orchestrator).submitReview(
        promptReview.id,
        '33333333-3333-4333-8333-333333333333',
        { step: 'prompt_review', action: 'approve_all' },
      ),
    ).rejects.toMatchObject({ code: 'PROMPTS_NOT_APPROVED' });
    expect(orchestrator.review).not.toHaveBeenCalled();
  });

  it('accepts prompt_review after matching approved prompt versions', async () => {
    const promptReview = run([
      {
        name: 'prompt',
        order: 8,
        status: 'completed',
        output: {
          shot_ids: ['shot-1'],
          prompt_version_ids: ['prompt-1'],
        },
      },
      { name: 'prompt_review', order: 9, status: 'running', output: null },
    ]);
    const afterReview = {
      ...promptReview,
      status: 'queued',
      steps: promptReview.steps.map((step) =>
        step.name === 'prompt_review' ? { ...step, status: 'completed' } : step,
      ),
    };
    const completed = { ...afterReview, status: 'completed' };
    const db = {
      workflowRun: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(promptReview)
          .mockResolvedValueOnce(afterReview)
          .mockResolvedValueOnce(completed),
      },
      promptVersion: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'prompt-1',
            positive: 'cinematic sunrise',
            negative: 'blur',
            approvedAt: new Date(),
            shot: { prompt: { positive: 'cinematic sunrise', negative: 'blur' } },
          },
        ]),
      },
      story: { update: vi.fn() },
      scene: { updateMany: vi.fn() },
      shot: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
      output: { updateMany: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaClient;
    const orchestrator = {
      review: vi.fn().mockResolvedValue(afterReview),
      beginNextStep: vi.fn().mockResolvedValue({ kind: 'completed' }),
    } as unknown as WorkflowOrchestrator;

    const result = await new MockWorkflowRunner(db, orchestrator).submitReview(
      promptReview.id,
      '33333333-3333-4333-8333-333333333333',
      { step: 'prompt_review', action: 'approve' },
    );

    expect(orchestrator.review).toHaveBeenCalledWith(
      promptReview.id,
      '33333333-3333-4333-8333-333333333333',
      { step: 'prompt_review', action: 'approve' },
    );
    expect(result.status).toBe('completed');
  });

  it('retries with feedback without requiring artifact approval gates', async () => {
    const promptReview = run([
      {
        name: 'prompt',
        order: 8,
        status: 'completed',
        output: { shot_ids: ['shot-1'], prompt_version_ids: ['prompt-1'] },
      },
      { name: 'prompt_review', order: 9, status: 'running', output: null },
    ]);
    const queuedAgain = {
      ...promptReview,
      status: 'queued',
      steps: promptReview.steps.map((step) =>
        step.name === 'prompt' ? { ...step, status: 'queued' } : step,
      ),
    };
    const awaitingAgain = {
      ...promptReview,
      status: 'running',
      steps: promptReview.steps.map((step) =>
        step.name === 'prompt_review' ? { ...step, status: 'running' } : step,
      ),
    };
    const db = {
      workflowRun: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(queuedAgain)
          .mockResolvedValueOnce(awaitingAgain),
      },
    } as unknown as PrismaClient;
    const orchestrator = {
      review: vi.fn().mockResolvedValue(queuedAgain),
      beginNextStep: vi
        .fn()
        .mockResolvedValueOnce({ kind: 'awaiting_review', step: 'prompt_review' }),
    } as unknown as WorkflowOrchestrator;

    const result = await new MockWorkflowRunner(db, orchestrator).submitReview(
      promptReview.id,
      '33333333-3333-4333-8333-333333333333',
      {
        step: 'prompt_review',
        action: 'retry_with_feedback',
        feedback: '加强暖色晨光与角色特写。',
      },
    );

    expect(orchestrator.review).toHaveBeenCalledWith(
      promptReview.id,
      '33333333-3333-4333-8333-333333333333',
      {
        step: 'prompt_review',
        action: 'retry_with_feedback',
        feedback: '加强暖色晨光与角色特写。',
      },
    );
    expect(result.steps.find((step) => step.name === 'prompt_review')?.status).toBe('running');
  });

  it('converges to completed after the final review step', async () => {
    const terminalPending = { ...run([{ name: 'video_review', status: 'completed' }]), status: 'queued' };
    const completed = { ...terminalPending, status: 'completed' };
    const db = {
      workflowRun: {
        findUnique: vi.fn().mockResolvedValueOnce(terminalPending).mockResolvedValueOnce(completed),
      },
    } as unknown as PrismaClient;
    const orchestrator = {
      beginNextStep: vi.fn().mockResolvedValue({ kind: 'completed' }),
    } as unknown as WorkflowOrchestrator;

    const result = await new MockWorkflowRunner(db, orchestrator).runUntilGate(
      terminalPending.id,
      '33333333-3333-4333-8333-333333333333',
    );

    expect(result.status).toBe('completed');
    expect(orchestrator.beginNextStep).toHaveBeenCalledWith(terminalPending.id);
  });
});
