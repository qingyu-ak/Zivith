/** 扮演页世界资源：失败不能把「调整记忆」装成没有。 */
export function chatWorldResourcesView(input: {
  error: string;
  hasResources: boolean;
}): 'error' | 'ready' | 'missing' {
  if (input.error.trim()) return 'error';
  if (input.hasResources) return 'ready';
  return 'missing';
}
