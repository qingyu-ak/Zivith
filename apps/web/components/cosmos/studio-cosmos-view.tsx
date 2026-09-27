'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '@zivith/ui';
import type { WorldResourcesDTO, WorldSelection } from '@/lib/types';

const StudioCosmosCanvas = dynamic(
  () => import('./studio-cosmos-canvas').then((mod) => mod.StudioCosmosCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center bg-black text-zinc-400">
        <Spinner label="正在打开空间…" />
      </div>
    ),
  },
);

export function StudioCosmosView(props: {
  resources: WorldResourcesDTO;
  selection: WorldSelection;
  onSelect: (selection: WorldSelection) => void;
}) {
  return <StudioCosmosCanvas {...props} />;
}
