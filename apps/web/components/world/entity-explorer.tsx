'use client';

import type {
  AssetDTO,
  SceneDTO,
  StoryDTO,
  WorldEventDTO,
  WorldResourcesDTO,
  WorldSelection,
} from '@/lib/types';

interface GroupItem {
  id: string;
  title: string;
  subtitle?: string;
}

const GROUP_COLORS: Record<string, string> = {
  character: 'border-l-[#b7ff4a]',
  location: 'border-l-[#a78bfa]',
  scene: 'border-l-[#60a5fa]',
  world_event: 'border-l-[#fbbf24]',
  story: 'border-l-[#f472b6]',
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
                  } ${active ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5 hover:text-white'}`}
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
  const { stories, characters, locations, scenes, world_events } = resources.entities;

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
    subtitle: item.summary || undefined,
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

  const handleSelect = (item: GroupItem, kind: string) => {
    onSelect({
      kind: kind as 'character' | 'location' | 'scene' | 'world_event' | 'story',
      id: item.id,
    });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-2 pb-6">
      <div className="border-b border-line px-2 pt-4 pb-3">
        <h1 className="text-sm font-semibold text-white">实体 Explorer</h1>
        <p className="mt-0.5 text-xs text-zinc-500">{resources.project.name}</p>
      </div>
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
    </div>
  );
}
