'use client';

import type {
  AssetDTO,
  SceneDTO,
  WorldResourcesDTO,
  WorldSelection,
} from '@/lib/types';

const KIND_LABEL: Record<string, string> = {
  character: '角色',
  location: '地点',
  scene: '场景',
  world_event: '事件',
  story: '故事',
  project: '项目',
};

const KIND_COLOR: Record<string, string> = {
  character: 'text-[#b7ff4a] border-[#b7ff4a]/40 bg-[#b7ff4a]/10',
  location: 'text-[#a78bfa] border-[#a78bfa]/40 bg-[#a78bfa]/10',
  scene: 'text-[#60a5fa] border-[#60a5fa]/40 bg-[#60a5fa]/10',
  world_event: 'text-[#fbbf24] border-[#fbbf24]/40 bg-[#fbbf24]/10',
  story: 'text-[#f472b6] border-[#f472b6]/40 bg-[#f472b6]/10',
  project: 'text-zinc-200 border-zinc-500/40 bg-zinc-500/10',
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="min-w-0 break-words text-right text-zinc-200">{value}</span>
    </div>
  );
}

function JsonValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 1);
  } catch {
    return String(value);
  }
}

function EntityDetail({
  kind,
  label,
  fields,
}: {
  kind: string;
  label: string;
  fields: Array<{ label: string; value: React.ReactNode }>;
}) {
  const rows = fields.filter((field) => field.value !== null && field.value !== undefined);
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${KIND_COLOR[kind]}`}>
          {label}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">暂无属性数据</p>
      ) : (
        rows.map((field) => <Row key={field.label} label={field.label} value={field.value} />)
      )}
    </div>
  );
}

function tagsOf(tags?: string[]): string {
  if (!tags || tags.length === 0) return '';
  return tags.join(' · ');
}

export function InspectorPanel({
  resources,
  selection,
}: {
  resources: WorldResourcesDTO;
  selection: WorldSelection;
}) {
  let detail: React.ReactNode = null;

  if (selection) {
    const entities = resources.entities;
    switch (selection.kind) {
      case 'character': {
        const asset = entities.characters.find((item) => item.id === selection.id);
        if (asset) {
          const appearance = asset.appearance as AssetDTO['appearance'] | undefined;
          detail = (
            <EntityDetail
              kind="character"
              label="角色"
              fields={[
                { label: '名称', value: asset.name },
                { label: '别名', value: (asset.aliases ?? []).join(' · ') },
                { label: '描述', value: asset.description },
                { label: '标签', value: tagsOf(asset.tags) },
                { label: '性别', value: appearance?.gender },
                { label: '年龄', value: appearance?.age_range },
                { label: '身形', value: appearance?.build },
                { label: '个性', value: asset.personality },
                { label: '常服', value: asset.default_outfit },
              ]}
            />
          );
        }
        break;
      }
      case 'location': {
        const asset = entities.locations.find((item) => item.id === selection.id);
        if (asset) {
          detail = (
            <EntityDetail
              kind="location"
              label="地点"
              fields={[
                { label: '名称', value: asset.name },
                { label: '描述', value: asset.description },
                { label: '标签', value: tagsOf(asset.tags) },
                { label: '时代', value: asset.time_period },
                { label: '默认天气', value: asset.weather_default },
                { label: '默认光线', value: asset.lighting_default },
                { label: '默认氛围', value: asset.mood_default },
              ]}
            />
          );
        }
        break;
      }
      case 'scene': {
        const scene = entities.scenes.find((item) => item.id === selection.id);
        if (scene) {
          detail = (
            <EntityDetail
              kind="scene"
              label="场景"
              fields={[
                { label: '标题', value: scene.title },
                { label: '摘要', value: scene.summary },
                { label: '时间段', value: scene.time_of_day },
                { label: '天气', value: scene.weather },
                { label: '氛围', value: scene.mood },
                { label: '镜头数', value: scene.shot_count ?? 0 },
              ]}
            />
          );
        }
        break;
      }
      case 'world_event': {
        const event = entities.world_events.find((item) => item.id === selection.id);
        if (event) {
          detail = (
            <EntityDetail
              kind="world_event"
              label="世界事件"
              fields={[
                { label: '标题', value: event.title },
                { label: '描述', value: event.description },
                { label: '呈现顺序', value: event.presentation_order ?? 0 },
                { label: '状态', value: event.state },
                { label: '参与角色', value: (event.character_ids ?? []).length },
                { label: '关联场景', value: (event.scene_ids ?? []).length },
                {
                  label: '世界时间',
                  value: <JsonValue value={event.world_time_envelope} />,
                },
              ]}
            />
          );
        }
        break;
      }
      case 'story': {
        const story = entities.stories.find((item) => item.id === selection.id);
        if (story) {
          detail = (
            <EntityDetail
              kind="story"
              label="故事"
              fields={[
                { label: '标题', value: story.title },
                { label: '类型', value: story.genre },
                { label: '主题', value: story.theme },
                { label: '一句话梗概', value: story.logline },
                { label: '完整梗概', value: story.synopsis },
              ]}
            />
          );
        }
        break;
      }
      case 'project': {
        detail = (
          <EntityDetail
            kind="project"
            label="项目"
            fields={[
              { label: '名称', value: resources.project.name },
              { label: 'ID', value: resources.project.id },
            ]}
          />
        );
        break;
      }
    }
    if (!detail) {
      detail = (
        <div className="px-4 py-6 text-sm text-zinc-500">
          未找到该实体（可能已删除或不在当前视图）
        </div>
      );
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 右上：世界线属性 */}
      <section className="border-b border-line">
        <header className="px-4 pt-4 pb-2">
          <h2 className="text-xs font-semibold tracking-wider text-zinc-500">世界线属性</h2>
        </header>
        {selection ? (
          detail
        ) : (
          <div className="px-4 pb-6">
            <p className="rounded-lg border border-dashed border-line p-4 text-sm leading-6 text-zinc-500">
              未选择实体。在左侧 Explorer 或中间世界线上点击任意实体查看属性。
            </p>
          </div>
        )}
      </section>

      {/* 右下：创作线属性（v1 占位） */}
      <section className="flex-1">
        <header className="px-4 pt-4 pb-2">
          <h2 className="text-xs font-semibold tracking-wider text-zinc-500">创作线属性</h2>
        </header>
        <div className="px-4 pb-6">
          <p className="text-sm leading-relaxed text-zinc-600">
            创作线属性将在后续版本呈现：15 秒 AI 视频镜头提示词、风格固定词与镜头参数将
            沿创作线轨道逐镜头展开（双时间线下半部分）。
          </p>
        </div>
      </section>
    </div>
  );
}
