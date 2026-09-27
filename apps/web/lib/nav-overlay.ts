import { navigationHistoryFor } from './navigation-history';
import { clearSettingsReturn, readSettingsReturn } from './settings-return';

/** 设置 / 帮助 / 登录是覆盖层：返回应落到进入前的 Chat 或 Studio 页。 */
export function isNavOverlay(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0] ?? path;
  return (
    pathname.includes('/settings') ||
    pathname === '/help' ||
    pathname === '/login' ||
    pathname === '/register'
  );
}

/** 先走全局浏览栈，没有记录再用进入覆盖层时记下的路径。 */
export function resolveOverlayReturn(fallback: string): string {
  const previous = navigationHistoryFor().backLeaving(isNavOverlay);
  if (previous) {
    clearSettingsReturn();
    return previous;
  }
  const origin = readSettingsReturn();
  if (origin) {
    clearSettingsReturn();
    return origin;
  }
  return fallback;
}
