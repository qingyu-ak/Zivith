# Shot Specification

> Zivith Shot 详细规格
>
> Version: 1.0
>
> Status: Draft
>
> Related: [Core-Domain-Model.md](Core-Domain-Model.md), [Design-Philosophy.md](../product/Design-Philosophy.md), [Asset-Model.md](Asset-Model.md)

---

# 1. 目的

本文档定义 Shot 的完整结构——最小可编辑创作单元，也是 Zivith 的核心对象。

每一次 AI 生成操作都针对一个或多个 Shot。每一个 Video 都源自 Shot。本规格必须足够精确，使人类创作者与 AI Agent 都能无歧义地消费。

---

# 2. Shot 生命周期

Shot 在创建与编辑过程中经过一组定义好的状态。

```
[Draft] → [Prompting] → [Generating] → [Review] → [Approved]
                ↑              ↓           ↓
                └──── Retry ────┴────── [Draft]
```

| State | Description | Allowed Transitions |
|-------|-------------|---------------------|
| `draft` | 创建后的初始状态，内容尚未定稿 | `prompting` |
| `prompting` | AI 正在根据 Shot 字段构建或精炼 prompt | `generating`, `draft` |
| `generating` | 视频生成进行中 | `review`, `draft`（取消或最终失败） |
| `review` | 已完成的 Output 等待人工决策 | `approved`, `draft`（拒绝或编辑） |
| `approved` | 创作签字，Shot 已冻结 | 仅通过显式 `UnfreezeShot` 操作回到 `draft` |

处于 `approved` 状态的 Shot 被冻结。后续 Project 或 Scene 的修改不会自动传播到已批准 Shot。返回 `draft` 需要手动解冻。

### Output 与 Shot 状态同步

每次 `GenerateVideo` 调用创建独立的 Output 版本。Output 跟踪 provider-job 状态；Shot 跟踪创作工作流：

- 当 job 创建时，Shot 进入 `generating`，其新 Output 为 `queued` 或 `generating`。
- 当任一 Output 完成时，Shot 进入 `review`。
- 当某个 Output 失败时，将该 Output 标记为 `failed`。若 Shot 既无运行中的 job 也无已完成的 Output，则将 Shot 退回 `draft` 以便重试。
- 重试始终创建新的 Output。历史 Output 保留该次尝试所用的 prompt 与视觉参考快照。
- 只有处于 `review` 的已完成 Output 才能被批准为活跃版本。Shot 一旦批准，就不再自动继承上游变更。

---

# 3. Shot Schema

## 3.1 Identity

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `ShotId` | Yes | 系统分配的唯一标识符 |
| `scene_id` | `SceneId` | Yes | 所属 Scene 引用 |
| `order` | `int` | Yes | 在 Scene 内的位置（从 1 起） |
| `label` | `string` | No | 人类可读标签，例如 "Close-up of Sun Wukong drawing his weapon" |
| `state` | `ShotState` | Yes | 当前生命周期状态 |
| `narrative_mode` | `enum` | No | `present`（默认）、`flashback`、`memory`、`dream`、`fantasy`。控制 prompt 构造中的视觉处理。 |
| `location_area` | `string` | No | Scene 的 Location 内的子区域，例如 "阁楼门前走廊"、"卧室角落" |

## 3.2 电影规格

这些字段定义镜头捕捉什么。它们构成 prompt 构造的主要输入。

### 3.2.1 Camera

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `camera.shot_type` | `enum` | No | `close_up`, `medium_shot`, `wide_shot`, `extreme_close_up`, `full_shot`, `over_the_shoulder`, `pov`, `aerial`, `dutch_angle` |
| `camera.angle` | `enum` | No | `eye_level`, `low_angle`, `high_angle`, `birds_eye`, `worms_eye` |
| `camera.movement` | `enum` | No | `static`, `pan_left`, `pan_right`, `tilt_up`, `tilt_down`, `dolly_in`, `dolly_out`, `tracking`, `handheld` |
| `camera.focal_length` | `string` | No | 例如 `24mm`, `50mm`, `85mm`, `200mm` |
| `camera.depth_of_field` | `string` | No | `shallow`, `deep` |
| `camera.custom` | `string` | No | 不支持规格的自由文本镜头覆盖 |

### 3.2.2 Composition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `composition.framing` | `string` | No | 例如 `rule_of_thirds`, `centered`, `leading_lines` |
| `composition.focus_subject` | `string` | No | 观众视线应被吸引到何处 |
| `composition.foreground` | `string` | No | 前景元素描述 |
| `composition.background` | `string` | No | 背景元素描述 |
| `composition.custom` | `string` | No | 自由文本构图覆盖 |

