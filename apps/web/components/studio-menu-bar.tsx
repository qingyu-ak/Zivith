'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { errorMessage } from '@/lib/api';
import { normalizeThread } from '@/lib/creator-chat-nav';
import { isDesktopApp, pickWorkspaceDirectory } from '@/lib/desktop';
import { captureSettingsReturn } from '@/lib/settings-return';
import { FolderFlowCancelled, openWorldFromFolder } from '@/lib/world-folder';

type MenuId = 'file' | 'edit' | 'view' | 'settings' | 'help';

/** Studio 顶栏菜单：只挂真实命令，不做空的 File/Edit 装饰。 */
export function StudioMenuBar({
  projectId,
  settingsHref,
  productionHref,
  explorerCollapsed,
  onToggleExplorer,
  onOpenChat,
}: {
  projectId?: string;
  settingsHref: string;
  productionHref: string;
  explorerCollapsed: boolean;
  onToggleExplorer: () => void;
  onOpenChat: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<MenuId | null>(null);
  const [desktop, setDesktop] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDesktop(isDesktopApp());
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(null);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function openFolder() {
    setOpen(null);
    try {
      const folderPath = await pickWorkspaceDirectory();
      if (!folderPath) return;
      // §8/§18：先检查 .zivith/workspace.json，再按异常状态引导用户选择。
      const created = await openWorldFromFolder(folderPath);
      const thread = normalizeThread(created);
      if (thread?.project_id) router.push(`/projects/${thread.project_id}/world`);
    } catch (reason) {
      if (reason instanceof FolderFlowCancelled) return;
      // §18.4：冲突/异常必须把原因告诉用户，不再静默跳转项目页。
      window.alert(errorMessage(reason));
    }
  }

  function edit(command: 'undo' | 'redo' | 'cut' | 'copy' | 'paste') {
    setOpen(null);
    document.execCommand(command);
  }

  const worldHref = projectId ? `/projects/${projectId}/world` : '/projects';
  const assetsHref = projectId ? `/projects/${projectId}/assets` : '/projects';
  const storiesHref = projectId ? `/projects/${projectId}` : '/projects';

  return (
    <nav
      ref={rootRef}
      className="flex items-center gap-0.5 [-webkit-app-region:no-drag]"
      aria-label="Studio 菜单"
    >
      <Menu label="文件" id="file" open={open} setOpen={setOpen}>
        {desktop ? <MenuButton onClick={() => void openFolder()}>打开文件夹</MenuButton> : null}
        <MenuLink href="/projects?new=1" onClick={() => setOpen(null)}>
          新建项目
        </MenuLink>
        <MenuLink href="/projects" onClick={() => setOpen(null)}>
          打开项目…
        </MenuLink>
        <MenuLink href={productionHref} onClick={() => setOpen(null)}>
          制作
        </MenuLink>
        <MenuButton
          onClick={() => {
            setOpen(null);
            onOpenChat();
          }}
        >
          打开 Chat
        </MenuButton>
      </Menu>
      {desktop ? (
        <Menu label="编辑" id="edit" open={open} setOpen={setOpen}>
          <MenuButton onClick={() => edit('undo')}>撤销</MenuButton>
          <MenuButton onClick={() => edit('redo')}>重做</MenuButton>
          <MenuButton onClick={() => edit('cut')}>剪切</MenuButton>
          <MenuButton onClick={() => edit('copy')}>复制</MenuButton>
          <MenuButton onClick={() => edit('paste')}>粘贴</MenuButton>
        </Menu>
      ) : null}
      <Menu label="视图" id="view" open={open} setOpen={setOpen}>
        <MenuButton
          onClick={() => {
            setOpen(null);
            onToggleExplorer();
          }}
        >
          {explorerCollapsed ? '显示资源树' : '隐藏资源树'}
        </MenuButton>
        <MenuLink href={worldHref} onClick={() => setOpen(null)}>
          世界工作区
        </MenuLink>
        <MenuLink href={assetsHref} onClick={() => setOpen(null)}>
          实体库
        </MenuLink>
        <MenuLink href={storiesHref} onClick={() => setOpen(null)}>
          故事
        </MenuLink>
      </Menu>
      <Menu label="设置" id="settings" open={open} setOpen={setOpen}>
        <MenuLink
          href={settingsHref}
          onClick={() => {
            captureSettingsReturn();
            setOpen(null);
          }}
        >
          系统设置
        </MenuLink>
        <MenuLink
          href={`${settingsHref}${settingsHref.includes('?') ? '&' : '?'}section=models`}
          onClick={() => {
            captureSettingsReturn();
            setOpen(null);
          }}
        >
          模型设置
        </MenuLink>
      </Menu>
      <Menu label="帮助" id="help" open={open} setOpen={setOpen}>
        <MenuLink href="/help" onClick={() => setOpen(null)}>
          使用文档
        </MenuLink>
        <MenuLink href="/help#feedback" onClick={() => setOpen(null)}>
          反馈
        </MenuLink>
      </Menu>
    </nav>
  );
}

function Menu({
  label,
  id,
  open,
  setOpen,
  children,
}: {
  label: string;
  id: MenuId;
  open: MenuId | null;
  setOpen: (id: MenuId | null) => void;
  children: ReactNode;
}) {
  const shown = open === id;
  return (
    <div className="relative">
      <button
        type="button"
        className={`rounded-md px-2 py-1 text-xs transition ${
          shown
            ? 'bg-zinc-200/80 text-zinc-900'
            : 'text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900'
        }`}
        aria-expanded={shown}
        aria-haspopup="menu"
        onClick={() => setOpen(shown ? null : id)}
      >
        {label}
      </button>
      {shown ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[10rem] rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
