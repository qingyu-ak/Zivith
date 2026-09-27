/// <reference types="vitest/globals" />
import { parseSpaceLayer, parseWorldCanvasView, worldCanvasHref } from './world-canvas';

describe('world canvas view', () => {
  it('defaults to the world line', () => {
    expect(parseWorldCanvasView(new URLSearchParams())).toBe('world');
  });

  it('reads production line and space as exclusive views', () => {
    expect(parseWorldCanvasView(new URLSearchParams('line=production'))).toBe('production');
    expect(parseWorldCanvasView(new URLSearchParams('view=space'))).toBe('space');
    expect(parseWorldCanvasView(new URLSearchParams('view=space&line=production'))).toBe('space');
  });

  it('keeps entity select when switching to space', () => {
    expect(
      worldCanvasHref('p1', 'space', new URLSearchParams('select=location&entity=loc_1')),
    ).toBe('/projects/p1/world?select=location&entity=loc_1&view=space');
  });

  it('clears the other view param when switching', () => {
    expect(worldCanvasHref('p1', 'world', new URLSearchParams('view=space'))).toBe(
      '/projects/p1/world',
    );
    expect(worldCanvasHref('p1', 'production', new URLSearchParams('view=space'))).toBe(
      '/projects/p1/world?line=production',
    );
  });

  it('treats layer=universe as the space outer layer', () => {
    expect(parseSpaceLayer(new URLSearchParams('view=space&layer=universe'))).toBe('universe');
    expect(parseSpaceLayer(new URLSearchParams('view=space'))).toBe(null);
    expect(worldCanvasHref('p1', 'world', new URLSearchParams('view=space&layer=universe'))).toBe(
      '/projects/p1/world',
    );
    expect(
      worldCanvasHref(
        'p1',
        'space',
        new URLSearchParams('select=location&entity=loc_1&view=space'),
        { layer: 'universe' },
      ),
    ).toBe('/projects/p1/world?view=space&layer=universe');
  });
});
