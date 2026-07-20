import type { FastifyInstance, HTTPMethods } from 'fastify';
import { authenticate } from './auth.js';

const routes: Array<[HTTPMethods, string]> = [
  ['GET', '/scenes/:id/visual-requirements'],
  ['POST', '/scenes/:id/visual-requirements'],
  ['PATCH', '/scenes/:id/visual-requirements/:rid'],
  ['POST', '/scenes/:id/visual-requirements/:rid/generate'],
  ['POST', '/scenes/:id/visual-requirements/:rid/approve'],
  ['POST', '/scenes/:id/visual-requirements/:rid/reject'],
  ['POST', '/shots/:id/generate-prompt'],
  ['POST', '/shots/:id/prompts/:promptId/approve'],
  ['POST', '/shots/:id/generate'],
  ['GET', '/shots/:id/outputs'],
  ['POST', '/shots/:id/outputs/:oid/activate'],
  ['POST', '/workflows/story-to-video'],
  ['GET', '/workflows/:runId'],
  ['POST', '/workflows/:runId/review'],
  ['POST', '/workflows/:runId/cancel'],
  ['GET', '/workflows/:runId/events'],
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
