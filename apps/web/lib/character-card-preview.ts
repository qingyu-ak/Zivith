import type { AssetDTO } from './types';

/** Chat 选人时只读预览：简介优先，没有则用个性。不在 Chat 里改卡。 */
export function characterCardPreview(
  asset: Pick<AssetDTO, 'description' | 'personality'> | null | undefined,
  max = 96,
): string {
  const text = (asset?.description || asset?.personality || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}
