import { useCallback, useEffect, useState } from 'react';

export const WORKSPACE_LAYOUT_KEYS = {
  leftWidth: 'zivith.worldLeftWidth',
  rightWidth: 'zivith.worldRightWidth',
  dockHeight: 'zivith.worldDockHeight',
  dockCopilot: 'zivith.worldDockCopilotOpen',
  dockMemory: 'zivith.worldDockMemoryOpen',
  dockImport: 'zivith.worldDockImportOpen',
  agentPanelOpen: 'zivith.studioAgentPanelOpen',
} as const;

export function clampPx(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readStoredPx(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return clampPx(parsed, min, max);
}

function readStoredFlag(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === '1';
}

export function usePersistedPx(
  key: string,
  fallback: number,
  min: number,
  max: number,
): [number, (value: number | ((current: number) => number)) => void] {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    setValue(readStoredPx(key, fallback, min, max));
  }, [fallback, key, max, min]);

  const update = useCallback(
    (next: number | ((current: number) => number)) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? next(current) : next;
        const clamped = clampPx(resolved, min, max);
        window.localStorage.setItem(key, String(clamped));
        return clamped;
      });
    },
    [key, max, min],
  );

  return [value, update];
}

export function usePersistedFlag(key: string, fallback: boolean): [boolean, () => void] {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    setValue(readStoredFlag(key, fallback));
  }, [fallback, key]);

  const toggle = useCallback(() => {
    setValue((current) => {
      const next = !current;
      window.localStorage.setItem(key, next ? '1' : '0');
      return next;
    });
  }, [key]);

  return [value, toggle];
}
