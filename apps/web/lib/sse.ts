export function parseSseBuffer(buffer: string): {
  frames: Array<{ event: string; data: unknown }>;
  rest: string;
} {
  const chunks = buffer.split('\n\n');
  const rest = chunks.pop() ?? '';
  const frames: Array<{ event: string; data: unknown }> = [];
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const lines = chunk.split('\n');
    const event =
      lines
        .find((line) => line.startsWith('event:'))
        ?.slice(6)
        .trim() ?? 'message';
    const dataLine = lines.find((line) => line.startsWith('data:'));
    if (!dataLine) continue;
    const raw = dataLine.slice(5).trim();
    try {
      frames.push({ event, data: JSON.parse(raw) as unknown });
    } catch {
      frames.push({ event, data: raw });
    }
  }
  return { frames, rest };
}

export function chunkText(text: string, chunkSize = 8): string[] {
  if (!text) return [];
  const size = Math.max(1, chunkSize);
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}
