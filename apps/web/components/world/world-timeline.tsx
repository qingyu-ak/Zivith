'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { WorldLineItem, WorldLineModel, WorldSelection } from '@/lib/types';
import { createOrderScale, integerTicks, thinByMinGap } from '@/lib/world-scale';
import { overlayFocusOfItem, isTimelineItemActive, derivedSourceShotId, isDerivedTrackKind } from '@/lib/world-line';

const TRACK_LABEL_WIDTH = 76;
const TRACK_HEIGHT = 64;
const TRACK_GAP = 12;
const PADDING = { top: 10, right: 18, bottom: 16 };
const ITEM_HEIGHT = 30;
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
  camera: { fill: 'rgba(13,148,136,0.12)', stroke: '#0f766e', text: '#115e59' },
  style: { fill: 'rgba(168,85,247,0.12)', stroke: '#7c3aed', text: '#5b21b6' },
  prompt: { fill: 'rgba(245,158,11,0.12)', stroke: '#d97706', text: '#92400e' },
  model: { fill: 'rgba(99,102,241,0.12)', stroke: '#4f46e5', text: '#3730a3' },
};

const KIND_LABEL: Record<string, string> = {
  character: '角色',
  location: '地点',
  scene: '场景',
  world_event: '事件',
  story: '故事',
  shot: '镜头',
  camera: '机位',
  style: '风格',
  prompt: '提示词',
  model: '模型',
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

function itemRelation(item: WorldLineItem): string | null {
  const relation = item.extra?.world_time_relation;
  return typeof relation === 'string' ? relation : null;
}

function itemOverlay(item: WorldLineItem): boolean {
  const relation = itemRelation(item);
  return relation != null && relation !== 'follow';
}

interface HoverInfo {
  x: number;
  y: number;
  title: string;
  kind: string;
  description?: string | null;
  worldTime?: string | null;
  diverges?: boolean;
  overlay?: boolean;
}

export function WorldTimeline({
  model,
  selection,
  onSelect,
  focusedDimensionId = null,
  focusedDimensionLabel = null,
  focusedIsPrimary = true,
}: {
  model: WorldLineModel;
  selection: WorldSelection;
  onSelect: (selection: Exclude<WorldSelection, null>) => void;
  focusedDimensionId?: string | null;
  focusedDimensionLabel?: string | null;
  focusedIsPrimary?: boolean;
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
  const axisHeight = namedAxis ? 56 : 32;
  const plotLeft = TRACK_LABEL_WIDTH + 8;
  const plotRight = Math.max(width - PADDING.right, plotLeft + 120);
  const domainSpan = Math.max(1, model.scaleDomain.max - model.scaleDomain.min);
  const unitPx = (plotRight - plotLeft) / domainSpan;

  const scale = useMemo(() => {
    const { min, max } = model.scaleDomain;
    return createOrderScale([min, max], [plotLeft, plotRight]);
  }, [model.scaleDomain, plotLeft, plotRight]);

  const fallbackTicks = useMemo(
    () => integerTicks(model.scaleDomain.min, model.scaleDomain.max),
    [model.scaleDomain],
  );

  const axisLabelKeep = useMemo(() => {
    if (namedAxis) {
      const positions = model.axisMarks.map((mark) => scale(mark.order));
      const gaps = model.axisMarks.map((mark) =>
        Math.max(48, estimateTextWidth(clipLabel(mark.label, 6)) + 12),
      );
      const minGap = gaps.length ? Math.max(48, Math.min(...gaps)) : 48;
      return thinByMinGap(positions, minGap);
    }
    return thinByMinGap(
      fallbackTicks.map((tick) => scale(tick)),
      40,
    );
  }, [namedAxis, model.axisMarks, fallbackTicks, scale]);

  const guideKeep = useMemo(() => {
    const positions = namedAxis
      ? model.axisMarks.map((mark) => scale(mark.order))
      : fallbackTicks.map((tick) => scale(tick));
    return thinByMinGap(positions, 10);
  }, [namedAxis, model.axisMarks, fallbackTicks, scale]);

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
        const naturalWidth = Math.min(Math.max(estimateTextWidth(item.title) + 24, 84), 190);
        const compactWidth = unitPx < 72 ? Math.max(18, Math.min(naturalWidth, unitPx * 0.82)) : naturalWidth;
        const itemWidth = stacked ? naturalWidth : compactWidth;
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
  }, [model.tracks, plotLeft, plotRight, scale, axisHeight, unitPx]);

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
  const hasOverlay = model.axisMarks.some(
    (mark) => mark.worldTimeRelation && mark.worldTimeRelation !== 'follow',
  );

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
      overlay: itemOverlay(item),
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
        <span className="inline-flex items-center gap-1.5 text-violet-700">
          <span className="inline-block size-2 rounded-full bg-violet-500" />
          {focusedDimensionLabel && !focusedIsPrimary
            ? `叠层「${focusedDimensionLabel}」· 主轴仍按呈现顺序`
            : '世界时间默认跟随主轴'}
        </span>
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
        {hasOverlay && (
          <span className="inline-flex items-center gap-1.5 text-violet-700">
            <span className="inline-block size-2 rounded-full bg-violet-500" />
            紫色表示显式世界时间绑定（区间 / 相对 / 平行）
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
            (mark, index) =>
              guideKeep[index] ? (
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
              ) : null,
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
                {link.label && <title>{link.label}</title>}
                <path
                  d={link.d}
                  fill="none"
                  stroke={active ? 'rgba(217,119,6,0.9)' : 'rgba(24,24,27,0.18)'}
                  strokeWidth={active ? 2.25 : 1.25}
                  strokeDasharray="4 3"
                />
                {link.label && active && (
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
                const overlay = mark.worldTimeRelation && mark.worldTimeRelation !== 'follow';
                const accent = diverges ? '#d97706' : overlay ? '#7c3aed' : '#d4d4d8';
                const labelFill = diverges ? '#b45309' : overlay ? '#5b21b6' : '#3f3f46';
                const subFill = diverges ? '#d97706' : overlay ? '#7c3aed' : '#a1a1aa';
                const showLabel = axisLabelKeep[index];
                const caption = mark.worldTimeLabel
                  ? `${mark.label} · ${mark.worldTimeLabel}`
                  : `${mark.label} · #${mark.order}`;
                return (
                  <g key={`axis-${mark.order}-${index}`}>
                    <title>{caption}</title>
                    <line x1={x} y1={axisY} x2={x} y2={axisY + 5} stroke={accent} strokeWidth="1" />
                    {showLabel && (
                      <>
                        <text
                          x={x}
                          y={PADDING.top + 14}
                          fill={labelFill}
                          fontSize="11"
                          fontWeight="600"
                          textAnchor="middle"
                        >
                          {clipLabel(mark.label, 8)}
                        </text>
                        <text
                          x={x}
                          y={PADDING.top + 28}
                          fill={subFill}
                          fontSize="9"
                          textAnchor="middle"
                        >
                          {mark.worldTimeLabel
                            ? clipLabel(mark.worldTimeLabel, 10)
                            : `#${mark.order}`}
                        </text>
                      </>
                    )}
                    {showLabel && diverges && (
                      <circle cx={x + 18} cy={PADDING.top + 12} r="3" fill="#d97706" />
                    )}
                    {showLabel && !diverges && overlay && (
                      <circle cx={x + 18} cy={PADDING.top + 12} r="3" fill="#7c3aed" />
                    )}
                  </g>
                );
              })
            : fallbackTicks.map((tick, index) => (
                <g key={tick}>
                  <line
                    x1={scale(tick)}
                    y1={axisY}
                    x2={scale(tick)}
                    y2={axisY + 5}
                    stroke="#d4d4d8"
                    strokeWidth="1"
                  />
                  {axisLabelKeep[index] && (
                    <text
                      x={scale(tick)}
                      y={PADDING.top + 12}
                      fill="#71717a"
                      fontSize="11"
                      textAnchor="middle"
                    >
                      #{tick}
                    </text>
                  )}
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
              {trackItems.length === 0 && track.kind === 'world_event' ? (
                <text
                  x={plotLeft + 12}
                  y={track.trackY + track.height / 2}
                  fill="#a1a1aa"
                  fontSize="11"
                  dominantBaseline="middle"
                >
                  {focusedDimensionLabel && !focusedIsPrimary
                    ? `「${focusedDimensionLabel}」尚无绑定事件 · 主轴仍按呈现顺序`
                    : '无事件 · 世界时间绑定写在事件信封上，主轴仍按呈现顺序'}
                </text>
              ) : null}
              {trackItems.length === 0 && track.kind === 'story' ? (
                <text
                  x={plotLeft + 12}
                  y={track.trackY + track.height / 2}
                  fill="#a1a1aa"
                  fontSize="11"
                  dominantBaseline="middle"
                >
                  还没有故事
                </text>
              ) : null}
              {trackItems.length === 0 && track.kind === 'scene' ? (
                <text
                  x={plotLeft + 12}
                  y={track.trackY + track.height / 2}
                  fill="#a1a1aa"
                  fontSize="11"
                  dominantBaseline="middle"
                >
                  还没有场景
                </text>
              ) : null}
              {trackItems.length === 0 && track.kind === 'shot' ? (
                <text
                  x={plotLeft + 12}
                  y={track.trackY + track.height / 2}
                  fill="#a1a1aa"
                  fontSize="11"
                  dominantBaseline="middle"
                >
                  还没有镜头 · 派生轨会跟随镜头出现
                </text>
              ) : null}
              {trackItems.length === 0 && track.kind === 'camera' ? (
                <text
                  x={plotLeft + 12}
                  y={track.trackY + track.height / 2}
                  fill="#a1a1aa"
                  fontSize="11"
                  dominantBaseline="middle"
                >
                  机位从镜头状态投影，不另存一份
                </text>
              ) : null}
              {trackItems.length === 0 && track.kind === 'style' ? (
                <text
                  x={plotLeft + 12}
                  y={track.trackY + track.height / 2}
                  fill="#a1a1aa"
                  fontSize="11"
                  dominantBaseline="middle"
                >
                  风格从镜头的光线、色彩与渲染设定投影
                </text>
              ) : null}
              {trackItems.length === 0 && track.kind === 'prompt' ? (
                <text
                  x={plotLeft + 12}
                  y={track.trackY + track.height / 2}
                  fill="#a1a1aa"
                  fontSize="11"
                  dominantBaseline="middle"
                >
                  提示词轨优先显示已批准版本，否则显示草稿
                </text>
              ) : null}
              {trackItems.length === 0 && track.kind === 'model' ? (
                <text
                  x={plotLeft + 12}
                  y={track.trackY + track.height / 2}
                  fill="#a1a1aa"
                  fontSize="11"
                  dominantBaseline="middle"
                >
                  模型轨来自生成 provenance，只读
                </text>
              ) : null}
              {trackItems.map((item) => {
                const pos = layout.positions.get(item.id);
                if (!pos) return null;
                const active = isTimelineItemActive(item, selection);
                const diverges = itemDiverges(item);
                const overlay = itemOverlay(item);
                const crossing = itemRelation(item) === 'crossing';
                const focus = overlayFocusOfItem(item, focusedDimensionId, focusedIsPrimary);
                const stroke = active
                  ? color.stroke
                  : diverges
                    ? '#d97706'
                    : crossing
                      ? '#7c3aed'
                      : overlay
                        ? '#8b5cf6'
                        : 'transparent';
                return (
                  <g
                    key={item.id}
                    className="cursor-pointer"
                    opacity={focus === 'other' ? 0.35 : 1}
                    onClick={() => {
                      const shotId = derivedSourceShotId(item);
                      if (shotId && isDerivedTrackKind(item.entityType)) {
                        onSelect({ kind: item.entityType, id: shotId });
                        return;
                      }
                      onSelect({ kind: item.entityType, id: item.id });
                    }}
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
                      stroke={stroke}
                      strokeWidth={active || diverges || overlay ? 1.75 : 1}
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
                      {pos.itemWidth < 36 ? '' : clipLabel(item.title, pos.itemWidth < 72 ? 4 : 14)}
                    </text>
                    {(diverges || overlay) && (
                      <circle
                        cx={pos.x + pos.itemWidth - 8}
                        cy={pos.y + 8}
                        r="3"
                        fill={diverges ? '#d97706' : '#7c3aed'}
                      />
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
            <p
              className={`mt-1 ${hover.diverges ? 'text-amber-700' : hover.overlay ? 'text-violet-700' : 'text-zinc-500'}`}
            >
              世界时间 · {hover.worldTime}
              {hover.diverges ? '（偏离呈现序）' : hover.overlay ? '（显式绑定）' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
