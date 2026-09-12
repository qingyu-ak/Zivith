import { api, ApiError } from './api';

/**
 * 世界文件夹统一流程（docs/planning/world-folder-v1.md §7/§8/§18）。
 *
 * 打开/导入永远先检查 `.zivith/workspace.json`，再按检查结果引导用户做出
 * 明确选择；API 层不静默降级，这里负责把异常状态翻译成确认对话框。
 */

export interface FolderInspect {
  path: string;
  state: 'ok' | 'not_a_world' | 'corrupt';
  world_id: string | null;
  name: string | null;
}

export interface OpenFolderOptions {
  on_missing?: 'import';
  on_corrupt?: 'recover';
  on_orphan?: 'create';
  rebind_project_id?: string;
}

/** 用户在确认/命名对话框里取消：调用方应静默返回，不当作错误展示。 */
export class FolderFlowCancelled extends Error {
  constructor() {
    super('已取消');
    this.name = 'FolderFlowCancelled';
  }
}

/** 从 web ApiError.details（{error:{code}}）里提取后端错误码。 */
export function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const details = error.details as { error?: { code?: unknown } } | undefined;
  const code = details?.error?.code;
  return typeof code === 'string' ? code : null;
}

export async function inspectWorldFolder(path: string): Promise<FolderInspect> {
  return api<FolderInspect>('/world/folders/inspect', { method: 'POST', body: { path } });
}

export async function openWorldFolderRequest(
  path: string,
  options: OpenFolderOptions = {},
): Promise<unknown> {
  return api<unknown>('/world/folders/open', {
    method: 'POST',
    body: { path, ...options },
  });
}

export async function createWorldInFolderRequest(path: string, name?: string): Promise<unknown> {
  const trimmed = name?.trim();
  return api<unknown>('/world/folders/create', {
    method: 'POST',
    body: trimmed ? { path, name: trimmed } : { path },
  });
}

/** §19 [移除本机绑定]：保留世界数据，只清除与本机文件夹的路径关联。 */
export async function unbindProjectWorkspace(projectId: string): Promise<void> {
  await api(`/projects/${projectId}/workspace`, { method: 'DELETE' });
}

export interface FolderFlowDialogs {
  confirm(message: string): boolean | Promise<boolean>;
}

const browserDialogs: FolderFlowDialogs = {
  confirm: (message) => window.confirm(message),
};

/**
 * 桌面端「打开文件夹」统一入口：检查 → 按状态对话确认 → open/create。
 * 成功返回 thread DTO（含 project_id / thread_id）；用户取消抛 FolderFlowCancelled。
 */
export async function openWorldFromFolder(
  folderPath: string,
  options: { rebindProjectId?: string; dialogs?: FolderFlowDialogs } = {},
): Promise<unknown> {
  const dialogs = options.dialogs ?? browserDialogs;
  if (options.rebindProjectId) {
    return openWorldFolderRequest(folderPath, { rebind_project_id: options.rebindProjectId });
  }

  const inspect = await inspectWorldFolder(folderPath);

  // §18.1 文件夹没有 .zivith/：[打开/导入为新世界] / [取消]。
  // 走 on_missing=import 而不是 /folders/create：数据库（含归档）仍绑着该路径时
  // 由服务端收回原绑定；否则才导入为新世界。走 create 会在已有绑定时卡死。
  if (inspect.state === 'not_a_world') {
    const confirmed = await dialogs.confirm(
      '这不是一个 Zivith 世界。\n\n要把它作为世界工作区打开吗？\n本机已有绑定会自动收回；没有绑定时将导入为新的世界。',
    );
    if (!confirmed) throw new FolderFlowCancelled();
    return openWorldFolderRequest(folderPath, { on_missing: 'import' });
  }

  // §18.2 workspace.json 损坏：[恢复] / [取消]。
  if (inspect.state === 'corrupt') {
    const confirmed = await dialogs.confirm(
      'Zivith 世界配置文件无法读取。\n\n要尝试按文件夹路径恢复这个世界吗？',
    );
    if (!confirmed) throw new FolderFlowCancelled();
    return openWorldFolderRequest(folderPath, { on_corrupt: 'recover' });
  }

  // §8 正常世界；worldId 在本机无运行数据时提供 §18.3 [创建运行副本]
  //（沿用文件 worldId 建本机运行数据，不改写文件身份）。
  // [重新绑定] 走项目卡的「绑定文件夹 / 重新定位」（rebind_project_id）。
  try {
    return await openWorldFolderRequest(folderPath);
  } catch (error) {
    if (apiErrorCode(error) !== 'WORLD_NOT_FOUND') throw error;
    const confirmed = await dialogs.confirm(
      '这个世界文件存在，但当前本机没有对应的运行数据。\n\n要创建一个运行副本吗？（沿用文件中的世界身份）',
    );
    if (!confirmed) throw new FolderFlowCancelled();
    return openWorldFolderRequest(folderPath, { on_orphan: 'create' });
  }
}
