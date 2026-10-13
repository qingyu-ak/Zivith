'use client';

import { useState } from 'react';
import type { TemporalDimensionDTO, WorldResourcesDTO } from '@/lib/types';
import { api, errorMessage } from '@/lib/api';
import { DIMENSION_KIND_LABEL, resolveDisplayDimensions } from '@/lib/world-line';

const PRESETS: Array<{ kind: TemporalDimensionDTO['kind']; label: string }> = [
  { kind: 'dream', label: '梦境' },
  { kind: 'calendar', label: '历法' },
  { kind: 'simulation', label: '模拟' },
];

export function WorldTimeBar({
  resources,
  selectedDimensionId,
  onSelectDimension,
  onUpdated,
}: {
  resources: WorldResourcesDTO;
  selectedDimensionId?: string | null;
  onSelectDimension: (dimension: TemporalDimensionDTO) => void;
  onUpdated: () => void;
}) {
  const dimensions = resolveDisplayDimensions(resources);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<TemporalDimensionDTO['kind']>('custom');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function persist(next: TemporalDimensionDTO[], select?: TemporalDimensionDTO) {
    setSaving(true);
    setError('');
    try {
      await api(`/world/projects/${resources.project.id}/timeline`, {
        method: 'PATCH',
        body: { temporal_dimensions: next },
      });
      if (select) onSelectDimension(select);
      onUpdated();
      setAdding(false);
      setLabel('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  function addPreset(preset: { kind: TemporalDimensionDTO['kind']; label: string }) {
    if (dimensions.some((dimension) => dimension.kind === preset.kind)) return;
    const created: TemporalDimensionDTO = {
      id: `dim-${Date.now()}`,
      label: preset.label,
      kind: preset.kind,
    };
    void persist([...dimensions, created], created);
  }

  function submitCustom() {
    const name = label.trim();
    if (!name) return;
    const created: TemporalDimensionDTO = { id: `dim-${Date.now()}`, label: name, kind };
    void persist([...dimensions, created], created);
  }

  return (
    <div className="shrink-0 border-b border-line bg-violet-50/60 px-4 py-2.5 dark:border-violet-900/40 dark:bg-violet-950/30">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tracking-wider text-violet-800 dark:text-violet-200">
          世界时间
        </span>
        <span className="text-[11px] text-zinc-500">点维度切换叠层，不换算真实日历</span>
        {dimensions.map((dimension) => {
          const active = selectedDimensionId === dimension.id;
          return (
            <button
              key={dimension.id}
              type="button"
              onClick={() => onSelectDimension(dimension)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] ${
                active
                  ? 'border-violet-700 bg-violet-700 text-white'
                  : 'border-violet-200 bg-white text-violet-900 hover:border-violet-400 dark:border-violet-700 dark:bg-transparent dark:text-violet-200 dark:hover:border-violet-400'
              }`}
            >
              <span className="font-medium">{dimension.label}</span>
              <span className={active ? 'text-violet-100' : 'text-violet-500'}>
                {DIMENSION_KIND_LABEL[dimension.kind]}
              </span>
            </button>
          );
        })}
        {PRESETS.filter(
          (preset) => !dimensions.some((dimension) => dimension.kind === preset.kind),
        ).map((preset) => (
          <button
            key={preset.kind}
            type="button"
            disabled={saving}
            onClick={() => addPreset(preset)}
            className="rounded-full border border-dashed border-violet-300 px-2.5 py-0.5 text-[11px] text-violet-700 hover:bg-white disabled:opacity-50 dark:border-violet-600 dark:text-violet-300 dark:hover:bg-violet-950/50"
          >
            + {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAdding((current) => !current)}
          className="rounded-full border border-violet-300 px-2.5 py-0.5 text-[11px] text-violet-800 hover:bg-white dark:border-violet-600 dark:text-violet-200 dark:hover:bg-violet-950/50"
        >
          {adding ? '取消' : '+ 自定义维度'}
        </button>
      </div>
      {adding ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            className="w-40 rounded-md border border-line bg-white px-2 py-1 text-xs text-zinc-800"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="维度名称，如：王朝历"
          />
          <select
            className="rounded-md border border-line bg-white px-2 py-1 text-xs"
            value={kind}
            onChange={(event) => setKind(event.target.value as TemporalDimensionDTO['kind'])}
          >
            {(Object.keys(DIMENSION_KIND_LABEL) as Array<TemporalDimensionDTO['kind']>).map(
              (option) => (
                <option key={option} value={option}>
                  {DIMENSION_KIND_LABEL[option]}
                </option>
              ),
            )}
          </select>
          <button
            type="button"
            disabled={saving || !label.trim()}
            onClick={submitCustom}
            className="rounded-md bg-violet-700 px-2.5 py-1 text-xs text-white disabled:opacity-50"
          >
            {saving ? '保存中…' : '添加'}
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
