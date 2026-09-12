const SETTINGS_RETURN_KEY = 'zivith.settingsReturnTo';

let memory: string | null = null;

function currentLocation(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}`;
}

function persist(value: string | null) {
  memory = value;
  if (typeof window === 'undefined') return;
  if (value) window.sessionStorage.setItem(SETTINGS_RETURN_KEY, value);
  else window.sessionStorage.removeItem(SETTINGS_RETURN_KEY);
}

/** 点进设置前记下当前界面；已在设置页内则不覆盖。 */
export function captureSettingsReturn(path?: string) {
  const value = path ?? currentLocation();
  if (!value || value.includes('/settings')) return;
  persist(value);
}

export function readSettingsReturn(): string | null {
  if (memory) return memory;
  if (typeof window === 'undefined') return null;
  const stored = window.sessionStorage.getItem(SETTINGS_RETURN_KEY);
  if (stored) memory = stored;
  return memory;
}

export function clearSettingsReturn() {
  persist(null);
}
