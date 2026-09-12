import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
