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

const TRACK_LABEL_WIDTH = 108;
const TRACK_HEIGHT = 56;
const TRACK_GAP = 0;
const PADDING = { top: 6, right: 0, bottom: 0 };
const ITEM_HEIGHT = 28;
const EDGE = 10;
const MIN_UNIT_PX = 56;
const MIN_EDIT_CLIP_PX = 64;
const CHAR_LANE_GAP = 4;
const CHAR_LANE_PAD = 6;

interface TrackColor {
  fill: string;
  stroke: string;
  text: string;
}

const TRACK_COLORS: Record<string, TrackColor> = {
  character: { fill: '#3b5bdb', stroke: '#91a7ff', text: '#f8fafc' },
  location: { fill: '#0f766e', stroke: '#5eead4', text: '#f8fafc' },
  scene: { fill: '#1d4ed8', stroke: '#93c5fd', text: '#f8fafc' },
  world_event: { fill: '#c2410c', stroke: '#fdba74', text: '#fff7ed' },
  story: { fill: '#9d174d', stroke: '#f9a8d4', text: '#fdf2f8' },
  shot: { fill: '#be123c', stroke: '#fda4af', text: '#fff1f2' },
  camera: { fill: '#0f766e', stroke: '#5eead4', text: '#f8fafc' },
  style: { fill: '#6d28d9', stroke: '#d8b4fe', text: '#f5f3ff' },
  prompt: { fill: '#b45309', stroke: '#fcd34d', text: '#fffbeb' },
  model: { fill: '#4338ca', stroke: '#a5b4fc', text: '#eef2ff' },
};

const TIMELINE_CANVAS = 'var(--z-timeline-canvas)';
const TIMELINE_LANE_A = 'var(--z-timeline-lane-a)';
const TIMELINE_LANE_B = 'var(--z-timeline-lane-b)';
const TIMELINE_BORDER = 'var(--z-timeline-border)';
const TIMELINE_MUTED = 'var(--z-timeline-muted)';
const TIMELINE_AXIS_LABEL = 'var(--z-timeline-axis-label)';
const TIMELINE_AXIS_SUB = 'var(--z-timeline-axis-sub)';
const TIMELINE_GUIDE = 'var(--z-timeline-guide)';
const TIMELINE_LINK = 'var(--z-timeline-link)';

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

function canCreateOnTrack(
  kind: string,
): kind is 'character' | 'location' | 'scene' | 'world_event' {
  return (
    kind === 'character' || kind === 'location' || kind === 'scene' || kind === 'world_event'
  );
}

function canEditOnTrack(kind: string): boolean {
  return canCreateOnTrack(kind);
}

