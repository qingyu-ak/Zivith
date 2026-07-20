import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import { assertPromptApprovedForGeneration } from '../src/contexts/generation/service.js';

function database(prompt: Record<string, unknown>, approved: Record<string, unknown> | null) {
  return {
    shot: {
      findUnique: vi.fn().mockResolvedValue({ prompt }),
    },
    promptVersion: {
      findFirst: vi.fn().mockResolvedValue(approved),
    },
  } as unknown as PrismaClient;
}

describe('mandatory prompt approval', () => {
  it('blocks generation when no prompt version is approved', async () => {
    await expect(
      assertPromptApprovedForGeneration(
        database({ positive: 'cinematic shot', negative: 'blur' }, null),
        'shot-1',
      ),
    ).rejects.toMatchObject({ code: 'PROMPT_APPROVAL_REQUIRED' });
  });

  it('invalidates approval after the current prompt is edited', async () => {
    await expect(
      assertPromptApprovedForGeneration(
        database(
          { positive: 'edited prompt', negative: 'blur' },
          { positive: 'approved prompt', negative: 'blur', approvedAt: new Date() },
        ),
        'shot-1',
      ),
    ).rejects.toMatchObject({ code: 'PROMPT_APPROVAL_REQUIRED' });
  });

  it('allows generation only when the approved version matches exactly', async () => {
    await expect(
      assertPromptApprovedForGeneration(
        database(
          { positive: 'approved prompt', negative: 'blur' },
          { positive: 'approved prompt', negative: 'blur', approvedAt: new Date() },
        ),
        'shot-1',
      ),
    ).resolves.toBeUndefined();
  });
});
