/// <reference types="vitest/globals" />
import { entityStagesLoadView } from './entity-stages-load';

describe('entityStagesLoadView', () => {
  it('treats a failed revisions load as error, not as a missing stage list', () => {
    expect(entityStagesLoadView({ loading: false, error: '无法加载阶段状态', revisionCount: 0 })).toBe(
      'error',
    );
    expect(entityStagesLoadView({ loading: true, error: '', revisionCount: 0 })).toBe('loading');
    expect(entityStagesLoadView({ loading: false, error: '', revisionCount: 2 })).toBe('ready');
    expect(entityStagesLoadView({ loading: false, error: '', revisionCount: 0 })).toBe('empty');
  });
});
