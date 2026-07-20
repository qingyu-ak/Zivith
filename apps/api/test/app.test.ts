import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

function errorMessage(response: { json(): unknown }): string {
  const payload = response.json();
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    throw new Error('Expected an error response');
  }
  const error = payload.error;
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    throw new Error('Expected an error message');
  }
  if (typeof error.message !== 'string') throw new Error('Expected a string error message');
  return error.message;
}

describe('API foundation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ jwtSecret: 'test-secret-that-is-at-least-32-characters' });
  });

  afterAll(async () => app.close());

  it('reports health without authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('protects project resources', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/projects' });
    expect(response.statusCode).toBe(401);
    expect(errorMessage(response)).toBe('请先登录');
  });

  it('returns Chinese validation errors', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { email: 'bad', password: 'short', display_name: '' },
    });
    expect(response.statusCode).toBe(400);
    expect(errorMessage(response)).toBe('请求参数验证失败');
  });

  it('preserves client error status for malformed JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });
    expect(response.statusCode).toBe(400);
    expect(errorMessage(response)).toBe('请求格式不正确');
  });

  it('allows browser preflight for destructive resource methods', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/shots/11111111-1111-4111-8111-111111111111',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'DELETE',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-methods']).toContain('DELETE');
    expect(response.headers['access-control-allow-headers']?.toLowerCase()).toContain(
      'authorization',
    );
  });
});
