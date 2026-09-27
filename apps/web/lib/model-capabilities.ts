import type { ChatEffort } from './chat-composer';

export interface ModelCapabilities {
  /** Chain-of-thought / thinking mode. Hide the Deep control when false. */
  thinking: boolean;
  /** Selectable native context windows in tokens. Hide the control unless more than one. */
  contextWindows: number[];
  /** Slider stops for this model. Always 3, 4, or 5. */
  effortStops: 3 | 4 | 5;
}

const KNOWN: Record<string, Partial<ModelCapabilities>> = {
  'deepseek-v4-flash': { thinking: true, effortStops: 4 },
  'deepseek-v4-pro': { thinking: true, effortStops: 5 },
  'deepseek-reasoner': { thinking: true, effortStops: 5 },
  'deepseek-chat': { thinking: false, effortStops: 3 },
  'mock-text-v1': { thinking: false, effortStops: 3 },
};

const THINKING_NAME = /(^|[-_/.])(r1|reasoner|qwq|thinking)([-_/.]|$)/i;
const FIVE_STOP_NAME = /(^|[-_/.])(pro|reasoner|r1)([-_/.]|$)/i;

export interface EffortStop {
  label: string;
  effort: ChatEffort;
}

const EFFORT_STOPS: Record<3 | 4 | 5, EffortStop[]> = {
  3: [
    { label: '快速', effort: 'fast' },
    { label: '均衡', effort: 'balanced' },
    { label: '深度', effort: 'deep' },
  ],
  4: [
    { label: '快速', effort: 'fast' },
    { label: '均衡', effort: 'balanced' },
    { label: '高', effort: 'deep' },
    { label: '深度', effort: 'deep' },
  ],
  5: [
    { label: '快速', effort: 'fast' },
    { label: '均衡', effort: 'balanced' },
    { label: '高', effort: 'balanced' },
    { label: '极深', effort: 'deep' },
    { label: '最深', effort: 'deep' },
  ],
};

function inferEffortStops(id: string, thinking: boolean, known?: 3 | 4 | 5): 3 | 4 | 5 {
  if (known === 3 || known === 4 || known === 5) return known;
  if (FIVE_STOP_NAME.test(id)) return 5;
  if (thinking) return 4;
  return 3;
}

export function modelCapabilities(modelId: string): ModelCapabilities {
  const id = modelId.trim();
  const lower = id.toLowerCase();
  const short = lower.includes('/') ? lower.slice(lower.lastIndexOf('/') + 1) : lower;
  const known = KNOWN[id] ?? KNOWN[lower] ?? KNOWN[short];
  const thinking = known?.thinking ?? (THINKING_NAME.test(id) || THINKING_NAME.test(short));
  return {
    thinking,
    contextWindows: known?.contextWindows ?? [],
    effortStops: inferEffortStops(short || lower, thinking, known?.effortStops),
  };
}

export function modelEffortStops(modelId: string): EffortStop[] {
  return EFFORT_STOPS[modelCapabilities(modelId).effortStops];
}

export function clampStopIndex(index: number, count: number): number {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(index)));
}

export function stopFill(index: number, count: number): string {
  if (count <= 1 || index <= 0) return '0%';
  return `${(index / (count - 1)) * 100}%`;
}

/** Higher gears glow more. Deep thinking adds another step of brightness. */
export function starBrightness(index: number, count: number, thinking: boolean): number {
  const t = count <= 1 ? 1 : index / (count - 1);
  const depth = 0.32 + t * 0.48;
  return Math.min(1, thinking ? depth + 0.28 : depth);
}

export function hasContextWindowChoice(windows: number[]): boolean {
  return windows.length > 1;
}

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    const k = tokens / 1000;
    return `${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return String(tokens);
}

export function clampContextWindow(selected: number | null, windows: number[]): number | null {
  if (!hasContextWindowChoice(windows)) return null;
  if (selected != null && windows.includes(selected)) return selected;
  return windows[windows.length - 1] ?? null;
}
