import type { PrismaClient } from '@zivith/database';
import { type Worldview, parseWorldview } from '@zivith/domain';

/**
 * World context for the World Builder agent.
 *
 * Extracts a compact, readable summary of every world entity in a project so
 * the agent can understand the world, spot conflicts, and propose updates
 * (ADR-0010: agent never writes — it only reads the world and proposes).
 */
export interface WorldContext {
  projectId: string;
  projectName: string;
  worldview: Worldview;
  stories: Array<{ id: string; title: string; genre: string | null; logline: string | null }>;
  characters: Array<{ id: string; name: string; description: string | null; tags: string[] }>;
  locations: Array<{ id: string; name: string; description: string | null; tags: string[] }>;
  scenes: Array<{ id: string; title: string; description: string | null; time: string | null }>;
  worldEvents: Array<{
    id: string;
    title: string;
    description: string | null;
    order: number | null;
  }>;
  relationships: Array<{
    id: string;
    kind: string;
    label: string | null;
    direction: string | null;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
  }>;
}

export async function buildWorldContext(
  db: PrismaClient,
  projectId: string,
): Promise<WorldContext | null> {
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, name: true, worldview: true },
  });
  if (!project) return null;

  const [stories, characters, locations, scenes, worldEvents, relationships] = await Promise.all([
    db.story.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, title: true, genre: true, logline: true },
      orderBy: { order: 'asc' },
    }),
    db.asset.findMany({
      where: { projectId, type: 'character', deletedAt: null },
      select: { id: true, name: true, description: true, tags: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.asset.findMany({
      where: { projectId, type: 'location', deletedAt: null },
      select: { id: true, name: true, description: true, tags: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.scene.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, title: true, description: true, time: true },
      orderBy: { order: 'asc' },
    }),
    db.worldEvent.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, title: true, description: true, presentationOrder: true },
      orderBy: [{ presentationOrder: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    }),
    db.relationship.findMany({
      where: { projectId, deletedAt: null },
      select: {
        id: true,
        kind: true,
        label: true,
        direction: true,
        sourceType: true,
        sourceId: true,
        targetType: true,
        targetId: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return assembleWorldContext({
    projectId: project.id,
    projectName: project.name,
    worldview: project.worldview,
    stories,
    characters,
    locations,
    scenes,
    worldEvents: worldEvents.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      order: event.presentationOrder,
    })),
    relationships,
  });
}

function stringTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];
}

/** Build a WorldContext from already-loaded rows (resources route + tests). */
export function assembleWorldContext(input: {
  projectId: string;
  projectName: string;
  worldview: unknown;
  stories: WorldContext['stories'];
  characters: Array<{ id: string; name: string; description: string | null; tags?: unknown }>;
  locations: Array<{ id: string; name: string; description: string | null; tags?: unknown }>;
  scenes: WorldContext['scenes'];
  worldEvents: WorldContext['worldEvents'];
  relationships: WorldContext['relationships'];
}): WorldContext {
  return {
    projectId: input.projectId,
    projectName: input.projectName,
    worldview: parseWorldview(input.worldview),
    stories: input.stories,
    characters: input.characters.map((character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      tags: stringTags(character.tags),
    })),
    locations: input.locations.map((location) => ({
      id: location.id,
      name: location.name,
      description: location.description,
      tags: stringTags(location.tags),
    })),
    scenes: input.scenes,
    worldEvents: input.worldEvents,
    relationships: input.relationships,
  };
}

function entityLabel(context: WorldContext, type: string, id: string): string {
  if (type === 'asset') {
    return (
      context.characters.find((c) => c.id === id)?.name ??
      context.locations.find((l) => l.id === id)?.name ??
      id
    );
  }
  const byType: Record<string, string> = {
    project: context.projectName,
    story: context.stories.find((s) => s.id === id)?.title ?? id,
    scene: context.scenes.find((s) => s.id === id)?.title ?? id,
    world_event: context.worldEvents.find((e) => e.id === id)?.title ?? id,
    relationship: context.relationships.find((r) => r.id === id)?.label ?? id,
  };
  return byType[type] ?? id;
}

/** Compact markdown-style text of the world, injected into the agent prompt. */
export function worldContextToPrompt(context: WorldContext | null): string {
  if (!context) return '（还没有项目。需要先创建 IP 项目。）';
  const lines: string[] = [`项目名称：${context.projectName}`, ''];
  const { worldview } = context;
  const hasWorldview =
    Boolean(worldview.genre?.trim()) ||
    Boolean(worldview.premise?.trim()) ||
    worldview.rules.length > 0 ||
    Boolean(worldview.notes?.trim());
  if (hasWorldview) {
    lines.push('## 世界观');
    if (worldview.genre) lines.push(`- 题材：${worldview.genre}`);
    if (worldview.premise) lines.push(`- 核心设定：${worldview.premise}`);
    if (worldview.rules.length > 0) {
      lines.push(`- 世界规则：${worldview.rules.map((rule) => `「${rule}」`).join('；')}`);
    }
    if (worldview.notes) lines.push(`- 补充：${worldview.notes}`);
    lines.push('');
  }
  if (
    context.stories.length === 0 &&
    context.characters.length === 0 &&
    context.locations.length === 0
  ) {
    lines.push('世界状态：全新世界，还没有任何实体。');
  }
  if (context.stories.length > 0) {
    lines.push('## 故事');
    for (const s of context.stories) {
      lines.push(
        `- [story:${s.id}] ${s.title}${s.genre ? `（${s.genre}）` : ''}${s.logline ? `：${s.logline}` : ''}`,
      );
    }
  }
  if (context.characters.length > 0) {
    lines.push('## 角色');
    for (const c of context.characters) {
      const tags = c.tags.length > 0 ? ` [标签:${c.tags.join(',')}]` : '';
      lines.push(
        `- [character:${c.id}] ${c.name}${c.description ? `：${c.description}` : ''}${tags}`,
      );
    }
  }
  if (context.locations.length > 0) {
    lines.push('## 地点');
    for (const l of context.locations) {
      const tags = l.tags.length > 0 ? ` [标签:${l.tags.join(',')}]` : '';
      lines.push(
        `- [location:${l.id}] ${l.name}${l.description ? `：${l.description}` : ''}${tags}`,
      );
    }
  }
  if (context.scenes.length > 0) {
    lines.push('## 场景');
    for (const s of context.scenes) {
      lines.push(
        `- [scene:${s.id}] ${s.title}${s.time ? `（${s.time}）` : ''}${s.description ? `：${s.description}` : ''}`,
      );
    }
  }
  if (context.worldEvents.length > 0) {
    lines.push('## 世界事件（按时间顺序）');
    for (const e of context.worldEvents) {
      lines.push(
        `- [world_event:${e.id}] ${e.order ?? '?'}. ${e.title}${e.description ? `：${e.description}` : ''}`,
      );
    }
  }
  if (context.relationships.length > 0) {
    lines.push('## 关系');
    for (const r of context.relationships) {
      const source = entityLabel(context, r.sourceType, r.sourceId);
      const target = entityLabel(context, r.targetType, r.targetId);
      lines.push(`- [relationship:${r.id}] ${source} —${r.label ?? r.kind}→ ${target}`);
    }
  }
  return lines.join('\n');
}
