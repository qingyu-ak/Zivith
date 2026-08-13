import { describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { LOCAL_OWNER_EMAIL, ensureProjectMember } from '../src/contexts/world/local-user.js';
import { createAuthenticate } from '../src/routes/auth.js';
import { ApiError } from '../src/errors.js';

describe('ADR-0013 local session', () => {
  it('binds the local owner when no JWT is present', async () => {
    const create = vi.fn();
    const db = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: 'local-1' }),
        create,
      },
    } as unknown as PrismaClient;
    const authenticate = createAuthenticate(db);
    const request = {
      jwtVerify: vi.fn().mockRejectedValue(new Error('No Authorization')),
    } as unknown as FastifyRequest;

    await authenticate(request);

    expect(request.user).toEqual({ sub: 'local-1', email: LOCAL_OWNER_EMAIL });
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps a verified JWT identity', async () => {
    const findFirst = vi.fn();
    const db = {
      user: { findFirst, create: vi.fn() },
    } as unknown as PrismaClient;
    const authenticate = createAuthenticate(db);
    const request = {
      jwtVerify: vi.fn().mockResolvedValue(undefined),
      user: { sub: 'user-9', email: 'demo@zivith.local' },
    } as unknown as FastifyRequest;

    await authenticate(request);

    expect(request.user).toEqual({ sub: 'user-9', email: 'demo@zivith.local' });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('auto-grants membership for a project on this machine', async () => {
    const upsert = vi.fn().mockResolvedValue({ role: 'owner' });
    const db = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'p1' }) },
      projectMember: { upsert },
    } as unknown as PrismaClient;

    const member = await ensureProjectMember(db, 'local-1', 'p1', true);
    expect(member.role).toBe('owner');
    expect(upsert).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 'p1', userId: 'local-1' } },
      create: { projectId: 'p1', userId: 'local-1', role: 'owner' },
      update: {},
    });
  });

  it('still 404s when the project is missing', async () => {
    const db = {
      project: { findFirst: vi.fn().mockResolvedValue(null) },
      projectMember: { upsert: vi.fn() },
    } as unknown as PrismaClient;

    await expect(ensureProjectMember(db, 'local-1', 'missing')).rejects.toBeInstanceOf(ApiError);
  });
});
