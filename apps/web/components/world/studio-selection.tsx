'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { api, errorMessage, unwrapList } from '@/lib/api';
import type { CreatorChatThreadDTO, WorldResourcesDTO, WorldSelection } from '@/lib/types';
import { normalizeThread, parseStudioSelect } from '@/lib/creator-chat-nav';

interface StudioSelectionValue {
  selection: WorldSelection;
  setSelection: React.Dispatch<React.SetStateAction<WorldSelection>>;
  resources: WorldResourcesDTO | null;
  threads: CreatorChatThreadDTO[];
  loading: boolean;
  error: string;
  reload: (options?: { silent?: boolean }) => Promise<void>;
  requestEdit: (target: Exclude<WorldSelection, null>) => void;
  consumeBeginEditing: () => void;
  pendingEditKey: string | null;
}

const StudioSelectionContext = createContext<StudioSelectionValue | null>(null);

/**
 * Studio 壳级选中态 + 世界资源：左侧 Explorer 与时间线 / Inspector 共用一份。
 * 挂在 AppShell；按 projectId 重挂以在切换项目时清空选中。
 */
export function StudioSelectionProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const [selection, setSelection] = useState<WorldSelection>(null);
  const [resources, setResources] = useState<WorldResourcesDTO | null>(null);
  const [threads, setThreads] = useState<CreatorChatThreadDTO[]>([]);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState('');
  const [pendingEditKey, setPendingEditKey] = useState<string | null>(null);

  const reload = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!projectId) {
        setResources(null);
        setThreads([]);
        setLoading(false);
        setError('');
        return;
      }
      if (!options?.silent) {
        setLoading(true);
        setError('');
      }
      try {
        const [value, listed] = await Promise.all([
          api<WorldResourcesDTO>(`/world/projects/${projectId}/resources`),
          api<unknown[] | { data?: unknown[]; items?: unknown[] }>(
            `/world/projects/${projectId}/creator-chats`,
          ).catch(() => []),
        ]);
        setResources(value);
        setThreads(
          unwrapList(listed)
            .map(normalizeThread)
            .filter((thread): thread is CreatorChatThreadDTO => Boolean(thread?.id)),
        );
      } catch (reason) {
        if (options?.silent) throw reason;
        setError(errorMessage(reason));
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setSelection(null);
    setPendingEditKey(null);
  }, [projectId]);

  useEffect(() => {
    const parsed = parseStudioSelect(searchParams);
    if (parsed) setSelection(parsed);
  }, [searchParams, projectId]);

  const requestEdit = useCallback((target: Exclude<WorldSelection, null>) => {
    setPendingEditKey(`${target.kind}:${target.id}`);
  }, []);
  const consumeBeginEditing = useCallback(() => setPendingEditKey(null), []);

  return (
    <StudioSelectionContext.Provider
      value={{
        selection,
        setSelection,
        resources,
        threads,
        loading,
        error,
        reload,
        requestEdit,
        consumeBeginEditing,
        pendingEditKey,
      }}
    >
      {children}
    </StudioSelectionContext.Provider>
  );
}

export function useStudioSelection(): StudioSelectionValue {
  const value = useContext(StudioSelectionContext);
  if (!value) {
    throw new Error('useStudioSelection 必须在 StudioSelectionProvider 内使用');
  }
  return value;
}
