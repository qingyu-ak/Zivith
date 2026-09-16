import type { WorldResourcesDTO } from '../types';

/** Zivith API 的极简客户端（与 apps/web/lib/api.ts 同一套约定） */

export interface ApiProject {
  id: string;
  name: string;
  description?: string | null;
}

const PROXY_BASE = '/zivith-api/api/v1';
const DEFAULT_BASE = 'http://127.0.0.1:4000';

export const LS_API_BASE = 'cosmos_zivith_base';
export const LS_API_TOKEN = 'cosmos_zivith_token';

/** 默认走 vite 代理（同源免 CORS）；填了其它地址则直连 */
export function resolveApiRoot(customBase: string): string {
  const base = customBase.trim().replace(/\/+$/, '');
  if (!base || base === DEFAULT_BASE || base === 'http://localhost:4000') {
    return PROXY_BASE;
  }
  return `${base}/api/v1`;
}

export async function zivithFetch<T>(base: string, token: string, path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${resolveApiRoot(base)}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch {
    throw new Error('无法连接 API，请确认 Zivith API 已在 4000 端口运行');
  }
  if (res.status === 401) {
    throw new Error('token 无效或已过期，请在 Zivith Studio 页面重新复制（见下方说明）');
  }
  if (res.status === 404) {
    throw new Error('接口不存在（404），请检查 API 地址是否指向 Zivith 后端');
  }
  if (!res.ok) {
    throw new Error(`请求失败（HTTP ${res.status}）`);
  }
  return (await res.json()) as T;
}

export function listProjects(base: string, token: string): Promise<ApiProject[]> {
  return zivithFetch<ApiProject[]>(base, token, '/projects');
}

export function getWorldResources(
  base: string,
  token: string,
  projectId: string,
): Promise<WorldResourcesDTO> {
  return zivithFetch<WorldResourcesDTO>(base, token, `/world/projects/${projectId}/resources`);
}
