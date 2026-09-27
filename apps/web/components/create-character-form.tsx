'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Field, Input, Textarea } from '@zivith/ui';
import { errorMessage } from '@/lib/api';
import {
  createWorldCharacter,
  openRoleplayForCharacter,
  requireCharacterName,
} from '@/lib/create-world-character';
import type { AssetDTO } from '@/lib/types';

type Busy = 'create' | 'talk' | null;

export function CreateCharacterForm({
  projectId,
  existingNames,
  allowTalk = true,
  compact = false,
  onCreated,
  onOpenTalk,
  onCancel,
}: {
  projectId: string;
  existingNames: string[];
  allowTalk?: boolean;
  compact?: boolean;
  onCreated: (character: AssetDTO) => void;
  onOpenTalk?: (threadId: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Busy>(null);

  async function submit(startTalk: boolean) {
    if (busy) return;
    setError('');
    try {
      requireCharacterName(name);
    } catch (reason) {
      setError(errorMessage(reason) || '请填写角色名称');
      return;
    }
    setBusy(startTalk ? 'talk' : 'create');
    try {
      const character = await createWorldCharacter({
        projectId,
        name,
        description,
        existingNames,
      });
      onCreated(character);
      if (startTalk) {
        try {
          const threadId = await openRoleplayForCharacter(projectId, character.id);
          onOpenTalk?.(threadId);
        } catch (reason) {
          setError(errorMessage(reason) || '角色已创建，但没能打开对话。请从角色列表再试。');
        }
      } else {
        setName('');
        setDescription('');
      }
    } catch (reason) {
      setError(errorMessage(reason) || '没能创建角色。请再试一次。');
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(allowTalk);
  }

  const disabled = busy !== null;
  const creatingLabel = busy === 'talk' ? '正在进入对话…' : busy === 'create' ? '正在创建…' : null;

  return (
    <form className={compact ? 'grid gap-2' : 'grid gap-3'} onSubmit={onSubmit}>
      <p className={compact ? 'text-xs text-zinc-500' : 'text-sm text-zinc-600'}>
        先创建一个角色，才能进入世界和他说话。
      </p>
      <Field label="角色名称">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
          disabled={disabled}
          placeholder="例如：林夕"
          className={compact ? 'min-h-9 text-sm' : undefined}
        />
      </Field>
      <Field label="简介（可选）">
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={disabled}
          placeholder="一句话：身份、性格或现在最想要什么"
          className={compact ? 'min-h-16 text-sm' : 'min-h-20'}
        />
      </Field>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {allowTalk ? (
          <>
            <Button type="submit" disabled={disabled || !name.trim()}>
              {creatingLabel && busy === 'talk' ? creatingLabel : '创建并开始对话'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || !name.trim()}
              onClick={() => void submit(false)}
            >
              {creatingLabel && busy === 'create' ? creatingLabel : '只创建'}
            </Button>
          </>
        ) : (
          <Button type="submit" disabled={disabled || !name.trim()}>
            {creatingLabel ?? '创建角色'}
          </Button>
        )}
        {onCancel ? (
          <Button type="button" variant="secondary" disabled={disabled} onClick={onCancel}>
            取消
          </Button>
        ) : null}
      </div>
    </form>
  );
}
