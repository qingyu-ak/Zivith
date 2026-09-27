const LAST_LOCATION_KEY = 'zivith.lastLocation';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const CHAT_HOME = /^\/creator-chats$/;
const CHAT_THREAD = new RegExp(`^/creator-chats/${UUID}$`);
const STUDIO_SURFACE = new RegExp(`^/projects/${UUID}/(world|chat)$`);

function pathnameFromRaw(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return null;
    return url.pathname;
  }
  if (!trimmed.startsWith('/')) return null;
  return trimmed.split(/[?#]/, 1)[0] ?? trimmed;
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

/** 关应用再开允许回到的路径。外站、登录、新建向导、设置、制作页都不记。 */
export function parseRestorablePath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const pathname = pathnameFromRaw(raw);
  if (!pathname) return null;
  const path = normalizePath(pathname);
  if (CHAT_HOME.test(path) || CHAT_THREAD.test(path) || STUDIO_SURFACE.test(path)) return path;
  return null;
}

export function persistLastLocation(pathname: string): string | null {
  const path = parseRestorablePath(pathname);
  if (!path) return null;
  if (typeof window === 'undefined') return path;
  window.localStorage.setItem(LAST_LOCATION_KEY, path);
  const desktop = window.zivithDesktop;
  if (desktop?.persistLocation) void desktop.persistLocation(path);
  return path;
}

export function readLastLocation(): string | null {
  if (typeof window === 'undefined') return null;
  return parseRestorablePath(window.localStorage.getItem(LAST_LOCATION_KEY));
}

export { LAST_LOCATION_KEY };
