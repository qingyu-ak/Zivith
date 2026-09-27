'use client';

import Link from 'next/link';
import { useEffect, useState, type RefObject } from 'react';
import { MeteorField, usePrefersReducedMotion } from '@/components/brand/meteor-field';
import { IconBolt, IconBrain, IconCheck, IconChevron } from '@/components/nav-icons';
import {
  displayModelId,
  type ChatEffort,
  type LlmChoice,
} from '@/lib/chat-composer';
import { captureSettingsReturn } from '@/lib/settings-return';
import {
  clampContextWindow,
  clampStopIndex,
  formatContextWindow,
  hasContextWindowChoice,
  EFFORT_THUMB_PX,
  starBrightness,
  stopFill,
  stopThumbOffset,
  type EffortStop,
} from '@/lib/model-capabilities';
import { METEOR_BLUE, stopParticleCount } from '@/lib/meteor-motion';
import type { ProviderCatalogDTO, ProviderId } from '@/lib/types';

type PickerView = 'main' | 'model' | 'context';

export function ModelEffortPicker({
  open,
  view,
  onOpen,
  onView,
  stops,
  stopIndex,
  onStopChange,
  fast,
  onFastChange,
  thinkingEnabled,
  onThinkingChange,
  supportsThinking,
  contextWindows,
  contextWindow,
  onContextWindowChange,
  modelLabel,
  catalog,
  saving,
  visibleChoices,
  modelQuery,
  onModelQueryChange,
  searchRef,
  settingsHref,
  onPickModel,
}: {
  open: boolean;
  view: PickerView;
  onOpen: () => void;
  onView: (view: PickerView) => void;
  stops: EffortStop[];
  stopIndex: number;
  onStopChange: (index: number, effort: ChatEffort) => void;
  fast: boolean;
  onFastChange: (fast: boolean) => void;
  thinkingEnabled: boolean;
  onThinkingChange: (enabled: boolean) => void;
  supportsThinking: boolean;
  contextWindows: number[];
  contextWindow: number | null;
  onContextWindowChange: (tokens: number) => void;
  modelLabel: string;
  catalog: ProviderCatalogDTO | null;
  saving: boolean;
  visibleChoices: LlmChoice[];
  modelQuery: string;
  onModelQueryChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  settingsHref: string;
  onPickModel: (provider: ProviderId, model: string) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const showContext = hasContextWindowChoice(contextWindows);
  const selectedWindow = clampContextWindow(contextWindow, contextWindows);
  const safeStop = clampStopIndex(stopIndex, stops.length);
  const stop = stops[safeStop] ?? stops[0];
  const stopLabel = stop?.label ?? '均衡';
  const stopEffort = stop?.effort ?? 'balanced';
  const bright = starBrightness(safeStop, stops.length, thinkingEnabled);
  const starCount = stopParticleCount(safeStop, stops.length, reduced);
  const topStop = stops.length > 0 && safeStop === stops.length - 1;
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (!topStop) {
      setShowHint(false);
      return;
    }
    setShowHint(true);
    const timer = window.setTimeout(() => setShowHint(false), 1500);
    return () => window.clearTimeout(timer);
  }, [topStop]);

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex h-8 max-w-[14rem] items-center gap-1 rounded-full px-2 text-xs text-[var(--z-fg-muted)] hover:bg-[var(--z-wash)]"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        <span className="truncate">{`${modelLabel} ${stopLabel}`}</span>
        {fast ? (
          <IconBolt filled className="size-3 shrink-0" style={{ color: METEOR_BLUE }} />
        ) : null}
        <IconChevron className="size-3.5 shrink-0 text-zinc-400" />
      </button>
      {open ? (
        <div className="absolute bottom-[calc(100%+8px)] right-0 z-20 w-[17.5rem] overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_12px_40px_rgba(15,23,42,0.18)]">
          {view === 'model' ? (
            <ModelList
              catalog={catalog}
              saving={saving}
              visibleChoices={visibleChoices}
              modelQuery={modelQuery}
              onModelQueryChange={onModelQueryChange}
              searchRef={searchRef}
              settingsHref={settingsHref}
              onPickModel={onPickModel}
              onClose={() => onView('main')}
            />
          ) : view === 'context' ? (
            <ContextList
              windows={contextWindows}
              selected={selectedWindow}
              onPick={onContextWindowChange}
              onClose={() => onView('main')}
            />
          ) : (
            <div className="px-3 pb-3 pt-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-full text-[var(--z-fg)] hover:bg-[var(--z-wash)]"
                    aria-pressed={fast}
                    aria-label={fast ? '关闭快速' : '开启快速'}
                    title="快速"
                    onClick={() => onFastChange(!fast)}
                    style={{ color: fast ? METEOR_BLUE : undefined }}
                  >
                    <IconBolt filled={fast} className="size-4" />
                  </button>
                  {showContext ? (
                    <button
                      type="button"
                      className="h-8 rounded-full px-2 text-[11px] text-[var(--z-fg-muted)] hover:bg-[var(--z-wash)]"
                      onClick={() => onView('context')}
                    >
                      {selectedWindow ? formatContextWindow(selectedWindow) : '上下文'}
                    </button>
                  ) : null}
                </div>
                <div className="relative min-w-0 flex-1 text-center">
                  <p className={`h-5 text-[15px] font-medium leading-5 ${showHint ? 'invisible' : ''}`}>
                    <span style={{ color: topStop ? '#7c5cff' : METEOR_BLUE }}>{stopLabel}</span>
                  </p>
                  <button
                    type="button"
                    className={`mt-0.5 inline-flex max-w-full items-center gap-0.5 text-[13px] text-[var(--z-fg-subtle)] hover:text-[var(--z-fg)] ${
                      showHint ? 'invisible' : ''
                    }`}
                    tabIndex={showHint ? -1 : 0}
                    aria-hidden={showHint}
                    onClick={() => onView('model')}
                  >
                    <span className="truncate">{modelLabel}</span>
                    <IconChevron className="size-3 -rotate-90" />
                  </button>
                  {showHint ? (
                    <p className="effort-hint pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
                      这一档会更快的消耗词元
                    </p>
                  ) : null}
                </div>
                {supportsThinking ? (
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-full text-[var(--z-fg-subtle)] hover:bg-[var(--z-wash)]"
                    aria-pressed={thinkingEnabled}
                    aria-label={thinkingEnabled ? '关闭深度思考' : '开启深度思考'}
                    title="深度思考"
                    onClick={() => onThinkingChange(!thinkingEnabled)}
                    style={{ color: thinkingEnabled ? METEOR_BLUE : undefined }}
                  >
                    <IconBrain className="size-4" />
                  </button>
                ) : (
                  <span className="size-8" />
                )}
              </div>
              <div className="relative mt-3">
                <div
                  className="pointer-events-none absolute inset-x-0 -top-3 z-[6] h-3 bg-panel"
                  aria-hidden
                />
                <div
                  className="effort-rail"
                  data-effort={stopEffort}
                  data-top={topStop ? 'true' : 'false'}
                  data-fast={fast ? 'on' : 'off'}
                  data-thinking={thinkingEnabled ? 'on' : 'off'}
                >
                  <div className="effort-rail-fill" style={{ width: stopFill(safeStop, stops.length) }} />
                  {topStop ? null : (
                    <div className="effort-stops">
                      {stops.map((item, index) => (
                        <span
                          key={`${item.label}-${index}`}
                          className={index <= safeStop ? 'is-on' : undefined}
                          style={{
                            left:
                              stops.length <= 1
                                ? `${EFFORT_THUMB_PX / 2}px`
                                : `calc(${EFFORT_THUMB_PX / 2}px + (100% - ${EFFORT_THUMB_PX}px) * ${index} / ${stops.length - 1})`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
                {fast ? <div className="effort-fast-sheen" aria-hidden /> : null}
                <div
                  className="effort-thumb"
                  aria-hidden
                  style={{ left: stopThumbOffset(safeStop, stops.length) }}
                />
                {topStop ? (
                  <div className="pointer-events-none absolute -top-1.5 right-0 bottom-0 left-0 z-[4] overflow-hidden">
                    <MeteorField
                      effort={stopEffort}
                      fast={fast}
                      phase="preview"
                      reduced={reduced}
                      size="capsule"
                      brightness={bright}
                      seed={safeStop * 13 + (thinkingEnabled ? 5 : 1)}
                      particles={starCount}
                    />
                  </div>
                ) : null}
                <input
                  className="meteor-effort-slider"
                  type="range"
                  min={0}
                  max={Math.max(0, stops.length - 1)}
                  step={1}
                  value={safeStop}
                  aria-label="思考深度"
                  aria-valuetext={stopLabel}
                  onChange={(event) => {
                    const index = clampStopIndex(Number(event.target.value), stops.length);
                    const next = stops[index];
                    if (next) onStopChange(index, next.effort);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ModelList({
  catalog,
  saving,
  visibleChoices,
  modelQuery,
  onModelQueryChange,
  searchRef,
  settingsHref,
  onPickModel,
  onClose,
}: {
  catalog: ProviderCatalogDTO | null;
  saving: boolean;
  visibleChoices: LlmChoice[];
  modelQuery: string;
  onModelQueryChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  settingsHref: string;
  onPickModel: (provider: ProviderId, model: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex max-h-[min(20rem,46vh)] flex-col">
      <p className="flex shrink-0 items-center justify-between px-3 pb-1 pt-2 text-xs text-[var(--z-fg-subtle)]">
        选择模型
        <button
          type="button"
          className="text-[var(--z-fg-subtle)] hover:text-[var(--z-fg)]"
          onClick={onClose}
        >
          返回
        </button>
      </p>
      <div className="shrink-0 px-2 pb-2">
        <input
          ref={searchRef}
          className="w-full rounded-lg border border-line bg-[var(--z-wash)] px-2.5 py-1.5 text-sm text-[var(--z-fg)] outline-none placeholder:text-[var(--z-fg-subtle)] focus:border-[var(--z-fg-subtle)] focus:bg-panel"
          placeholder="搜索模型"
          value={modelQuery}
          onChange={(event) => onModelQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault();
          }}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {visibleChoices.length === 0 ? (
          <p className="px-3 py-2 text-sm text-[var(--z-fg-subtle)]">没有匹配的模型</p>
        ) : (
          visibleChoices.map((choice, index) => {
            const showProvider =
              index === 0 || visibleChoices[index - 1]?.provider !== choice.provider;
            const active =
              catalog?.selection.llm === choice.provider && catalog.models.llm === choice.model;
            return (
              <div key={`${choice.provider}:${choice.model}`}>
                {showProvider ? (
                  <p className="px-3 pb-1 pt-2 text-[11px] text-[var(--z-fg-subtle)]">
                    {choice.providerLabel}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  title={choice.model}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--z-fg)] hover:bg-[var(--z-wash)] disabled:opacity-50"
                  onClick={() => onPickModel(choice.provider, choice.model)}
                >
                  <span className="min-w-0 flex-1 truncate">{displayModelId(choice.model)}</span>
                  {choice.tag ? (
                    <span className="rounded-full bg-[var(--z-wash-2)] px-1.5 py-0.5 text-[10px] text-[var(--z-fg-subtle)]">
                      {choice.tag}
                    </span>
                  ) : null}
                  {active ? <IconCheck className="size-4 shrink-0 text-[var(--z-fg-muted)]" /> : null}
                </button>
              </div>
            );
          })
        )}
      </div>
      <div className="shrink-0 border-t border-line">
        <Link
          href={settingsHref}
          className="block px-3 py-2 text-sm text-[var(--z-fg-muted)] hover:bg-[var(--z-wash)]"
          onClick={() => {
            captureSettingsReturn();
            onClose();
          }}
        >
          管理模型
        </Link>
      </div>
    </div>
  );
}

function ContextList({
  windows,
  selected,
  onPick,
  onClose,
}: {
  windows: number[];
  selected: number | null;
  onPick: (tokens: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="py-1">
      <p className="flex items-center justify-between px-3 pb-1 pt-2 text-xs text-[var(--z-fg-subtle)]">
        选择上下文
        <button
          type="button"
          className="text-[var(--z-fg-subtle)] hover:text-[var(--z-fg)]"
          onClick={onClose}
        >
          返回
        </button>
      </p>
      {windows.map((tokens) => (
        <button
          key={tokens}
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-[var(--z-fg)] hover:bg-[var(--z-wash)]"
          onClick={() => onPick(tokens)}
        >
          {formatContextWindow(tokens)}
          {selected === tokens ? <IconCheck className="size-4 text-[var(--z-fg-muted)]" /> : null}
        </button>
      ))}
    </div>
  );
}