### 3.2.3 Lighting

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lighting.type` | `enum` | No | `natural`, `studio`, `dramatic`, `silhouette`, `neon`, `golden_hour`, `overcast`, `practical` |
| `lighting.direction` | `enum` | No | `front`, `side`, `back`, `top`, `bottom`, `ambient` |
| `lighting.intensity` | `enum` | No | `bright`, `moderate`, `low`, `high_contrast` |
| `lighting.color_temperature` | `string` | No | `warm`, `cool`, `neutral`，或 Kelvin 值如 `5600K` |
| `lighting.custom` | `string` | No | 自由文本灯光覆盖 |

### 3.2.4 Color & Mood

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `color.palette` | `string[]` | No | 主色或调色板名称列表，例如 `["teal", "orange"]` |
| `color.saturation` | `enum` | No | `desaturated`, `natural`, `vibrant`, `hyper_real` |
| `color.contrast` | `enum` | No | `low`, `medium`, `high` |
| `mood` | `string` | No | 情绪基调，例如 `tense`, `joyful`, `melancholic`, `epic` |

### 3.2.5 Visual Style

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `style.reference` | `StyleId` | No | 引用 Project 级 Style 资产 |
| `style.aspect_ratio` | `string` | Yes | `16:9`, `9:16`, `1:1`, `4:3`, `21:9` |
| `style.fps` | `int` | No | 目标帧率，默认 `24` |
| `style.rendering` | `string` | No | `photorealistic`, `anime`, `3d_cgi`, `stop_motion`, `hand_drawn`, `oil_painting`, `pixel_art` |

## 3.3 Character 规格

出现在本 Shot 中的角色。引用 Project 级 Character 资产，可带可选本地覆盖。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `characters[].character_id` | `CharacterId` | Yes | 引用 Project Character |
| `characters[].presence` | `enum` | No | `physical`（默认）、`voice_only`、`implied`。电话用 voice-only；照片/回忆用 implied。 |
| `characters[].action` | `string` | No | 角色在本 Shot 中正在做什么 |
| `characters[].emotion` | `string` | No | 情绪状态，例如 `angry`, `calm`, `surprised` |
| `characters[].pose` | `string` | No | 身体姿态描述 |
| `characters[].expression` | `string` | No | 面部表情细节 |
| `characters[].outfit_override` | `string` | No | 服装覆盖（为空则从 Character 继承） |
| `characters[].position` | `string` | No | 画面中位置，例如 `center`, `left_third`, `background` |

## 3.4 Content

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dialogue.text` | `string` | No | 对白文本 |
| `dialogue.speaker_id` | `CharacterId` | No | 哪位角色在说话 |
| `dialogue.style` | `enum` | No | `voice_over`, `on_screen`, `off_screen`, `internal_monologue` |
| `action.description` | `string` | No | Shot 中发生的物理动作 |
| `action.duration_hint` | `float` | No | 近似时长（秒） |

## 3.5 Audio

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio.music_id` | `AssetId` | No | 背景音乐资产引用 |
| `audio.sfx[]` | `AssetId[]` | No | 音效引用 |
| `audio.ambience` | `string` | No | 环境音描述 |
| `audio.volume_music` | `float` | No | 音乐音量（0.0–1.0） |
| `audio.volume_sfx` | `float` | No | 音效音量（0.0–1.0） |

## 3.6 Prompt

`prompt` 部分是结构化 Shot 数据与 AI 生成模型之间的桥梁。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt.positive` | `string` | No | 构造出的正向 prompt |
| `prompt.negative` | `string` | No | 负向 prompt / 应避免的内容 |
| `prompt.source` | `enum` | Yes | `auto`（AI 构造）、`manual`（人工撰写）、`hybrid`（AI 基底 + 人工编辑） |
| `prompt.generation_prompt` | `string` | No | 用于指示 LLM 构造视频 prompt 的提示词 |
| `prompt.custom` | `string` | No | 完整手动 prompt 覆盖 |

当 `prompt.source` 为 `auto` 时，系统使用 Prompt Template（见第 5 节）组合上述所有结构化字段，构造 `prompt.positive`。

## 3.7 Outputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `outputs[].id` | `OutputId` | Yes | Output 标识符 |
| `outputs[].video_url` | `string` | Yes | 生成视频的 URL 或路径 |
| `outputs[].thumbnail_url` | `string` | No | 缩略图 |
| `outputs[].model` | `string` | Yes | 所选 provider 返回的 AI 模型标识符 |
| `outputs[].model_version` | `string` | No | 具体模型版本 |
| `outputs[].parameters` | `json` | Yes | 完整生成参数快照 |
| `outputs[].duration_seconds` | `float` | No | 实际视频时长 |
| `outputs[].resolution` | `string` | No | 例如 `1920x1080` |
| `outputs[].file_size_bytes` | `int` | No | 文件大小 |
| `outputs[].generated_at` | `datetime` | Yes | 生成时间戳 |
| `outputs[].is_active` | `bool` | Yes | 是否为活跃输出版本 |
| `outputs[].status` | `enum` | Yes | `queued`, `generating`, `completed`, `failed` |

