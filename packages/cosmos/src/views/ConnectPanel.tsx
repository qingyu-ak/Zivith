import { useEffect, useRef, useState } from 'react';
import type { WorldResourcesDTO } from '../types';
import {
  getWorldResources,
  listProjects,
  LS_API_BASE,
  LS_API_TOKEN,
  type ApiProject,
} from '../lib/api';

export interface ConnectedProject {
  id: string;
  name: string;
}

interface Props {
  connected: ConnectedProject | null;
  onLoaded: (resources: WorldResourcesDTO, project: ConnectedProject) => void;
  onDisconnect: () => void;
  onProjectsListed?: (projects: ApiProject[]) => void;
}

const LS_BASE = LS_API_BASE;
const LS_TOKEN = LS_API_TOKEN;

export function ConnectPanel({ connected, onLoaded, onDisconnect, onProjectsListed }: Props) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState(() => localStorage.getItem(LS_BASE) ?? 'http://127.0.0.1:4000');
  const [token, setToken] = useState(() => localStorage.getItem(LS_TOKEN) ?? '');
  const [projects, setProjects] = useState<ApiProject[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState<'idle' | 'listing' | 'loading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const persist = () => {
    localStorage.setItem(LS_BASE, base);
    localStorage.setItem(LS_TOKEN, token);
  };

  const handleList = async () => {
    setBusy('listing');
    setError(null);
    try {
      persist();
      const list = await listProjects(base, token);
      setProjects(list);
      if (list.length > 0) setSelectedId(list[0].id);
      if (list.length === 0) setError('API 连上了，但还没有任何项目');
      onProjectsListed?.(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('idle');
    }
  };

  const handleLoad = async () => {
    if (!selectedId) return;
    setBusy('loading');
    setError(null);
    try {
      persist();
      const project = projects?.find((p) => p.id === selectedId);
      const resources = await getWorldResources(base, token, selectedId);
      onLoaded(resources, { id: selectedId, name: project?.name ?? resources.project.name });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('idle');
    }
  };

  const handleDisconnect = () => {
    setProjects(null);
    setSelectedId('');
    setOpen(false);
    onDisconnect();
  };

  return (
    <>
      <button
        className="btn"
        onClick={() => setOpen((v) => !v)}
        title={connected ? `已连接：${connected.name}` : '连接 Zivith 加载真实世界'}
      >
        {connected ? `已连接 · ${connected.name}` : '连接 Zivith'}
      </button>

      {open && (
        <div className="connect-pop" ref={popRef}>
          <h4>{connected ? '切换世界' : '连接 Zivith API'}</h4>

          <div className="field">
            <label>API 地址</label>
            <input
              className="input"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="http://127.0.0.1:4000"
            />
          </div>

          <div className="field">
            <label>Access Token（Bearer）</label>
            <input
              className="input"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="粘贴 zivith_token"
            />
          </div>

          <div className="row">
            <button className="btn" onClick={() => void handleList()} disabled={busy !== 'idle'}>
              {busy === 'listing' ? '载入中…' : '载入项目列表'}
            </button>
            {connected && (
              <button className="btn" onClick={handleDisconnect}>
                断开，回到示例
              </button>
            )}
          </div>

          {projects && projects.length > 0 && (
            <>
              <div className="field" style={{ marginTop: 10 }}>
                <label>选择项目</label>
                <select
                  className="select"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn primary"
                onClick={() => void handleLoad()}
                disabled={busy !== 'idle'}
                style={{ width: '100%' }}
              >
                {busy === 'loading' ? '加载中…' : '加载世界'}
              </button>
            </>
          )}

          {error && <div className="error">{error}</div>}
          {projects && projects.length > 0 && !error && (
            <div className="ok">已找到 {projects.length} 个项目</div>
          )}

          <div className="note">
            token 获取：打开 Zivith Studio（127.0.0.1:3100）并登录 → DevTools → Application → Local
            Storage → 复制 <b>zivith_token</b> 的值。默认地址通过本页代理转发，无需处理跨域。
          </div>
        </div>
      )}
    </>
  );
}
