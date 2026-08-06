import { describe, expect, it } from 'vitest';
import { parseWorldview } from '@zivith/domain';
import {
  assetDto,
  computeReorderIds,
  parseAssetCreateInput,
  parseAssetPatchInput,
  projectBody,
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

describe('project worldview patch contract', () => {
  it('accepts the Inspector inline-edit worldview payload and normalizes rules', () => {
    const body = projectBody.partial().parse({
      name: '凡人修仙传',
      description: '一个凡人踏入修仙之路的故事',
      worldview: {
        genre: '东方玄幻',
        premise: '灵气复苏，凡人亦可逆天改命',
        rules: [' 灵气浓度决定修行上限 ', '功法品阶分天地玄黄'],
        notes: '补充说明',
      },
    });
    const normalized = parseWorldview(body.worldview);

    expect(normalized.genre).toBe('东方玄幻');
    expect(normalized.premise).toBe('灵气复苏，凡人亦可逆天改命');
    expect(normalized.rules).toEqual(['灵气浓度决定修行上限', '功法品阶分天地玄黄']);
    expect(normalized.notes).toBe('补充说明');
  });

  it('replaces the whole worldview so cleared fields can persist', () => {
    const next = parseWorldview({ genre: '', premise: '', rules: [], notes: '' });

    expect(next.genre).toBe('');
    expect(next.premise).toBe('');
    expect(next.rules).toEqual([]);
    expect(next.notes).toBe('');
  });
});
