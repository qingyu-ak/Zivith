'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { navigationHistoryFor } from '@/lib/navigation-history';
import { isNavOverlay } from '@/lib/nav-overlay';
import { IconArrowLeft, IconArrowRight, IconSidebar } from './nav-icons';
import { DesktopWindowControls } from './desktop-window-controls';

/**
 * Chat 与 Studio 共用顶栏（Electron 里就是窗口标题栏）。
 * 前进 / 后退走全局浏览栈，从对话进设置或帮助后能回到原对话。
 */
export function TopBar({
  surface,
  onToggleSidebar,
  menus,
  middle,
  right,
}: {
  surface: 'chat' | 'studio';
  onToggleSidebar?: () => void;
  /** logo 右侧菜单（Studio：文件 / 编辑 / 视图 / 设置 / 帮助）。 */
  menus?: ReactNode;
  /** 前进/后退右侧、拖动空白之前的区域（Studio：项目切换）。 */
  middle?: ReactNode;
  /** 顶栏最右（Chat：Studio 跳转；Studio：制作 / Chat）。 */
  right?: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const locationKey = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  useEffect(() => {
    const history = navigationHistoryFor(surface);
    history.push(locationKey);
    setCanBack(history.canBack);
    setCanForward(history.canForward);
  }, [locationKey, surface]);

  function goBack() {
    const history = navigationHistoryFor(surface);
    const target = isNavOverlay(history.current)
      ? history.backLeaving(isNavOverlay)
      : history.back();
    if (target) router.push(target);
  }

  function goForward() {
    const target = navigationHistoryFor(surface).forward();
    if (target) router.push(target);
  }

  return (
    <header
      className="sticky top-0 z-40 flex h-11 w-full shrink-0 items-center gap-1 border-b border-line bg-[var(--z-chrome)] pl-2 select-none [-webkit-app-region:drag]"
      style={{
        paddingLeft: 'max(0.5rem, env(titlebar-area-x, 0.5rem))',
        height: 'env(titlebar-area-height, 2.75rem)',
      }}
    >
      <img
        src="/brand/icon.png"
        alt="Zivith"
        width={20}
        height={20}
        draggable={false}
        title="Zivith"
        className="mx-1 size-4 shrink-0 rounded [-webkit-app-region:no-drag]"
      />
      {menus ? (
        <div className="flex min-w-0 items-center [-webkit-app-region:no-drag]">{menus}</div>
      ) : null}
      <TopBarButton label="上一步" disabled={!canBack} onClick={goBack}>
        <IconArrowLeft className="size-4" />
      </TopBarButton>
      <TopBarButton label="下一步" disabled={!canForward} onClick={goForward}>
        <IconArrowRight className="size-4" />
      </TopBarButton>
      {onToggleSidebar ? (
        <TopBarButton label="收起 / 展开侧栏" onClick={onToggleSidebar}>
          <IconSidebar className="size-4" />
        </TopBarButton>
      ) : null}
      {middle ? (
        <div className="flex min-w-0 items-center gap-1 [-webkit-app-region:no-drag]">{middle}</div>
      ) : null}
      <span className="flex-1" />
      {right ? (
        <div className="flex items-center gap-1 pr-1 [-webkit-app-region:no-drag]">{right}</div>
      ) : null}
      <DesktopWindowControls />
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-200/80 hover:text-zinc-800 disabled:pointer-events-none disabled:opacity-40 [-webkit-app-region:no-drag]"
    >
      {children}
    </button>
  );
}
