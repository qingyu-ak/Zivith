import type { Prisma } from '@zivith/database';
import {
  type Proposal,
  compactWorldTimeBinding,
  mergeWorldview,
  worldEventCreateSchema,
  worldTimeEnvelopeSchema,
  relationshipCreateSchema,
} from '@zivith/domain';
import { ApiError } from '../../errors.js';
import { claimWorkspaceSeed, createWorldProject, isWorkspaceSeed } from './workspace.js';
import { ensureAssetBaseline, recordAssetHistory } from '../history/record-asset-change.js';

/**
 * ADR-0010 fence: the agent NEVER writes to the world directly.
 *
 * A user-confirmed proposal is applied here through the same create/update
 * services used by the Studio — every entity always lands as `draft` and is
 * reviewed/approved by the creator (Studio right inspector / approve).
 */
export type ApplyProposalResult = {
  kind: Proposal['kind'];
  projectId: string;
  entityType: string;
  entityId: string;
  title: string;
};

function requireProjectId(proposal: Proposal, fallback?: string | null): string {
  // 上下文归属（批量 apply 的 currentProjectId / thread.projectId）优先：
  // 真实 LLM 可能给占位 project_id（如 project_placeholder），会绕过上下文导致外键失败。
  const id = fallback ?? proposal.project_id ?? undefined;
  if (!id) throw new ApiError(400, 'PROJECT_REQUIRED', '该提案缺少 project_id');
  return id;
}

/** Asset.data 的提案更新是浅合并：patch 中显式为 null 的键会被清空，其余既有键保留。 */
export function mergeAssetData(
  current: unknown,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) {
      delete base[key];
      continue;
    }
    base[key] = value;
  }
  return base as Prisma.InputJsonValue;
}

function requireString(payload: Record<string, unknown>, key: string, label: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(400, 'PROPOSAL_FIELD_REQUIRED', `提案缺少 ${label}`);
  }
  return value.trim();
}

export async function applyProposal(
  db: Prisma.TransactionClient,
  proposal: Proposal,
  fallbackProjectId?: string | null,
  memberUserId?: string | null,
): Promise<ApplyProposalResult> {
  switch (proposal.kind) {
    case 'create_project':
      return applyCreateProject(db, proposal, memberUserId, fallbackProjectId);
    case 'create_world_event':
      return applyCreateWorldEvent(db, proposal, fallbackProjectId);
    case 'create_character':
    case 'create_location':
      return applyCreateAsset(db, proposal, fallbackProjectId);
    case 'create_scene':
      return applyCreateScene(db, proposal, fallbackProjectId);
    case 'create_relationship':
      return applyCreateRelationship(db, proposal, fallbackProjectId);
    case 'update_entity':
      return applyUpdateEntity(db, proposal, fallbackProjectId);
    default:
      throw new ApiError(400, 'UNSUPPORTED_PROPOSAL', '不支持的提案类型');
  }
}

async function applyCreateProject(
  db: Prisma.TransactionClient,
  proposal: Proposal,
  memberUserId?: string | null,
  fallbackProjectId?: string | null,
): Promise<ApplyProposalResult> {
  const payload = proposal.payload;
  const name = requireString(payload, 'name', '项目名称');
  const description =
    typeof payload.description === 'string' && payload.description.trim()
      ? payload.description.trim()
      : null;
  const worldview =
    payload.worldview && typeof payload.worldview === 'object'
      ? mergeWorldview({}, payload.worldview)
      : undefined;

  if (fallbackProjectId) {
    const existing = await db.project.findFirst({
      where: { id: fallbackProjectId, deletedAt: null },
    });
    if (existing && isWorkspaceSeed(existing)) {
      await claimWorkspaceSeed(db, existing.id, {
        name,
        description,
        ...(worldview ? { worldview: worldview } : {}),
      });
      return {
        kind: proposal.kind,
        projectId: existing.id,
        entityType: 'project',
        entityId: existing.id,
        title: name,
      };
    }
  }

  const project = await createWorldProject(db, {
    name,
    description,
    memberUserId: memberUserId ?? null,
    seed: false,
    ...(worldview ? { worldview: worldview as Prisma.InputJsonValue } : {}),
  });
  return {
    kind: proposal.kind,
    projectId: project.id,
    entityType: 'project',
    entityId: project.id,
    title: name,
  };
}

