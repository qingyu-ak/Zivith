/// <reference types="vitest/globals" />
import {
  meteorDurationMs,
  meteorEffortFill,
  meteorMotion,
  meteorParticleCount,
  meteorSettleMs,
  meteorStarKind,
  meteorStarLayout,
  meteorCapsuleStars,
  meteorSlopeDrop,
  meteorStatusLabel,
  meteorTrailLength,
  nextMeteorPhase,
} from './meteor-motion';

describe('meteor motion tokens', () => {
  it('keeps Fast / Balanced / Deep distinct by trail, duration, and particles', () => {
    expect(meteorTrailLength('fast')).toBeLessThan(meteorTrailLength('balanced'));
    expect(meteorTrailLength('balanced')).toBeLessThan(meteorTrailLength('deep'));
    expect(meteorMotion.fast.duration).toBeLessThan(meteorMotion.balanced.duration);
    expect(meteorMotion.balanced.duration).toBeLessThan(meteorMotion.deep.duration);
    expect(meteorParticleCount('fast', false)).toBe(2);
    expect(meteorParticleCount('balanced', false)).toBe(4);
    expect(meteorParticleCount('deep', false)).toBe(8);
  });

  it('speeds star flow when Fast is on without adding particles', () => {
    expect(meteorDurationMs('deep', true)).toBeLessThan(meteorDurationMs('deep', false));
    expect(meteorDurationMs('balanced', true)).toBe(
      Math.round(meteorMotion.balanced.duration * meteorMotion.fastSpeed),
    );
    expect(meteorParticleCount('deep', false)).toBe(meteorMotion.deep.particleCount);
  });

  it('drops particles when reduced motion is on', () => {
    expect(meteorParticleCount('deep', true)).toBe(0);
  });

  it('lets stars appear first, then meteor only at Deep', () => {
    expect(meteorStarKind('fast')).toBe('twinkle');
    expect(meteorStarKind('balanced')).toBe('drift');
    expect(meteorStarKind('deep')).toBe('meteor');
    expect(meteorEffortFill('fast')).toBe('0%');
    expect(meteorEffortFill('deep')).toBe('100%');
    const stars = meteorStarLayout(4);
    expect(stars).toHaveLength(4);
    expect(stars[0]?.delayMs).toBeLessThan(stars[3]?.delayMs ?? 0);
    const capsule = meteorCapsuleStars(6, 3);
    const delays = capsule.map((star) => star.delayMs);
    expect(new Set(delays).size).toBeGreaterThan(3);
    expect(capsule.some((star) => star.durationScale !== capsule[0]?.durationScale)).toBe(true);
    for (const star of capsule) {
      expect(star.driftPx / star.travelPx).toBeCloseTo(meteorSlopeDrop(1), 1);
    }
  });

  it('settles shortly after thinking ends', () => {
    expect(meteorSettleMs()).toBe(
      meteorMotion.completion.duration + meteorMotion.completion.settleDuration,
    );
  });
});

describe('meteor thinking phase', () => {
  it('enters thinking while waiting for the first tokens', () => {
    expect(
      nextMeteorPhase('idle', {
        sending: true,
        hasStream: false,
        stopped: false,
        failed: false,
      }),
    ).toBe('thinking');
  });

  it('settles instead of vanishing when the reply starts', () => {
    expect(
      nextMeteorPhase('thinking', {
        sending: true,
        hasStream: true,
        stopped: false,
        failed: false,
      }),
    ).toBe('completing');
  });

  it('stops immediately on error or cancel', () => {
    expect(
      nextMeteorPhase('thinking', {
        sending: false,
        hasStream: false,
        stopped: false,
        failed: true,
      }),
    ).toBe('idle');
    expect(
      nextMeteorPhase('thinking', {
        sending: false,
        hasStream: false,
        stopped: true,
        failed: false,
      }),
    ).toBe('idle');
  });

  it('labels thinking, speaker, and chain-of-thought without a spinner phrase', () => {
    expect(meteorStatusLabel({ phase: 'idle' })).toBeNull();
    expect(meteorStatusLabel({ phase: 'thinking' })).toBe('正在思考…');
    expect(meteorStatusLabel({ phase: 'thinking', thinkingEnabled: true })).toBe(
      '正在深度思考…',
    );
    expect(meteorStatusLabel({ phase: 'thinking', speaker: '陈默' })).toBe('陈默正在说…');
  });
});
