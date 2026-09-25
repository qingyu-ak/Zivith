/** Studio 阶段状态：加载失败不能装成没有修订。 */
export function entityStagesLoadView(input: {
  loading: boolean;
  error: string;
  revisionCount: number;
}): 'loading' | 'error' | 'ready' | 'empty' {
  if (input.error.trim()) return 'error';
  if (input.loading && input.revisionCount === 0) return 'loading';
  if (input.revisionCount === 0) return 'empty';
  return 'ready';
}
