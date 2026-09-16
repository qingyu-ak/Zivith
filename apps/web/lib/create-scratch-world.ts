import { api } from './api';
import { normalizeThread } from './creator-chat-nav';
import type { CreatorChatThreadDTO } from './types';
import { createWorldInFolderRequest } from './world-folder';

export const NEW_WORLD_HREF = '/projects/new';

export function worldBuilderHref(threadId: string): string {
  return `/creator-chats/${threadId}`;
}

export function worldStudioHref(projectId: string): string {
  return `/projects/${projectId}/world`;
}

function asId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function requireThread(value: unknown, failed: string): CreatorChatThreadDTO {
  const thread = normalizeThread(value);
  if (!thread?.id) throw new Error(failed);
  return thread;
}

/** 从零创建世界：无文件夹走 POST /projects，有文件夹走已有 folders/create。都打开 World Builder 线程。 */
export async function createScratchWorld(input: {
  name: string;
  description?: string | null;
  folderPath?: string;
}): Promise<CreatorChatThreadDTO> {
  const name = input.name.trim();
  if (!name) throw new Error('请填写世界名称');
  const description = input.description?.trim() || null;
  const folderPath = input.folderPath?.trim();

  if (folderPath) {
    const created = await createWorldInFolderRequest(folderPath, {
      name,
      description,
    });
    return requireThread(created, '无法创建世界');
  }

  const project = await api<unknown>('/projects', {
    method: 'POST',
    body: {
      name,
      ...(description ? { description } : {}),
    },
  });
  const projectId = asId(project);
  if (!projectId) throw new Error('无法创建世界');
  const created = await api<unknown>('/world/creator-chats', {
    method: 'POST',
    body: { project_id: projectId },
  });
  const thread = requireThread(created, '世界已创建，但没能打开对话。请从项目列表进入。');
  if (!thread.project_id) {
    return { ...thread, project_id: projectId };
  }
  return thread;
}
