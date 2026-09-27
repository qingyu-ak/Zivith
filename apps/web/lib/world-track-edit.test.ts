/// <reference types="vitest/globals" />
import {
  characterSpanPatches,
  locationSpanPatches,
  orderInSpan,
  persistClipWrites,
} from './world-track-edit';

describe('persistClipWrites', () => {
  it('writes events, scenes, characters, and locations', () => {
    expect(persistClipWrites('character')).toBe(true);
    expect(persistClipWrites('location')).toBe(true);
    expect(persistClipWrites('world_event')).toBe(true);
    expect(persistClipWrites('scene')).toBe(true);
    expect(persistClipWrites('camera')).toBe(false);
  });
});

describe('orderInSpan', () => {
  it('includes endpoints', () => {
    expect(orderInSpan(2, 2, 4)).toBe(true);
    expect(orderInSpan(4, 2, 4)).toBe(true);
    expect(orderInSpan(1, 2, 4)).toBe(false);
  });
});

describe('characterSpanPatches', () => {
  const events = [
    { id: 'e1', presentation_order: 1, character_ids: ['c1'] },
    { id: 'e2', presentation_order: 2, character_ids: [] },
    { id: 'e3', presentation_order: 3, character_ids: ['c2'] },
  ];

  it('adds the character inside the span and removes them outside', () => {
    expect(characterSpanPatches(events, 'c1', 1.5, 3.2)).toEqual([
      { id: 'e1', character_ids: [] },
      { id: 'e2', character_ids: ['c1'] },
      { id: 'e3', character_ids: ['c2', 'c1'] },
    ]);
  });

  it('skips events that already match the span', () => {
    expect(
      characterSpanPatches(
        [{ id: 'e1', presentation_order: 1, character_ids: ['c1'] }],
        'c1',
        0.5,
        1.5,
      ),
    ).toEqual([]);
  });
});

describe('locationSpanPatches', () => {
  const scenes = [
    { id: 's1', order: 1, location_id: 'loc-a' },
    { id: 's2', order: 2, location_id: 'loc-b' },
    { id: 's3', order: 3, location_id: null },
  ];

  it('assigns the location inside the span and clears it outside', () => {
    expect(locationSpanPatches(scenes, 'loc-a', 2, 3)).toEqual([
      { id: 's1', location_id: null },
      { id: 's2', location_id: 'loc-a' },
      { id: 's3', location_id: 'loc-a' },
    ]);
  });

  it('does not clear a different location outside the span', () => {
    expect(
      locationSpanPatches([{ id: 's2', order: 2, location_id: 'loc-b' }], 'loc-a', 5, 6),
    ).toEqual([]);
  });
});
