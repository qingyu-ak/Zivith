import { api } from './api';

export const TXT_MAX_BYTES = 20 * 1024 * 1024;

export interface TxtWorldPreview {
  suggested_name: string;
  chapter_count: number;
  characters: Array<{
    name: string;
    aliases?: string[];
    mentions?: number;
    tier?: 'full' | 'light';
  }>;
  locations: Array<{ name: string }>;
  events: Array<{ title: string; chapter_index?: number }>;
  relationships: Array<{ source: string; target: string }>;
  worldview_highlights: string[];
  skipped: string[];
  memory_estimate: number;
}

function asId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export function isAbortError(reason: unknown): boolean {
  return (
    (reason instanceof DOMException && reason.name === 'AbortError') ||
    (reason instanceof Error && reason.name === 'AbortError')
  );
}

export function assertTxtFile(file: File): void {
  if (!file.name.toLowerCase().endsWith('.txt')) {
    throw new Error('请选择 .txt 文件');
  }
  if (file.size === 0) {
    throw new Error('这个文件是空的，请换一份小说文本');
  }
  if (file.size > TXT_MAX_BYTES) {
    throw new Error('文件不能超过 20MB');
  }
}

export async function previewNovelTxt(file: File, signal?: AbortSignal): Promise<TxtWorldPreview> {
  assertTxtFile(file);
  const form = new FormData();
  form.append('file', file);
  return api<TxtWorldPreview>('/novel-imports/preview', {
    method: 'POST',
    body: form,
    signal,
  });
}

export async function commitWorldFromTxt(input: {
  name: string;
  file: File;
}): Promise<{ projectId: string }> {
  const name = input.name.trim();
  if (!name) throw new Error('请填写世界名称');
  const project = await api<unknown>('/projects', {
    method: 'POST',
    body: { name },
  });
  const projectId = asId(project);
  if (!projectId) throw new Error('无法创建世界');
  try {
    const form = new FormData();
    form.append('project_id', projectId);
    form.append('file', input.file);
    await api('/novel-imports', { method: 'POST', body: form });
    return { projectId };
  } catch (error) {
    try {
      await api(`/projects/${projectId}`, { method: 'DELETE' });
    } catch {
      throw new Error('没能写入小说内容。已留下不完整的世界，请到世界列表删除后重试。');
    }
    throw error;
  }
}
