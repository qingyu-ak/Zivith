'use client';

import { useRouter } from 'next/navigation';
import type {
  AssetDTO,
  CreatorChatThreadDTO,
  SceneDTO,
  StoryDTO,
  WorldEventDTO,
  WorldRelationshipDTO,
  WorldResourcesDTO,
  WorldSelection,
} from '@/lib/types';
import { threadDisplayTitle } from '@/lib/chat-history';
import { createRoleplayThread, errorMessage } from '@/lib/api';
import { studioTalkActionView } from '@/lib/studio-talk-action';
import { isPlayableCharacter } from '@/lib/create-world-character';
import { DIMENSION_KIND_LABEL, resolveDisplayDimensions, worldTimeCaption } from '@/lib/world-line';
import { useState, type ReactNode } from 'react';
import type {
  RelationshipCreateInput,
  StudioCreateExtras,
  StudioCreateKind,
} from '@/lib/studio-entity-create';
import { ImportCharacterDialog } from './import-character-dialog';
import {
  namedRefLabel,
  parseRefKey,
  refKey,
  relationshipRefOptions,
  type NamedEntityRef,
} from '@/lib/entity-refs';

interface FileItem {
  id: string;
  title: string;
  subtitle?: string;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-3 text-[10px] text-zinc-400 ${open ? '' : '-rotate-90'}`}
    >
      ▼
    </span>
  );
}

function TreeFolder({
  label,
  count,
  defaultOpen,
  onCreate,
  extraAction,
  creating,
  createLabel,
  namePlaceholder,
  descriptionPlaceholder,
  nameRequired,
  emptyActionLabel,
  children,
}: {
  label: string;
  count: number;
  defaultOpen: boolean;
  onCreate?: (name?: string, description?: string) => void;
  extraAction?: { label: string; onClick: () => void; disabled?: boolean };
  creating?: boolean;
  createLabel?: string;
  namePlaceholder?: string;
  descriptionPlaceholder?: string;
  nameRequired?: boolean;
  emptyActionLabel?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [nameError, setNameError] = useState('');

  function beginCreate() {
    setOpen(true);
    if (namePlaceholder) {
      setNaming(true);
      setDraftName('');
      setDraftDescription('');
      setNameError('');
      return;
    }
    onCreate?.();
  }

  return (
    <section className="min-w-0">
      <div className="flex w-full items-center gap-1 px-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left text-xs text-zinc-500 hover:text-zinc-800"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Chevron open={open} />
          <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
          <span className="tabular-nums text-zinc-400">{count}</span>
        </button>
        {extraAction ? (
          <button
            type="button"
            disabled={extraAction.disabled || creating}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50"
            onClick={(event) => {
              event.stopPropagation();
              extraAction.onClick();
            }}
          >
            {extraAction.label}
          </button>
        ) : null}
        {onCreate ? (
          <button
            type="button"
            disabled={creating}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50"
            onClick={(event) => {
              event.stopPropagation();
              beginCreate();
            }}
          >
            {creating ? '…' : (createLabel ?? '+ 新建')}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="ml-2 border-l border-zinc-200/80 pl-1">
          {naming ? (
            <form
              className="mx-1 mb-1 space-y-1 rounded-md border border-zinc-200 bg-white p-2"
              onSubmit={(event) => {
                event.preventDefault();
                const next = draftName.trim();
                if (nameRequired && !next) {
                  setNameError('请填写角色名称');
                  return;
                }
                const intro = draftDescription.trim();
                setNaming(false);
                setDraftName('');
                setDraftDescription('');
                setNameError('');
                onCreate?.(next || undefined, intro || undefined);
              }}
            >
              <input
                autoFocus
                value={draftName}
                disabled={creating}
                placeholder={namePlaceholder}
                className="w-full rounded border border-zinc-200 px-1.5 py-1 text-[11px] outline-none focus:border-[#4d6bfe]"
                onChange={(event) => {
                  setDraftName(event.target.value);
                  if (nameError) setNameError('');
                }}
              />
              {descriptionPlaceholder ? (
                <input
                  value={draftDescription}
                  disabled={creating}
                  placeholder={descriptionPlaceholder}
                  className="w-full rounded border border-zinc-200 px-1.5 py-1 text-[11px] outline-none focus:border-[#4d6bfe]"
                  onChange={(event) => setDraftDescription(event.target.value)}
                />
              ) : null}
              {nameError ? (
                <p className="text-[11px] text-red-600" role="alert">
                  {nameError}
                </p>
              ) : null}
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  className="px-1.5 py-0.5 text-[11px] text-zinc-400"
                  onClick={() => {
                    setNaming(false);
                    setDraftName('');
                    setDraftDescription('');
                    setNameError('');
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating || (nameRequired && !draftName.trim())}
                  className="rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] text-white disabled:opacity-40"
                >
                  {creating ? '…' : '创建'}
                </button>
              </div>
            </form>
          ) : null}
          {count === 0 && !naming && emptyActionLabel && onCreate ? (
            <button
              type="button"
              disabled={creating}
              className="w-full rounded-md px-2 py-1 text-left text-[12px] text-[#1e3a8a] hover:bg-zinc-100 disabled:opacity-50"
              onClick={beginCreate}
            >
              {emptyActionLabel}
            </button>
          ) : (
            children
          )}
        </div>
      ) : null}
    </section>
  );
}

function TreeFile({
  active,
  title,
  subtitle,
  actionLabel,
  onClick,
  onAction,
  actionDisabled,
  secondaryLabel,
  onSecondary,
}: {
  active: boolean;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onClick: () => void;
  onAction?: () => void;
  actionDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div
      className={`flex w-full items-center gap-1 rounded-md ${
        active
          ? 'bg-[#e8f0fe] text-zinc-900'
          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="min-w-0 flex-1 flex flex-col px-2 py-1 text-left"
      >
        <span className="truncate text-[13px] leading-5">{title}</span>
        {subtitle ? <span className="truncate text-[11px] text-zinc-400">{subtitle}</span> : null}
      </button>
      {onSecondary && secondaryLabel ? (
        <button
          type="button"
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-white"
          onClick={(event) => {
            event.stopPropagation();
            onSecondary();
          }}
        >
          {secondaryLabel}
        </button>
      ) : null}
      {onAction && actionLabel ? (
        <button
          type="button"
          disabled={actionDisabled}
          className="mr-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[#1e3a8a] hover:bg-white disabled:opacity-50"
          onClick={(event) => {
            event.stopPropagation();
            if (actionDisabled) return;
            onAction();
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function EntityExplorer({
  resources,
  selection,
  onSelect,
  threads = [],
  onNewChat,
  onCreate,
  creatingKind,
  createError,
}: {
  resources: WorldResourcesDTO;
  selection: WorldSelection;
  onSelect: (selection: Exclude<WorldSelection, null>) => void;
  threads?: CreatorChatThreadDTO[];
  onNewChat?: () => void;
  onCreate?: (
    kind: StudioCreateKind,
    extras?: StudioCreateExtras,
  ) => void | Promise<void | boolean>;
  creatingKind?: StudioCreateKind | null;
  createError?: string;
}) {
  const router = useRouter();
  const { stories, characters, locations, scenes, world_events, relationships } =
    resources.entities;
  const [relationshipOpen, setRelationshipOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [talkBusy, setTalkBusy] = useState(false);
  const [talkError, setTalkError] = useState('');
  const talkView = studioTalkActionView({ busy: talkBusy, error: talkError });

  const characterItems: FileItem[] = characters.map((item: AssetDTO) => ({
    id: item.id,
    title: item.name,
    subtitle: item.tier === 'light' ? '轻量' : item.description || undefined,
  }));
  const locationItems: FileItem[] = locations.map((item: AssetDTO) => ({
    id: item.id,
    title: item.name,
    subtitle: item.description || undefined,
  }));
  const sceneItems: FileItem[] = scenes.map((item: SceneDTO) => ({
    id: item.id,
    title: item.title,
    subtitle: item.summary || item.description || undefined,
  }));
  const eventItems: FileItem[] = world_events.map((item: WorldEventDTO) => ({
    id: item.id,
    title: item.title,
    subtitle: worldTimeCaption(item.world_time_envelope) || item.description || undefined,
  }));
  const storyItems: FileItem[] = stories.map((item: StoryDTO) => ({
    id: item.id,
    title: item.title,
    subtitle: item.logline || undefined,
  }));
  const relationshipItems: FileItem[] = relationships.map((item: WorldRelationshipDTO) => ({
    id: item.id,
    title: item.label || item.kind,
    subtitle: `${namedRefLabel(resources, item.source_type, item.source_id)} → ${namedRefLabel(resources, item.target_type, item.target_id)}`,
  }));
  const dimensionItems: FileItem[] = resolveDisplayDimensions(resources).map((dimension) => ({
    id: dimension.id,
    title: dimension.label,
    subtitle: DIMENSION_KIND_LABEL[dimension.kind],
  }));

  const worldThreads = threads.filter((thread) => thread.kind !== 'roleplay');
  const playThreads = threads.filter((thread) => thread.kind === 'roleplay');
  const projectSelected = selection?.kind === 'project' && selection.id === resources.project.id;

  return (
    <div className="flex h-full flex-col overflow-y-auto pb-6">
      {createError ? (
        <p
          className="mx-2 mt-2 rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-600"
          role="alert"
        >
          {createError}
        </p>
      ) : null}
      {talkView === 'error' ? (
        <p
          className="mx-2 mt-2 rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-600"
          role="alert"
        >
          {talkError}
        </p>
      ) : null}
      <div className="mt-1 space-y-0.5 px-1">
        <TreeFolder label="IP Core" count={1} defaultOpen>
          <TreeFile
            active={projectSelected}
            title={resources.project.name}
            subtitle="世界观 · 规则 · 题材"
            onClick={() => onSelect({ kind: 'project', id: resources.project.id })}
          />
        </TreeFolder>

        <TreeFolder label="对话" count={threads.length} defaultOpen>
          {onNewChat ? (
            <button
              type="button"
              className="mb-0.5 w-full rounded-md px-2 py-1 text-left text-[13px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              onClick={onNewChat}
            >
              + 新对话
            </button>
          ) : null}
          {worldThreads.length === 0 && playThreads.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-zinc-400">还没有对话</p>
          ) : (
            <>
              {worldThreads.map((thread) => (
                <TreeFile
                  key={thread.id}
                  active={false}
                  title={threadDisplayTitle(thread)}
                  subtitle="世界构建"
                  onClick={() => router.push(`/creator-chats/${thread.id}`)}
                />
              ))}
              {playThreads.map((thread) => (
                <TreeFile
                  key={thread.id}
                  active={false}
                  title={threadDisplayTitle(thread)}
                  subtitle={thread.character_name ? `扮演 · ${thread.character_name}` : '扮演'}
                  onClick={() => router.push(`/creator-chats/${thread.id}`)}
                />
              ))}
            </>
          )}
        </TreeFolder>

        <TreeFolder
          label="角色"
          count={characterItems.length}
          defaultOpen
          extraAction={
            onCreate
              ? {
                  label: '从其他世界导入',
                  disabled: creatingKind === 'character',
                  onClick: () => setImportOpen(true),
                }
              : undefined
          }
          onCreate={
            onCreate
              ? (name, description) =>
                  void onCreate('character', {
                    ...(name ? { name } : {}),
                    ...(description ? { description } : {}),
                  })
              : undefined
          }
          creating={creatingKind === 'character'}
          createLabel="+ 角色"
          namePlaceholder="角色名，如韩立"
          descriptionPlaceholder="简介，如雾城酒馆的店主"
          nameRequired
          emptyActionLabel="新建角色"
        >
          {characterItems.map((item) => (
            <TreeFile
              key={item.id}
              active={selection?.kind === 'character' && selection.id === item.id}
              title={item.title}
              subtitle={item.subtitle}
              secondaryLabel={
                onCreate &&
                isPlayableCharacter(characters.find((character) => character.id === item.id) ?? {})
                  ? creatingKind === 'character'
                    ? '…'
                    : '复制'
                  : undefined
              }
              onSecondary={
                onCreate ? () => void onCreate('character', { copyFromId: item.id }) : undefined
              }
              actionLabel="对话"
              actionDisabled={talkBusy}
              onClick={() => onSelect({ kind: 'character', id: item.id })}
              onAction={() => {
                if (talkBusy) return;
                setTalkBusy(true);
                setTalkError('');
                void createRoleplayThread(resources.project.id, item.id)
                  .then((created) => {
                    router.push(`/creator-chats/${created.thread_id}`);
                  })
                  .catch((reason: unknown) => {
                    setTalkError(errorMessage(reason) || '没能打开这场对话');
                  })
                  .finally(() => setTalkBusy(false));
              }}
            />
          ))}
        </TreeFolder>

        <TreeFolder
          label="地点"
          count={locationItems.length}
          defaultOpen={locationItems.length > 0}
          onCreate={
            onCreate ? (name) => void onCreate('location', name ? { name } : undefined) : undefined
          }
          creating={creatingKind === 'location'}
          createLabel="+ 地点"
          namePlaceholder="地点名"
          emptyActionLabel="新建地点"
        >
          {locationItems.map((item) => (
            <TreeFile
              key={item.id}
              active={selection?.kind === 'location' && selection.id === item.id}
              title={item.title}
              subtitle={item.subtitle}
              onClick={() => onSelect({ kind: 'location', id: item.id })}
            />
          ))}
        </TreeFolder>

        <TreeFolder
          label="事件"
          count={eventItems.length}
          defaultOpen={eventItems.length > 0}
          onCreate={
            onCreate
              ? (name) => void onCreate('world_event', name ? { name } : undefined)
              : undefined
          }
          creating={creatingKind === 'world_event'}
          createLabel="+ 事件"
          namePlaceholder="事件标题"
          emptyActionLabel="新建事件"
        >
          {eventItems.map((item) => (
            <TreeFile
              key={item.id}
              active={selection?.kind === 'world_event' && selection.id === item.id}
              title={item.title}
              subtitle={item.subtitle}
              onClick={() => onSelect({ kind: 'world_event', id: item.id })}
            />
          ))}
        </TreeFolder>

        <TreeFolder
          label="故事"
          count={storyItems.length}
          defaultOpen={storyItems.length > 0}
          onCreate={
            onCreate ? (name) => void onCreate('story', name ? { name } : undefined) : undefined
          }
          creating={creatingKind === 'story'}
          createLabel="+ 故事"
          namePlaceholder="故事名"
          emptyActionLabel="新建故事"
        >
          {storyItems.map((item) => (
            <TreeFile
              key={item.id}
              active={selection?.kind === 'story' && selection.id === item.id}
              title={item.title}
              subtitle={item.subtitle}
              onClick={() => onSelect({ kind: 'story', id: item.id })}
            />
          ))}
        </TreeFolder>

        <TreeFolder
          label="场景"
          count={sceneItems.length}
          defaultOpen={sceneItems.length > 0 || creatingKind === 'scene'}
          onCreate={
            onCreate ? (name) => void onCreate('scene', name ? { name } : undefined) : undefined
          }
          creating={creatingKind === 'scene'}
          createLabel="+ 场景"
          namePlaceholder="场景标题"
          emptyActionLabel="新建场景"
        >
          {sceneItems.map((item) => (
            <TreeFile
              key={item.id}
              active={selection?.kind === 'scene' && selection.id === item.id}
              title={item.title}
              subtitle={item.subtitle}
              onClick={() => onSelect({ kind: 'scene', id: item.id })}
            />
          ))}
        </TreeFolder>

        <TreeFolder
          label="关系"
          count={relationshipItems.length}
          defaultOpen={relationshipItems.length > 0 || relationshipOpen}
          onCreate={onCreate ? () => setRelationshipOpen(true) : undefined}
          creating={creatingKind === 'relationship'}
          createLabel="+ 关系"
        >
          {relationshipOpen && onCreate ? (
            <RelationshipCreateForm
              resources={resources}
              busy={creatingKind === 'relationship'}
              onCancel={() => setRelationshipOpen(false)}
              onSubmit={(relationship) => {
                void Promise.resolve(onCreate('relationship', { relationship })).then(() => {
                  setRelationshipOpen(false);
                });
              }}
            />
          ) : null}
          {relationshipItems.length === 0 && !relationshipOpen ? (
            onCreate ? (
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-left text-[12px] text-[#1e3a8a] hover:bg-zinc-100"
                onClick={() => setRelationshipOpen(true)}
              >
                新建关系
              </button>
            ) : (
              <p className="px-2 py-1 text-[11px] text-zinc-400">（空）</p>
            )
          ) : (
            relationshipItems.map((item) => (
              <TreeFile
                key={item.id}
                active={selection?.kind === 'relationship' && selection.id === item.id}
                title={item.title}
                subtitle={item.subtitle}
                onClick={() => onSelect({ kind: 'relationship', id: item.id })}
              />
            ))
          )}
        </TreeFolder>

        <TreeFolder
          label="时间维度"
          count={dimensionItems.length}
          defaultOpen={false}
          onCreate={
            onCreate ? (name) => void onCreate('dimension', name ? { name } : undefined) : undefined
          }
          creating={creatingKind === 'dimension'}
          createLabel="+ 维度"
          namePlaceholder="维度名，如梦境"
        >
          {dimensionItems.map((item) => (
            <TreeFile
              key={item.id}
              active={selection?.kind === 'dimension' && selection.id === item.id}
              title={item.title}
              subtitle={item.subtitle}
              onClick={() => onSelect({ kind: 'dimension', id: item.id })}
            />
          ))}
        </TreeFolder>
      </div>
      {importOpen && onCreate ? (
        <ImportCharacterDialog
          currentProjectId={resources.project.id}
          busy={creatingKind === 'character'}
          onCancel={() => setImportOpen(false)}
          onConfirm={(sourceProjectId, sourceCharacterId) => {
            void Promise.resolve(
              onCreate('character', { importFrom: { sourceProjectId, sourceCharacterId } }),
            ).then((ok) => {
              if (ok !== false) setImportOpen(false);
            });
          }}
        />
      ) : null}
    </div>
  );
}

function RelationshipCreateForm({
  resources,
  busy,
  onCancel,
  onSubmit,
}: {
  resources: WorldResourcesDTO;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: RelationshipCreateInput) => void;
}) {
  const options = relationshipRefOptions(resources);
  const [kind, setKind] = useState('related');
  const [label, setLabel] = useState('');
  const [sourceKey, setSourceKey] = useState(options[0] ? refKey(options[0]) : '');
  const [targetKey, setTargetKey] = useState(options[1] ? refKey(options[1]) : '');

  function parseKey(key: string): NamedEntityRef | undefined {
    return parseRefKey(key, options);
  }

  if (options.length < 2) {
    return (
      <p className="px-2 py-1 text-[11px] text-zinc-500">
        至少先有两个角色、地点或场景，才能建关系。
        <button type="button" className="ml-1 text-[#4d6bfe]" onClick={onCancel}>
          关闭
        </button>
      </p>
    );
  }

  return (
    <form
      className="mx-1 mb-1 space-y-1 rounded-md border border-zinc-200 bg-white p-2"
      onSubmit={(event) => {
        event.preventDefault();
        const source = parseKey(sourceKey);
        const target = parseKey(targetKey);
        if (!source || !target) return;
        onSubmit({
          kind: kind.trim() || 'related',
          source: { type: source.type, id: source.id },
          target: { type: target.type, id: target.id },
          label: label.trim() || undefined,
        });
      }}
    >
      <input
        value={kind}
        onChange={(event) => setKind(event.target.value)}
        placeholder="关系类型，如师徒"
        className="w-full rounded border border-zinc-200 px-1.5 py-1 text-[11px] outline-none focus:border-[#4d6bfe]"
      />
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="显示名（可选）"
        className="w-full rounded border border-zinc-200 px-1.5 py-1 text-[11px] outline-none focus:border-[#4d6bfe]"
      />
      <select
        value={sourceKey}
        onChange={(event) => setSourceKey(event.target.value)}
        className="w-full rounded border border-zinc-200 bg-white px-1.5 py-1 text-[11px]"
      >
        {options.map((item) => (
          <option key={`s-${item.type}-${item.id}`} value={refKey(item)}>
            从 {item.label}
          </option>
        ))}
      </select>
      <select
        value={targetKey}
        onChange={(event) => setTargetKey(event.target.value)}
        className="w-full rounded border border-zinc-200 bg-white px-1.5 py-1 text-[11px]"
      >
        {options.map((item) => (
          <option key={`t-${item.type}-${item.id}`} value={refKey(item)}>
            到 {item.label}
          </option>
        ))}
      </select>
      <div className="flex justify-end gap-1">
        <button
          type="button"
          className="px-1.5 py-0.5 text-[11px] text-zinc-400"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] text-white disabled:opacity-40"
        >
          {busy ? '…' : '创建'}
        </button>
      </div>
    </form>
  );
}
