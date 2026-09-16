/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertTxtFile, commitWorldFromTxt, previewNovelTxt } from './txt-new-world';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock('./api', () => ({
  api: apiMock,
}));

function txtFile(name: string, size = 400): File {
  const file = new File(['x'.repeat(size)], name, { type: 'text/plain' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('assertTxtFile', () => {
  it('rejects a non-txt file without calling the API', () => {
    expect(() => assertTxtFile(txtFile('story.md'))).toThrow('请选择 .txt 文件');
  });

  it('rejects an oversized file', () => {
    expect(() => assertTxtFile(txtFile('story.txt', 21 * 1024 * 1024))).toThrow(
      '文件不能超过 20MB',
    );
  });
});

describe('previewNovelTxt', () => {
  it('posts the file to the preview endpoint', async () => {
    apiMock.mockResolvedValue({ suggested_name: '雾城', characters: [] });
    const file = txtFile('雾城.txt');
    await previewNovelTxt(file);
    expect(apiMock).toHaveBeenCalledTimes(1);
    const [path, init] = apiMock.mock.calls[0] as [string, { method: string; body: FormData }];
    expect(path).toBe('/novel-imports/preview');
    expect(init.method).toBe('POST');
    expect(init.body.get('file')).toBe(file);
  });
});

describe('commitWorldFromTxt', () => {
  it('creates the world only after a name is given, then imports', async () => {
    apiMock.mockResolvedValueOnce({ id: 'p1' }).mockResolvedValueOnce({ import_id: 'i1' });
    const file = txtFile('雾城.txt');
    await expect(commitWorldFromTxt({ name: '雾城', file })).resolves.toEqual({
      projectId: 'p1',
    });
    expect(apiMock).toHaveBeenNthCalledWith(1, '/projects', {
      method: 'POST',
      body: { name: '雾城' },
    });
    expect(apiMock.mock.calls[1]?.[0]).toBe('/novel-imports');
    expect(apiMock).not.toHaveBeenCalledWith('/world/creator-chats', expect.anything());
  });

  it('does not create a project when the name is blank', async () => {
    await expect(commitWorldFromTxt({ name: '  ', file: txtFile('雾城.txt') })).rejects.toThrow(
      '请填写世界名称',
    );
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('deletes the new world if import fails', async () => {
    apiMock
      .mockResolvedValueOnce({ id: 'p1' })
      .mockRejectedValueOnce(new Error('写入失败'))
      .mockResolvedValueOnce(null);
    await expect(commitWorldFromTxt({ name: '雾城', file: txtFile('雾城.txt') })).rejects.toThrow(
      '写入失败',
    );
    expect(apiMock).toHaveBeenNthCalledWith(3, '/projects/p1', { method: 'DELETE' });
  });

  it('explains leftover worlds when undo also fails', async () => {
    apiMock
      .mockResolvedValueOnce({ id: 'p1' })
      .mockRejectedValueOnce(new Error('写入失败'))
      .mockRejectedValueOnce(new Error('无法删除'));
    await expect(commitWorldFromTxt({ name: '雾城', file: txtFile('雾城.txt') })).rejects.toThrow(
      /不完整的世界/,
    );
  });
});
