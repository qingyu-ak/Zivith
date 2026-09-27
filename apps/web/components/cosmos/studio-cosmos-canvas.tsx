'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  SpaceCosmos,
  SystemView,
  UniverseView,
  type UniverseBubble,
  type WorldResourcesDTO as CosmosResources,
} from '@zivith/cosmos';
import '@zivith/cosmos/styles.css';
import { api, unwrapList } from '@/lib/api';
import type { ProjectDTO, WorldResourcesDTO, WorldSelection } from '@/lib/types';
import { parseSpaceLayer, worldCanvasHref } from '@/lib/world-canvas';

function isSpaceFly(selection: WorldSelection): boolean {
  return Boolean(
    selection &&
    (selection.kind === 'location' || selection.kind === 'scene' || selection.kind === 'character'),
  );
}

function bubbleFromProject(project: {
  id: string;
  name: string;
  description?: string | null;
}): UniverseBubble {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    kind: 'api',
  };
}

export function StudioCosmosCanvas({
  resources,
  selection,
  onSelect,
}: {
  resources: WorldResourcesDTO;
  selection: WorldSelection;
  onSelect: (selection: WorldSelection) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fly = isSpaceFly(selection);
  const urlUniverse = parseSpaceLayer(searchParams) === 'universe';
  const [layer, setLayer] = useState<'universe' | 'system' | 'planet'>(() => {
    if (urlUniverse) return 'universe';
    if (fly) return 'planet';
    return 'system';
  });
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [enteringId, setEnteringId] = useState<string | null>(null);

  useEffect(() => {
    if (urlUniverse) {
      setLayer('universe');
      return;
    }
    if (fly) {
      setLayer('planet');
      return;
    }
    setLayer((current) => (current === 'universe' ? 'system' : current));
  }, [fly, urlUniverse, selection?.id, selection?.kind]);

  useEffect(() => {
    let cancelled = false;
    api<ProjectDTO[] | { data?: ProjectDTO[]; items?: ProjectDTO[] }>('/projects')
      .then((value) => {
        if (!cancelled) setProjects(unwrapList(value));
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bubbles = useMemo((): UniverseBubble[] => {
    const byId = new Map<string, UniverseBubble>();
    byId.set(resources.project.id, bubbleFromProject(resources.project));
    for (const project of projects) {
      byId.set(project.id, bubbleFromProject(project));
    }
    const current = byId.get(resources.project.id);
    if (!current) return [...byId.values()];
    return [current, ...[...byId.values()].filter((bubble) => bubble.id !== current.id)];
  }, [projects, resources.project]);

  const goUniverse = useCallback(() => {
    setLayer('universe');
    router.replace(
      worldCanvasHref(resources.project.id, 'space', searchParams, { layer: 'universe' }),
    );
  }, [resources.project.id, router, searchParams]);

  const goSystem = useCallback(() => {
    setEnteringId(null);
    setLayer('system');
    router.replace(worldCanvasHref(resources.project.id, 'space', searchParams));
  }, [resources.project.id, router, searchParams]);

  const enterBubble = useCallback(
    (bubble: UniverseBubble) => {
      if (bubble.id === resources.project.id) {
        goSystem();
        return;
      }
      setEnteringId(bubble.id);
      router.push(`/projects/${bubble.id}/world?view=space`);
    },
    [goSystem, resources.project.id, router],
  );

  const cosmosResources = resources as unknown as CosmosResources;
  const locationId = selection?.kind === 'location' ? selection.id : null;
  const sceneId = selection?.kind === 'scene' ? selection.id : null;
  const characterId = selection?.kind === 'character' ? selection.id : null;
  const sceneLocationId = useMemo(() => {
    if (selection?.kind !== 'scene') return null;
    return resources.entities.scenes.find((item) => item.id === selection.id)?.location_id ?? null;
  }, [resources, selection]);

  const projectSelection = { kind: 'project' as const, id: resources.project.id };

  return (
    <div className="cosmos-root h-full min-h-0 w-full">
      {layer === 'universe' ? (
        <UniverseView
          bubbles={bubbles}
          enteringId={enteringId}
          onEnter={enterBubble}
          active
          initialFocusId={resources.project.id}
        />
      ) : layer === 'system' ? (
        <SystemView
          resources={cosmosResources}
          active
          embedded
          onEnterPlanet={() => setLayer('planet')}
          onBackToUniverse={goUniverse}
        />
      ) : (
        <SpaceCosmos
          resources={cosmosResources}
          active
          embedded
          sourceKind="api"
          onBackToUniverse={goUniverse}
          onBackToSystem={() => setLayer('system')}
          selectedLocationId={locationId ?? sceneLocationId}
          selectedSceneId={sceneId}
          selectedCharacterId={characterId}
          onSelectLocation={(id) => onSelect(id ? { kind: 'location', id } : projectSelection)}
          onSelectScene={(id) => {
            if (id) {
              onSelect({ kind: 'scene', id });
              return;
            }
            const fallback = locationId ?? sceneLocationId;
            onSelect(fallback ? { kind: 'location', id: fallback } : projectSelection);
          }}
          onSelectCharacter={(id) => {
            if (id) {
              onSelect({ kind: 'character', id });
              return;
            }
            onSelect(locationId ? { kind: 'location', id: locationId } : projectSelection);
          }}
        />
      )}
    </div>
  );
}
