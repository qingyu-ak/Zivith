import { useCallback, useState } from 'react';
import {
  CharacterCosmos,
  ConnectPanel,
  LS_API_BASE,
  LS_API_TOKEN,
  MOCK_UNIVERSE,
  SpaceCosmos,
  SystemView,
  UniverseView,
  getWorldResources,
  type ApiProject,
  type ConnectedProject,
  type UniverseBubble,
  type WorldResourcesDTO,
} from '@zivith/cosmos';

type Layer = 'universe' | 'system' | 'planet';
type ViewKey = 'space' | 'relations';

interface SourceState {
  kind: 'mock' | 'api';
  label: string;
  project: ConnectedProject | null;
}

export function App() {
  const [layer, setLayer] = useState<Layer>('universe');
  const [view, setView] = useState<ViewKey>('space');
  const [resources, setResources] = useState<WorldResourcesDTO | null>(null);
  const [bubbles, setBubbles] = useState<UniverseBubble[]>(MOCK_UNIVERSE);
  const [source, setSource] = useState<SourceState>({
    kind: 'mock',
    label: 'Universe',
    project: null,
  });
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keepSystem, setKeepSystem] = useState(false);
  const [keepPlanet, setKeepPlanet] = useState(false);

  const enterSystem = useCallback(
    (res: WorldResourcesDTO, project: ConnectedProject, kind: SourceState['kind']) => {
      setResources((prev) => {
        if (!prev || prev.project.id !== res.project.id) {
          queueMicrotask(() => setKeepPlanet(false));
        }
        return res;
      });
      setSource({ kind, label: project.name, project });
      setLoadError(null);
      setView('space');
      setKeepSystem(true);
      setLayer('system');
      setEnteringId(null);
    },
    [],
  );

  const handleLoaded = useCallback(
    (res: WorldResourcesDTO, project: ConnectedProject) => {
      enterSystem(res, project, 'api');
    },
    [enterSystem],
  );

  const handleProjectsListed = useCallback((projects: ApiProject[]) => {
    setBubbles((prev) => {
      const incoming: UniverseBubble[] = projects.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description ?? '',
        kind: 'api' as const,
      }));
      const prevMap = new Map(prev.map((bubble) => [bubble.id, bubble]));
      return incoming.map((bubble) => {
        const old = prevMap.get(bubble.id);
        return old ? { ...old, ...bubble, resources: old.resources, genre: old.genre } : bubble;
      });
    });
    setLayer('universe');
    setLoadError(null);
  }, []);

  const handleDisconnect = useCallback(() => {
    setBubbles(MOCK_UNIVERSE);
    setResources(null);
    setSource({ kind: 'mock', label: 'Universe', project: null });
    setLoadError(null);
    setKeepSystem(false);
    setKeepPlanet(false);
    setLayer('universe');
    setEnteringId(null);
  }, []);

  const handleEnterBubble = useCallback(
    async (bubble: UniverseBubble) => {
      if (bubble.resources) {
        enterSystem(bubble.resources, { id: bubble.id, name: bubble.name }, bubble.kind);
        return;
      }
      setEnteringId(bubble.id);
      setLoadError(null);
      try {
        const base = localStorage.getItem(LS_API_BASE) ?? 'http://127.0.0.1:4000';
        const token = localStorage.getItem(LS_API_TOKEN) ?? '';
        const res = await getWorldResources(base, token, bubble.id);
        enterSystem(res, { id: bubble.id, name: bubble.name }, 'api');
      } catch (err) {
        setEnteringId(null);
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    },
    [enterSystem],
  );

  const backToUniverse = useCallback(() => {
    setLayer('universe');
    setView('space');
  }, []);

  const backToSystem = useCallback(() => {
    setLayer('system');
    setView('space');
  }, []);

  const enterPlanet = useCallback(() => {
    setKeepPlanet(true);
    setLayer('planet');
    setView('space');
  }, []);

  const remountKey = `${source.kind}:${source.project?.id ?? 'none'}`;
  const title = layer === 'universe' ? 'Universe' : layer === 'system' ? 'Star System' : 'Cosmos';

  return (
    <div className="cosmos-root app">
      <header className="topbar">
        <div className="brand">
          <strong>Zivith {title}</strong>
          <em>
            {layer === 'universe'
              ? '左右滑动，切换宇宙'
              : layer === 'system'
                ? '恒星与世界轨道'
                : '世界空间浏览器 · Space × Timeline × Entity'}
          </em>
        </div>
        {layer !== 'universe' && (
          <nav className="tabs">
            <button className="tab" onClick={backToUniverse}>
              🌌 宇宙
            </button>
            {layer === 'planet' && (
              <button className="tab" onClick={backToSystem}>
                ☉ 恒星系
              </button>
            )}
            {layer === 'planet' && (
              <>
                <button
                  className={`tab ${view === 'space' ? 'active' : ''}`}
                  onClick={() => setView('space')}
                >
                  ◍ 空间
                </button>
                <button
                  className={`tab ${view === 'relations' ? 'active' : ''}`}
                  onClick={() => setView('relations')}
                >
                  ✦ 关系
                </button>
              </>
            )}
          </nav>
        )}
        <span className="source-badge">
          <span className={`dot ${source.kind === 'mock' ? 'mock' : ''}`} />
          {layer === 'universe'
            ? source.kind === 'api'
              ? `已连接 · ${bubbles.length} 个世界`
              : `示例宇宙 · ${bubbles.length} 个世界`
            : source.label}
        </span>
        <div className="connect-anchor">
          <ConnectPanel
            connected={source.kind === 'api' ? source.project : null}
            onLoaded={handleLoaded}
            onDisconnect={handleDisconnect}
            onProjectsListed={handleProjectsListed}
          />
        </div>
      </header>

      <main className="view-wrap">
        <div className={`layer-pane ${layer === 'universe' ? 'on' : ''}`}>
          <UniverseView
            bubbles={bubbles}
            enteringId={enteringId}
            onEnter={(bubble) => void handleEnterBubble(bubble)}
            active={layer === 'universe'}
          />
        </div>
        {resources && keepSystem ? (
          <div className={`layer-pane ${layer === 'system' ? 'on' : ''}`}>
            <SystemView
              key={remountKey}
              resources={resources}
              onEnterPlanet={enterPlanet}
              onBackToUniverse={backToUniverse}
              active={layer === 'system'}
            />
          </div>
        ) : null}
        {resources && keepPlanet ? (
          <div className={`layer-pane ${layer === 'planet' && view === 'space' ? 'on' : ''}`}>
            <SpaceCosmos
              key={remountKey}
              resources={resources}
              onBackToUniverse={backToUniverse}
              onBackToSystem={backToSystem}
              active={layer === 'planet' && view === 'space'}
              sourceKind={source.kind}
            />
          </div>
        ) : null}
        {resources && layer === 'planet' && view === 'relations' ? (
          <CharacterCosmos key={remountKey} resources={resources} />
        ) : null}
        {enteringId && <div className="loading-veil">进入世界…</div>}
        {loadError && (
          <div className="empty-state">
            <div>加载数据时出错：{loadError}</div>
          </div>
        )}
      </main>
    </div>
  );
}
