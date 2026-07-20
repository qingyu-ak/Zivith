import { describe, expect, it } from 'vitest';
import {
  assetDto,
  computeReorderIds,
  parseAssetCreateInput,
  parseAssetPatchInput,
  sceneBodySchema,
  sceneDto,
  storyBodySchema,
} from '../src/routes/resources.js';

describe('story and scene contracts', () => {
  it('accepts and preserves the complete frontend story shape', () => {
    const story = storyBodySchema.parse({
      title: 'The Last Seed',
      logline: 'A robot discovers the final living seed.',
      synopsis: 'A short story.',
      genre: 'science_fiction',
      theme: 'hope',
      target_audience: 'general',
      tone: 'contemplative',
      target_duration_seconds: 180,
      language: 'en',
    });

    expect(story.target_audience).toBe('general');
    expect(story.target_duration_seconds).toBe(180);
  });

  it('accepts frontend scene aliases and exposes both aliases', () => {
    const input = sceneBodySchema.parse({
      title: 'Dawn Patrol',
      summary: 'R-7 begins its daily routine.',
      time_of_day: 'early_morning',
      weather: 'overcast',
      mood: 'melancholic',
      order: 2,
    });
    const response = sceneDto({
      id: 'scene_1',
      description: input.summary,
      time: input.time_of_day,
    });

    expect(response.summary).toBe(input.summary);
    expect(response.time_of_day).toBe(input.time_of_day);
  });
});

describe('reorder compatibility', () => {
  it('moves one resource using a one-based new_order', () => {
    expect(computeReorderIds(['a', 'b', 'c'], 'c', 1)).toEqual(['c', 'a', 'b']);
    expect(computeReorderIds(['a', 'b', 'c'], 'a', 3)).toEqual(['b', 'c', 'a']);
  });
});

describe('asset contracts', () => {
  it('accepts flat character and location payloads', () => {
    const character = parseAssetCreateInput({
      asset_type: 'character',
      type: 'character',
      name: 'R-7',
      description: 'A maintenance robot.',
      personality: 'careful',
      default_outfit: 'weathered shell',
    });
    const location = parseAssetCreateInput({
      asset_type: 'location',
      type: 'interior',
      name: 'Greenhouse',
      description: 'A collapsed greenhouse.',
      weather_default: 'overcast',
    });

    expect(character.asset_type).toBe('character');
    if (character.asset_type !== 'character') throw new Error('Expected character input');
    expect(character.data.personality).toBe('careful');
    expect(location.asset_type).toBe('location');
    if (location.asset_type !== 'location') throw new Error('Expected location input');
    expect(location.data.type).toBe('interior');
  });

  it('keeps the legacy envelope and strictly validates its data', () => {
    const parsed = parseAssetCreateInput({
      type: 'location',
      data: {
        name: 'City',
        description: 'An abandoned city.',
        type: 'modern',
      },
    });

    expect(parsed.asset_type).toBe('location');
    expect(() =>
      parseAssetCreateInput({
        asset_type: 'character',
        type: 'character',
        name: 'R-7',
        description: 'Robot',
        unsupported_field: true,
      }),
    ).toThrow();
  });

  it('strips discriminators on patch and flattens stored asset data', () => {
    const patch = parseAssetPatchInput('character', {
      asset_type: 'character',
      type: 'character',
      personality: 'brave',
    });
    const response = assetDto({
      id: 'asset_1',
      type: 'location',
      name: 'Greenhouse',
      referenceImages: ['media_1'],
      data: {
        type: 'interior',
        weather_default: 'rainy',
      },
    });

    expect(patch).toEqual({ personality: 'brave' });
    expect(response.asset_type).toBe('location');
    expect(response.type).toBe('interior');
    expect(response.weather_default).toBe('rainy');
    expect(response.referenceImages).toEqual(['media_1']);
    expect(response.data).toEqual({ type: 'interior', weather_default: 'rainy' });
  });
});
