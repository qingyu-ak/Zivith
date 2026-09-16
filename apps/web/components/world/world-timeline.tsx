'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { WorldLineItem, WorldLineModel, WorldSelection } from '@/lib/types';
import { createOrderScale, integerTicks, thinByMinGap } from '@/lib/world-scale';
import {
  overlayFocusOfItem,
  isTimelineItemActive,
  derivedSourceShotId,
  isDerivedTrackKind,
  clipSpan,
  canEditClip,
} from '@/lib/world-line';
import { persistClipWrites } from '@/lib/world-track-edit';

const TRACK_LABEL_WIDTH = 92;
const TRACK_HEIGHT = 72;
const TRACK_GAP = 10;
const PADDING = { top: 10, right: 28, bottom: 16 };
const ITEM_HEIGHT = 48;
const EDGE = 18;
const MIN_UNIT_PX = 56;
const MIN_EDIT_CLIP_PX = 88;
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

function spanCaption(start: number, end: number): string {
  const from = Math.round(start);
  const to = Math.round(end);
  if (from === to) return `#${from}`;
  return `#${from}–#${to}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function persistWrites(kind: string): boolean {
  return persistClipWrites(kind);
}

function HorizontalNav({
  canvasWidth,
  viewportWidth,
  scrollLeft,
  unitPx,
  onJump,
}: {
  canvasWidth: number;
  viewportWidth: number;
  scrollLeft: number;
  unitPx: number;
  onJump: (left: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const maxScroll = Math.max(0, canvasWidth - viewportWidth);
  const viewRatio = canvasWidth <= 0 ? 1 : Math.min(1, viewportWidth / canvasWidth);
  const thumbPct = Math.max(8, viewRatio * 100);
  const leftPct = maxScroll <= 0 ? 0 : (scrollLeft / maxScroll) * (100 - thumbPct);

  function clientToScroll(clientX: number): number {
    const track = trackRef.current;
    if (!track || maxScroll <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const usable = rect.width * (1 - viewRatio);
    if (usable <= 0) return 0;
    const x = clientX - rect.left - (rect.width * viewRatio) / 2;
    return Math.min(maxScroll, Math.max(0, (x / usable) * maxScroll));
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-t border-line bg-zinc-50 px-2">
      <button
        type="button"
        className="grid size-7 place-items-center rounded-md text-lg leading-none text-zinc-600 hover:bg-zinc-200"
        aria-label="向左滚动"
        onClick={() => onJump(scrollLeft - Math.max(160, viewportWidth * 0.55))}
      >
        ‹
      </button>
      <div
        ref={trackRef}
        className="relative h-3.5 flex-1 cursor-pointer rounded-full bg-zinc-200"
        role="scrollbar"
        aria-label="时间线横向位置"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxScroll)}
        aria-valuenow={Math.round(scrollLeft)}
        onPointerDown={(event) => {
          event.preventDefault();
          onJump(clientToScroll(event.clientX));
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          onJump(clientToScroll(event.clientX));
        }}
      >
        <div
          className="absolute top-0 h-full rounded-full bg-zinc-500"
          style={{ left: `${leftPct}%`, width: `${thumbPct}%` }}
        />
      </div>
      <button
        type="button"
        className="grid size-7 place-items-center rounded-md text-lg leading-none text-zinc-600 hover:bg-zinc-200"
        aria-label="向右滚动"
        onClick={() => onJump(scrollLeft + Math.max(160, viewportWidth * 0.55))}
      >
        ›
      </button>
      <span className="w-[4.5rem] shrink-0 text-right text-[10px] tabular-nums text-zinc-500">
        {Math.round(unitPx)}px/序
      </span>
    </div>
  );
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
  onClipCommit,
}: {
  model: WorldLineModel;
  selection: WorldSelection;
  onSelect: (selection: Exclude<WorldSelection, null>) => void;
  focusedDimensionId?: string | null;
  focusedDimensionLabel?: string | null;
  focusedIsPrimary?: boolean;
  onClipCommit?: (item: WorldLineItem, start: number, end: number) => Promise<void> | void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const skipSelectRef = useRef(false);
  const [width, setWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [zoomX, setZoomX] = useState(1);
  const [zoomY, setZoomY] = useState(1);
  const panRef = useRef<{
    originX: number;
    originY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [playheadX, setPlayheadX] = useState<number | null>(null);
  const [draftSpans, setDraftSpans] = useState<Record<string, { start: number; end: number }>>({});
  const [trackOrder, setTrackOrder] = useState<string[]>([]);
  const dragRef = useRef<{
    mode: 'move' | 'start' | 'end' | 'track';
    id: string;
    start: number;
    end: number;
    originX: number;
    originY: number;
    moved: boolean;
    latest?: { start: number; end: number };
  } | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const key = `zivith.worldTrackOrder.${model.projectId}`;
    const stored = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    const ids = model.tracks.map((track) => track.id);
    if (!stored) {
      setTrackOrder(ids);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) {
        setTrackOrder(ids);
        return;
      }
      const known = parsed.filter((id): id is string => typeof id === 'string' && ids.includes(id));
      setTrackOrder([...known, ...ids.filter((id) => !known.includes(id))]);
    } catch {
      setTrackOrder(ids);
    }
  }, [model.projectId, model.tracks]);

  useEffect(() => {
    const spanKey = `zivith.worldClipSpans.${model.projectId}`;
    const zoomKey = `zivith.worldZoom.${model.projectId}`;
    try {
      const spans = window.localStorage.getItem(spanKey);
      if (spans) {
        const parsed = JSON.parse(spans) as Record<string, { start: number; end: number }>;
        if (parsed && typeof parsed === 'object') {
          const persistedIds = new Set(
            model.tracks.flatMap((track) =>
              track.items.filter((item) => persistWrites(item.entityType)).map((item) => item.id),
            ),
          );
          const kept = Object.fromEntries(
            Object.entries(parsed).filter(([id]) => !persistedIds.has(id)),
          );
          setDraftSpans(kept);
        }
      }
      const zoom = window.localStorage.getItem(zoomKey);
      if (zoom) {
        const parsed = JSON.parse(zoom) as { x?: number; y?: number };
        if (typeof parsed.x === 'number') setZoomX(clamp(parsed.x, 0.5, 3));
        if (typeof parsed.y === 'number') setZoomY(clamp(parsed.y, 0.6, 2.2));
      }
    } catch {
      /* keep defaults */
    }
  }, [model.projectId]);

  const orderedTracks = useMemo(() => {
    const byId = new Map(model.tracks.map((track) => [track.id, track]));
    const ordered = trackOrder.map((id) => byId.get(id)).filter(Boolean) as typeof model.tracks;
    for (const track of model.tracks) {
      if (!ordered.some((item) => item.id === track.id)) ordered.push(track);
    }
    return ordered;
  }, [model.tracks, trackOrder]);

  const namedAxis = model.axisMarks.length > 0;
  const axisHeight = namedAxis ? 56 : 32;
  const plotLeft = TRACK_LABEL_WIDTH + 8;
  const domainSpan = Math.max(1, model.scaleDomain.max - model.scaleDomain.min);
  const available = Math.max(160, width - plotLeft - PADDING.right);
  const unitMin = MIN_UNIT_PX * zoomX;
  const plotWidth = Math.max(available, domainSpan * unitMin);
  const unitPx = plotWidth / domainSpan;
  const plotRight = plotLeft + plotWidth;
  const itemH = ITEM_HEIGHT * zoomY;
  const trackH = TRACK_HEIGHT * zoomY;
  const laneGap = CHAR_LANE_GAP * zoomY;
  const lanePad = CHAR_LANE_PAD * zoomY;

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

    for (const track of orderedTracks) {
      const stacked = stackedTrack(track.kind, track.items.length);
      const height = stacked
        ? Math.max(
            trackH,
            lanePad * 2 +
              track.items.length * itemH +
              Math.max(0, track.items.length - 1) * laneGap,
          )
        : trackH;
      const trackY = y;
      tracks.push({ id: track.id, title: track.title, kind: track.kind, trackY, height });

      track.items.forEach((item, itemIndex) => {
        const span = draftSpans[item.id] ?? clipSpan(item);
        const startX = plotLeft + (span.start - model.scaleDomain.min) * unitPx;
        const endX = plotLeft + (span.end - model.scaleDomain.min) * unitPx;
        const itemWidth = Math.max(
          canEditClip(item.entityType) ? MIN_EDIT_CLIP_PX * zoomX : 48 * zoomX,
          endX - startX,
        );
        const x = startX;
        const itemY = stacked
          ? trackY + lanePad + itemIndex * (itemH + laneGap)
          : trackY + (height - itemH) / 2;
        positions.set(item.id, {
          x,
          y: itemY,
          cx: x + itemWidth / 2,
          cy: itemY + itemH / 2,
          itemWidth,
          kind: track.kind,
        });
      });

      y += height + TRACK_GAP * zoomY;
    }

    return { tracks, positions, totalHeight: y - TRACK_GAP * zoomY + PADDING.bottom };
  }, [
    orderedTracks,
    plotLeft,
    unitPx,
    model.scaleDomain.min,
    axisHeight,
    draftSpans,
    itemH,
    trackH,
    laneGap,
    lanePad,
    zoomX,
    zoomY,
  ]);

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

  const unitPxRef = useRef(unitPx);
  unitPxRef.current = unitPx;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const trackOrderRef = useRef(trackOrder);
  trackOrderRef.current = trackOrder;
  const orderedTracksRef = useRef(orderedTracks);
  orderedTracksRef.current = orderedTracks;
  const onClipCommitRef = useRef(onClipCommit);
  onClipCommitRef.current = onClipCommit;
  const projectIdRef = useRef(model.projectId);
  projectIdRef.current = model.projectId;

  function findItem(id: string): WorldLineItem | undefined {
    for (const track of orderedTracksRef.current) {
      const found = track.items.find((item) => item.id === id);
      if (found) return found;
    }
    return undefined;
  }

  function clientToSvgY(clientY: number): number | null {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const point = svg.createSVGPoint();
    point.x = 0;
    point.y = clientY;
    return point.matrixTransform(ctm.inverse()).y;
  }

  function applyPointer(event: { clientX: number; clientY: number }) {
    const drag = dragRef.current;
    if (!drag) return;
    const scroller = scrollRef.current;
    if (scroller && drag.mode !== 'track') {
      const rect = scroller.getBoundingClientRect();
      if (event.clientX > rect.right - 56) scroller.scrollLeft += 28;
      else if (event.clientX < rect.left + TRACK_LABEL_WIDTH + 48) scroller.scrollLeft -= 28;
    }
    if (drag.mode === 'track') {
      if (Math.abs(event.clientY - drag.originY) > 4) drag.moved = true;
      const localY = clientToSvgY(event.clientY);
      if (localY == null) return;
      const over = layoutRef.current.tracks.find(
        (track) => localY >= track.trackY && localY <= track.trackY + track.height,
      );
      if (!over || over.id === drag.id) return;
      const current = trackOrderRef.current;
      const from = current.indexOf(drag.id);
      const to = current.indexOf(over.id);
      if (from < 0 || to < 0 || from === to) return;
      const next = current.slice();
      next.splice(from, 1);
      next.splice(to, 0, drag.id);
      trackOrderRef.current = next;
      setTrackOrder(next);
      return;
    }
    const delta = (event.clientX - drag.originX) / Math.max(unitPxRef.current, 1);
    if (Math.abs(event.clientX - drag.originX) > 3) drag.moved = true;
    let start = drag.start;
    let end = drag.end;
    if (drag.mode === 'move') {
      start = drag.start + delta;
      end = drag.end + delta;
    } else if (drag.mode === 'start') {
      start = Math.min(drag.start + delta, drag.end - 0.2);
    } else {
      end = Math.max(drag.end + delta, drag.start + 0.2);
    }
    drag.latest = { start, end };
    setDraftSpans((current) => ({ ...current, [drag.id]: { start, end } }));
  }

  function finishPointer() {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === 'track') {
      if (drag.moved) {
        window.localStorage.setItem(
          `zivith.worldTrackOrder.${projectIdRef.current}`,
          JSON.stringify(trackOrderRef.current),
        );
      }
      if (drag.moved) skipSelectRef.current = true;
      dragRef.current = null;
      return;
    }
    const span = drag.latest;
    const item = findItem(drag.id);
    const moved = drag.moved;
    if (moved) skipSelectRef.current = true;
    dragRef.current = null;
    if (!moved || !span || !item) return;
    if (!persistWrites(item.entityType)) {
      try {
        const key = `zivith.worldClipSpans.${projectIdRef.current}`;
        const raw = window.localStorage.getItem(key);
        const stored = raw
          ? (JSON.parse(raw) as Record<string, { start: number; end: number }>)
          : {};
        stored[item.id] = span;
        window.localStorage.setItem(key, JSON.stringify(stored));
      } catch {
        /* ignore quota */
      }
      return;
    }
    void Promise.resolve(onClipCommitRef.current?.(item, span.start, span.end)).finally(() => {
      setDraftSpans((current) => {
        const next = { ...current };
        delete next[drag.id];
        return next;
      });
    });
  }

  useEffect(() => {
    function onMove(event: globalThis.PointerEvent) {
      const pan = panRef.current;
      if (pan) {
        const scroller = scrollRef.current;
        if (!scroller) return;
        scroller.scrollLeft = pan.scrollLeft - (event.clientX - pan.originX);
        scroller.scrollTop = pan.scrollTop - (event.clientY - pan.originY);
        return;
      }
      if (!dragRef.current) return;
      applyPointer(event);
    }
    function onUp() {
      panRef.current = null;
      if (scrollRef.current) scrollRef.current.style.cursor = '';
      if (!dragRef.current) return;
      finishPointer();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  function showItemHover(event: MouseEvent, item: WorldLineItem, kind: string) {
    const host = containerRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    setHover({
      x: event.clientX - rect.left + 12,
      y: event.clientY - rect.top + 12,
      title: item.title,
      kind: KIND_LABEL[kind] ?? kind,
      description: item.description,
      worldTime: itemCaption(item),
      diverges: itemDiverges(item),
      overlay: itemOverlay(item),
    });
  }

  const canvasWidth = plotRight + PADDING.right;

  function jumpScroll(left: number) {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const next = Math.min(max, Math.max(0, left));
    scroller.scrollLeft = next;
    setScrollLeft(next);
  }

  function beginTrackDrag(trackId: string, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode: 'track',
      id: trackId,
      start: 0,
      end: 0,
      originX: event.clientX,
      originY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function beginClipDrag(
    mode: 'move' | 'start' | 'end',
    item: WorldLineItem,
    event: ReactPointerEvent<HTMLElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const spanNow = draftSpans[item.id] ?? clipSpan(item);
    dragRef.current = {
      mode,
      id: item.id,
      start: spanNow.start,
      end: spanNow.end,
      originX: event.clientX,
      originY: event.clientY,
      moved: false,
      latest: spanNow,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function changeZoom(nextX: number, nextY: number) {
    const x = clamp(nextX, 0.5, 3);
    const y = clamp(nextY, 0.6, 2.2);
    setZoomX(x);
    setZoomY(y);
    window.localStorage.setItem(`zivith.worldZoom.${model.projectId}`, JSON.stringify({ x, y }));
  }

  return (
    <div
      ref={containerRef}
      className="relative isolate flex h-full min-h-64 w-full flex-col overflow-hidden"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-white px-1 py-1 text-[11px] text-zinc-500">
        <span>左键拖块移动 · 边缘左右拉长短 · 右键拖动画布 · 拖轨名换上下</span>
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
        <label className="ml-auto inline-flex items-center gap-1 text-[11px] text-zinc-500">
          横
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.1}
            value={zoomX}
            aria-label="横向缩放"
            className="w-20 accent-zinc-600"
            onChange={(event) => changeZoom(Number(event.target.value), zoomY)}
          />
        </label>
        <label className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
          纵
          <input
            type="range"
            min={0.6}
            max={2.2}
            step={0.1}
            value={zoomY}
            aria-label="纵向缩放"
            className="w-20 accent-zinc-600"
            onChange={(event) => changeZoom(zoomX, Number(event.target.value))}
          />
        </label>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300"
        onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDownCapture={(event) => {
          if (event.button !== 2) return;
          event.preventDefault();
          event.stopPropagation();
          const scroller = scrollRef.current;
          if (!scroller) return;
          panRef.current = {
            originX: event.clientX,
            originY: event.clientY,
            scrollLeft: scroller.scrollLeft,
            scrollTop: scroller.scrollTop,
          };
          scroller.style.cursor = 'grabbing';
          scroller.setPointerCapture(event.pointerId);
        }}
      >
        <div
          className="relative"
          style={{ width: canvasWidth, height: svgHeight }}
          onMouseMove={(event) => {
            const svg = svgRef.current;
            const ctm = svg?.getScreenCTM();
            if (!svg || !ctm) return;
            const point = svg.createSVGPoint();
            point.x = event.clientX;
            point.y = event.clientY;
            setPlayheadX(point.matrixTransform(ctm.inverse()).x);
          }}
          onMouseLeave={() => {
            if (dragRef.current || panRef.current) return;
            setHover(null);
            setPlayheadX(null);
          }}
        >
          <svg
            ref={svgRef}
            width={canvasWidth}
            height={svgHeight}
            className="block select-none"
            style={{ touchAction: 'none', pointerEvents: 'none' }}
            role="img"
            aria-label="世界线时间轴"
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
            {playheadX != null && playheadX > plotLeft && playheadX < plotRight ? (
              <line
                x1={playheadX}
                y1={axisY}
                x2={playheadX}
                y2={svgHeight - PADDING.bottom}
                stroke="rgba(24,24,27,0.55)"
                strokeWidth="1.5"
                pointerEvents="none"
              />
            ) : null}

            {/* 关系连线层（条目之下） */}
            <g style={{ pointerEvents: 'auto' }}>
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
                        <line
                          x1={x}
                          y1={axisY}
                          x2={x}
                          y2={axisY + 5}
                          stroke={accent}
                          strokeWidth="1"
                        />
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
              const source = orderedTracks[index];
              const trackItems = source?.items ?? [];
              return (
                <g key={track.id}>
                  <rect
                    x={TRACK_LABEL_WIDTH}
                    y={track.trackY}
                    width={Math.max(0, plotRight - TRACK_LABEL_WIDTH)}
                    height={track.height}
                    rx="10"
                    fill="rgba(24,24,27,0.03)"
                    stroke="#e5e7eb"
                    strokeWidth="1"
                  />
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
                      ? '#ffffff'
                      : diverges
                        ? '#d97706'
                        : crossing
                          ? '#7c3aed'
                          : overlay
                            ? '#8b5cf6'
                            : 'rgba(255,255,255,0.85)';
                    const span = draftSpans[item.id] ?? clipSpan(item);
                    const spanLabel = spanCaption(span.start, span.end);
                    const pillWidth = Math.max(36, estimateTextWidth(spanLabel) + 12);
                    return (
                      <g
                        key={item.id}
                        className="pointer-events-none"
                        opacity={focus === 'other' ? 0.35 : 1}
                      >
                        <rect
                          x={pos.x}
                          y={pos.y}
                          width={pos.itemWidth}
                          height={itemH}
                          rx="10"
                          fill={color.fill}
                          stroke={stroke}
                          strokeWidth={active ? 2.5 : 1.5}
                          filter={active ? 'url(#selected-glow)' : undefined}
                        />
                        {pos.itemWidth > pillWidth + 16 ? (
                          <rect
                            x={pos.x + 8}
                            y={pos.y + 6}
                            width={pillWidth}
                            height={14}
                            rx="7"
                            fill="rgba(24,24,27,0.55)"
                          />
                        ) : null}
                        {pos.itemWidth > pillWidth + 16 ? (
                          <text
                            x={pos.x + 8 + pillWidth / 2}
                            y={pos.y + 14}
                            fill="#fff"
                            fontSize="9"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            style={{ pointerEvents: 'none' }}
                          >
                            {spanLabel}
                          </text>
                        ) : null}
                        <text
                          x={pos.x + pos.itemWidth / 2}
                          y={pos.y + itemH / 2 + 6}
                          fill={color.text}
                          fontSize="12"
                          fontWeight="700"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          style={{ pointerEvents: 'none' }}
                        >
                          {pos.itemWidth < 44
                            ? ''
                            : clipLabel(item.title, pos.itemWidth < 88 ? 4 : 12)}
                        </text>
                        {(diverges || overlay) && (
                          <circle
                            cx={pos.x + pos.itemWidth - 16}
                            cy={pos.y + 10}
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
          <div className="pointer-events-none absolute inset-0 z-10">
            {orderedTracks.flatMap((track) =>
              track.items.map((item) => {
                const pos = layout.positions.get(item.id);
                if (!pos) return null;
                const editable = canEditClip(item.entityType);
                return (
                  <div
                    key={`hit-${item.id}`}
                    className="pointer-events-auto absolute"
                    style={{
                      left: pos.x,
                      top: pos.y,
                      width: pos.itemWidth,
                      height: itemH,
                      cursor: editable ? 'grab' : 'pointer',
                      touchAction: 'none',
                    }}
                    onClick={() => {
                      if (skipSelectRef.current) {
                        skipSelectRef.current = false;
                        return;
                      }
                      const shotId = derivedSourceShotId(item);
                      if (shotId && isDerivedTrackKind(item.entityType)) {
                        onSelect({ kind: item.entityType, id: shotId });
                        return;
                      }
                      onSelect({ kind: item.entityType, id: item.id });
                    }}
                    onPointerDown={(event) => {
                      if (!editable) return;
                      beginClipDrag('move', item, event);
                    }}
                    onMouseEnter={(event) => showItemHover(event, item, track.kind)}
                    onMouseMove={(event) => showItemHover(event, item, track.kind)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {editable ? (
                      <>
                        <div
                          className="absolute inset-y-0 left-0 z-10"
                          style={{ width: EDGE, cursor: 'ew-resize' }}
                          onPointerDown={(event) => beginClipDrag('start', item, event)}
                        />
                        <div
                          className="absolute inset-y-0 right-0 z-10"
                          style={{ width: EDGE, cursor: 'ew-resize' }}
                          onPointerDown={(event) => beginClipDrag('end', item, event)}
                        />
                      </>
                    ) : null}
                  </div>
                );
              }),
            )}
          </div>
          <div
            className="pointer-events-auto absolute top-0 z-20 border-r border-line bg-white/95"
            style={{ left: scrollLeft, width: TRACK_LABEL_WIDTH, height: svgHeight }}
          >
            {layout.tracks.map((track) => {
              const label = track.title || KIND_LABEL[track.kind] || track.kind;
              const dragging = dragRef.current?.mode === 'track' && dragRef.current.id === track.id;
              return (
                <button
                  key={track.id}
                  type="button"
                  className={`absolute left-0 right-0 flex cursor-ns-resize items-center justify-end px-2 text-xs font-semibold ${
                    dragging ? 'bg-zinc-100 text-zinc-800' : 'text-zinc-500 hover:bg-zinc-50'
                  }`}
                  style={{ top: track.trackY, height: track.height, touchAction: 'none' }}
                  onPointerDown={(event) => beginTrackDrag(track.id, event)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <HorizontalNav
        canvasWidth={canvasWidth}
        viewportWidth={Math.max(1, width)}
        scrollLeft={scrollLeft}
        unitPx={unitPx}
        onJump={jumpScroll}
      />
      {hover && (
        <div
          className="pointer-events-none absolute z-20 max-w-[16rem] rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(8, hover.x), Math.max(8, width - 272)),
            top: Math.max(8, hover.y),
          }}
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
