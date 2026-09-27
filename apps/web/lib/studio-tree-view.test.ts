/// <reference types="vitest/globals" />
import { studioTreeView } from './studio-tree-view';

describe('studioTreeView', () => {
  it('treats a failed load as error, not as a ready empty tree', () => {
    expect(studioTreeView({ loading: false, error: '无法加载项目树', ready: false })).toBe('error');
    expect(studioTreeView({ loading: true, error: '', ready: false })).toBe('loading');
    expect(studioTreeView({ loading: false, error: '', ready: true })).toBe('ready');
    expect(studioTreeView({ loading: false, error: '', ready: false })).toBe('missing');
  });
});
