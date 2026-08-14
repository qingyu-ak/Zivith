'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { WorldLineItem, WorldLineModel, WorldSelection } from '@/lib/types';
import { createOrderScale, integerTicks } from '@/lib/world-scale';

const TRACK_LABEL_WIDTH = 76;
const TRACK_HEIGHT = 58;
const TRACK_GAP = 10;
const PADDING = { top: 8, right: 18, bottom: 14 };
const ITEM_HEIGHT = 32;
const ITEM_INSET = 8;
const CHAR_LANE_GAP = 6;
const CHAR_LANE_PAD = 8;

interface TrackColor {
  fill: string;
  stroke: string;
  text: string;
}

const TRACK_COLORS: Record<string, TrackColor> = {
  character: { fill: 'rgba(77,107,254,0.12)', stroke: '#4d6bfe', text: '#1e3a8a' },
  location: { fill: 'rgba(5,150,105,0.12)', stroke: '#059669', text: '#065f46' },
  scene: { fill: 'rgba(37,99,235,0.10)', stroke: '#2563eb', text: '#1e3a8a' },
  world_event: { fill: 'rgba(217,119,6,0.12)', stroke: '#d97706', text: '#92400e' },
  story: { fill: 'rgba(219,39,119,0.10)', stroke: '#db2777', text: '#9d174d' },
  shot: { fill: 'rgba(225,29,72,0.10)', stroke: '#e11d48', text: '#9f1239' },
};

const KIND_LABEL: Record<string, string> = {
  character: '角色',
  location: '地点',
  scene: '场景',
  world_event: '事件',
  story: '故事',
  shot: '镜头',
};

function estimateTextWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += char.charCodeAt(0) > 255 ? 14 : 8;
  }
  return width;
}

