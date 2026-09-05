'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, createRoleplayThread, errorMessage } from '@/lib/api';
import type { AssetDTO, WorldEventDTO } from '@/lib/types';

const NEW_SELF = '__new_self__';

/** Shared M3 launch: pick anchor + speaker, then open or reuse a roleplay thread. */
export function RoleplayLaunchButton({
  projectId,
  characterAssetId,
  characterName,
  characters,
  worldEvents,
  align = 'end',
}: {
  projectId: string;
  characterAssetId: string;
  characterName: string;
  characters: AssetDTO[];
  worldEvents: WorldEventDTO[];
  align?: 'start' | 'end';
}) {
  const router = useRouter();
  const [anchorId, setAnchorId] = useState('');
  const [userChoice, setUserChoice] = useState('');
  const [selfName, setSelfName] = useState('');
  const [selfPersonality, setSelfPersonality] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const others = characters
    .filter((item) => item.id !== characterAssetId)
    .slice()
    .sort((a, b) => {
      const aSelf = a.tags?.includes('user_self') ? 0 : 1;
      const bSelf = b.tags?.includes('user_self') ? 0 : 1;
      if (aSelf !== bSelf) return aSelf - bSelf;
      return a.name.localeCompare(b.name, 'zh');
    });

  async function launch() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      let userCharacterAssetId: string | null = userChoice || null;
      if (userChoice === NEW_SELF) {
        const name = selfName.trim();
        if (!name) throw new Error('请填写你的角色名');
        const created = await api<AssetDTO>(`/projects/${projectId}/assets`, {
          method: 'POST',
          body: {
            asset_type: 'character',
            name,
            description: selfPersonality.trim()
              ? `用户角色卡：${selfPersonality.trim()}`
              : '用户自己的角色卡',
            personality: selfPersonality.trim() || null,
            tags: ['user_self'],
            state: 'active',
          },
        });
        userCharacterAssetId = created.id;
      }
      const created = await createRoleplayThread(
        projectId,
        characterAssetId,
        anchorId || null,
        userCharacterAssetId,
      );
      router.push(`/creator-chats/${created.thread_id}`);
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  }

  return (
    <div className={`flex max-w-md flex-col gap-1 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      <div className={`flex flex-wrap items-center gap-1 ${align === 'end' ? 'justify-end' : ''}`}>
        <select
          className="max-w-36 rounded-md border border-line bg-white px-1.5 py-0.5 text-xs text-zinc-600"
          value={anchorId}
          disabled={busy}
          onChange={(event) => setAnchorId(event.target.value)}
          title="时间锚点：角色只知道该时刻之前亲历的事"
        >
          <option value="">全书读完</option>
          {worldEvents.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
        <select
          className="max-w-40 rounded-md border border-line bg-white px-1.5 py-0.5 text-xs text-zinc-600"
          value={userChoice}
          disabled={busy}
          onChange={(event) => setUserChoice(event.target.value)}
          title="你在对话里是谁"
        >
          <option value="">你是：读者（默认）</option>
          {others.map((character) => (
            <option key={character.id} value={character.id}>
              你是：{character.name}
            </option>
          ))}
          <option value={NEW_SELF}>新建我自己…</option>
        </select>
        <button
          type="button"
          onClick={() => void launch()}
          disabled={busy}
          className="whitespace-nowrap rounded-md border border-[#4d6bfe]/40 bg-[#eef2ff] px-2 py-0.5 text-xs text-[#1e3a8a] transition hover:border-[#4d6bfe] disabled:opacity-50"
        >
          {busy ? '创建中…' : `与${characterName}对话`}
        </button>
      </div>
      {userChoice === NEW_SELF && (
        <div className={`flex w-full flex-wrap gap-1 ${align === 'end' ? 'justify-end' : ''}`}>
          <input
            className="w-28 rounded-md border border-line bg-white px-1.5 py-0.5 text-xs text-zinc-700"
            placeholder="你的名字"
            value={selfName}
            disabled={busy}
            onChange={(event) => setSelfName(event.target.value)}
          />
          <input
            className="w-40 rounded-md border border-line bg-white px-1.5 py-0.5 text-xs text-zinc-700"
            placeholder="个性（可选）"
            value={selfPersonality}
            disabled={busy}
            onChange={(event) => setSelfPersonality(event.target.value)}
          />
        </div>
      )}
      {error ? <span className="text-[10px] text-red-500">{error}</span> : null}
    </div>
  );
}
