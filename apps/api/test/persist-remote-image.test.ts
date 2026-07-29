import { describe, expect, it, vi } from 'vitest';
import { persistRemoteImage } from '../src/contexts/visual/persist-remote-image.js';

describe('persistRemoteImage', () => {
  it('stores remote bytes into object storage and returns object URL', async () => {
    const png = Uint8Array.from([137, 80, 78, 71]);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: () => Promise.resolve(png.buffer),
    });
    const storage = {
      put: vi.fn().mockResolvedValue({ key: 'visual-assets/a.png', url: 's3://zivith-media/visual-assets/a.png' }),
      delete: vi.fn(),
      signedReadUrl: vi.fn(),
    };

    const result = await persistRemoteImage({
      url: 'https://s3.siliconflow.cn/temporary/outputs/demo.png',
      storageKey: 'visual-assets/a.png',
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.persisted).toBe(true);
    expect(result.url).toBe('s3://zivith-media/visual-assets/a.png');
    expect(storage.put).toHaveBeenCalledOnce();
  });

  it('keeps data URLs without uploading', async () => {
    const result = await persistRemoteImage({
      url: 'data:image/svg+xml;charset=utf-8,x',
      storageKey: 'visual-assets/a.png',
      storage: {
        put: vi.fn(),
        delete: vi.fn(),
        signedReadUrl: vi.fn(),
      },
    });
    expect(result.persisted).toBe(false);
    expect(result.url.startsWith('data:')).toBe(true);
  });
});
