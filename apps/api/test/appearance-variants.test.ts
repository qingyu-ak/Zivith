import { describe, expect, it } from 'vitest';
import {
  appearanceVariantCreateSchema,
  appearanceVariantKeySchema,
  appearanceVariantPatchSchema,
  DEFAULT_APPEARANCE_VARIANT_KEY,
} from '@zivith/domain';

describe('appearance variant contracts', () => {
  it('accepts stable slug keys and Chinese titles', () => {
    expect(appearanceVariantKeySchema.parse('default')).toBe('default');
    expect(appearanceVariantKeySchema.parse('wounded')).toBe('wounded');
    expect(() => appearanceVariantKeySchema.parse('受伤')).toThrow();
    expect(() => appearanceVariantKeySchema.parse('1bad')).toThrow();

    const created = appearanceVariantCreateSchema.parse({
      key: 'wounded',
      title: '受伤形象',
      change_reason: '战斗后',
      description: '衣衫破损，左臂绷带',
    });
    expect(created.key).toBe('wounded');
    expect(created.title).toBe('受伤形象');
  });

  it('allows partial patches without requiring key', () => {
    expect(
      appearanceVariantPatchSchema.parse({
        title: '幼年形象',
        description: '更矮，发色更浅',
      }),
    ).toEqual({
      title: '幼年形象',
      description: '更矮，发色更浅',
    });
  });

  it('keeps default key constant for backfill / ensure helpers', () => {
    expect(DEFAULT_APPEARANCE_VARIANT_KEY).toBe('default');
  });
});
