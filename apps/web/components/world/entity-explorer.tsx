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
import { DIMENSION_KIND_LABEL, resolveDisplayDimensions, worldTimeCaption } from '@/lib/world-line';
import { useState, type ReactNode } from 'react';

interface FileItem {
  id: string;
  title: string;
  subtitle?: string;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span aria-hidden className={`inline-block w-3 text-[10px] text-zinc-400 ${open ? '' : '-rotate-90'}`}>
      ▼
    </span>
  );
}

function TreeFolder({
  label,
  count,
  defaultOpen,
  children,
}: {
  label: string;
  count: number;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="min-w-0">
      <button
        type="button"
        className="flex w-full items-center gap-1 px-2 py-1 text-left text-xs text-zinc-500 hover:text-zinc-800"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Chevron open={open} />
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span className="tabular-nums text-zinc-400">{count}</span>
      </button>
      {open ? <div className="ml-2 border-l border-zinc-200/80 pl-1">{children}</div> : null}
    </section>
  );
}

function TreeFile({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col rounded-md px-2 py-1 text-left ${
        active ? 'bg-[#e8f0fe] text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
      }`}
    >
      <span className="truncate text-[13px] leading-5">{title}</span>
      {subtitle ? <span className="truncate text-[11px] text-zinc-400">{subtitle}</span> : null}
    </button>
  );
}

export function EntityExplorer({
  resources,
  selection,
  onSelect,
  threads = [],
  onNewChat,
}: {
  resources: WorldResourcesDTO;
  selection: WorldSelection;
  onSelect: (selection: Exclude<WorldSelection, null>) => void;
  threads?: CreatorChatThreadDTO[];
  onNewChat?: () => void;
}) {
  const router = useRouter();
  const { stories, characters, locations, scenes, world_events, relationships } =
    resources.entities;

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
    subtitle: `${item.source_type} → ${item.target_type}`,
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
      <div className="border-b border-line px-3 py-3">
        <button
          type="button"
          onClick={() => onSelect({ kind: 'project', id: resources.project.id })}
          className={`w-full rounded-md px-1 py-0.5 text-left ${
            projectSelected ? 'bg-[#e8f0fe]' : 'hover:bg-zinc-100'
          }`}
        >
          <h1 className="truncate text-sm font-semibold text-zinc-900">{resources.project.name}</h1>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            {resources.project.workspace_path || '项目文件夹'}
          </p>
        </button>
      </div>

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

        <TreeFolder label="角色" count={characterItems.length} defaultOpen={characterItems.length > 0}>
          {characterItems.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-zinc-400">（空）</p>
          ) : (
            characterItems.map((item) => (
              <TreeFile
                key={item.id}
                active={selection?.kind === 'character' && selection.id === item.id}
                title={item.title}
                subtitle={item.subtitle}
                onClick={() => onSelect({ kind: 'character', id: item.id })}
              />
            ))
          )}
        </TreeFolder>

        <TreeFolder label="地点" count={locationItems.length} defaultOpen={locationItems.length > 0}>
          {locationItems.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-zinc-400">（空）</p>
          ) : (
            locationItems.map((item) => (
              <TreeFile
                key={item.id}
                active={selection?.kind === 'location' && selection.id === item.id}
                title={item.title}
                subtitle={item.subtitle}
                onClick={() => onSelect({ kind: 'location', id: item.id })}
              />
            ))
          )}
        </TreeFolder>

        <TreeFolder label="事件" count={eventItems.length} defaultOpen={eventItems.length > 0}>
          {eventItems.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-zinc-400">（空）</p>
          ) : (
            eventItems.map((item) => (
              <TreeFile
                key={item.id}
                active={selection?.kind === 'world_event' && selection.id === item.id}
                title={item.title}
                subtitle={item.subtitle}
                onClick={() => onSelect({ kind: 'world_event', id: item.id })}
              />
            ))
          )}
        </TreeFolder>

        <TreeFolder label="故事" count={storyItems.length} defaultOpen={storyItems.length > 0}>
          {storyItems.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-zinc-400">（空）</p>
          ) : (
            storyItems.map((item) => (
              <TreeFile
                key={item.id}
                active={selection?.kind === 'story' && selection.id === item.id}
                title={item.title}
                subtitle={item.subtitle}
                onClick={() => onSelect({ kind: 'story', id: item.id })}
              />
            ))
          )}
        </TreeFolder>

        <TreeFolder label="场景" count={sceneItems.length} defaultOpen={false}>
          {sceneItems.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-zinc-400">（空）</p>
          ) : (
            sceneItems.map((item) => (
              <TreeFile
                key={item.id}
                active={selection?.kind === 'scene' && selection.id === item.id}
                title={item.title}
                subtitle={item.subtitle}
                onClick={() => onSelect({ kind: 'scene', id: item.id })}
              />
            ))
          )}
        </TreeFolder>

        <TreeFolder label="关系" count={relationshipItems.length} defaultOpen={false}>
          {relationshipItems.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-zinc-400">（空）</p>
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

        <TreeFolder label="时间维度" count={dimensionItems.length} defaultOpen={false}>
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
    </div>
  );
}
