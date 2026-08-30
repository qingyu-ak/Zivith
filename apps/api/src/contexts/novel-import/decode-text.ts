/** 去掉 NUL，避免控制字符进入下游。 */
function stripNulls(text: string): string {
  return text.split('\0').join('');
}

function isValidUtf8(buffer: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function countCjk(text: string): number {
  return (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
}

/**
 * 小说 txt 解码：优先 UTF-8；非法 UTF-8 时回退 GB18030（覆盖 Windows 记事本 ANSI/GBK）。
 */
export function decodeNovelBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return stripNulls(buffer.subarray(3).toString('utf8'));
  }
  if (isValidUtf8(buffer)) return stripNulls(buffer.toString('utf8'));
  try {
    const gbk = new TextDecoder('gb18030').decode(buffer);
    const utf8 = buffer.toString('utf8');
    return stripNulls(countCjk(gbk) >= countCjk(utf8) ? gbk : utf8);
  } catch {
    return stripNulls(buffer.toString('utf8'));
  }
}
