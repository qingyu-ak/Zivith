import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { memoryConflictDecisionSchema } from '@zivith/domain';
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

function conflictDto(conflict: {
  id: string;
  projectId: string;
  threadId: string | null;
  sourceMessageId: string | null;
  entityType: string | null;
  entityId: string | null;
  factType: string;
  incomingContent: string;
  existingContent: string;
  existingAtomId: string | null;
  antonym: string[];
  status: string;
  decision: string | null;
  resolvedAtomId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}) {
  return {
    id: conflict.id,
    project_id: conflict.projectId,
    thread_id: conflict.threadId,
    source_message_id: conflict.sourceMessageId,
    entity_type: conflict.entityType,
    entity_id: conflict.entityId,
    fact_type: conflict.factType,
    incoming_content: conflict.incomingContent,
    existing_content: conflict.existingContent,
    existing_atom_id: conflict.existingAtomId,
    antonym: conflict.antonym,
    status: conflict.status,
    decision: conflict.decision,
    resolved_atom_id: conflict.resolvedAtomId,
    created_at: conflict.createdAt.toISOString(),
    resolved_at: conflict.resolvedAt?.toISOString() ?? null,
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

  // L2 展开溯源：核心块 + 源原子内容（sourceAtomIds 不只给裸 id）。
  app.get('/projects/:projectId/cores/:coreId', async (request) => {
    const { projectId, coreId } = z
      .object({ projectId: idSchema, coreId: idSchema })
      .strict()
      .parse(request.params);
    const detail = await memory.coreDetail(projectId, coreId);
    if (!detail) throw new ApiError(404, 'CORE_NOT_FOUND', '核心记忆不存在');
    return {
      core: coreDto(detail.core),
      source_atoms: detail.sourceAtoms.map(atomDto),
    };
  });

  app.get('/projects/:projectId/conflicts', async (request) => {
    const { projectId } = z.object({ projectId: idSchema }).strict().parse(request.params);
    const query = z
      .object({
        status: z.enum(['pending', 'resolved', 'discarded']).optional(),
        thread_id: idSchema.optional(),
      })
      .strict()
      .parse(request.query ?? {});
    const conflicts = await memory.listConflicts(projectId, {
      ...(query.status ? { status: query.status } : {}),
      ...(query.thread_id ? { threadId: query.thread_id } : {}),
    });
    return { items: conflicts.map(conflictDto) };
  });

  // D4 冲突裁决：确认（保留新卡）/ 丢弃（保留已有卡）。不静默改世界实体。
  app.post('/conflicts/:conflictId/resolve', async (request) => {
    const { conflictId } = z
      .object({ conflictId: idSchema })
      .strict()
      .parse(request.params);
    const body = z
      .object({ decision: memoryConflictDecisionSchema })
      .strict()
      .parse(request.body ?? {});
    const conflict = await memory.resolveConflict(conflictId, body.decision);
    return conflictDto(conflict);
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
