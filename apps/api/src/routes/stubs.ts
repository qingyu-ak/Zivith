import type { FastifyInstance, HTTPMethods } from 'fastify';
import { authenticate } from './auth.js';

const routes: Array<[HTTPMethods, string]> = [
  ['POST', '/scenes/:id/visual-requirements/:rid/generate'],
  ['PUT', '/provider-credentials/:provider'],
  ['DELETE', '/provider-credentials/:provider'],
  ['GET', '/projects/:pid/provider-usage'],
  ['PUT', '/projects/:pid/provider-limits/:provider'],
  ['POST', '/internal/providers/:provider/callbacks'],
];

export function registerStubRoutes(app: FastifyInstance): void {
  for (const [method, url] of routes) {
    app.route({
      method,
      url,
      preHandler: authenticate,
      handler: async (_request, reply) =>
        reply.status(501).send({
          error: { code: 'NOT_IMPLEMENTED', message: '该功能将在后续阶段实现' },
        }),
    });
  }
}
