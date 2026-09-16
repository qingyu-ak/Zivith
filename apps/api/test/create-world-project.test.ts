import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@zivith/database';
import { createMemoryPrisma } from './helpers/memory-prisma.js';
import { resolveLocalOwner } from '../src/contexts/world/local-user.js';
import { createWorldProject } from '../src/contexts/world/workspace.js';
import { projectBody } from '../src/routes/resources.js';

describe('createWorldProject', () => {
  it('creates a ProjectTimeline named World Line', async () => {
    const db = createMemoryPrisma();
    const ownerId = await resolveLocalOwner(db as unknown as PrismaClient);
    const project = await createWorldProject(db as unknown as PrismaClient, {
      name: '雾城来信',
      description: '港口永远有雾',
      memberUserId: ownerId,
      seed: false,
    });
    expect(project.name).toBe('雾城来信');
    const timelines = await db.projectTimeline.findMany({ where: { projectId: project.id } });
    expect(timelines).toHaveLength(1);
    expect(timelines[0]?.name).toBe('World Line');
  });
});

describe('POST /projects body', () => {
  it('rejects a blank name', () => {
    expect(() => projectBody.parse({ name: '  ' })).toThrow();
  });
});