async function applyCreateWorldEvent(
  db: Prisma.TransactionClient,
  proposal: Proposal,
  fallbackProjectId?: string | null,
): Promise<ApplyProposalResult> {
  const projectId = requireProjectId(proposal, fallbackProjectId);
  const payload = proposal.payload;
  const input = worldEventCreateSchema.parse(payload);

  const count = await db.worldEvent.count({
    where: { projectId, deletedAt: null },
  });
  const presentationOrder = input.presentation_order ?? count + 1;

  const created = await db.worldEvent.create({
    data: {
      projectId,
      title: input.title,
      description: input.description ?? null,
      worldTimeEnvelope: compactWorldTimeBinding(
        input.world_time_envelope,
      ) as Prisma.InputJsonValue,
      anchorStoryId: input.anchor_story_id ?? null,
      presentationOrder,
      characterIds: input.character_ids,
      sceneIds: input.scene_ids,
      state: 'draft',
    },
  });
  return {
    kind: proposal.kind,
    projectId,
    entityType: 'world_event',
    entityId: created.id,
    title: created.title,
  };
}

async function applyCreateAsset(
  db: Prisma.TransactionClient,
  proposal: Proposal,
  fallbackProjectId?: string | null,
): Promise<ApplyProposalResult> {
  const projectId = requireProjectId(proposal, fallbackProjectId);
  const payload = proposal.payload;
  const name = requireString(payload, 'name', '实体名称');
  const description =
    typeof payload.description === 'string' && payload.description.trim()
      ? payload.description.trim()
      : '';

  const aliases = Array.isArray(payload.aliases)
    ? payload.aliases.filter((a): a is string => typeof a === 'string').slice(0, 64)
    : [];
  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((t): t is string => typeof t === 'string').slice(0, 64)
    : [];
  const data =
    payload.data && typeof payload.data === 'object'
      ? (payload.data as Prisma.InputJsonValue)
      : ({} as Prisma.InputJsonValue);

  const asset = await db.asset.create({
    data: {
      projectId,
      type: proposal.kind === 'create_character' ? 'character' : 'location',
      state: 'draft',
      name,
      description,
      aliases,
      tags,
      data,
    },
  });
  await recordAssetHistory(db, {
    asset,
    changeKind: 'create',
    eventType: 'entity.created',
    idempotencyKey: `proposal:create:${asset.id}`,
    actorType: 'user',
    sourceType: 'proposal',
    sourceId: proposal.kind,
  });
  return {
    kind: proposal.kind,
    projectId,
    entityType: 'asset',
    entityId: asset.id,
    title: asset.name,
  };
}

