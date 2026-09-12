'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { studioHrefForEntity } from '@/lib/creator-chat-nav';

export interface ChatChoiceOption {
  value: string;
  label: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
}

export function ChatChoiceMenu({
  value,
  disabled,
  label,
  options,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  label: string;
  options: ChatChoiceOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = options.filter((option) => {
    if (!query.trim()) return true;
    const hay = `${option.label} ${option.description ?? ''}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={current?.description || current?.label || label}
        onClick={() => setOpen((next) => !next)}
        className="relative max-w-[12rem] truncate rounded-full border border-zinc-200 bg-white py-1 pl-3 pr-7 text-left text-xs text-zinc-600 transition hover:border-[#4d6bfe]/40 hover:text-zinc-900 disabled:opacity-50"
      >
        {current?.label ?? label}
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[9px] text-zinc-400">
          ▼
        </span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-full z-40 mt-1 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg"
        >
          {options.length > 8 ? (
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名字或简介"
              className="w-full border-b border-zinc-100 px-3 py-2 text-xs outline-none placeholder:text-zinc-400"
            />
          ) : null}
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-zinc-400">没有匹配的角色</li>
            ) : (
              filtered.map((option) => {
                const active = option.value === value;
                return (
                  <li key={option.value}>
                    <div
                      className={`flex items-start gap-2 px-3 py-2 ${
                        active ? 'bg-[#e8f0fe]' : 'hover:bg-zinc-50'
                      }`}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          onChange(option.value);
                          setOpen(false);
                          setQuery('');
                        }}
                      >
                        <span className="block truncate text-xs text-zinc-800">{option.label}</span>
                        {option.description ? (
                          <span className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-zinc-500">
                            {option.description}
                          </span>
                        ) : null}
                      </button>
                      {option.href ? (
                        <Link
                          href={option.href}
                          className="shrink-0 pt-0.5 text-[10px] text-[#4d6bfe] hover:underline"
                          onClick={() => setOpen(false)}
                        >
                          {option.hrefLabel ?? '改卡'}
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function CharacterCardPeek({
  projectId,
  characterId,
  name,
  preview,
  extra,
}: {
  projectId: string;
  characterId: string;
  name: string;
  preview: string;
  extra?: ReactNode;
}) {
  return (
    <div className="flex max-w-xl flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] leading-5 text-zinc-500">
      <span className="line-clamp-2 min-w-0 flex-1">
        {preview || `「${name}」的角色卡还没有简介。`}
      </span>
      <Link
        href={studioHrefForEntity(projectId, { kind: 'character', id: characterId })}
        className="shrink-0 text-[#4d6bfe] hover:underline"
      >
        在 Studio 编辑角色卡
      </Link>
      {extra}
    </div>
  );
}
