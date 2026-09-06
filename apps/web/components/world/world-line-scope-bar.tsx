'use client';

import type { WorldLineViewState } from '@/lib/world-line';

export function WorldLineScopeBar({
  view,
  domain,
  characterCount,
  sceneCount,
  onChange,
}: {
  view: WorldLineViewState;
  domain: { min: number; max: number };
  characterCount: number;
  sceneCount: number;
  onChange: (next: WorldLineViewState) => void;
}) {
  const min = Math.floor(domain.min);
  const max = Math.ceil(domain.max);
  const crowded = characterCount > 12 || sceneCount > 12;

  function clampOrder(value: number) {
    return Math.min(max, Math.max(min, Math.round(value)));
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-white px-4 py-2 text-xs text-zinc-600">
      <span className="font-medium text-zinc-800">范围</span>
      <div className="flex rounded-lg border border-line bg-zinc-100 p-0.5" role="radiogroup" aria-label="世界线范围">
        <button
          type="button"
          role="radio"
          aria-checked={view.overview}
          className={`rounded-md px-2.5 py-0.5 transition ${
            view.overview ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
          }`}
          onClick={() => onChange({ ...view, overview: true, from: min, to: max })}
        >
          总览
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!view.overview}
          className={`rounded-md px-2.5 py-0.5 transition ${
            !view.overview ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
          }`}
          onClick={() =>
            onChange({
              ...view,
              overview: false,
              from: view.overview ? min : view.from,
              to: view.overview ? Math.min(min + 4, max) : view.to,
            })
          }
        >
          按章
        </button>
      </div>
      {view.overview ? (
        <span className="text-zinc-400">全轴 #{min}–#{max}</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-zinc-600">
          第
          <input
            type="number"
            min={min}
            max={max}
            value={view.from}
            aria-label="起始章"
            className="w-14 rounded-md border border-line bg-white px-1.5 py-0.5 text-xs tabular-nums"
            onChange={(event) => {
              const from = clampOrder(Number(event.target.value));
              onChange({ ...view, overview: false, from, to: Math.max(from, view.to) });
            }}
          />
          –
          <input
            type="number"
            min={min}
            max={max}
            value={view.to}
            aria-label="结束章"
            className="w-14 rounded-md border border-line bg-white px-1.5 py-0.5 text-xs tabular-nums"
            onChange={(event) => {
              const to = clampOrder(Number(event.target.value));
              onChange({ ...view, overview: false, to, from: Math.min(view.from, to) });
            }}
          />
          章
        </span>
      )}

      <span className="mx-1 h-3 w-px bg-zinc-200" aria-hidden />

      <span className="font-medium text-zinc-800">角色 / 场景</span>
      <div
        className="flex rounded-lg border border-line bg-zinc-100 p-0.5"
        role="radiogroup"
        aria-label="条目密度"
      >
        <button
          type="button"
          role="radio"
          aria-checked={view.density === 'all'}
          className={`rounded-md px-2.5 py-0.5 transition ${
            view.density === 'all' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
          }`}
          onClick={() => onChange({ ...view, density: 'all' })}
        >
          全部
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={view.density === 'main'}
          className={`rounded-md px-2.5 py-0.5 transition ${
            view.density === 'main' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
          }`}
          onClick={() => onChange({ ...view, density: 'main' })}
        >
          仅主要
        </button>
      </div>
      {crowded && view.density === 'main' ? (
        <span className="text-zinc-400">轻量角色会藏起，主线人物按出场保留</span>
      ) : null}
    </div>
  );
}
