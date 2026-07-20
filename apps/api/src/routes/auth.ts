import { createHash, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { z } from 'zod';
import { ApiError } from '../errors.js';

const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(200),
});

const signupSchema = credentialsSchema.extend({
  display_name: z.string().trim().min(1).max(100),
});

const refreshSchema = z.object({ refresh_token: z.string().min(32) });
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

async function issueTokens(
  app: FastifyInstance,
  db: PrismaClient,
  user: { id: string; email: string },
  familyId: string = randomUUID(),
) {
  const access_token = app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '15m' });
  const refresh_token = `${randomUUID()}${randomUUID()}`;
  await db.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refresh_token),
      familyId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  return { access_token, refresh_token, token_type: 'Bearer', expires_in: 900 };
}

export async function authenticate(request: FastifyRequest): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', '请先登录');
  }
}

export function registerAuthRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.post('/auth/signup', async (request, reply) => {
    const body = signupSchema.parse(request.body);
    if (await db.user.findUnique({ where: { email: body.email } })) {
      throw new ApiError(409, 'EMAIL_EXISTS', '该邮箱已注册');
    }
    const user = await db.user.create({
      data: {
        email: body.email,
        displayName: body.display_name,
        passwordHash: await argon2.hash(body.password),
      },
    });
    return reply.status(201).send({
      user: { id: user.id, email: user.email, display_name: user.displayName },
      ...(await issueTokens(app, db, user)),
    });
  });

  app.post('/auth/login', async (request) => {
    const body = credentialsSchema.parse(request.body);
    const user = await db.user.findFirst({ where: { email: body.email, deletedAt: null } });
    if (!user || !(await argon2.verify(user.passwordHash, body.password))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', '邮箱或密码错误');
    }
    return {
      user: { id: user.id, email: user.email, display_name: user.displayName },
      ...(await issueTokens(app, db, user)),
    };
  });

  app.post('/auth/refresh', async (request) => {
    const { refresh_token } = refreshSchema.parse(request.body);
    const stored = await db.refreshToken.findUnique({
      where: { tokenHash: hashToken(refresh_token) },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt <= new Date() || stored.user.deletedAt) {
      throw new ApiError(401, 'INVALID_REFRESH_TOKEN', '刷新令牌无效或已过期');
    }
    return db.$transaction(async (tx) => {
      const next = await issueTokens(app, tx as PrismaClient, stored.user, stored.familyId);
      const replacement = await tx.refreshToken.findUnique({
        where: { tokenHash: hashToken(next.refresh_token) },
      });
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedBy: replacement?.id },
      });
      return next;
    });
  });

  app.post('/auth/logout', { preHandler: authenticate }, async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (parsed.success) {
      await db.refreshToken.updateMany({
        where: {
          userId: request.user.sub,
          tokenHash: hashToken(parsed.data.refresh_token),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
    return reply.status(204).send();
  });

  app.get('/auth/me', { preHandler: authenticate }, async (request) => {
    const user = await db.user.findFirst({ where: { id: request.user.sub, deletedAt: null } });
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');
    return { id: user.id, email: user.email, display_name: user.displayName };
  });
}
