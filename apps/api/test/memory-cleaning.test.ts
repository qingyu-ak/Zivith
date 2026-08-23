import { describe, expect, it } from 'vitest';
import { decideAtomAction } from '../src/contexts/memory/cleaning.js';

const incoming = { dedupHash: 'h-new', content: '林澈性格冷静', factType: 'trait' };

describe('decideAtomAction', () => {
  it('NOOP on exact fingerprint duplicate', () => {
    expect(
      decideAtomAction({
        incoming: { ...incoming, dedupHash: 'h-1' },
        candidates: [{ atom: { id: 'a1', content: '林澈性格冷静。', dedupHash: 'h-1' }, similarity: 0.5 }],
      }),
    ).toEqual({ op: 'NOOP', reason: 'duplicate' });
  });

  it('CONFLICT on antonym clash', () => {
    expect(
      decideAtomAction({
        incoming,
        candidates: [{ atom: { id: 'a1', content: '林澈性格阴郁', dedupHash: 'h-1' }, similarity: 0.3 }],
      }),
    ).toMatchObject({ op: 'CONFLICT', conflictAtomId: 'a1' });
  });

  it('UPDATE merges near-duplicate (similarity >= 0.85)', () => {
    expect(
      decideAtomAction({
        incoming: { ...incoming, content: '林澈性格冷静，为人低调' },
        candidates: [{ atom: { id: 'a1', content: '林澈性格冷静', dedupHash: 'h-1' }, similarity: 0.9 }],
      }),
    ).toEqual({ op: 'UPDATE', supersedeAtomId: 'a1' });
  });

  it('ADD when nothing matches; conflict wins over merge', () => {
    expect(decideAtomAction({ incoming, candidates: [] })).toEqual({ op: 'ADD' });
    expect(
      decideAtomAction({
        incoming,
        candidates: [{ atom: { id: 'a1', content: '林澈性格阴郁', dedupHash: 'h-1' }, similarity: 0.86 }],
      }),
    ).toMatchObject({ op: 'CONFLICT' });
  });
});
