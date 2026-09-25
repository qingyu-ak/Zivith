/** Studio 角色行「对话」：失败不能吞掉。 */
export function studioTalkActionView(input: {
  busy: boolean;
  error: string;
}): 'busy' | 'error' | 'idle' {
  if (input.busy) return 'busy';
  if (input.error.trim()) return 'error';
  return 'idle';
}
