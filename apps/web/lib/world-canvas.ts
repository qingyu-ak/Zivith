/**
 * 世界工作区画布视图。
 * `line=production` 是创作线（已有）；`view=space` 是空间浏览器。
 * 两者互斥：切到空间时清掉 line，切到创作线时清掉 view。
 */

export const WORLD_CANVAS_VIEWS = ['world', 'production', 'space'] as const;
export type WorldCanvasView = (typeof WORLD_CANVAS_VIEWS)[number];

export function parseWorldCanvasView(search: Pick<URLSearchParams, 'get'>): WorldCanvasView {
  if (search.get('view') === 'space') return 'space';
  if (search.get('line') === 'production') return 'production';
  return 'world';
}

/** 空间画布内层：宇宙星云；缺省为当前世界的恒星系。 */
export function parseSpaceLayer(search: Pick<URLSearchParams, 'get'>): 'universe' | null {
  return search.get('view') === 'space' && search.get('layer') === 'universe' ? 'universe' : null;
}

export function worldCanvasHref(
  projectId: string,
  view: WorldCanvasView,
  current?: Pick<URLSearchParams, 'toString'>,
  options?: { layer?: 'universe' },
): string {
  const params = current ? new URLSearchParams(current.toString()) : new URLSearchParams();
  params.delete('line');
  params.delete('view');
  params.delete('layer');
  if (view === 'production') params.set('line', 'production');
  if (view === 'space') params.set('view', 'space');
  if (view === 'space' && options?.layer === 'universe') {
    params.set('layer', 'universe');
    params.delete('select');
    params.delete('entity');
  }
  const query = params.toString();
  return `/projects/${projectId}/world${query ? `?${query}` : ''}`;
}
