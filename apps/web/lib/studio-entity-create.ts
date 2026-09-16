import { api } from './api';
import { createWorldCharacter } from './create-world-character';
import type { WorldResourcesDTO, WorldSelection } from './types';
import { nextUntitledName, resolveCreateName } from './unique-name';
import { resolveDisplayDimensions } from './world-line';

export { nextUntitledName, resolveCreateName } from './unique-name';

export type StudioCreateKind =
  'character' | 'location' | 'scene' | 'story' | 'world_event' | 'relationship' | 'dimension';

export interface RelationshipCreateInput {
  kind: string;
  source: { type: 'asset' | 'scene' | 'world_event' | 'story'; id: string };
  target: { type: 'asset' | 'scene' | 'world_event' | 'story'; id: string };
  label?: string;
}

export interface StudioCreateExtras {
  relationship?: RelationshipCreateInput;
  name?: string;
}

function createdId(value: unknown, fallbackMessage: string): string {
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = value.id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  throw new Error(fallbackMessage);
}

export async function createStudioEntity(
  projectId: string,
  resources: WorldResourcesDTO,
  kind: StudioCreateKind,
  extras?: StudioCreateExtras,
): Promise<Exclude<WorldSelection, null>> {
  switch (kind) {
    case 'character': {
      const created = await createWorldCharacter({
        projectId,
        name: extras?.name ?? '',
        existingNames: resources.entities.characters.map((item) => item.name),
      });
      return { kind: 'character', id: created.id };
    }
    case 'location': {
      const name = resolveCreateName(
        resources.entities.locations.map((item) => item.name),
        extras?.name,
        '未命名地点',
      );
      const created = await api(`/projects/${projectId}/assets`, {
        method: 'POST',
        body: {
          asset_type: 'location',
          name,
          description: '（待补充）',
          state: 'draft',
        },
      });
      return { kind: 'location', id: createdId(created, '地点已创建，但未返回编号') };
    }
    case 'story': {
      const title = resolveCreateName(
        resources.entities.stories.map((item) => item.title),
        extras?.name,
        '未命名故事',
      );
      const created = await api(`/projects/${projectId}/stories`, {
        method: 'POST',
        body: { title },
      });
      return { kind: 'story', id: createdId(created, '故事已创建，但未返回编号') };
    }
    case 'scene': {
      let storyId = resources.entities.stories[0]?.id;
      if (!storyId) {
        const story = await api(`/projects/${projectId}/stories`, {
          method: 'POST',
          body: { title: nextUntitledName([], '故事 1') },
        });
        storyId = createdId(story, '需要先有一个故事才能建场景');
      }
      const title = resolveCreateName(
        resources.entities.scenes.map((item) => item.title),
        extras?.name,
        '未命名场景',
      );
      const created = await api(`/stories/${storyId}/scenes`, {
        method: 'POST',
        body: { title },
      });
      return { kind: 'scene', id: createdId(created, '场景已创建，但未返回编号') };
    }
    case 'world_event': {
      const title = resolveCreateName(
        resources.entities.world_events.map((item) => item.title),
        extras?.name,
        '未命名事件',
      );
      const created = await api(`/world/projects/${projectId}/world-events`, {
        method: 'POST',
        body: { title },
      });
      return { kind: 'world_event', id: createdId(created, '事件已创建，但未返回编号') };
    }
    case 'relationship': {
      const input = extras?.relationship;
      if (!input) throw new Error('新建关系需要选择起点和终点');
      if (input.source.id === input.target.id && input.source.type === input.target.type) {
        throw new Error('关系的两端不能是同一个实体');
      }
      const created = await api(`/world/projects/${projectId}/relationships`, {
        method: 'POST',
        body: {
          kind: input.kind.trim() || 'related',
          source: input.source,
          target: input.target,
          direction: 'directed',
          label: input.label?.trim() || null,
        },
      });
      return { kind: 'relationship', id: createdId(created, '关系已创建，但未返回编号') };
    }
    case 'dimension': {
      const dimensions = resolveDisplayDimensions(resources);
      const created = {
        id: `dim-${Date.now()}`,
        label: resolveCreateName(
          dimensions.map((item) => item.label),
          extras?.name,
          '未命名维度',
        ),
        kind: 'custom' as const,
      };
      await api(`/world/projects/${projectId}/timeline`, {
        method: 'PATCH',
        body: { temporal_dimensions: [...dimensions, created] },
      });
      return { kind: 'dimension', id: created.id };
    }
    default:
      throw new Error('这类实体暂不支持在 Studio 新建');
  }
}
