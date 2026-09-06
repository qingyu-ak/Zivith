'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { WorldSelection } from '@/lib/types';

interface StudioSelectionValue {
  selection: WorldSelection;
  setSelection: React.Dispatch<React.SetStateAction<WorldSelection>>;
}

const StudioSelectionContext = createContext<StudioSelectionValue | null>(null);

/**
 * Studio 壳级选中态：左侧 Explorer 树与世界工作区（时间线 / Inspector）共用。
 * 挂在 AppShell；按 projectId 重挂以在切换项目时清空选中。
 */
export function StudioSelectionProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const [selection, setSelection] = useState<WorldSelection>(null);

  useEffect(() => {
    setSelection(null);
  }, [projectId]);

  return (
    <StudioSelectionContext.Provider value={{ selection, setSelection }}>
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
