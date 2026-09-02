export interface ZivithDesktop {
  openDirectory: () => Promise<string | null>;
}

declare global {
  interface Window {
    zivithDesktop?: ZivithDesktop;
  }
}

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && typeof window.zivithDesktop?.openDirectory === 'function';
}

export async function pickWorkspaceDirectory(): Promise<string | null> {
  if (!isDesktopApp() || !window.zivithDesktop) {
    throw new Error('请用桌面应用选择文件夹（仓库根目录运行 pnpm desktop）');
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
