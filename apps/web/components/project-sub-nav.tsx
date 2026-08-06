'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const sections = [
  { label: '世界工作区', suffix: '/world' },
  { label: '故事', suffix: '' },
  { label: '实体库', suffix: '/assets' },
  { label: '制作', suffix: '/production' },
  { label: '设置', suffix: '/settings' },
] as const;

/** 项目内分区导航：世界工作区 / 故事 / 实体库 / 制作 / 设置 */
export function ProjectSubNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  return (
    <nav
      aria-label="项目分区"
      className="mb-8 flex flex-wrap gap-1 rounded-xl border border-line bg-ink/50 p-1"
    >
      {sections.map((item) => {
        const href = `${base}${item.suffix}`;
        const active =
          item.suffix === '/world'
            ? pathname.includes('/world')
            : item.suffix === '/assets'
              ? pathname.includes('/assets')
              : item.suffix === '/production'
                ? pathname.includes('/production')
                : item.suffix === '/settings'
                  ? pathname.includes('/settings')
                  : pathname === href || pathname.startsWith(`${href}/stories`);
        return (
          <Link
            key={item.label}
            href={href}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm transition ${
              active
                ? 'bg-white/5 text-white'
                : 'text-zinc-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
