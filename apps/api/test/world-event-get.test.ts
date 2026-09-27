import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { buildApp } from '../src/app.js';
import { createMemoryPrisma, type MemoryPrisma } from './helpers/memory-prisma.js';

describe('GET /world/world-events/:id', () => {
  let app: FastifyInstance;
  let db: MemoryPrisma;
  let eventId: string;

  beforeAll(async () => {
    db = createMemoryPrisma();
    await db.user.create({
      data: { id: 'u1', email: 'local@zivith.local', passwordHash: '!', displayName: 'Local' },
    });
    await db.project.create({
      data: {
        id: 'p1',
        ownerId: 'u1',
        name: '龙族',
        description: null,
        worldview: {},
        defaults: {},
        settings: {},
        workspacePath: null,
      },
    });
    const created = await db.worldEvent.create({
      data: {
        id: 'evt-rooftop',
        projectId: 'p1',
        title: '路明非在天台向诺诺坦白见过龙王',
        description: '后半夜，路明非在卡塞尔学院天台当面告诉诺诺自己见过龙王。',
        characterIds: ['c-lumingfei', 'c-nuonuo'],
        sceneIds: [],
      },
    });
    eventId = String(created.id);
    app = await buildApp({
      db: db as unknown as PrismaClient,
      jwtSecret: 'test-secret-that-is-at-least-32-characters',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the event that is still in the list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/world/world-events/${eventId}`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { id: string; title: string };
    expect(body.id).toBe(eventId);
    expect(body.title).toBe('路明非在天台向诺诺坦白见过龙王');
  });

  it('returns WORLD_EVENT_NOT_FOUND for a missing id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/world/world-events/missing-event-id',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'WORLD_EVENT_NOT_FOUND', message: '世界事件不存在' },
    });
  });

  it('returns WORLD_EVENT_NOT_FOUND after soft delete', async () => {
    await db.worldEvent.update({
      where: { id: eventId },
      data: { deletedAt: new Date() },
    });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/world/world-events/${eventId}`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'WORLD_EVENT_NOT_FOUND' },
    });
  });
});
