/** 与 API transcript 规则对齐:静音噪声(M M M A)不写入输入框。 */

export function collapseRepeatArtifacts(text: string): string {
  return text.replace(/([\u4e00-\u9fff])\1{2,}/g, '$1$1');
}

export function shouldInsertTranscript(text: string): boolean {
  const cleaned = collapseRepeatArtifacts(text).replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2) return false;
  const cjk = cleaned.replace(/[^\u4e00-\u9fff]/g, '');
  if (cjk.length >= 2) return true;
  return /[A-Za-z]{3,}/.test(cleaned);
}

export function insertDictatedText(
  value: string,
  cursor: number,
  text: string,
): { value: string; cursor: number } {
  const collapsed = collapseRepeatArtifacts(text).trim();
  if (!shouldInsertTranscript(collapsed)) return { value, cursor };
  const before = value.slice(0, cursor);
  const needsSpace = Boolean(before) && !/\s$/.test(before) && !/[\u4e00-\u9fff]$/.test(before);
  const separator = needsSpace ? ' ' : '';
  const nextCursor = cursor + separator.length + collapsed.length;
  return { value: `${before}${separator}${collapsed}${value.slice(cursor)}`, cursor: nextCursor };
}
