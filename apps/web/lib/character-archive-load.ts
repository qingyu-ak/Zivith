/** 角色档案 cores/atoms：加载失败不能装成空档案。 */
export function characterArchiveLoadView(input: {
  loading: boolean;
  loadError: string;
}): 'loading' | 'error' | 'ready' {
  if (input.loadError.trim()) return 'error';
  if (input.loading) return 'loading';
  return 'ready';
}
