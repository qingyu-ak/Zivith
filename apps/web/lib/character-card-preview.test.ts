/// <reference types="vitest/globals" />
import { characterCardPreview } from './character-card-preview';

describe('characterCardPreview', () => {
  it('prefers description and truncates long text', () => {
    expect(characterCardPreview({ description: '落魄散修', personality: '冷' })).toBe('落魄散修');
    expect(characterCardPreview({ description: '', personality: '谨慎' })).toBe('谨慎');
    expect(characterCardPreview({ description: '  ' })).toBe('');
    expect(characterCardPreview({ description: '甲'.repeat(20) }, 8)).toBe('甲甲甲甲甲甲甲甲…');
  });
});
