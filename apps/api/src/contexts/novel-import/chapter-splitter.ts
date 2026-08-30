// M2 小说导入 — 章节切分（设计 §5.2）
// 中文「第X章/回/卷/节」标题行正则 + 无标题时按字数兜底分块。

export interface ChapterText {
  index: number;
  title: string | null;
  content: string;
}

const CHAPTER_TITLE =
  /^[ \t]*(第[0-9０-９一二三四五六七八九十百千零〇两]+[章回卷节部集][^\n]{0,40})$/gm;

/** 极短章节（<50 字）并入前一章，避免正则误切。 */
export function splitChapters(raw: string, fallbackChunkChars = 4000): ChapterText[] {
  const text = raw.replace(/\r\n/g, '\n').replace(/\u3000/g, ' ');
  const matches = [...text.matchAll(CHAPTER_TITLE)];
  if (matches.length >= 2) {
    const blocks: Array<{ title: string; content: string }> = [];
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (!m || m.index === undefined) continue;
      const next = matches[i + 1];
      const start = m.index + m[0].length;
      const end = next?.index ?? text.length;
      const content = text.slice(start, end).trim();
      const title = (m[1] ?? '').trim();
      const last = blocks.length > 0 ? blocks[blocks.length - 1] : undefined;
      if (content.length < 50 && last) {
        last.content += `\n${content}`;
        continue;
      }
      if (content) blocks.push({ title, content });
    }
    if (blocks.length > 0) {
      return blocks.map((block, index) => ({ index, title: block.title, content: block.content }));
    }
  }
  // 兜底：无章节标题 → 按字数分块
  const chunks: ChapterText[] = [];
  const clean = text.trim();
  for (let offset = 0; offset < clean.length; offset += fallbackChunkChars) {
    chunks.push({
      index: chunks.length,
      title: null,
      content: clean.slice(offset, offset + fallbackChunkChars),
    });
  }
  return chunks;
}
