'use client';

import type {
  AssetDTO,
  SceneDTO,
  StoryDTO,
  WorldEventDTO,
  WorldRelationshipDTO,
  WorldResourcesDTO,
  WorldSelection,
} from '@/lib/types';

interface GroupItem {
  id: string;
  title: string;
  subtitle?: string;
}

const GROUP_COLORS: Record<string, string> = {
  character: 'border-l-[#4d6bfe]',
  location: 'border-l-[#059669]',
  scene: 'border-l-[#60a5fa]',
  world_event: 'border-l-[#fbbf24]',
  story: 'border-l-[#f472b6]',
  project: 'border-l-zinc-400',
  relationship: 'border-l-[#f59e0b]',
};

function Group({
  label,
  kind,
  count,
  items,
  selection,
  onSelect,
}: {
  label: string;
  kind: string;
  count: number;
  items: GroupItem[];
  selection: WorldSelection;
  onSelect: (item: GroupItem, kind: string) => void;
}) {
  return (
    <section className="min-w-0">
      <h2 className="px-3 pt-4 pb-1.5 text-xs font-semibold tracking-wider text-zinc-500">
        {label}
        <span className="ml-1.5 text-zinc-600">{count}</span>
      </h2>
      {items.length === 0 ? (
        <p className="px-3 py-1 text-xs text-zinc-600">（空）</p>
      ) : (
        <ul className="space-y-0.5 px-2">
          {items.map((item) => {
            const active = selection?.id === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item, kind)}
                  className={`w-full rounded-md border-l-2 px-2.5 py-1.5 text-left transition ${
                    GROUP_COLORS[kind] ?? 'border-l-transparent'
                  } ${active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`}
                >
                  <span className="block truncate text-sm">{item.title}</span>
                  {item.subtitle && (
                    <span className="block truncate text-xs text-zinc-500">{item.subtitle}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function EntityExplorer({
  resources,
  selection,
  onSelect,
}: {
  resources: WorldResourcesDTO;
  selection: WorldSelection;
  onSelect: (selection: Exclude<WorldSelection, null>) => void;
}) {
  const { stories, characters, locations, scenes, world_events, relationships } =
    resources.entities;

  const characterItems: GroupItem[] = characters.map((item: AssetDTO) => ({
    id: item.id,
    title: item.name,
    subtitle: item.description || undefined,
  }));
  const locationItems: GroupItem[] = locations.map((item: AssetDTO) => ({
    id: item.id,
    title: item.name,
    subtitle: item.description || undefined,
  }));
  const sceneItems: GroupItem[] = scenes.map((item: SceneDTO) => ({
    id: item.id,
    title: item.title,
    subtitle: item.summary || item.description || undefined,
  }));
  const eventItems: GroupItem[] = world_events.map((item: WorldEventDTO) => ({
    id: item.id,
    title: item.title,
    subtitle: item.description || undefined,
  }));
  const storyItems: GroupItem[] = stories.map((item: StoryDTO) => ({
    id: item.id,
    title: item.title,
    subtitle: item.logline || undefined,
  }));
  const relationshipItems: GroupItem[] = relationships.map((item: WorldRelationshipDTO) => ({
    id: item.id,
    title: item.label || item.kind,
    subtitle: `${item.source_type} → ${item.target_type}`,
  }));
  const hasWorldview =
    Boolean(resources.project.worldview?.genre?.trim()) ||
    Boolean(resources.project.worldview?.premise?.trim()) ||
    (resources.project.worldview?.rules ?? []).length > 0;
  const worldviewItems: GroupItem[] = [
    {
      id: resources.project.id,
      title: resources.project.name,
      subtitle:
        resources.project.worldview?.premise?.trim() ||
        resources.project.worldview?.genre?.trim() ||
        '未设定世界观',
    },
  ];

  const handleSelect = (item: GroupItem, kind: string) => {
    onSelect({
      kind: kind as Exclude<WorldSelection, null>['kind'],
      id: item.id,
    });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-2 pb-6">
      <div className="border-b border-line px-2 pt-4 pb-3">
        <h1 className="text-sm font-semibold text-zinc-900">实体 Explorer</h1>
        <p className="mt-0.5 text-xs text-zinc-500">{resources.project.name}</p>
      </div>
      <Group
        label="世界观"
        kind="project"
        count={hasWorldview ? 1 : 0}
        items={worldviewItems}
        selection={selection}
        onSelect={handleSelect}
      />
      <Group
        label="角色"
        kind="character"
        count={characters.length}
        items={characterItems}
        selection={selection}
        onSelect={handleSelect}
      />
      <Group
        label="地点"
        kind="location"
        count={locations.length}
        items={locationItems}
        selection={selection}
        onSelect={handleSelect}
      />
      <Group
        label="场景"
        kind="scene"
        count={scenes.length}
        items={sceneItems}
        selection={selection}
        onSelect={handleSelect}
      />
      <Group
        label="事件"
        kind="world_event"
        count={world_events.length}
        items={eventItems}
        selection={selection}
        onSelect={handleSelect}
      />
      <Group
        label="故事"
        kind="story"
        count={stories.length}
        items={storyItems}
        selection={selection}
        onSelect={handleSelect}
      />
      <Group
        label="关系"
        kind="relationship"
        count={relationships.length}
        items={relationshipItems}
        selection={selection}
        onSelect={handleSelect}
      />
    </div>
  );
}
