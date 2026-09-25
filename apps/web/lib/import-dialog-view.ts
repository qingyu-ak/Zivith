/** 导入角色弹窗：列表失败不能装成没有可导入的角色。 */
export function importDialogView(input: {
  loading: boolean;
  error: string;
  worldCount: number;
}): 'loading' | 'error' | 'empty' | 'list' {
  if (input.error.trim()) return 'error';
  if (input.loading) return 'loading';
  if (input.worldCount === 0) return 'empty';
  return 'list';
}
