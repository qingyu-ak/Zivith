'use client';

import { useRef, type PointerEvent, type ReactNode } from 'react';

export function ResizeHandle({
  orientation,
  label,
  onDrag,
}: {
  orientation: 'vertical' | 'horizontal';
  label: string;
  onDrag: (delta: number) => void;
}) {
  const last = useRef(0);
  const vertical = orientation === 'vertical';

  function start(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    last.current = vertical ? event.clientX : event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const pos = vertical ? event.clientX : event.clientY;
    onDrag(pos - last.current);
    last.current = pos;
  }

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      tabIndex={0}
      onPointerDown={start}
      onPointerMove={move}
      className={
        vertical
          ? 'z-10 w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-accent/25 active:bg-accent/40'
          : 'z-10 h-1.5 shrink-0 cursor-row-resize bg-zinc-200/80 hover:bg-accent/30 active:bg-accent/50'
      }
    />
  );
}

export function DockSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>{title}</span>
        <span className="text-[10px] text-zinc-400">{open ? '收起' : '展开'}</span>
      </button>
      {open ? <div className="px-1 pb-2">{children}</div> : null}
    </section>
  );
}
