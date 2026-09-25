/// <reference types="vitest/globals" />
import { importDialogView } from './import-dialog-view';

describe('importDialogView', () => {
  it('treats a failed world list as error, not as an empty import list', () => {
    expect(importDialogView({ loading: false, error: '无法加载可导入的角色', worldCount: 0 })).toBe(
      'error',
    );
    expect(importDialogView({ loading: true, error: '', worldCount: 0 })).toBe('loading');
    expect(importDialogView({ loading: false, error: '', worldCount: 0 })).toBe('empty');
    expect(importDialogView({ loading: false, error: '', worldCount: 2 })).toBe('list');
  });

  it('treats skipped world resource failures as error or partial, not as empty', () => {
    expect(importDialogView({ loading: false, error: '', worldCount: 0, failedCount: 2 })).toBe(
      'error',
    );
    expect(importDialogView({ loading: false, error: '', worldCount: 1, failedCount: 1 })).toBe(
      'partial',
    );
  });
});