async function applyCreateScene(
  db: Prisma.TransactionClient,
  proposal: Proposal,
  fallbackProjectId?: string | null,
): Promise<ApplyProposalResult> {
  const projectId = requireProjectId(proposal, fallbackProjectId);
  const payload = proposal.payload;
  const title = requireString(payload, 'title', '场景标题');
  const storyId = requireString(payload, 'story_id', '所属故事 story_id');

  const story = await db.story.findFirst({
    where: { id: storyId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!story) throw new ApiError(404, 'STORY_NOT_FOUND', '所属故事不存在');

  const count = await db.scene.count({
    where: { storyId, deletedAt: null },
  });
  const created = await db.scene.create({
    data: {
      storyId,
      projectId,
      title,
      description:
        typeof payload.description === 'string' && payload.description.trim()
          ? payload.description.trim()
          : null,
      order: typeof payload.order === 'number' ? payload.order : count + 1,
      time: typeof payload.time === 'string' && payload.time.trim() ? payload.time.trim() : null,
      weather:
        typeof payload.weather === 'string' && payload.weather.trim()
          ? payload.weather.trim()
          : null,
      mood: typeof payload.mood === 'string' && payload.mood.trim() ? payload.mood.trim() : null,
      state: 'draft',
    },
  });
  return {
    kind: proposal.kind,
    projectId,
    entityType: 'scene',
    entityId: created.id,
    title: created.title,
  };
}

async function applyCreateRelationship(
  db: Prisma.TransactionClient,
  proposal: Proposal,
  fallbackProjectId?: string | null,
): Promise<ApplyProposalResult> {
  const projectId = requireProjectId(proposal, fallbackProjectId);
  const input = relationshipCreateSchema.parse(proposal.payload);

  // Validate polymorphic refs point at real entities inside the project.
  await assertEntityRefExists(db, projectId, input.source);
  await assertEntityRefExists(db, projectId, input.target);

  const created = await db.relationship.create({
    data: {
      projectId,
      kind: input.kind,
      sourceType: input.source.type,
      sourceId: input.source.id,
      targetType: input.target.type,
      targetId: input.target.id,
      direction: input.direction,
      label: input.label ?? null,
      description: input.description ?? null,
      ...(input.valid_from ? { validFrom: input.valid_from as Prisma.InputJsonValue } : {}),
      ...(input.valid_until ? { validUntil: input.valid_until as Prisma.InputJsonValue } : {}),
      state: 'draft',
    },
  });
  return {
    kind: proposal.kind,
    projectId,
    entityType: 'relationship',
    entityId: created.id,
    title: created.label ?? created.kind,
  };
}

async function assertEntityRefExists(
  db: Prisma.TransactionClient,
  projectId: string,
  ref: { type: string; id: string },
): Promise<void> {
  const { type, id } = ref;
  if (type === 'project') {
    if (id !== projectId) throw new ApiError(400, 'REF_NOT_IN_PROJECT', '引用不属于该项目');
    return;
  }
  const exists =
    type === 'story'
      ? await db.story.findFirst({
          where: { id, projectId, deletedAt: null },
          select: { id: true },
        })
      : type === 'asset'
        ? await db.asset.findFirst({
            where: { id, projectId, deletedAt: null },
            select: { id: true },
          })
        : type === 'scene'
          ? await db.scene.findFirst({
              where: { id, projectId, deletedAt: null },
              select: { id: true },
            })
          : type === 'world_event'
            ? await db.worldEvent.findFirst({
                where: { id, projectId, deletedAt: null },
                select: { id: true },
              })
            : type === 'relationship'
              ? await db.relationship.findFirst({
                  where: { id, projectId, deletedAt: null },
                  select: { id: true },
                })
              : null;
  if (!exists) throw new ApiError(400, 'REF_NOT_FOUND', `引用实体不存在: ${type}:${id}`);
}

async function applyUpdateEntity(
  db: Prisma.TransactionClient,
  proposal: Proposal,
  fallbackProjectId?: string | null,
): Promise<ApplyProposalResult> {
  const projectId = requireProjectId(proposal, fallbackProjectId);
  const payload = proposal.payload;
  const type = requireString(payload, 'type', '实体类型');
  // 世界观更新目标恒为当前项目本身：忽略 LLM 可能填写的占位 id（如 proj-001）。
  const id = type === 'project' ? projectId : requireString(payload, 'id', '实体 id');
  const fields = payload.fields as Record<string, unknown> | undefined;

  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new ApiError(400, 'PROPOSAL_FIELD_REQUIRED', '提案缺少 fields');
  }

  let title = id;
  switch (type) {
    case 'world_event': {
      const entity = await db.worldEvent.findFirst({
        where: { id, projectId, deletedAt: null },
      });
      if (!entity) throw new ApiError(404, 'ENTITY_NOT_FOUND', '世界事件不存在');
      const data: Prisma.WorldEventUpdateInput = {};
      if (typeof fields.title === 'string' && fields.title.trim()) {
        data.title = fields.title.trim();
        title = fields.title.trim();
      }
      if (typeof fields.description === 'string') data.description = fields.description.trim();
      if (fields.world_time_envelope && typeof fields.world_time_envelope === 'object') {
        const envelope = worldTimeEnvelopeSchema.parse(fields.world_time_envelope);
        data.worldTimeEnvelope = compactWorldTimeBinding(envelope) as Prisma.InputJsonValue;
      }
      if (typeof fields.presentation_order === 'number') {
        data.presentationOrder = fields.presentation_order;
      }
      if (Array.isArray(fields.character_ids)) {
        data.characterIds = fields.character_ids.filter((x): x is string => typeof x === 'string');
      }
      if (Array.isArray(fields.scene_ids)) {
        data.sceneIds = fields.scene_ids.filter((x): x is string => typeof x === 'string');
      }
      if (fields.anchor_story_id !== undefined) {
        data.anchorStoryId =
          typeof fields.anchor_story_id === 'string' ? fields.anchor_story_id : null;
      }
      await db.worldEvent.update({ where: { id }, data });
      return { kind: proposal.kind, projectId, entityType: 'world_event', entityId: id, title };
    }
    case 'character':
    case 'location': {
      const entity = await db.asset.findFirst({
        where: { id, projectId, deletedAt: null },
      });
      if (!entity) throw new ApiError(404, 'ENTITY_NOT_FOUND', '实体不存在');
      const data: Prisma.AssetUpdateInput = {};
      if (typeof fields.name === 'string' && fields.name.trim()) {
        data.name = fields.name.trim();
        title = fields.name.trim();
      }
      if (typeof fields.description === 'string') data.description = fields.description.trim();
      if (Array.isArray(fields.aliases)) {
        data.aliases = fields.aliases.filter((x): x is string => typeof x === 'string');
      }
      if (Array.isArray(fields.tags)) {
        data.tags = fields.tags.filter((x): x is string => typeof x === 'string');
      }
      if (fields.data && typeof fields.data === 'object' && !Array.isArray(fields.data)) {
        // 浅合并：提案只带它要改的键，不得抹掉 personality / default_outfit 等既有字段。
        data.data = mergeAssetData(entity.data, fields.data as Record<string, unknown>);
      }
      await ensureAssetBaseline(db, entity, { sourceType: 'proposal' });
      await db.asset.update({ where: { id }, data });
      const updated = await db.asset.findFirst({ where: { id } });
      if (updated) {
        const asOf =
          typeof fields.as_of_world_event_id === 'string' ? fields.as_of_world_event_id : undefined;
        const stageLabel = typeof fields.stage_label === 'string' ? fields.stage_label : undefined;
        await recordAssetHistory(db, {
          asset: updated,
          changeKind: 'update',
          eventType: 'entity.changed',
          idempotencyKey: `proposal:update:${updated.id}:${updated.updatedAt.toISOString()}`,
          actorType: 'user',
          sourceType: 'proposal',
          sourceId: proposal.kind,
          asOfWorldEventId: asOf ?? null,
          stageLabel: stageLabel ?? null,
        });
      }
      return { kind: proposal.kind, projectId, entityType: 'asset', entityId: id, title };
    }
    case 'scene': {
      const entity = await db.scene.findFirst({
        where: { id, projectId, deletedAt: null },
      });
      if (!entity) throw new ApiError(404, 'ENTITY_NOT_FOUND', '场景不存在');
      const data: Prisma.SceneUpdateInput = {};
      if (typeof fields.title === 'string' && fields.title.trim()) {
        data.title = fields.title.trim();
        title = fields.title.trim();
      }
      if (typeof fields.description === 'string') data.description = fields.description.trim();
      if (typeof fields.time === 'string') data.time = fields.time.trim() || null;
      if (typeof fields.weather === 'string') data.weather = fields.weather.trim() || null;
      if (typeof fields.mood === 'string') data.mood = fields.mood.trim() || null;
      await db.scene.update({ where: { id }, data });
      return { kind: proposal.kind, projectId, entityType: 'scene', entityId: id, title };
    }
    case 'story': {
      const entity = await db.story.findFirst({
        where: { id, projectId, deletedAt: null },
      });
      if (!entity) throw new ApiError(404, 'ENTITY_NOT_FOUND', '故事不存在');
      const data: Prisma.StoryUpdateInput = {};
      if (typeof fields.title === 'string' && fields.title.trim()) {
        data.title = fields.title.trim();
        title = fields.title.trim();
      }
      if (typeof fields.logline === 'string') data.logline = fields.logline.trim() || null;
      if (typeof fields.synopsis === 'string') data.synopsis = fields.synopsis.trim() || null;
      if (typeof fields.genre === 'string') data.genre = fields.genre.trim() || null;
      if (typeof fields.theme === 'string') data.theme = fields.theme.trim() || null;
      if (typeof fields.tone === 'string') data.tone = fields.tone.trim() || null;
      await db.story.update({ where: { id }, data });
      return { kind: proposal.kind, projectId, entityType: 'story', entityId: id, title };
    }
    case 'relationship': {
      const entity = await db.relationship.findFirst({
        where: { id, projectId, deletedAt: null },
      });
      if (!entity) throw new ApiError(404, 'ENTITY_NOT_FOUND', '关系不存在');
      const data: Prisma.RelationshipUpdateInput = {};
      if (typeof fields.label === 'string') {
        data.label = fields.label.trim() || null;
        title = fields.label.trim() || id;
      }
      if (typeof fields.description === 'string')
        data.description = fields.description.trim() || null;
      if (typeof fields.direction === 'string') data.direction = fields.direction;
      if (fields.valid_from && typeof fields.valid_from === 'object') {
        data.validFrom = fields.valid_from;
      }
      if (fields.valid_until && typeof fields.valid_until === 'object') {
        data.validUntil = fields.valid_until;
      }
      await db.relationship.update({ where: { id }, data });
      return { kind: proposal.kind, projectId, entityType: 'relationship', entityId: id, title };
    }
    case 'project': {
      if (id !== projectId) throw new ApiError(400, 'REF_NOT_IN_PROJECT', '引用不属于该项目');
      const entity = await db.project.findFirst({
        where: { id, deletedAt: null },
      });
      if (!entity) throw new ApiError(404, 'ENTITY_NOT_FOUND', '项目不存在');
      const data: Prisma.ProjectUpdateInput = {};
      if (typeof fields.worldview === 'object' && fields.worldview !== null) {
        data.worldview = mergeWorldview(entity.worldview, fields.worldview);
      }
      await db.project.update({ where: { id }, data });
      const premise =
        typeof fields.worldview === 'object' && fields.worldview !== null
          ? (fields.worldview as Record<string, unknown>).premise
          : undefined;
      title = typeof premise === 'string' && premise.trim() ? premise.trim() : entity.name;
      return { kind: proposal.kind, projectId, entityType: 'project', entityId: id, title };
    }
    default:
      throw new ApiError(400, 'UNSUPPORTED_ENTITY_TYPE', `不支持的实体类型: ${type}`);
  }
}
