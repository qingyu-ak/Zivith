import type { JsonValue, Output, Shot, ShotState } from './types.js';

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(shot: Pick<Shot, 'id' | 'state'>, target: ShotState) {
    super('INVALID_STATE_TRANSITION', `镜头无法从 ${shot.state} 转换为 ${target}`, {
      shot_id: shot.id,
      from: shot.state,
      to: target,
    });
  }
}

export const SHOT_TRANSITIONS: Readonly<Record<ShotState, readonly ShotState[]>> = {
  draft: ['prompting'],
  prompting: ['generating', 'draft'],
  generating: ['review', 'draft'],
  review: ['approved', 'draft'],
  approved: [],
};

export function transitionShot<T extends Shot>(
  shot: T,
  target: ShotState,
  snapshot?: JsonValue,
): T {
  const allowed: readonly ShotState[] = SHOT_TRANSITIONS[shot.state];
  if (!allowed.includes(target)) {
    throw new InvalidStateTransitionError(shot, target);
  }
  if (target === 'approved' && snapshot === undefined) {
    throw new DomainError('APPROVAL_SNAPSHOT_REQUIRED', '批准镜头时必须保存解析快照');
  }
  return {
    ...shot,
    state: target,
    ...(target === 'approved' ? { approved_snapshot: snapshot as JsonValue } : {}),
    updated_at: new Date(),
  };
}

export function unfreezeShot<T extends Shot>(shot: T): T {
  if (shot.state !== 'approved') throw new InvalidStateTransitionError(shot, 'draft');
  return { ...shot, state: 'draft', approved_snapshot: null, updated_at: new Date() };
}

export function synchronizeShotWithOutputs<T extends Shot>(shot: T, outputs: readonly Output[]): T {
  if (shot.state === 'approved') return shot;
  if (outputs.some((output) => output.status === 'completed')) {
    if (shot.state !== 'generating') return shot;
    return transitionShot(shot, 'review');
  }
  const running = outputs.some(
    (output) => output.status === 'queued' || output.status === 'generating',
  );
  if (!running && shot.state === 'generating') return transitionShot(shot, 'draft');
  return shot;
}