function clipLabel(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function stackedTrack(kind: string, itemCount: number): boolean {
  return (kind === 'character' || kind === 'location') && itemCount > 1;
}

function itemCaption(item: WorldLineItem): string | null {
  const extra = item.extra ?? {};
  if (typeof extra.world_time_label === 'string' && extra.world_time_label) {
    return extra.world_time_label;
  }
  if (typeof extra.time_of_day === 'string' && extra.time_of_day) return extra.time_of_day;
  return null;
}

function itemDiverges(item: WorldLineItem): boolean {
  return item.extra?.world_time_diverges === true;
}

interface HoverInfo {
  x: number;
  y: number;
  title: string;
  kind: string;
  description?: string | null;
  worldTime?: string | null;
  diverges?: boolean;
}

export function WorldTimeline({
  model,
  selection,
  onSelect,
}: {
  model: WorldLineModel;
  selection: WorldSelection;
  onSelect: (selection: Exclude<WorldSelection, null>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const namedAxis = model.axisMarks.length > 0;
  const axisHeight = namedAxis ? 52 : 30;
  const plotLeft = TRACK_LABEL_WIDTH + 8;
  const plotRight = Math.max(width - PADDING.right, plotLeft + 120);

  const scale = useMemo(() => {
    const { min, max } = model.scaleDomain;
    return createOrderScale([min, max], [plotLeft, plotRight]);
  }, [model.scaleDomain, plotLeft, plotRight]);

  const fallbackTicks = useMemo(
    () => integerTicks(model.scaleDomain.min, model.scaleDomain.max),
    [model.scaleDomain],
  );

  const layout = useMemo(() => {
    let y = PADDING.top + axisHeight;
    const tracks: Array<{
      id: string;
      title: string;
      kind: string;
      trackY: number;
      height: number;
    }> = [];
    const positions = new Map<
      string,
      { x: number; y: number; cx: number; cy: number; itemWidth: number; kind: string }
    >();

    for (const track of model.tracks) {
      const stacked = stackedTrack(track.kind, track.items.length);
      const height = stacked
        ? Math.max(
            TRACK_HEIGHT,
            CHAR_LANE_PAD * 2 +
              track.items.length * ITEM_HEIGHT +
              Math.max(0, track.items.length - 1) * CHAR_LANE_GAP,
          )
        : TRACK_HEIGHT;
      const trackY = y;
      tracks.push({ id: track.id, title: track.title, kind: track.kind, trackY, height });

      track.items.forEach((item, itemIndex) => {
        const itemWidth = Math.min(Math.max(estimateTextWidth(item.title) + 24, 84), 190);
        const maxLeft = Math.max(plotLeft + ITEM_INSET, plotRight - itemWidth - ITEM_INSET);
        const x = Math.min(
          Math.max(scale(item.anchorOrder) - itemWidth / 2, plotLeft + ITEM_INSET),
          maxLeft,
        );
        const itemY = stacked
          ? trackY + CHAR_LANE_PAD + itemIndex * (ITEM_HEIGHT + CHAR_LANE_GAP)
          : trackY + (height - ITEM_HEIGHT) / 2;
        positions.set(item.id, {
          x,
          y: itemY,
          cx: x + itemWidth / 2,
          cy: itemY + ITEM_HEIGHT / 2,
          itemWidth,
          kind: track.kind,
        });
      });

      y += height + TRACK_GAP;
    }

    return { tracks, positions, totalHeight: y - TRACK_GAP + PADDING.bottom };
  }, [model.tracks, plotLeft, plotRight, scale, axisHeight]);

  const links = useMemo(
    () =>
      model.relationships
        .map((relationship) => {
          const source = relationship.sourceItemId
            ? layout.positions.get(relationship.sourceItemId)
            : undefined;
          const target = relationship.targetItemId
            ? layout.positions.get(relationship.targetItemId)
            : undefined;
          if (!source || !target) return null;
          if (source.cx === target.cx && source.cy === target.cy) return null;
          const sameTrack = source.cy === target.cy;
          const curveY = sameTrack ? source.cy - 18 : (source.cy + target.cy) / 2;
          return {
            id: relationship.id,
            label: relationship.label,
            d: `M ${source.cx} ${source.cy} C ${source.cx} ${curveY}, ${target.cx} ${curveY}, ${target.cx} ${target.cy}`,
            midX: (source.cx + target.cx) / 2,
            midY: curveY - 6,
          };
        })
        .filter((link): link is Exclude<typeof link, null> => link !== null),
    [model.relationships, layout.positions],
  );

  const svgHeight = layout.totalHeight;
  const axisY = PADDING.top + axisHeight;
  const hasDivergence = model.axisMarks.some((mark) => mark.worldTimeDiverges);

  function showItemHover(event: MouseEvent, item: WorldLineItem, kind: string) {
    const host = containerRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    setHover({
      x: event.clientX - rect.left + host.scrollLeft + 12,
      y: event.clientY - rect.top + host.scrollTop + 12,
      title: item.title,
      kind: KIND_LABEL[kind] ?? kind,
      description: item.description,
      worldTime: itemCaption(item),
      diverges: itemDiverges(item),
    });
  }

  if (width === 0) {
    return (
      <div ref={containerRef} className="h-full min-h-64 w-full">
        <div className="grid h-full min-h-64 place-items-center text-sm text-zinc-600">
          世界线渲染中…
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-auto">
      <div className="sticky top-0 z-10 mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 bg-white/90 px-1 py-1 text-[11px] text-zinc-500 backdrop-blur">
        <span>刻度按呈现顺序</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-px bg-zinc-300" />
          事件竖线对齐主轴
        </span>
        {hasDivergence && (
          <span className="inline-flex items-center gap-1.5 text-amber-700">
            <span className="inline-block size-2 rounded-full bg-amber-500" />
            琥珀色表示世界时间偏离呈现序
          </span>
        )}
      </div>
      <svg
        width={plotRight + PADDING.right}
        height={svgHeight}
        className="block min-w-full"
        role="img"
        aria-label="世界线时间轴"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <filter id="selected-glow" x="-40%" y="-60%" width="180%" height="220%">
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="4"
              floodColor={selection ? 'currentColor' : '#4d6bfe'}
              floodOpacity="0.45"
            />
          </filter>
        </defs>

        {/* 事件竖导轨：把呈现主轴落到各轨道 */}
        <g>
          {(namedAxis ? model.axisMarks : fallbackTicks.map((tick) => ({ order: tick }))).map(
            (mark, index) => (
              <line
                key={`guide-${mark.order}-${index}`}
                x1={scale(mark.order)}
                y1={axisY}
                x2={scale(mark.order)}
                y2={svgHeight - PADDING.bottom}
                stroke={
                  'worldTimeDiverges' in mark && mark.worldTimeDiverges
                    ? 'rgba(217,119,6,0.28)'
                    : 'rgba(24,24,27,0.08)'
                }
                strokeWidth="1"
              />
            ),
          )}
        </g>

        {/* 关系连线层（条目之下） */}
        <g>
          {links.map((link) => {
            const active = selection?.kind === 'relationship' && selection.id === link.id;
            return (
              <g
                key={link.id}
                className="cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect({ kind: 'relationship', id: link.id });
                }}
              >
                <path
                  d={link.d}
                  fill="none"
                  stroke={active ? 'rgba(217,119,6,0.9)' : 'rgba(24,24,27,0.18)'}
                  strokeWidth={active ? 2.25 : 1.25}
                  strokeDasharray="4 3"
                />
                {link.label && (
                  <text
                    x={link.midX}
                    y={link.midY}
                    fill={active ? '#b45309' : '#71717a'}
                    fontSize="10"
                    textAnchor="middle"
                  >
                    {link.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* 顶部刻度轴：呈现顺序为主轴，事件标题为刻度名 */}
        <g>
          <line
            x1={plotLeft}
            y1={axisY}
            x2={plotRight}
            y2={axisY}
            stroke="#d4d4d8"
            strokeWidth="1"
          />
          {namedAxis
            ? model.axisMarks.map((mark, index) => {
                const x = scale(mark.order);
                const diverges = Boolean(mark.worldTimeDiverges);
                return (
                  <g key={`axis-${mark.order}-${index}`}>
                    <line
                      x1={x}
                      y1={axisY}
                      x2={x}
                      y2={axisY + 5}
                      stroke={diverges ? '#d97706' : '#d4d4d8'}
                      strokeWidth="1"
                    />
                    <text
                      x={x}
                      y={PADDING.top + 14}
                      fill={diverges ? '#b45309' : '#3f3f46'}
                      fontSize="11"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {clipLabel(mark.label, 8)}
                    </text>
                    <text
                      x={x}
                      y={PADDING.top + 28}
                      fill={diverges ? '#d97706' : '#a1a1aa'}
                      fontSize="9"
                      textAnchor="middle"
                    >
                      {mark.worldTimeLabel ? clipLabel(mark.worldTimeLabel, 10) : `#${mark.order}`}
                    </text>
                    {diverges && <circle cx={x + 18} cy={PADDING.top + 12} r="3" fill="#d97706" />}
                  </g>
                );
              })
            : fallbackTicks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={scale(tick)}
                    y1={axisY}
                    x2={scale(tick)}
                    y2={axisY + 5}
                    stroke="#d4d4d8"
                    strokeWidth="1"
                  />
                  <text
                    x={scale(tick)}
                    y={PADDING.top + 10}
                    fill="#71717a"
                    fontSize="11"
                    textAnchor="middle"
                  >
                    #{tick}
                  </text>
                </g>
              ))}
        </g>

        {/* 轨道行 + 条目 */}
        {layout.tracks.map((track, index) => {
          const color = TRACK_COLORS[track.kind] ?? TRACK_COLORS.world_event;
          const source = model.tracks[index];
          const trackItems = source?.items ?? [];
          const label = track.title || KIND_LABEL[track.kind] || track.kind;
          return (
            <g key={track.id}>
              <rect
                x={plotLeft}
                y={track.trackY}
                width={plotRight - plotLeft}
                height={track.height}
                rx="10"
                fill="rgba(24,24,27,0.03)"
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text
                x={TRACK_LABEL_WIDTH - 8}
                y={track.trackY + track.height / 2}
                fill="#71717a"
                fontSize="12"
                fontWeight="600"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {label}
              </text>
              {trackItems.map((item) => {
                const pos = layout.positions.get(item.id);
                if (!pos) return null;
                const active = selection?.id === item.id;
                const diverges = itemDiverges(item);
                return (
                  <g
                    key={item.id}
                    className="cursor-pointer"
                    onClick={() => onSelect({ kind: item.entityType, id: item.id })}
                    onMouseEnter={(event) => showItemHover(event, item, track.kind)}
                    onMouseMove={(event) => showItemHover(event, item, track.kind)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <rect
                      x={pos.x}
                      y={pos.y}
                      width={pos.itemWidth}
                      height={ITEM_HEIGHT}
                      rx="8"
                      fill={color.fill}
                      stroke={active ? color.stroke : diverges ? '#d97706' : 'transparent'}
                      strokeWidth={active || diverges ? 1.75 : 1}
                      className={active ? '' : 'hover:stroke-zinc-400'}
                      filter={active ? 'url(#selected-glow)' : undefined}
                    />
                    <text
                      x={pos.x + 10}
                      y={pos.y + ITEM_HEIGHT / 2}
                      fill={color.text}
                      fontSize="12"
                      dominantBaseline="middle"
                      style={{ pointerEvents: 'none' }}
                    >
                      {clipLabel(item.title, 14)}
                    </text>
                    {diverges && (
                      <circle cx={pos.x + pos.itemWidth - 8} cy={pos.y + 8} r="3" fill="#d97706" />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-20 max-w-xs rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: hover.x, top: hover.y }}
          role="tooltip"
        >
          <p className="font-medium text-zinc-900">{hover.title}</p>
          <p className="mt-0.5 text-zinc-500">{hover.kind}</p>
          {hover.description && (
            <p className="mt-1 line-clamp-3 text-zinc-600">{hover.description}</p>
          )}
          {hover.worldTime && (
            <p className={`mt-1 ${hover.diverges ? 'text-amber-700' : 'text-zinc-500'}`}>
              世界时间 · {hover.worldTime}
              {hover.diverges ? '（偏离呈现序）' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
