'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, Card, Field, Input, Select, Spinner, Textarea } from '@zivith/ui';
import { api, errorMessage, unwrapList } from '@/lib/api';
import { getFormList, getOptionalFormText } from '@/lib/form-data';
import type { AssetDTO, ShotCharacterDTO, ShotDTO } from '@/lib/types';

const option = (value: string, label: string) => (
  <option key={value} value={value}>
    {label}
  </option>
);
const stateLabel = {
  draft: '草稿',
  prompting: '构建提示词',
  generating: '生成中',
  review: '待审核',
  approved: '已批准并冻结',
};
const number = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' && value !== '' ? Number(value) : undefined;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </Card>
  );
}

export default function ShotEditorPage() {
  const { projectId, storyId, sceneId, shotId } = useParams<{
    projectId: string;
    storyId: string;
    sceneId: string;
    shotId: string;
  }>();
  const router = useRouter();
  const [shot, setShot] = useState<ShotDTO | null>(null);
  const [characters, setCharacters] = useState<AssetDTO[]>([]);
  const [cast, setCast] = useState<ShotCharacterDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [shotValue, assetValue] = await Promise.all([
        api<ShotDTO>(`/shots/${shotId}`),
        api<AssetDTO[] | { data?: AssetDTO[]; items?: AssetDTO[] }>(
          `/projects/${projectId}/assets?type=character`,
        ),
      ]);
      setShot(shotValue);
      setCast(shotValue.characters ?? []);
      setCharacters(unwrapList(assetValue));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [projectId, shotId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api(`/shots/${shotId}`, {
        method: 'PATCH',
        body: {
          label: getOptionalFormText(form, 'label'),
          narrative_mode: getOptionalFormText(form, 'narrative_mode'),
          location_area: getOptionalFormText(form, 'location_area'),
          camera: {
            shot_type: getOptionalFormText(form, 'camera.shot_type'),
            angle: getOptionalFormText(form, 'camera.angle'),
            movement: getOptionalFormText(form, 'camera.movement'),
            focal_length: getOptionalFormText(form, 'camera.focal_length'),
            depth_of_field: getOptionalFormText(form, 'camera.depth_of_field'),
            custom: getOptionalFormText(form, 'camera.custom'),
          },
          composition: {
            framing: getOptionalFormText(form, 'composition.framing'),
            focus_subject: getOptionalFormText(form, 'composition.focus_subject'),
            foreground: getOptionalFormText(form, 'composition.foreground'),
            background: getOptionalFormText(form, 'composition.background'),
            custom: getOptionalFormText(form, 'composition.custom'),
          },
          lighting: {
            type: getOptionalFormText(form, 'lighting.type'),
            direction: getOptionalFormText(form, 'lighting.direction'),
            intensity: getOptionalFormText(form, 'lighting.intensity'),
            color_temperature: getOptionalFormText(form, 'lighting.color_temperature'),
            custom: getOptionalFormText(form, 'lighting.custom'),
          },
          color: {
            palette: getFormList(form, 'color.palette'),
            saturation: getOptionalFormText(form, 'color.saturation'),
            contrast: getOptionalFormText(form, 'color.contrast'),
          },
          mood: getOptionalFormText(form, 'mood'),
          style: {
            reference: getOptionalFormText(form, 'style.reference'),
            aspect_ratio: getOptionalFormText(form, 'style.aspect_ratio'),
            fps: number(form, 'style.fps'),
            rendering: getOptionalFormText(form, 'style.rendering'),
          },
          characters: cast,
          dialogue: {
            text: getOptionalFormText(form, 'dialogue.text'),
            speaker_id: getOptionalFormText(form, 'dialogue.speaker_id'),
            style: getOptionalFormText(form, 'dialogue.style'),
          },
          action: {
            description: getOptionalFormText(form, 'action.description'),
            duration_hint: number(form, 'action.duration_hint'),
          },
          audio: {
            music_id: getOptionalFormText(form, 'audio.music_id'),
            sfx: getFormList(form, 'audio.sfx'),
            ambience: getOptionalFormText(form, 'audio.ambience'),
            volume_music: number(form, 'audio.volume_music'),
            volume_sfx: number(form, 'audio.volume_sfx'),
          },
          prompt: {
            positive: getOptionalFormText(form, 'prompt.positive'),
            negative: getOptionalFormText(form, 'prompt.negative'),
            source: getOptionalFormText(form, 'prompt.source'),
            generation_prompt: getOptionalFormText(form, 'prompt.generation_prompt'),
            custom: getOptionalFormText(form, 'prompt.custom'),
          },
        },
      });
      setNotice('镜头已保存');
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  async function action(name: 'duplicate' | 'approve' | 'unfreeze') {
    try {
      const result = await api<ShotDTO>(`/shots/${shotId}/${name}`, { method: 'POST' });
      if (name === 'duplicate' && result.id)
        router.push(
          `/projects/${projectId}/stories/${storyId}/scenes/${sceneId}/shots/${result.id}`,
        );
      else await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function remove() {
    if (!confirm('确定删除这个镜头及其输出吗？')) return;
    try {
      await api(`/shots/${shotId}`, { method: 'DELETE' });
      router.push(`/projects/${projectId}/stories/${storyId}`);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  function updateCast(index: number, patch: Partial<ShotCharacterDTO>) {
    setCast((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  }

  if (loading || !shot)
    return (
      <div className="p-8">
        <Spinner label="正在加载镜头规格…" />
      </div>
    );
  const frozen = shot.state === 'approved';

  return (
    <form
      onSubmit={(event) => {
        void save(event);
      }}
    >
      <header className="sticky top-0 z-20 border-b border-line bg-ink/95 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
          <Link
            className="text-sm text-zinc-500 hover:text-accent"
            href={`/projects/${projectId}/stories/${storyId}`}
          >
            ← 场景列表
          </Link>
          <div className="min-w-40 flex-1">
            <h1 className="font-semibold">{shot.label || '未命名镜头'}</h1>
            <p className="text-xs text-zinc-500">镜头 {shot.order} · 所有字段均可单独覆盖</p>
          </div>
          <Badge tone={frozen ? 'success' : shot.state === 'review' ? 'warning' : 'neutral'}>
            {stateLabel[shot.state]}
          </Badge>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void action('duplicate');
            }}
          >
            复制
          </Button>
          {frozen && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void action('unfreeze');
              }}
            >
              解冻
            </Button>
          )}
          {shot.state === 'review' && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void action('approve');
              }}
            >
              批准
            </Button>
          )}
          <Button type="submit" disabled={saving || frozen}>
            {saving ? '保存中…' : '保存镜头'}
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-5 p-5 sm:p-8">
        {error && (
          <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg bg-accent/10 p-3 text-sm text-accent" role="status">
            {notice}
          </p>
        )}
        {frozen && (
          <p className="rounded-lg border border-accent/20 bg-accent/5 p-4 text-sm text-zinc-300">
            该镜头已批准，当前规格已冻结。解冻后才能继续编辑。
          </p>
        )}
        <fieldset disabled={frozen} className="space-y-5">
          <Section title="基本信息">
            <Field label="镜头标签">
              <Input name="label" defaultValue={shot.label ?? ''} />
            </Field>
            <Field label="叙事模式">
              <Select name="narrative_mode" defaultValue={shot.narrative_mode ?? 'present'}>
                {option('present', '当前叙事')}
                {option('flashback', '闪回')}
                {option('memory', '记忆')}
                {option('dream', '梦境')}
                {option('fantasy', '幻想')}
              </Select>
            </Field>
            <Field label="场景内区域">
              <Input
                name="location_area"
                defaultValue={shot.location_area ?? ''}
                placeholder="例如：阁楼门前走廊"
              />
            </Field>
            <Field label="情绪基调">
              <Input name="mood" defaultValue={shot.mood ?? ''} />
            </Field>
          </Section>
          <Section title="摄影机" description="定义观看方式、机位与运动。">
            <Field label="景别">
              <Select name="camera.shot_type" defaultValue={shot.camera?.shot_type ?? ''}>
                <option value="">继承 / 未设置</option>
                {[
                  ['close_up', '近景'],
                  ['medium_shot', '中景'],
                  ['wide_shot', '远景'],
                  ['extreme_close_up', '特写'],
                  ['full_shot', '全景'],
                  ['over_the_shoulder', '过肩'],
                  ['pov', '主观视角'],
                  ['aerial', '航拍'],
                  ['dutch_angle', '荷兰角'],
                ].map(([v, l]) => option(v, l))}
              </Select>
            </Field>
            <Field label="机位角度">
              <Select name="camera.angle" defaultValue={shot.camera?.angle ?? ''}>
                <option value="">继承 / 未设置</option>
                {[
                  ['eye_level', '平视'],
                  ['low_angle', '低角度'],
                  ['high_angle', '高角度'],
                  ['birds_eye', '鸟瞰'],
                  ['worms_eye', '虫视'],
                ].map(([v, l]) => option(v, l))}
              </Select>
            </Field>
            <Field label="运动">
              <Select name="camera.movement" defaultValue={shot.camera?.movement ?? ''}>
                <option value="">继承 / 未设置</option>
                {[
                  ['static', '固定'],
                  ['pan_left', '左摇'],
                  ['pan_right', '右摇'],
                  ['tilt_up', '上摇'],
                  ['tilt_down', '下摇'],
                  ['dolly_in', '推近'],
                  ['dolly_out', '拉远'],
                  ['tracking', '跟拍'],
                  ['handheld', '手持'],
                ].map(([v, l]) => option(v, l))}
              </Select>
            </Field>
            <Field label="焦距">
              <Input
                name="camera.focal_length"
                defaultValue={shot.camera?.focal_length ?? ''}
                placeholder="例如：50mm"
              />
            </Field>
            <Field label="景深">
              <Select name="camera.depth_of_field" defaultValue={shot.camera?.depth_of_field ?? ''}>
                <option value="">未设置</option>
                {option('shallow', '浅景深')}
                {option('deep', '深景深')}
              </Select>
            </Field>
            <Field label="自定义摄影说明">
              <Input name="camera.custom" defaultValue={shot.camera?.custom ?? ''} />
            </Field>
          </Section>
          <Section title="构图">
            <Field label="构图方式">
              <Input
                name="composition.framing"
                defaultValue={shot.composition?.framing ?? ''}
                placeholder="三分法 / 居中 / 引导线"
              />
            </Field>
            <Field label="视觉焦点">
              <Input
                name="composition.focus_subject"
                defaultValue={shot.composition?.focus_subject ?? ''}
              />
            </Field>
            <Field label="前景">
              <Input
                name="composition.foreground"
                defaultValue={shot.composition?.foreground ?? ''}
              />
            </Field>
            <Field label="背景">
              <Input
                name="composition.background"
                defaultValue={shot.composition?.background ?? ''}
              />
            </Field>
            <Field label="自定义构图">
              <Textarea name="composition.custom" defaultValue={shot.composition?.custom ?? ''} />
            </Field>
          </Section>
          <Section title="灯光">
            <Field label="光线类型">
              <Select name="lighting.type" defaultValue={shot.lighting?.type ?? ''}>
                <option value="">未设置</option>
                {[
                  ['natural', '自然光'],
                  ['studio', '影棚光'],
                  ['dramatic', '戏剧光'],
                  ['silhouette', '剪影'],
                  ['neon', '霓虹'],
                  ['golden_hour', '黄金时刻'],
                  ['overcast', '阴天漫射'],
                  ['practical', '实景灯'],
                ].map(([v, l]) => option(v, l))}
              </Select>
            </Field>
            <Field label="方向">
              <Select name="lighting.direction" defaultValue={shot.lighting?.direction ?? ''}>
                <option value="">未设置</option>
                {[
                  ['front', '正面'],
                  ['side', '侧面'],
                  ['back', '背面'],
                  ['top', '顶部'],
                  ['bottom', '底部'],
                  ['ambient', '环境'],
                ].map(([v, l]) => option(v, l))}
              </Select>
            </Field>
            <Field label="强度">
              <Select name="lighting.intensity" defaultValue={shot.lighting?.intensity ?? ''}>
                <option value="">未设置</option>
                {[
                  ['bright', '明亮'],
                  ['moderate', '适中'],
                  ['low', '低照度'],
                  ['high_contrast', '高反差'],
                ].map(([v, l]) => option(v, l))}
              </Select>
            </Field>
            <Field label="色温">
              <Input
                name="lighting.color_temperature"
                defaultValue={shot.lighting?.color_temperature ?? ''}
                placeholder="暖 / 冷 / 5600K"
              />
            </Field>
            <Field label="自定义灯光">
              <Textarea name="lighting.custom" defaultValue={shot.lighting?.custom ?? ''} />
            </Field>
          </Section>
          <Section title="色彩与视觉风格">
            <Field label="主色板" hint="用英文逗号分隔">
              <Input name="color.palette" defaultValue={shot.color?.palette?.join(', ') ?? ''} />
            </Field>
            <Field label="饱和度">
              <Select name="color.saturation" defaultValue={shot.color?.saturation ?? ''}>
                <option value="">未设置</option>
                {option('desaturated', '低饱和')}
                {option('natural', '自然')}
                {option('vibrant', '鲜艳')}
                {option('hyper_real', '超现实')}
              </Select>
            </Field>
            <Field label="对比度">
              <Select name="color.contrast" defaultValue={shot.color?.contrast ?? ''}>
                <option value="">未设置</option>
                {option('low', '低')}
                {option('medium', '中')}
                {option('high', '高')}
              </Select>
            </Field>
            <Field label="风格资产 ID">
              <Input name="style.reference" defaultValue={shot.style?.reference ?? ''} />
            </Field>
            <Field label="画幅">
              <Select
                required
                name="style.aspect_ratio"
                defaultValue={shot.style?.aspect_ratio ?? '16:9'}
              >
                {['16:9', '9:16', '1:1', '4:3', '21:9'].map((v) => option(v, v))}
              </Select>
            </Field>
            <Field label="帧率">
              <Input name="style.fps" type="number" min={1} defaultValue={shot.style?.fps ?? 24} />
            </Field>
            <Field label="渲染方式">
              <Select name="style.rendering" defaultValue={shot.style?.rendering ?? ''}>
                <option value="">未设置</option>
                {[
                  ['photorealistic', '写实'],
                  ['anime', '动画'],
                  ['3d_cgi', '三维 CG'],
                  ['stop_motion', '定格'],
                  ['hand_drawn', '手绘'],
                  ['oil_painting', '油画'],
                  ['pixel_art', '像素艺术'],
                ].map(([v, l]) => option(v, l))}
              </Select>
            </Field>
          </Section>
          <Section title="角色" description="引用项目角色，并添加仅用于当前镜头的表演覆盖。">
            <div className="space-y-4 md:col-span-2">
              {cast.map((member, index) => (
                <div
                  key={`${member.character_id}-${index}`}
                  className="grid gap-3 rounded-lg border border-line p-4 md:grid-cols-4"
                >
                  <Field label="角色">
                    <Select
                      value={member.character_id}
                      onChange={(e) => updateCast(index, { character_id: e.target.value })}
                    >
                      <option value="">选择角色</option>
                      {characters.map((item) => option(item.id, item.name))}
                    </Select>
                  </Field>
                  <Field label="出现方式">
                    <Select
                      value={member.presence ?? 'physical'}
                      onChange={(e) =>
                        updateCast(index, {
                          presence: e.target.value as ShotCharacterDTO['presence'],
                        })
                      }
                    >
                      {option('physical', '实体出现')}
                      {option('voice_only', '仅声音')}
                      {option('implied', '暗示出现')}
                    </Select>
                  </Field>
                  {(
                    [
                      'action',
                      'emotion',
                      'pose',
                      'expression',
                      'outfit_override',
                      'position',
                    ] as const
                  ).map((key) => (
                    <Field
                      key={key}
                      label={
                        (
                          {
                            action: '动作',
                            emotion: '情绪',
                            pose: '姿态',
                            expression: '表情',
                            outfit_override: '服装覆盖',
                            position: '画面位置',
                          } as const
                        )[key]
                      }
                    >
                      <Input
                        value={member[key] ?? ''}
                        onChange={(e) => updateCast(index, { [key]: e.target.value })}
                      />
                    </Field>
                  ))}
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setCast((items) => items.filter((_, i) => i !== index))}
                  >
                    移除角色
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setCast((items) => [...items, { character_id: '', presence: 'physical' }])
                }
              >
                添加角色
              </Button>
            </div>
          </Section>
          <Section title="动作与对白">
            <Field label="动作描述">
              <Textarea name="action.description" defaultValue={shot.action?.description ?? ''} />
            </Field>
            <Field label="时长提示（秒）">
              <Input
                name="action.duration_hint"
                type="number"
                step=".1"
                min="0"
                max="120"
                defaultValue={shot.action?.duration_hint ?? ''}
              />
            </Field>
            <Field label="对白内容">
              <Textarea name="dialogue.text" defaultValue={shot.dialogue?.text ?? ''} />
            </Field>
            <Field label="说话角色">
              <Select name="dialogue.speaker_id" defaultValue={shot.dialogue?.speaker_id ?? ''}>
                <option value="">未指定</option>
                {characters.map((item) => option(item.id, item.name))}
              </Select>
            </Field>
            <Field label="对白方式">
              <Select name="dialogue.style" defaultValue={shot.dialogue?.style ?? ''}>
                <option value="">未设置</option>
                {option('voice_over', '旁白')}
                {option('on_screen', '画内对白')}
                {option('off_screen', '画外对白')}
                {option('internal_monologue', '内心独白')}
              </Select>
            </Field>
          </Section>
          <Section title="声音">
            <Field label="音乐资产 ID">
              <Input name="audio.music_id" defaultValue={shot.audio?.music_id ?? ''} />
            </Field>
            <Field label="音效资产 ID" hint="用英文逗号分隔">
              <Input name="audio.sfx" defaultValue={shot.audio?.sfx?.join(', ') ?? ''} />
            </Field>
            <Field label="环境声">
              <Input name="audio.ambience" defaultValue={shot.audio?.ambience ?? ''} />
            </Field>
            <Field label="音乐音量">
              <Input
                name="audio.volume_music"
                type="number"
                min="0"
                max="1"
                step=".05"
                defaultValue={shot.audio?.volume_music ?? ''}
              />
            </Field>
            <Field label="音效音量">
              <Input
                name="audio.volume_sfx"
                type="number"
                min="0"
                max="1"
                step=".05"
                defaultValue={shot.audio?.volume_sfx ?? ''}
              />
            </Field>
          </Section>
          <Section title="提示词" description="结构化镜头与视频生成模型之间的桥梁。">
            <Field label="来源">
              <Select name="prompt.source" defaultValue={shot.prompt?.source ?? 'auto'}>
                {option('auto', 'AI 自动构建')}
                {option('manual', '人工编写')}
                {option('hybrid', 'AI 基础 + 人工编辑')}
              </Select>
            </Field>
            <Field label="正向提示词">
              <Textarea name="prompt.positive" defaultValue={shot.prompt?.positive ?? ''} />
            </Field>
            <Field label="负向提示词">
              <Textarea name="prompt.negative" defaultValue={shot.prompt?.negative ?? ''} />
            </Field>
            <Field label="提示词构建指令">
              <Textarea
                name="prompt.generation_prompt"
                defaultValue={shot.prompt?.generation_prompt ?? ''}
              />
            </Field>
            <Field label="完整人工覆盖">
              <Textarea name="prompt.custom" defaultValue={shot.prompt?.custom ?? ''} />
            </Field>
          </Section>
        </fieldset>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              void remove();
            }}
          >
            删除镜头
          </Button>
        </div>
      </div>
    </form>
  );
}
