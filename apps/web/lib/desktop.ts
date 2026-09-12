import { useEffect, useState } from 'react';

export interface ZivithDesktop {
  openDirectory: () => Promise<string | null>;
}

declare global {
  interface Window {
    zivithDesktop?: ZivithDesktop;
  }
}

/** 浏览器无法完成选文件夹时的说明。不要写仓库命令。 */
export const WEB_FOLDER_HINT =
  '浏览器拿不到真实磁盘路径。请使用 Zivith 桌面应用打开文件夹；已经打开过的世界可以从侧栏点选。';

export const WEB_CHAT_NEEDS_WORLD = '请先从左侧选择一个项目，或使用桌面应用打开新文件夹。';

export const WEB_CHAT_NEEDS_WORLD_EMPTY =
  '请先选择一个世界再发送。左侧点选已有项目，或新建一个世界。';

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && typeof window.zivithDesktop?.openDirectory === 'function';
}

/** 首屏与 SSR 一致（按网页）。Electron 注入的 API 只在挂载后可读。 */
export function useIsDesktopApp(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    setDesktop(isDesktopApp());
  }, []);
  return desktop;
}

export async function pickWorkspaceDirectory(): Promise<string | null> {
  if (!isDesktopApp() || !window.zivithDesktop) {
    throw new Error(WEB_FOLDER_HINT);
  }
  return window.zivithDesktop.openDirectory();
}

export function asWorkspacePath(record: Record<string, unknown>): string | null {
  const snake = record.workspace_path;
  const camel = record.workspacePath;
  if (typeof snake === 'string' && snake.trim()) return snake;
  if (typeof camel === 'string' && camel.trim()) return camel;
  return null;
}