一个 Shot 可以有多个 outputs（版本）。任意时刻只有一个 `is_active`。旧版本保留作历史。

---

# 4. 继承与覆盖规则

Shot 从父 Scene 继承上下文，Scene 从 Story 继承，Story 从 Project 继承。

**继承链：**

```
Project.defaults
    ↓
Story.overrides
    ↓
Scene.overrides
    ↓
Shot.local
```

**解析规则：** 当字段在 Shot 中为 `null` 或不存在时，沿链向上查找。第一个非 null 值胜出。

**覆盖示例：**

```
Project.style.rendering = "anime"

Scene 1: style.rendering = null          → inherits "anime"
Scene 2: style.rendering = "3d_cgi"      → overrides to "3d_cgi"

Shot 2.1: style.rendering = null         → inherits "3d_cgi" from Scene 2
Shot 2.2: style.rendering = "oil_painting" → local override
```

**已批准 Shot 打断继承。** 一旦 Shot 到达 `approved` 状态，父 Scene/Story/Project 的后续变更不会传播到它。这保护创作决策免受意外漂移。

---

# 5. Prompt 构造

当 `prompt.source` 为 `auto` 时，系统通过组合结构化字段构造 `prompt.positive`。

## 5.1 Prompt Template

默认模板按优先级顺序拼接字段：

```
[Camera] [Composition] [Lighting] [Color & Mood]
[Character descriptions with action, emotion, pose]
[Action description]
[Dialogue context]
[Location & Environment context from Scene]
[Style context from Project]
```

## 5.2 Template Configuration

每个 Project 可定义自定义 prompt templates，控制字段顺序、权重与包含逻辑。

```yaml
prompt_template:
  name: "cinematic_default"
  sections:
    - field: "camera"
      weight: 1.0
      prefix: "Cinematography: "
    - field: "lighting"
      weight: 0.8
      prefix: "Lighting: "
    - field: "characters"
      weight: 1.2
      prefix: ""
    - field: "action"
      weight: 1.0
      prefix: ""
    - field: "dialogue"
      weight: 0.5
      prefix: "Context: "
    - field: "style"
      weight: 0.7
      prefix: "Style: "
```

## 5.3 Negative Prompt 构造

负向 prompt 由 Project 级默认值与 Shot 级覆盖组合而成：

- Project 默认负向 prompt（`project.defaults.negative_prompt`）
- 每 Shot 额外负向 token（`prompt.negative`）

---

# 6. 校验规则

Shot 在生成前必须满足这些约束：

| Rule | Severity | Description |
|------|----------|-------------|
| `scene_must_exist` | Error | `scene_id` 必须引用存在的 Scene |
| `at_least_one_content` | Warning | Shot 应至少具备 action、dialogue 或 character 之一 |
| `aspect_ratio_required` | Error | `style.aspect_ratio` 必须已设置（或已继承） |
| `character_refs_valid` | Error | 所有 `characters[].character_id` 必须引用 Project 中存在的 Character |
| `asset_refs_valid` | Warning | 被引用的资产应存在 |
| `visual_assets_approved` | Error | Scene 中每个必需的 Character 或 Location Visual Asset Requirement 必须有已批准的绑定图。`voice_only` 与 `implied` 角色除外。 |
| `duration_range` | Warning | `action.duration_hint` 应在模型支持范围内（通常 2–120 秒） |

---

# 7. Shot Editor API Surface

Shot Editor 是人类与 AI Agent 修改 Shot 的主要工作区。必须支持以下操作：

| Operation | Description |
|-----------|-------------|
| `UpdateShot(shot_id, patch)` | 对任意 Shot 字段的部分更新 |
| `GeneratePrompt(shot_id)` | AI 根据结构化字段构造 prompt |
| `EditPrompt(shot_id, prompt)` | 直接编辑 prompt |
| `GenerateVideo(shot_id)` | 校验必需的 Scene Visual Asset Requirements 已批准，然后触发视频生成 |
| `RegenerateVideo(shot_id, output_id?)` | 从同一 Shot 重新生成，可选基于先前 output |
| `ApproveShot(shot_id)` | 将 Shot 冻结为 `approved` |
| `UnfreezeShot(shot_id)` | 将已批准 Shot 退回 `draft` |
| `ReorderShot(shot_id, new_order)` | 更改 Shot 在 Scene 内的位置 |
| `DuplicateShot(shot_id)` | 创建副本，`state = draft` |
| `DeleteShot(shot_id)` | 移除 Shot 及其所有 outputs（软删除） |
