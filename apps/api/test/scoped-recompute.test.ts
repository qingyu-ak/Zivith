import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import { GenerationService } from '../src/contexts/generation/service.js';
import { MockWorkflowRunner } from '../src/contexts/workflow/mock-runner.js';
import { WorkflowOrchestrator } from '../src/contexts/workflow/orchestrator.js';
import {
  markSceneVisualsStale,
  sceneVisualInputSnapshot,
  stableInputHash,
} from '../src/contexts/workflow/scoped-recompute.js';
import type { ApiError } from '../src/errors.js';

describe('scoped recompute helpers', () => {
  it('produces stable input hashes for the same scene snapshot', () => {
    const snapshot = sceneVisualInputSnapshot({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: '雨夜码头',
      description: '货船靠岸',
      time: 'night',
      weather: 'rain',
      locationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      characterIds: ['c2', 'c1'],
      mood: 'tense',
      overrides: { time_of_day: 'night' },
    });
    expect(stableInputHash(snapshot)).toBe(stableInputHash(snapshot));
    expect(stableInputHash(snapshot)).toHaveLength(64);
  });

  it('marks only non-approved visual requirements as pending', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const db = { visualAssetRequirement: { updateMany } } as unknown as PrismaClient;
    const count = await markSceneVisualsStale(db, 'scene-1');
    expect(count).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        sceneId: 'scene-1',
        deletedAt: null,
        status: { not: 'approved' },
      },
      data: {
        status: 'pending',
        approvedMediaId: null,
      },
    });
  });
});

describe('WorkflowOrchestrator scoped recompute', () => {
  it('rejects concurrent recomputes on the same entity', async () => {
    const runId = '11111111-1111-4111-8111-111111111111';
    const stepId = '22222222-2222-4222-8222-222222222222';
    const projectId = '33333333-3333-4333-8333-333333333333';
    const storyId = '44444444-4444-4444-8444-444444444444';
    const sceneId = '55555555-5555-4555-8555-555555555555';

    const run = {
      id: runId,
      projectId,
      type: 'story_to_video',
      status: 'running',
      state: {
        version: 1,
        current_step_index: 5,
        awaiting_review: 'visual_assets_review',
        automation: {},
        revision: 1,
        scoped_locks: {
          [`visual_prep:scene:${sceneId}`]: 'existing-attempt',
        },
      },
      steps: [
        {
          id: 'story-step',
          name: 'story',
          order: 0,
          status: 'completed',
          output: { story_id: storyId },
        },
        {
          id: stepId,
          name: 'visual_prep',
          order: 4,
          status: 'completed',
          output: { requirement_ids: [] },
        },
      ],
    };

    const db = {
      workflowRun: {
        findMany: vi.fn().mockResolvedValue([run]),
        findUniqueOrThrow: vi.fn().mockResolvedValue(run),
        findUnique: vi.fn().mockResolvedValue(run),
        update: vi.fn(),
      },
      workflowStepAttempt: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    } as unknown as PrismaClient;

    const orchestrator = new WorkflowOrchestrator(db);
    await expect(
      orchestrator.beginScopedRecompute({
        projectId,
        stepName: 'visual_prep',
        entityType: 'scene',
        entityId: sceneId,
        inputHash: 'abc',
        actorId: 'user-1',
        storyId,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'RECOMPUTE_IN_PROGRESS',
    } satisfies Partial<ApiError>);
  });

  it('creates an attempt row with input_hash', async () => {
    const runId = '11111111-1111-4111-8111-111111111111';
    const stepId = '22222222-2222-4222-8222-222222222222';
    const projectId = '33333333-3333-4333-8333-333333333333';
    const storyId = '44444444-4444-4444-8444-444444444444';
    const sceneId = '55555555-5555-4555-8555-555555555555';

    const run = {
      id: runId,
      projectId,
      type: 'story_to_video',
      status: 'running',
      state: {
        version: 1,
        current_step_index: 5,
        awaiting_review: 'visual_assets_review',
        automation: {},
        revision: 1,
      },
      steps: [
        {
          id: 'story-step',
          name: 'story',
          order: 0,
          status: 'completed',
          output: { story_id: storyId },
        },
        {
          id: stepId,
          name: 'visual_prep',
          order: 4,
          status: 'completed',
          output: { requirement_ids: [] },
        },
      ],
    };

    const createAttempt = vi.fn().mockResolvedValue({
      id: 'attempt-1',
      attempt: 1,
      workflowStepId: stepId,
      inputHash: 'hash-1',
      status: 'running',
    });
    const updateRun = vi.fn().mockResolvedValue(run);

    const db = {
      workflowRun: {
        findMany: vi.fn().mockResolvedValue([run]),
        findUniqueOrThrow: vi.fn().mockResolvedValue(run),
        findUnique: vi.fn().mockResolvedValue(run),
        update: updateRun,
      },
      workflowStepAttempt: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: createAttempt,
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    } as unknown as PrismaClient;

    const orchestrator = new WorkflowOrchestrator(db);
    const result = await orchestrator.beginScopedRecompute({
      projectId,
      stepName: 'visual_prep',
      entityType: 'scene',
      entityId: sceneId,
      inputHash: 'hash-1',
      actorId: 'user-1',
      storyId,
    });

    expect(result.attempt.attempt).toBe(1);
    expect(createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowStepId: stepId,
          attempt: 1,
          status: 'running',
          inputHash: 'hash-1',
        }),
      }),
    );
  });
});

describe('MockWorkflowRunner recompute guards', () => {
  it('refuses prompt recompute on approved shots', async () => {
    const db = {
      shot: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'shot-1',
          state: 'approved',
          scene: { story: { id: 'story-1', projectId: 'project-1' } },
        }),
      },
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }),
      },
      projectMember: {
        upsert: vi.fn().mockResolvedValue({ role: 'editor' }),
      },
    } as unknown as PrismaClient;
    const orchestrator = {
      beginScopedRecompute: vi.fn(),
    } as unknown as WorkflowOrchestrator;
    const runner = new MockWorkflowRunner(db, orchestrator, new GenerationService(db));
    await expect(runner.recomputePrompt('shot-1', 'user-1')).rejects.toMatchObject({
      code: 'SHOT_APPROVED',
    });
    expect(orchestrator.beginScopedRecompute).not.toHaveBeenCalled();
  });
});
