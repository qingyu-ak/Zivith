import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import type { MemoryService } from '../contexts/memory/service.js';

const idSchema = z.string().min(1).max(128);

function atomDto(atom: {
  id: string;
  entityType: string | null;
  entityId: string | null;
  factType: string;
  content: string;
  status: string;
  memoryOp: string;
  sourceMessageId: string | null;
  threadId: string | null;
  confidence: number;
  createdAt: Date;
}) {
  return {
    id: atom.id,
    entity_type: atom.entityType,
    entity_id: atom.entityId,
    fact_type: atom.factType,
    content: atom.content,
    status: atom.status,
    memory_op: atom.memoryOp,
    source_message_id: atom.sourceMessageId,
    thread_id: atom.threadId,
    confidence: atom.confidence,
    created_at: atom.createdAt.toISOString(),
  };
}

function coreDto(core: {
  id: string;
  kind: string;
  topic: string;
  content: string;
  version: number;
  sourceAtomIds: string[];
  updatedAt: Date;
}) {
  return {
    id: core.id,
    kind: core.kind,
    topic: core.topic,
    content: core.content,
    version: core.version,
    source_atom_ids: core.sourceAtomIds,
    updated_at: core.updatedAt.toISOString(),
  };
}

/** 记忆面板 + 调试 API（ADR-0013 本地单用户，随 world 路由免登录）。 */
export function registerMemoryRoutes(app: FastifyInstance, memory: MemoryService) {
  app.get('/projects/:projectId/atoms', async (request) => {
    const { projectId } = z.object({ projectId: idSchema }).strict().parse(request.params);
    const query = z
      .object({
        entity_type: z.string().max(64).optional(),
        entity_id: z.string().max(128).optional(),
        page: z.coerce.number().int().min(1).default(1),
        page_size: z.coerce.number().int().min(1).max(50).default(20),
      })
      .strict()
      .parse(request.query ?? {});
    const result = await memory.listAtoms(projectId, {
      ...(query.entity_type ? { entityType: query.entity_type } : {}),
      ...(query.entity_id ? { entityId: query.entity_id } : {}),
      page: query.page,
      pageSize: query.page_size,
    });
    return { items: result.items.map(atomDto), total: result.total, page: query.page };
  });

  app.get('/projects/:projectId/cores', async (request) => {
    const { projectId } = z.object({ projectId: idSchema }).strict().parse(request.params);
    const cores = await memory.listCores(projectId);
    return { items: cores.map(coreDto) };
  });

  app.delete('/atoms/:atomId', async (request) => {
    const { atomId } = z.object({ atomId: idSchema }).strict().parse(request.params);
    const ok = await memory.invalidateAtom(atomId);
    if (!ok) throw new ApiError(404, 'ATOM_NOT_FOUND', '记忆原子不存在或已失效');
    return { ok: true };
  });

  app.post('/rebuild', async (request) => {
    const body = z
      .object({ project_id: idSchema })
      .strict()
      .parse(request.body ?? {});
    return memory.rebuildVectors(body.project_id);
  });

  app.post('/search', async (request) => {
    const body = z
      .object({
        project_id: idSchema,
        query: z.string().trim().min(1).max(2_000),
        top_k: z.coerce.number().int().min(1).max(24).default(8),
      })
      .strict()
      .parse(request.body ?? {});
    const world = await memory.projectWorld(body.project_id);
    const items = await memory.retrieve({
      projectId: body.project_id,
      text: body.query,
      world,
      topK: body.top_k,
    });
    return { items };
  });
}
