export function nextUntitledName(existing: string[], base: string): string {
  const names = new Set(existing.map((name) => name.trim()).filter(Boolean));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

export function resolveCreateName(
  existing: string[],
  requested: string | undefined,
  untitled: string,
): string {
  const trimmed = requested?.trim();
  if (!trimmed) return nextUntitledName(existing, untitled);
  return nextUntitledName(existing, trimmed);
}
