'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorldLineModel, WorldSelection } from '@/lib/types';
import { createOrderScale, integerTicks } from '@/lib/world-scale';

// 布局常量（借鉴 vis-timeline 轨道可视化思路：左侧轨道标签 + 顶部时间轴 + 轨道行）
const TRACK_LABEL_WIDTH = 76;
const AXIS_HEIGHT = 30;
const TRACK_HEIGHT = 58;
const TRACK_GAP = 10;
const PADDING = { top: 14, right: 18, bottom: 14 };
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
  character: { fill: 'rgba(183,255,74,0.14)', stroke: '#b7ff4a', text: '#eaf9d2' },
  scene: { fill: 'rgba(96,165,250,0.14)', stroke: '#60a5fa', text: '#dbeafe' },
  world_event: { fill: 'rgba(251,191,36,0.14)', stroke: '#fbbf24', text: '#fef3c7' },
  story: { fill: 'rgba(244,114,182,0.14)', stroke: '#f472b6', text: '#fce7f3' },
  shot: { fill: 'rgba(251,113,133,0.16)', stroke: '#fb7185', text: '#ffe4e6' },
};

const KIND_LABEL: Record<string, string> = {
  character: '角色',
  scene: '场景',
  world_event: '事件',
  story: '故事',
  shot: '镜头',
};

/** 估算文本像素宽度（中文 14px/字，拉丁 8px/字），用于自适应条带宽度。 */
function estimateTextWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += char.charCodeAt(0) > 255 ? 14 : 8;
  }
  return width;
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

  const plotLeft = TRACK_LABEL_WIDTH + 8;
  const plotRight = Math.max(width - PADDING.right, plotLeft + 120);

  const scale = useMemo(() => {
    const { min, max } = model.scaleDomain;
    return createOrderScale([min, max], [plotLeft, plotRight]);
  }, [model.scaleDomain, plotLeft, plotRight]);

  const ticks = useMemo(
    () => integerTicks(model.scaleDomain.min, model.scaleDomain.max),
    [model.scaleDomain],
  );

  const layout = useMemo(() => {
    let y = PADDING.top + AXIS_HEIGHT;
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
      const stacked = track.kind === 'character' && track.items.length > 1;
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
  }, [model.tracks, plotLeft, plotRight, scale]);

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
          // 同点关系（mock 引擎曾把两端都指向同一实体）退化为零长弧线，跳过渲染
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
    <div ref={containerRef} className="h-full w-full overflow-auto">
      <svg
        width={plotRight + PADDING.right}
        height={svgHeight}
        className="block min-w-full"
        role="img"
        aria-label="世界线时间轴"
      >
        <defs>
          <filter id="selected-glow" x="-40%" y="-60%" width="180%" height="220%">
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="4"
              floodColor={selection ? 'currentColor' : '#b7ff4a'}
              floodOpacity="0.45"
            />
          </filter>
        </defs>

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
                  stroke={active ? 'rgba(251,191,36,0.9)' : 'rgba(244,244,245,0.32)'}
                  strokeWidth={active ? 2.25 : 1.25}
                  strokeDasharray="4 3"
                />
                {link.label && (
                  <text
                    x={link.midX}
                    y={link.midY}
                    fill={active ? '#fbbf24' : '#a1a1aa'}
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

        {/* 顶部刻度轴：非均匀刻度（事件 presentation_order 为锚点） */}
        <g>
          <line
            x1={plotLeft}
            y1={PADDING.top + AXIS_HEIGHT}
            x2={plotRight}
            y2={PADDING.top + AXIS_HEIGHT}
            stroke="#3f3f46"
            strokeWidth="1"
          />
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={scale(tick)}
                y1={PADDING.top + AXIS_HEIGHT}
                x2={scale(tick)}
                y2={PADDING.top + AXIS_HEIGHT + 5}
                stroke="#3f3f46"
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
                fill="rgba(255,255,255,0.02)"
                stroke="#23262e"
                strokeWidth="1"
              />
              <text
                x={TRACK_LABEL_WIDTH - 8}
                y={track.trackY + track.height / 2}
                fill="#a1a1aa"
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
                return (
                  <g
                    key={item.id}
                    className="cursor-pointer"
                    onClick={() => onSelect({ kind: item.entityType, id: item.id })}
                  >
                    <rect
                      x={pos.x}
                      y={pos.y}
                      width={pos.itemWidth}
                      height={ITEM_HEIGHT}
                      rx="8"
                      fill={color.fill}
                      stroke={active ? color.stroke : 'transparent'}
                      strokeWidth={active ? 1.75 : 1}
                      className={active ? '' : 'hover:stroke-white/50'}
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
                      {item.title.length > 14 ? `${item.title.slice(0, 13)}…` : item.title}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