/** 世界线是语义轨，不是剪辑软件：禁止拖块、拉长短。 */
function canTrimClipLikeNle(_kind: string): boolean {
  return false;
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
  const [held, setHeld] = useState(false);
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
    <div
      className={`absolute inset-x-0 bottom-0 z-30 flex h-8 items-center gap-2 border-t px-2 transition-opacity ${
        held
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0 group-hover/timeline:pointer-events-auto group-hover/timeline:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'
      }`}
      style={{
        borderColor: TIMELINE_BORDER,
        background: 'color-mix(in srgb, var(--z-timeline-chrome) 95%, transparent)',
      }}
    >
      <button
        type="button"
        className="grid size-7 place-items-center rounded-md text-lg leading-none hover:opacity-100"
        style={{ color: TIMELINE_MUTED }}
        aria-label="向左滚动"
        onClick={() => onJump(scrollLeft - Math.max(160, viewportWidth * 0.55))}
      >
        ‹
      </button>
      <div
        ref={trackRef}
        className="relative h-2.5 flex-1 cursor-pointer rounded-full"
        style={{ background: 'var(--z-timeline-hover)' }}
        role="scrollbar"
        aria-label="时间线横向位置"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxScroll)}
        aria-valuenow={Math.round(scrollLeft)}
        onPointerDown={(event) => {
          event.preventDefault();
          setHeld(true);
          onJump(clientToScroll(event.clientX));
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          onJump(clientToScroll(event.clientX));
        }}
        onPointerUp={() => setHeld(false)}
        onPointerCancel={() => setHeld(false)}
      >
        <div
          className="absolute top-0 h-full rounded-full bg-zinc-500"
          style={{ left: `${leftPct}%`, width: `${thumbPct}%` }}
        />
      </div>
      <button
        type="button"
        className="grid size-7 place-items-center rounded-md text-lg leading-none"
        style={{ color: TIMELINE_MUTED }}
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
  onCreateTrack,
  onEditItem,
  creatingKind = null,
}: {
  model: WorldLineModel;
  selection: WorldSelection;
  onSelect: (selection: Exclude<WorldSelection, null>) => void;
  focusedDimensionId?: string | null;
  focusedDimensionLabel?: string | null;
  focusedIsPrimary?: boolean;
  onClipCommit?: (item: WorldLineItem, start: number, end: number) => Promise<void> | void;
  onCreateTrack?: (kind: 'character' | 'location' | 'scene' | 'world_event') => void;
  onEditItem?: (item: WorldLineItem) => void;
  creatingKind?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const skipSelectRef = useRef(false);
  const [width, setWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [zoomX, setZoomX] = useState(0.75);
  const [zoomY, setZoomY] = useState(0.85);
  const zoomRef = useRef({ x: 0.75, y: 0.85 });
  zoomRef.current = { x: zoomX, y: zoomY };
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
        if (typeof parsed.x === 'number') setZoomX(clamp(parsed.x, 0.35, 3));
        if (typeof parsed.y === 'number') setZoomY(clamp(parsed.y, 0.45, 2.2));
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
  const unitMin = MIN_UNIT_PX * zoomX;
  const plotWidth = Math.max(120, domainSpan * unitMin);
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

      y += height + TRACK_GAP;
    }

    return { tracks, positions, totalHeight: Math.max(y, axisHeight + trackH) + PADDING.bottom };
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

  const canvasWidth = Math.max(plotRight + PADDING.right, width);
  const laneRight = canvasWidth;

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
    const x = clamp(nextX, 0.35, 3);
    const y = clamp(nextY, 0.45, 2.2);
    setZoomX(x);
    setZoomY(y);
    window.localStorage.setItem(`zivith.worldZoom.${model.projectId}`, JSON.stringify({ x, y }));
  }

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const { x, y } = zoomRef.current;
      changeZoom(x + direction * 0.08, y + direction * 0.08);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [model.projectId]);

  return (
    <div
      ref={containerRef}
      className="group/timeline relative isolate flex h-full min-h-64 w-full flex-col overflow-hidden"
      style={{ background: TIMELINE_CANVAS }}
    >
      <div
        className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b px-2 py-1 text-[11px]"
        style={{
          borderColor: TIMELINE_BORDER,
          background: 'var(--z-timeline-chrome)',
          color: TIMELINE_MUTED,
        }}
      >
        <span>
          左键选中 · 双击编辑角色/地点/场景/事件 · 点轨名旁 + 添加 · Ctrl+滚轮缩放 ·
          不支持剪辑式拖块删块
        </span>
        <span className="inline-flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
          <span className="inline-block size-2 rounded-full bg-violet-400" />
          {focusedDimensionLabel && !focusedIsPrimary
            ? `叠层「${focusedDimensionLabel}」· 主轴仍按呈现顺序`
            : '世界时间默认跟随主轴'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-px bg-zinc-600" />
          事件竖线对齐主轴
        </span>
        {hasDivergence && (
          <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
            <span className="inline-block size-2 rounded-full bg-amber-400" />
            琥珀色表示世界时间偏离呈现序
          </span>
        )}
        {hasOverlay && (
          <span className="inline-flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
            <span className="inline-block size-2 rounded-full bg-violet-400" />
            紫色表示显式世界时间绑定（区间 / 相对 / 平行）
          </span>
        )}
        <label className="ml-auto inline-flex items-center gap-1 text-[11px] text-zinc-500">
          横
          <input
            type="range"
            min={0.35}
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
            min={0.45}
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
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        style={{ background: TIMELINE_CANVAS }}
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

            <rect x={0} y={0} width={canvasWidth} height={svgHeight} fill={TIMELINE_CANVAS} />
            {layout.tracks.map((track, index) => (
              <rect
                key={`lane-${track.id}`}
                x={0}
                y={track.trackY}
                width={laneRight}
                height={track.height}
                fill={index % 2 === 0 ? TIMELINE_LANE_A : TIMELINE_LANE_B}
              />
            ))}
            {layout.tracks.map((track) => (
              <line
                key={`lane-edge-${track.id}`}
                x1={0}
                y1={track.trackY + track.height}
                x2={laneRight}
                y2={track.trackY + track.height}
                stroke={TIMELINE_BORDER}
                strokeWidth="1"
              />
            ))}

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
                      y2={svgHeight}
                      stroke={
                        'worldTimeDiverges' in mark && mark.worldTimeDiverges
                          ? 'rgba(217,119,6,0.35)'
                          : TIMELINE_GUIDE
                      }
                      strokeWidth="1"
                    />
                  ) : null,
              )}
            </g>
            {playheadX != null && playheadX > plotLeft && playheadX < laneRight ? (
              <line
                x1={playheadX}
                y1={0}
                x2={playheadX}
                y2={svgHeight}
                stroke="#ef4444"
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
                      stroke={active ? 'rgba(251,191,36,0.95)' : TIMELINE_LINK}
                      strokeWidth={active ? 2.25 : 1.25}
                      strokeDasharray="4 3"
                    />
                    {link.label && active && (
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

            {/* 顶部刻度轴：呈现顺序为主轴，事件标题为刻度名 */}
            <g>
              <line
                x1={0}
                y1={axisY}
                x2={laneRight}
                y2={axisY}
                stroke={TIMELINE_BORDER}
                strokeWidth="1"
              />
              {namedAxis
                ? model.axisMarks.map((mark, index) => {
                    const x = scale(mark.order);
                    const diverges = Boolean(mark.worldTimeDiverges);
                    const overlay = mark.worldTimeRelation && mark.worldTimeRelation !== 'follow';
                    const accent = diverges ? '#f59e0b' : overlay ? '#a78bfa' : TIMELINE_MUTED;
                    const labelFill = diverges
                      ? '#f59e0b'
                      : overlay
                        ? '#7c3aed'
                        : TIMELINE_AXIS_LABEL;
                    const subFill = diverges ? '#d97706' : overlay ? '#7c3aed' : TIMELINE_AXIS_SUB;
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
                        stroke={TIMELINE_MUTED}
                        strokeWidth="1"
                      />
                      {axisLabelKeep[index] && (
                        <text
                          x={scale(tick)}
                          y={PADDING.top + 12}
                          fill={TIMELINE_AXIS_SUB}
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
                    width={Math.max(0, laneRight - TRACK_LABEL_WIDTH)}
                    height={track.height}
                    fill="transparent"
                  />
                  {trackItems.length === 0 && track.kind === 'world_event' && !onCreateTrack ? (
                    <text
                      x={plotLeft + 12}
                      y={track.trackY + track.height / 2}
                      fill={TIMELINE_MUTED}
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
                      fill={TIMELINE_MUTED}
                      fontSize="11"
                      dominantBaseline="middle"
                    >
                      还没有故事
                    </text>
                  ) : null}
                  {trackItems.length === 0 && track.kind === 'scene' && !onCreateTrack ? (
                    <text
                      x={plotLeft + 12}
                      y={track.trackY + track.height / 2}
                      fill={TIMELINE_MUTED}
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
                      fill={TIMELINE_MUTED}
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
                      fill={TIMELINE_MUTED}
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
                      fill={TIMELINE_MUTED}
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
                      fill={TIMELINE_MUTED}
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
                      fill={TIMELINE_MUTED}
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
                        ? '#f59e0b'
                        : crossing
                          ? '#c4b5fd'
                          : overlay
                            ? '#a78bfa'
                            : color.stroke;
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
                          rx="3"
                          fill={color.fill}
                          stroke={stroke}
                          strokeWidth={active ? 2 : 1}
                          filter={active ? 'url(#selected-glow)' : undefined}
                        />
                        {pos.itemWidth > 28 ? (
                          <text
                            x={pos.x + 8}
                            y={pos.y + itemH / 2}
                            fill={color.text}
                            fontSize="11"
                            fontWeight="600"
                            dominantBaseline="middle"
                            style={{ pointerEvents: 'none' }}
                          >
                            {clipLabel(
                              pos.itemWidth > pillWidth + 36
                                ? `${item.title}  ${spanLabel}`
                                : item.title,
                              Math.max(2, Math.floor((pos.itemWidth - 14) / 12)),
                            )}
                          </text>
                        ) : null}
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
                const nleTrim = canTrimClipLikeNle(item.entityType);
                return (
                  <div
                    key={`hit-${item.id}`}
                    className="pointer-events-auto absolute"
                    style={{
                      left: pos.x,
                      top: pos.y,
                      width: pos.itemWidth,
                      height: itemH,
                      cursor: nleTrim ? 'grab' : 'pointer',
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
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      if (!canEditOnTrack(item.entityType)) return;
                      onSelect({ kind: item.entityType, id: item.id });
                      onEditItem?.(item);
                    }}
                    onPointerDown={(event) => {
                      if (!nleTrim) return;
                      beginClipDrag('move', item, event);
                    }}
                    onMouseEnter={(event) => showItemHover(event, item, track.kind)}
                    onMouseMove={(event) => showItemHover(event, item, track.kind)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {nleTrim ? (
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
          {layout.tracks.map((track) => {
            const source = orderedTracks.find((item) => item.id === track.id);
            if (!source || source.items.length > 0) return null;
            if (!canCreateOnTrack(track.kind) || !onCreateTrack) return null;
            const kind = track.kind;
            const label = KIND_LABEL[kind] ?? kind;
            const busy = creatingKind === kind;
            return (
              <button
                key={`add-${track.id}`}
                type="button"
                disabled={busy}
                className="pointer-events-auto absolute z-10 text-left text-[11px] disabled:opacity-40"
                style={{
                  left: TRACK_LABEL_WIDTH + 12,
                  top: track.trackY,
                  height: track.height,
                  width: Math.max(80, canvasWidth - TRACK_LABEL_WIDTH - 24),
                  color: TIMELINE_MUTED,
                }}
                onClick={() => {
                  if (canCreateOnTrack(kind)) onCreateTrack(kind);
                }}
              >
                {busy ? `正在添加${label}…` : `点击添加${label}`}
              </button>
            );
          })}
          <div
            className="pointer-events-auto absolute z-20 border-r"
            style={{
              left: scrollLeft,
              top: axisY,
              width: TRACK_LABEL_WIDTH,
              height: Math.max(0, svgHeight - axisY),
              borderColor: TIMELINE_BORDER,
              background: 'var(--z-timeline-chrome)',
            }}
          >
            {layout.tracks.map((track) => {
              const label = track.title || KIND_LABEL[track.kind] || track.kind;
              const dragging = dragRef.current?.mode === 'track' && dragRef.current.id === track.id;
              const busy = creatingKind === track.kind;
              return (
                <div
                  key={track.id}
                  className="absolute left-0 right-0 flex"
                  style={{ top: track.trackY - axisY, height: track.height }}
                >
                  {canCreateOnTrack(track.kind) && onCreateTrack ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="grid w-7 shrink-0 place-items-center text-base leading-none disabled:opacity-40"
                      style={{ color: TIMELINE_MUTED }}
                      aria-label={`添加${label}`}
                      title={`添加${label}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => {
                        if (canCreateOnTrack(track.kind)) onCreateTrack(track.kind);
                      }}
                    >
                      {busy ? '…' : '+'}
                    </button>
                  ) : (
                    <span className="w-7 shrink-0" />
                  )}
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-ns-resize px-1 text-right text-xs font-medium"
                    style={{
                      touchAction: 'none',
                      color: dragging ? 'var(--z-fg)' : TIMELINE_MUTED,
                      background: dragging ? 'var(--z-timeline-hover)' : undefined,
                    }}
                    onPointerDown={(event) => beginTrackDrag(track.id, event)}
                  >
                    {label}
                  </button>
                </div>
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
