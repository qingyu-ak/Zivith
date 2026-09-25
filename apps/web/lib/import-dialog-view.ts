/** 导入角色弹窗：列表失败或部分世界失败，都不能装成没有角色。 */
export function importDialogView(input: {
  loading: boolean;
  error: string;
  worldCount: number;
  failedCount?: number;
}): 'loading' | 'error' | 'empty' | 'list' | 'partial' {
  const failedCount = input.failedCount ?? 0;
  if (input.loading) return 'loading';
  if (input.worldCount > 0 && failedCount > 0) return 'partial';
  if (input.error.trim()) return 'error';
  if (failedCount > 0 && input.worldCount === 0) return 'error';
  if (input.worldCount === 0) return 'empty';
  return 'list';
}
