import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

let app: FastifyInstance;
let authHeaders: Record<string, string>;

beforeAll(async () => {
  app = await buildApp({ jwtSecret: 'test-secret-that-is-at-least-32-characters' });
  // providers 路由挂在模块级 authenticate 上（jwtVerify 优先）；带 token 就不触碰本地 owner 查询。
  const token = app.jwt.sign({ sub: 'owner-1', email: 'owner@zivith.local' });
  authHeaders = { authorization: `Bearer ${token}` };
});

afterAll(async () => {
  await app.close();
});

async function firstLlmModel(): Promise<{ provider: string; model: string }> {
  const catalog = await app.inject({
    method: 'GET',
    url: '/api/v1/providers',
    headers: authHeaders,
  });
  if (catalog.statusCode !== 200) {
    throw new Error(`GET /providers ${catalog.statusCode}: ${catalog.body.slice(0, 400)}`);
  }
  const providers = catalog.json().providers as Array<{
    id: string;
    llm_models?: Array<{ id: string }>;
  }>;
  for (const provider of providers) {
    const model = provider.llm_models?.[0]?.id;
    if (model) return { provider: provider.id, model };
  }
  throw new Error('catalog has no llm models to toggle');
}

describe('providers model-visibility (设置页模型开关)', () => {
  it('hides and shows a model, reflected in the catalog', async () => {
    const target = await firstLlmModel();

    const hide = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/model-visibility',
      headers: authHeaders,
      payload: { ...target, visible: false },
    });
    expect(hide.statusCode).toBe(200);
    expect(hide.json().hidden_models).toContainEqual(target);

    const catalog = await app.inject({
      method: 'GET',
      url: '/api/v1/providers',
      headers: authHeaders,
    });
    expect(catalog.json().hidden_models).toContainEqual(target);

    const show = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/model-visibility',
      headers: authHeaders,
      payload: { ...target, visible: true },
    });
    expect(show.statusCode).toBe(200);
    expect(show.json().hidden_models).not.toContainEqual(target);
  });

  it('is idempotent: hiding twice keeps a single entry', async () => {
    const target = await firstLlmModel();
    await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/model-visibility',
      headers: authHeaders,
      payload: { ...target, visible: false },
    });
    const again = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/model-visibility',
      headers: authHeaders,
      payload: { ...target, visible: false },
    });
    expect(
      again.json().hidden_models.filter((item: unknown) => deepEqual(item, target)),
    ).toHaveLength(1);
    // 清理，避免影响其他用例
    await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/model-visibility',
      headers: authHeaders,
      payload: { ...target, visible: true },
    });
  });

  it('rejects unknown providers and empty model ids', async () => {
    const badProvider = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/model-visibility',
      headers: authHeaders,
      payload: { provider: 'nope', model: 'some-model', visible: false },
    });
    expect(badProvider.statusCode).toBe(400);

    const emptyModel = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/model-visibility',
      headers: authHeaders,
      payload: { provider: 'deepseek', model: '   ', visible: false },
    });
    expect(emptyModel.statusCode).toBe(400);
  });
});

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
