const fs = require('node:fs');
const path = require('node:path');

/** 与 web `appearance-theme.ts` / `globals.css` 的 --z-bg 对齐。 */
const LIGHT = { backgroundColor: '#ffffff' };
const DARK = { backgroundColor: '#18181b' };

function asAppearanceTheme(value) {
  return value === 'dark' ? 'dark' : 'light';
}

function chromeForTheme(theme) {
  return asAppearanceTheme(theme) === 'dark' ? DARK : LIGHT;
}

function appearanceFile(userData) {
  return path.join(userData, 'appearance-theme.json');
}

function readAppearanceTheme(userData) {
  try {
    const parsed = JSON.parse(fs.readFileSync(appearanceFile(userData), 'utf8'));
    return asAppearanceTheme(parsed?.theme);
  } catch {
    return 'light';
  }
}

function writeAppearanceTheme(userData, theme) {
  const next = asAppearanceTheme(theme);
  fs.writeFileSync(appearanceFile(userData), `${JSON.stringify({ theme: next })}\n`, 'utf8');
  return next;
}

function applyWindowAppearance(win, theme) {
  if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return;
  const chrome = chromeForTheme(theme);
  if (typeof win.setBackgroundColor === 'function') {
    win.setBackgroundColor(chrome.backgroundColor);
  }
}

module.exports = {
  LIGHT,
  DARK,
  asAppearanceTheme,
  chromeForTheme,
  readAppearanceTheme,
  writeAppearanceTheme,
  applyWindowAppearance,
};
