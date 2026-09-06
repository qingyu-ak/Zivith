'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { navigationHistory } from '@/lib/navigation-history';
import { IconArrowLeft, IconArrowRight, IconSidebar } from './nav-icons';

/** Chat 与 Studio 共用顶栏：logo 槽、收起侧栏、应用内上一步/下一步（会话级路径栈）。 */
export function TopBar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);

  useEffect(() => {
    navigationHistory.push(pathname);
    setCanBack(navigationHistory.canBack);
    setCanForward(navigationHistory.canForward);
  }, [pathname]);

  function goBack() {
    const target = navigationHistory.back();
    if (target) router.push(target);
  }

  function goForward() {
    const target = navigationHistory.forward();
    if (target) router.push(target);
  }

  return (
    <header className="sticky top-0 z-40 flex h-11 shrink-0 items-center gap-1 border-b border-line bg-[#f7f8fa] px-2">
      {/* logo 位：28×28 圆角槽，正式 logo 就位后替换背景即可。 */}
      <span
        className="mx-1 size-7 shrink-0 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-900"
        title="Zivith"
      />
      <TopBarButton
        label="上一步"
        disabled={!canBack}
        onClick={goBack}
      >
        <IconArrowLeft className="size-4" />
      </TopBarButton>
      <TopBarButton
        label="下一步"
        disabled={!canForward}
        onClick={goForward}
      >
        <IconArrowRight className="size-4" />
      </TopBarButton>
      {onToggleSidebar ? (
        <TopBarButton label="收起 / 展开侧栏" onClick={onToggleSidebar}>
          <IconSidebar className="size-4" />
        </TopBarButton>
      ) : null}
      <span className="flex-1" />
    </header>
  );
}

function TopBarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-200/80 hover:text-zinc-800 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}
