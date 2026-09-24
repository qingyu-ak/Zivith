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

function requireThread(value: unknown, failed: string): CreatorChatThreadDTO {
  const thread = normalizeThread(value);
  if (!thread?.id) throw new Error(failed);
  return thread;
}

/** 从零创建世界：没有指定路径时，在默认目录下自动建同名文件夹并写入 .zivith/workspace.json。 */
export async function createScratchWorld(input: {
  name: string;
  description?: string | null;
  folderPath?: string;
}): Promise<CreatorChatThreadDTO> {
  const name = input.name.trim();
  if (!name) throw new Error('请填写世界名称');
  const description = input.description?.trim() || null;
  let folderPath = input.folderPath?.trim();
  if (!folderPath) {
    const allocated = await api<{ path: string }>('/world/folders/allocate', {
      method: 'POST',
      body: { name },
    });
    folderPath = allocated.path?.trim();
    if (!folderPath) throw new Error('无法准备世界文件夹');
  }

  if (folderPath) {
    const created = await createWorldInFolderRequest(folderPath, {
      name,
      description,
    });
    return requireThread(created, '无法创建世界');
  }
  throw new Error('无法准备世界文件夹');
}
