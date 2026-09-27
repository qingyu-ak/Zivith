'use client';

import { useEffect, useState } from 'react';
import type { ChatEffort } from '@/lib/chat-composer';
import {
  meteorDurationMs,
  meteorParticleCount,
  meteorSettleMs,
  meteorStarKind,
  meteorStarLayout,
  meteorCapsuleStars,
  meteorTrackStars,
  meteorTrailLength,
  nextMeteorPhase,
  type MeteorFieldPhase,
  type MeteorPhase,
} from '@/lib/meteor-motion';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function useMeteorPhase({
  sending,
  hasStream,
  stopped,
  failed,
}: {
  sending: boolean;
  hasStream: boolean;
  stopped: boolean;
  failed: boolean;
}): MeteorPhase {
  const [phase, setPhase] = useState<MeteorPhase>('idle');

  useEffect(() => {
    setPhase((current) =>
      nextMeteorPhase(current, { sending, hasStream, stopped, failed }),
    );
  }, [sending, hasStream, stopped, failed]);

  useEffect(() => {
    if (phase !== 'completing') return;
    const timer = window.setTimeout(() => setPhase('idle'), meteorSettleMs());
    return () => window.clearTimeout(timer);
  }, [phase]);

  return phase;
}

/** Three diagonal bars matching the Zivith mark. Motion travels top-right → bottom-left. */
export function MeteorMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden>
      <g fill="currentColor" transform="rotate(-48 16 16)">
        <rect x="8" y="8.6" width="16" height="3.1" rx="1.55" />
        <rect x="3.5" y="14.45" width="25" height="3.3" rx="1.65" />
        <rect x="10" y="20.4" width="12.5" height="2.9" rx="1.45" />
      </g>
    </svg>
  );
}

export function MeteorField({
  effort,
  fast,
  phase,
  reduced,
  size = 'status',
  brightness = 1,
  seed = 1,
  particles,
}: {
  effort: ChatEffort;
  fast: boolean;
  phase: MeteorFieldPhase;
  reduced: boolean;
  size?: 'status' | 'slider' | 'capsule';
  brightness?: number;
  seed?: number;
  particles?: number;
}) {
  const duration = meteorDurationMs(effort, fast);
  const count =
    particles ?? (phase === 'idle' && size === 'status' ? 0 : meteorParticleCount(effort, reduced));
  const kind = size === 'capsule' ? 'meteor' : meteorStarKind(effort);
  const stars =
    size === 'capsule'
      ? meteorCapsuleStars(count, seed)
      : size === 'slider'
        ? meteorTrackStars(count, seed)
        : meteorStarLayout(count);

  return (
    <span
      className="meteor-field"
      data-effort={effort}
      data-fast={fast ? 'on' : 'off'}
      data-kind={kind}
      data-phase={phase}
      data-reduced={reduced ? 'true' : 'false'}
      data-size={size}
      style={{
        ['--meteor-duration' as string]: `${duration}ms`,
        ['--meteor-trail' as string]: String(meteorTrailLength(effort)),
        ['--star-bright' as string]: String(brightness),
      }}
      aria-hidden
    >
      {size === 'status' ? <MeteorMark className="meteor-mark" /> : null}
      {!reduced &&
        stars.map((star, index) =>
          size === 'capsule' ? (
            <span
              key={index}
              className={`meteor-flight${star.arcX || star.arcY ? ' is-arc' : ''}`}
              style={{
                left: star.left,
                top: star.top,
                animationDelay: `${star.delayMs}ms`,
                animationDuration: `${Math.round(duration * star.durationScale)}ms`,
                ['--star-travel' as string]: `${-star.travelPx}px`,
                ['--star-drift' as string]: `${star.driftPx}px`,
                ['--arc-x' as string]: `${star.arcX}px`,
                ['--arc-y' as string]: `${star.arcY}px`,
                ['--tail' as string]: `${star.tailPx}px`,
                ['--star-bright' as string]: String(star.glow),
              }}
            >
              <span className="meteor-tail" />
              <span
                className="meteor-head"
                style={{ width: star.sizePx, height: star.sizePx }}
              />
            </span>
          ) : (
            <span key={index} className="meteor-star-slot" style={{ left: star.left, top: star.top }}>
              <span
                className="meteor-star"
                style={{
                  width: star.sizePx,
                  height: star.sizePx,
                  animationDelay: `${star.delayMs}ms`,
                  animationDuration: `${Math.round(duration * star.durationScale)}ms`,
                  ['--star-travel' as string]: `${-star.travelPx}px`,
                  ['--star-drift' as string]: `${star.driftPx}px`,
                }}
              />
            </span>
          ),
        )}
    </span>
  );
}
