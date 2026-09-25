/** Studio 左树：失败不能只剩一行死字、也不能装成空世界。 */
export function studioTreeView(input: {
  loading: boolean;
  error: string;
  ready: boolean;
}): 'ready' | 'loading' | 'error' | 'missing' {
  if (input.ready) return 'ready';
  if (input.loading) return 'loading';
  if (input.error.trim()) return 'error';
  return 'missing';
}
