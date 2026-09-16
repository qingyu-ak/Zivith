import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STUDIO_ORIGIN,
  spatialContextToPrompt,
  studioWorldHref,
  type SpatialContext,
} from '../src/space.js';

describe('space contract', () => {
  it('opens Studio Inspector with the same select query the world workspace already reads', () => {
    expect(
      studioWorldHref(DEFAULT_STUDIO_ORIGIN, 'proj_1', { kind: 'location', id: 'loc_capital' }),
    ).toBe('http://127.0.0.1:3100/projects/proj_1/world?select=location&entity=loc_capital');
  });

  it('puts location brief into Agent context', () => {
    const ctx: SpatialContext = {
      projectId: 'proj_1',
      spacePath: [
        { id: 'proj_1', type: 'planet', name: '雾港遗事' },
        { id: 'loc_capital', type: 'city', name: '王城·曦京' },
      ],
      locationBrief: '王朝的心脏。学士塔的灯彻夜不灭。',
      nearbyEntities: [],
      relevantEvents: [],
      relatedShots: [],
    };
    const prompt = spatialContextToPrompt(ctx);
    expect(prompt).toContain('城市「王城·曦京」');
    expect(prompt).toContain('地点简介：王朝的心脏。学士塔的灯彻夜不灭。');
  });
});
