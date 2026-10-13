'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { errorMessage } from '@/lib/api';
import { listImportableWorlds } from '@/lib/create-world-character';
import { importDialogView } from '@/lib/import-dialog-view';
import type { AssetDTO } from '@/lib/types';

export function ImportCharacterDialog({
  currentProjectId,
  busy,
  onCancel,
  onConfirm,
}: {
  currentProjectId: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (sourceProjectId: string, sourceCharacterId: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [worlds, setWorlds] = useState<Array<{ id: string; name: string; characters: AssetDTO[] }>>(
    [],
  );
  const [failedCount, setFailedCount] = useState(0);
  const [worldId, setWorldId] = useState('');
  const [characterId, setCharacterId] = useState('');
  const dialogView = importDialogView({
    loading,
    error,
    worldCount: worlds.length,
    failedCount,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setFailedCount(0);
    void listImportableWorlds(currentProjectId)
      .then((result) => {
        if (cancelled) return;
        setWorlds(result.worlds);
        setFailedCount(result.failedCount);
        setWorldId(result.worlds[0]?.id ?? '');
        setCharacterId(result.worlds[0]?.characters[0]?.id ?? '');
        setError(
          result.worlds.length === 0 && result.failedCount > 0
            ? '有的世界没加载到，暂时看不到可导入的角色'
            : '',
        );
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason) || '无法加载可导入的角色');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentProjectId, reloadToken]);

  const selected = worlds.find((item) => item.id === worldId);
  const characters = selected?.characters ?? [];
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-zinc-900/30 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-labelledby="import-character-title"
        className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="import-character-title" className="text-sm font-medium text-zinc-800">
            从其他世界导入角色
          </h2>
          <button
            type="button"
            className="text-xs text-zinc-400 hover:text-zinc-700"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
        {dialogView === 'loading' ? (
          <p className="text-xs text-zinc-500">正在查找可导入的角色…</p>
        ) : dialogView === 'error' ? (
          <div className="space-y-3">
            <p className="text-xs text-red-600" role="alert">
              {error || '无法加载可导入的角色'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading}
                className="rounded-md border border-line px-2 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50"
                onClick={() => setReloadToken((current) => current + 1)}
              >
                {loading ? '正在加载…' : '重试'}
              </button>
              <button
                type="button"
                className="rounded-md border border-line px-2 py-1 text-xs"
                onClick={onCancel}
              >
                关闭
              </button>
            </div>
          </div>
        ) : dialogView === 'empty' ? (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              没有可导入的角色。先在别的世界创建，或在这里新建。
            </p>
            <button
              type="button"
              className="rounded-md border border-line px-2 py-1 text-xs"
              onClick={onCancel}
            >
              关闭
            </button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!worldId || !characterId || busy) return;
              onConfirm(worldId, characterId);
            }}
          >
            {dialogView === 'partial' ? (
              <div className="space-y-2">
                <p className="text-xs text-red-600" role="alert">
                  有的世界没加载到。已列出的仍可导入。
                </p>
                <button
                  type="button"
                  disabled={loading || busy}
                  className="rounded-md border border-line px-2 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50"
                  onClick={() => setReloadToken((current) => current + 1)}
                >
                  {loading ? '正在加载…' : '重试'}
                </button>
              </div>
            ) : null}
            <label className="block text-xs text-zinc-600">
              世界
              <select
                className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm"
                value={worldId}
                disabled={busy}
                onChange={(event) => {
                  const next = event.target.value;
                  setWorldId(next);
                  const first = worlds.find((item) => item.id === next)?.characters[0]?.id ?? '';
                  setCharacterId(first);
                }}
              >
                {worlds.map((world) => (
                  <option key={world.id} value={world.id}>
                    {world.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-zinc-600">
              角色
              <select
                className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm"
                value={characterId}
                disabled={busy || characters.length === 0}
                onChange={(event) => setCharacterId(event.target.value)}
              >
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[11px] text-zinc-400">只导入角色卡，不带走那边的记忆和事件。</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-line px-3 py-1.5 text-xs"
                onClick={onCancel}
                disabled={busy}
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-md bg-[#4d6bfe] px-3 py-1.5 text-xs text-white disabled:opacity-50"
                disabled={busy || !characterId}
              >
                {busy ? '正在导入…' : '确认导入'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
