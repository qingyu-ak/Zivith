'use client';

import { useMemo, useState } from 'react';
import { createRoleplayThread, errorMessage } from '@/lib/api';
import { playableCharacters } from '@/lib/create-world-character';
import type { AssetDTO, WorldEventDTO } from '@/lib/types';

export function GroupChatLaunch({
  projectId,
  characters,
  worldEvents,
  onCreated,
  onNeedCharacter,
}: {
  projectId: string;
  characters: AssetDTO[];
  worldEvents: WorldEventDTO[];
  onCreated: (threadId: string) => void;
  onNeedCharacter?: () => void;
}) {
  const playable = useMemo(() => playableCharacters(characters), [characters]);
  const [picked, setPicked] = useState<string[]>([]);
  const [anchorId, setAnchorId] = useState('');
  const [userChoice, setUserChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const others = characters
    .filter((item) => !picked.includes(item.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));

  function toggle(id: string) {
    setError('');
    setPicked((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
    if (userChoice === id) setUserChoice('');
  }

  async function launch() {
    if (busy) return;
    if (playable.length < 2) {
      setError('再创建一个角色，才能把他们放进同一场对话。');
      onNeedCharacter?.();
      return;
    }
    if (picked.length < 2) {
      setError('请选出至少两位角色。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await createRoleplayThread(
        projectId,
        picked[0] ?? '',
        anchorId || null,
        userChoice || null,
        picked,
        { forceNew: true },
      );
      onCreated(created.thread_id);
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  }

  if (playable.length < 2) {
    return (
      <div className="grid gap-3">
        <p className="text-sm leading-6 text-zinc-600">
          再创建一个角色，才能把他们放进同一场对话。
        </p>
        {onNeedCharacter ? (
          <button
            type="button"
            className="rounded-lg bg-[#4d6bfe] px-3 py-1.5 text-sm text-white"
            onClick={onNeedCharacter}
          >
            去创建角色
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-xs leading-5 text-zinc-500">
        选出 2 或 3 人由 AI 开口。你自己可以当读者，也可以扮演另一个书中角色。
      </p>
      <ul className="grid max-h-52 gap-1 overflow-y-auto">
        {playable.map((character) => {
          const on = picked.includes(character.id);
          return (
            <li key={character.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={busy || (!on && picked.length >= 3)}
                  onChange={() => toggle(character.id)}
                />
                <span className="min-w-0 truncate text-zinc-800">{character.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <select
          className="max-w-40 rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-600"
          value={anchorId}
          disabled={busy}
          onChange={(event) => setAnchorId(event.target.value)}
        >
          <option value="">全书读完</option>
          {worldEvents.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
        <select
          className="max-w-44 rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-600"
          value={userChoice}
          disabled={busy}
          onChange={(event) => setUserChoice(event.target.value)}
        >
          <option value="">你扮演：读者（默认）</option>
          {others.map((character) => (
            <option key={character.id} value={character.id}>
              你扮演：{character.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-end gap-2">
        {error ? <p className="mr-auto text-[11px] text-red-500">{error}</p> : null}
        <button
          type="button"
          disabled={busy || picked.length < 2}
          className="rounded-lg bg-[#4d6bfe] px-3 py-1.5 text-sm text-white disabled:opacity-40"
          onClick={() => void launch()}
        >
          {busy ? '创建中…' : '开始群聊'}
        </button>
      </div>
    </div>
  );
}
