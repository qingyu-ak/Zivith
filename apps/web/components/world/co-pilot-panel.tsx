'use client';

import Link from 'next/link';
import { Badge } from '@zivith/ui';
import type { WorldResourcesDTO, WorldSelection, WorldStage } from '@/lib/types';
import { WorldConflictList } from './conflict-list';

const STAGE_META: Record<WorldStage, { label: string; tone: 'neutral' | 'warning' | 'success' }> = {
  bootstrap: { label: '萌芽期', tone: 'neutral' },
  growing: { label: '成长期', tone: 'warning' },
  mature: { label: '成熟期', tone: 'success' },
};

/** 世界线副驾驶：世界阶段 + 世界观摘要 + 实体计数 + Lore Keeper 冲突发现。 */
export function CoPilotPanel({
  resources,
  onSelect,
}: {
  resources: WorldResourcesDTO;
  onSelect?: (selection: NonNullable<WorldSelection>) => void;
}) {
  const { name } = resources.project;
  const worldview = resources.project.worldview ?? { rules: [] };
  const stageMeta = STAGE_META[resources.stage] ?? STAGE_META.bootstrap;
  const entities = resources.entities;
  const counts = [
    { label: '角色', value: entities.characters.length },
    { label: '地点', value: entities.locations.length },
    { label: '场景', value: entities.scenes.length },
    { label: '事件', value: entities.world_events.length },
    { label: '关系', value: entities.relationships.length },
  ];
  const hasWorldview =
    Boolean(worldview.genre?.trim()) ||
    Boolean(worldview.premise?.trim()) ||
    (worldview.rules ?? []).length > 0 ||
    Boolean(worldview.notes?.trim());

  return (
    <div className="shrink-0 border-t border-line px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-accent/80" aria-hidden />
        <h3 className="text-sm font-medium text-zinc-200">副驾驶</h3>
        <Badge tone={stageMeta.tone}>{stageMeta.label}</Badge>
        <span className="text-xs text-zinc-600">建议性核对</span>
      </div>

      <div className="mt-2 grid grid-cols-5 gap-2">
        {counts.map((item) => (
          <div key={item.label} className="rounded-lg bg-white/5 px-2 py-1.5 text-center">
            <div className="text-sm font-semibold text-white">{item.value}</div>
            <div className="text-xs text-zinc-500">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-2.5">
        {hasWorldview ? (
          <div className="space-y-1 text-xs leading-5 text-zinc-400">
            {worldview.genre && (
              <p>
                <span className="text-zinc-500">题材：</span>
                {worldview.genre}
              </p>
            )}
            {worldview.premise && (
              <p>
                <span className="text-zinc-500">核心设定：</span>
                {worldview.premise}
              </p>
            )}
            {(worldview.rules ?? []).length > 0 && (
              <p>
                <span className="text-zinc-500">世界规则：</span>
                {(worldview.rules ?? []).join(' · ')}
              </p>
            )}
            {worldview.notes && (
              <p>
                <span className="text-zinc-500">补充：</span>
                {worldview.notes}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs leading-5 text-zinc-500">
            尚未设定世界观。去
            <Link
              href="/creator-chats"
              className="mx-1 text-accent hover:underline"
            >
              创作聊天
            </Link>
            描述题材、核心设定与世界规则，自动提炼后这里会同步显示。
          </p>
        )}
      </div>

      <WorldConflictList conflicts={resources.conflicts ?? []} onSelect={onSelect} />

      <p className="mt-2.5 text-xs leading-5 text-zinc-600">
        副驾驶会核对同名、关系循环与事件顺序等结构化冲突；修复由你确认。也可以在创作聊天里说「检查设定冲突」。
      </p>
      <p className="mt-0.5 text-xs text-zinc-600">项目：{name}</p>
    </div>
  );
}
