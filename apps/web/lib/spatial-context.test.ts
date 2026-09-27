import { describe, expect, it } from 'vitest';
import { DEFAULT_STUDIO_ORIGIN, spatialContextToPrompt, studioWorldHref } from './spatial-context';

describe('spatial-context (Studio 合同)', () => {
  it('matches the world workspace select query', () => {
    expect(studioWorldHref(DEFAULT_STUDIO_ORIGIN, 'p1', { kind: 'location', id: 'loc_1' })).toBe(
      'http://127.0.0.1:3100/projects/p1/world?select=location&entity=loc_1',
    );
  });

  it('keeps location brief in the Agent prompt', () => {
    expect(
      spatialContextToPrompt({
        projectId: 'p1',
        spacePath: [{ id: 'loc_1', type: 'city', name: '王城·曦京' }],
        locationBrief: '王朝的心脏。',
        nearbyEntities: [],
        relevantEvents: [],
        relatedShots: [],
      }),
    ).toContain('地点简介：王朝的心脏。');
  });
});
