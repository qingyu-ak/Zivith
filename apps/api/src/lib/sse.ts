/** Format one SSE frame. Hijacked replies bypass Fastify's JSON serializer. */
export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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
