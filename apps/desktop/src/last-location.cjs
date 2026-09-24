const fs = require('node:fs');
const path = require('node:path');

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const CHAT_HOME = /^\/creator-chats$/;
const CHAT_THREAD = new RegExp(`^/creator-chats/${UUID}$`);
const STUDIO_SURFACE = new RegExp(`^/projects/${UUID}/(world|chat)$`);

function pathnameFromRaw(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    let url;
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

function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

function parseRestorablePath(raw) {
  if (!raw) return null;
  const pathname = pathnameFromRaw(raw);
  if (!pathname) return null;
  const value = normalizePath(pathname);
  if (CHAT_HOME.test(value) || CHAT_THREAD.test(value) || STUDIO_SURFACE.test(value)) return value;
  return null;
}

function lastLocationFile(userData) {
  return path.join(userData, 'last-location.json');
}

function readLastPath(userData) {
  try {
    const parsed = JSON.parse(fs.readFileSync(lastLocationFile(userData), 'utf8'));
    return parseRestorablePath(typeof parsed?.path === 'string' ? parsed.path : null);
  } catch {
    return null;
  }
}

function writeLastPath(userData, raw) {
  const value = parseRestorablePath(raw);
  if (!value) return null;
  fs.writeFileSync(lastLocationFile(userData), `${JSON.stringify({ path: value })}\n`, 'utf8');
  return value;
}

function startupUrl(webUrl, userData) {
  const last = readLastPath(userData);
  if (!last) return webUrl;
  try {
    return new URL(last, webUrl.endsWith('/') ? webUrl : `${webUrl}/`).href;
  } catch {
    return webUrl;
  }
}

module.exports = {
  parseRestorablePath,
  readLastPath,
  writeLastPath,
  startupUrl,
};
