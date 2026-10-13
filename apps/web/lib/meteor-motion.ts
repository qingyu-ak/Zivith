import type { ChatEffort } from './chat-composer';

/** Product blue used when Fast is on. */
export const METEOR_BLUE = '#4d6bfe';

/** Logo bars sit at 48° off horizontal. Meteors run back along that slope. */
export const LOGO_METEOR_DEG = 48;

export function meteorSlopeDrop(runPx: number): number {
  return runPx * Math.tan((LOGO_METEOR_DEG * Math.PI) / 180);
}

/**
 * Central motion tokens for the Zivith meteor.
 * Components must not scatter durations or particle counts.
 */
export const meteorMotion = {
  fast: {
    duration: 900,
    trailLength: 0.35,
    particleCount: 2,
  },
  balanced: {
    duration: 1800,
    trailLength: 0.6,
    particleCount: 4,
  },
  deep: {
    duration: 2800,
    trailLength: 1,
    particleCount: 8,
  },
  completion: {
    duration: 450,
    settleDuration: 250,
  },
  /** Duration multiplier when Fast is on (smaller = faster star flow). */
  fastSpeed: 0.55,
} as const;

export type MeteorPhase = 'idle' | 'thinking' | 'completing';
export type MeteorFieldPhase = MeteorPhase | 'preview';

export function meteorDurationMs(effort: ChatEffort, fast: boolean): number {
  const base = meteorMotion[effort].duration;
  return Math.round(base * (fast ? meteorMotion.fastSpeed : 1));
}

export function meteorParticleCount(effort: ChatEffort, reduced: boolean): number {
  if (reduced) return 0;
  return meteorMotion[effort].particleCount;
}

export function meteorTrailLength(effort: ChatEffort): number {
  return meteorMotion[effort].trailLength;
}

export type MeteorStarKind = 'twinkle' | 'drift' | 'meteor';

export function meteorStarKind(effort: ChatEffort): MeteorStarKind {
  if (effort === 'deep') return 'meteor';
  if (effort === 'balanced') return 'drift';
  return 'twinkle';
}

export function meteorEffortFill(effort: ChatEffort): string {
  if (effort === 'fast') return '0%';
  if (effort === 'balanced') return '50%';
  return '100%';
}

export function meteorEffortAccent(effort: ChatEffort): string {
  return effort === 'deep' ? '#7c5cff' : METEOR_BLUE;
}

export interface MeteorStarPose {
  left: string;
  top: string;
  delayMs: number;
  sizePx: number;
  durationScale: number;
  travelPx: number;
  driftPx: number;
  /** Perpendicular bow, in px. Zero keeps a straight slope. */
  arcX: number;
  arcY: number;
  /** 0–1. Dimmer stars stay quieter than the bright ones. */
  glow: number;
  tailPx: number;
}

function unit(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Stars that enter the right of the effort capsule and cross it. */
export function meteorCapsuleStars(count: number, seed = 1): MeteorStarPose[] {
  return Array.from({ length: count }, (_, index) => {
    const along = unit(seed * 17 + index * 13 + 1);
    const band = index % 3;
    const left = band === 0 ? 74 + along * 24 : band === 1 ? 42 + along * 30 : 12 + along * 28;
    const wait = unit(seed * 29 + index * 19 + 5);
    const size = unit(seed * 41 + index * 7 + 3);
    const pace = unit(seed * 53 + index * 11 + 9);
    const glow = unit(seed * 61 + index * 37 + 4);
    const tail = unit(seed * 71 + index * 19 + 6);
    const run = 40 + unit(seed * 23 + index * 31 + 2) * 6;
    const drop = meteorSlopeDrop(run);
    const arc = index === seed % Math.max(count, 1);
    const bow = arc ? 3.2 : 0;
    const sin = Math.sin((LOGO_METEOR_DEG * Math.PI) / 180);
    const cos = Math.cos((LOGO_METEOR_DEG * Math.PI) / 180);
    return {
      left: `${left}%`,
      top: '0%',
      delayMs: Math.round(wait * 1600),
      sizePx: 2.2 + size * 1.4,
      durationScale: 0.82 + pace * 0.28,
      travelPx: Math.round(run),
      driftPx: Math.round(drop),
      arcX: Math.round(-bow * sin * 10) / 10,
      arcY: Math.round(-bow * cos * 10) / 10,
      glow: 0.86 + glow * 0.14,
      tailPx: Math.round(6 + tail * 18),
    };
  });
}

export function meteorTrackStars(count: number, seed = 1): MeteorStarPose[] {
  return Array.from({ length: count }, (_, index) => {
    const along = unit(seed * 11 + index * 17 + 4);
    const lane = unit(seed * 19 + index * 23 + 6);
    const wait = unit(seed * 31 + index * 13 + 2);
    const size = unit(seed * 47 + index * 29 + 8);
    return {
      left: `${8 + along * 78}%`,
      top: `${24 + lane * 52}%`,
      delayMs: Math.round(wait * 1200),
      sizePx: 1.5 + size * 2.2,
      durationScale: 0.75 + unit(seed + index * 59) * 0.6,
      travelPx: 0,
      driftPx: 0,
      arcX: 0,
      arcY: 0,
      glow: 1,
      tailPx: 0,
    };
  });
}

/** Deterministic sparkles along the track: they appear in place, then may streak. */
export function meteorStarLayout(count: number): MeteorStarPose[] {
  return Array.from({ length: count }, (_, index) => {
    const t = count <= 1 ? 0.42 : index / (count - 1);
    const lane = index % 3;
    const top = lane === 0 ? 28 : lane === 1 ? 50 : 72;
    return {
      left: `${10 + t * 76}%`,
      top: `${top}%`,
      delayMs: Math.round(t * 520),
      sizePx: index % 2 === 0 ? 9 : 6,
      durationScale: 1,
      travelPx: 0,
      driftPx: 0,
      arcX: 0,
      arcY: 0,
      glow: 1,
      tailPx: 0,
    };
  });
}

export function stopParticleCount(index: number, count: number, reduced: boolean): number {
  if (reduced) return 0;
  const t = count <= 1 ? 1 : index / Math.max(1, count - 1);
  return Math.round(3 + t * 10);
}

export function meteorSettleMs(): number {
  return meteorMotion.completion.duration + meteorMotion.completion.settleDuration;
}

export function nextMeteorPhase(
  current: MeteorPhase,
  input: {
    sending: boolean;
    hasStream: boolean;
    stopped: boolean;
    failed: boolean;
  },
): MeteorPhase {
  if (input.failed && !input.sending) return 'idle';
  if (input.stopped && !input.sending) return 'idle';
  if (input.sending && !input.hasStream) return 'thinking';
  if (current === 'thinking' && (input.hasStream || !input.sending)) return 'completing';
  if (current === 'completing') return 'completing';
  return 'idle';
}

export function meteorStatusLabel(input: {
  phase: MeteorPhase;
  speaker?: string;
  thinkingEnabled?: boolean;
}): string | null {
  if (input.phase === 'idle') return null;
  if (input.speaker?.trim()) return `${input.speaker.trim()}正在说…`;
  if (input.thinkingEnabled) return '正在深度思考…';
  return '正在思考…';
}
