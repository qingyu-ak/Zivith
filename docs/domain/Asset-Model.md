# Asset Model

> Zivith 素材与资源模型
>
> Version: 1.1
>
> Status: Active — synced 2026-07-28（设定表、地点设定表、provider 矩阵、封面解析）
>
> Related: [Core-Domain-Model.md](Core-Domain-Model.md), [Design-Philosophy.md](../product/Design-Philosophy.md), [Shot-Specification.md](Shot-Specification.md), [Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md), [Next-Tasks.md](../planning/Next-Tasks.md)

---

# 1. 目的

本文档定义 Zivith 的完整 Asset 分类体系与生命周期。

Asset 是由 Project 拥有的持久、可复用创作资源。它们是 Stories、Scenes 与 Shots 的构建块，并可在同一 Project 内的多个创作上下文中共享。

Asset 层围绕两个关键设计目标：

- **复用**：一次创建的 Asset 应可在同一 Project 内任意 Story 中使用
- **一致性**：按 ID 引用 Asset，确保整个创作宇宙的视觉与上下文连续性

---

# 2. Asset 分类体系

## 2.1 顶层分类

每个 Asset 恰好属于一个顶层类别。

| Category | Description | Examples |
|----------|-------------|----------|
| `character` | 出现在 Shot 中的人、生物或实体 | Sun Wukong、机器人、会说话的动物 |
| `location` | 物理场所或环境 | Heavenly Palace、咖啡店、森林 |
| `prop` | 场景中使用的物理物件 | 剑、书、飞船 |
| `style` | 视觉风格配置 | Anime style、film noir、水彩 |
| `media` | 原始媒体文件 | 图片、视频、音频片段、3D 模型 |
| `knowledge` | 结构化世界观信息 | Lore 文档、关系图、世界规则 |
| `prompt_template` | 可复用的 prompt 构造模板 | Cinematic default、产品广告模板 |

## 2.2 Character

最复杂的 Asset 类型。角色必须在其出现的所有 Shot 中保持视觉一致性。

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `CharacterId` | Yes | 唯一标识符 |
| `project_id` | `ProjectId` | Yes | 所属 Project |
| `name` | `string` | Yes | 角色名 |
| `aliases[]` | `string[]` | No | 别名 / 昵称 |
| `description` | `string` | Yes | 供 AI prompt 上下文使用的详细角色描述 |
| `base_character_id` | `CharacterId` | No | 用于替身/双胞胎角色：从另一 Character 继承外观，仅覆盖不同之处。用于共享同一张脸的角色。 |
| `appearance` | `object` | Yes | 外观规格（若设置了 `base_character_id` 可为部分字段——未指定字段继承） |
| `personality` | `string` | No | 性格特征。与 `name` / `description` / `aliases` 组成 Studio 角色卡，世界构建对话与扮演共用；导入档案（MemoryCore persona）只作补充，不覆盖这张卡 |
| `default_outfit` | `string` | No | 默认服装 / 戏服描述 |
| `reference_images[]` | `MediaId[]` | No | 用于视觉一致性的参考图。视频生成时，这些图作为 image-to-video 条件输入传入，以在 Shot 间维持角色外观。 |
| `voice_profile_id` | `AssetId` | No | 若使用声音克隆，引用 voice profile |
| `tags[]` | `string[]` | No | 可搜索标签 |
| `metadata` | `json` | No | 可扩展元数据 |

### Appearance Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `appearance.gender` | `string` | No | 性别呈现 |
| `appearance.age_range` | `string` | No | 例如 `young_adult`, `middle_aged`, `elderly` |
| `appearance.height` | `string` | No | 相对身高，例如 `tall`, `average`, `short` |
| `appearance.build` | `string` | No | 体型，例如 `athletic`, `slender`, `stocky` |
| `appearance.skin_tone` | `string` | No | 肤色描述 |
| `appearance.hair` | `string` | No | 发型与发色 |
| `appearance.eyes` | `string` | No | 眼睛颜色与特征 |
| `appearance.distinguishing_features` | `string` | No | 独特识别特征（伤疤、纹身等） |
| `appearance.custom` | `string` | No | 上述未覆盖内容的自由文本覆盖 |

### Appearance Variants（V0.4 W2 — 已实现）

一致性锚定在 **character × narrative state**，而非每个角色单一外观。Character 拥有有序的 `AppearanceVariant` 列表（表 `asset_appearance_variants`；见 [V0.4-Modification-Plan.md](../archive/V0.4-Modification-Plan.md) W2，采纳自 [waoowaoo review](../architecture/review/Zivith-Architecture-Review-Based-on-waoowaoo.md) A1）：

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | 稳定语义键，每 Character 唯一，例如 `default`, `wounded`, `young` |
| `title` | `string` | Yes | 显示名（中文 UI） |
| `change_reason` | `string` | No | 外观变化的叙事原因 |
| `description` | `string` | No | 外观增量，读取时合并到 Character 的基础 `appearance` 之上 |
| `anchor_media_id` | `MediaId` | No | 该变体的已批准锚定图——图像生成时注入的参考 |
| `candidate_media_ids[]` | `MediaId[]` | No | 等待选择的生成候选 |
| `state` | `enum` | Yes | 审批状态（与其他可审阅实体相同的枚举） |

每个角色在创建时获得 `default` 变体（既有角色由迁移回填），外加预留的**多视图设定表**槽位 `sheet_turnaround`。

### Character design sheet（`sheet_turnaround`）

| Rule | Detail |
|------|--------|
| Shape | **一张 T2I 图**，不是四次 API 调用——要求 **2×2** 布局：全身正面 / 侧面 / 背面 + **专用的大尺寸头肩面部特写**面板（不是角落小裁切） |
| Prompt flow | Visual Prep / 资产页根据剧本 + 描述 **起草**英文 prompt → 操作员 **审阅** → 再 T2I |
| Generation | 主设定表始终 **T2I**（不对占位图做 I2I 条件化） |
| Cover | 成功生成后将设定表 Media 前置到 Asset `reference_images[]`；列表/详情 API 暴露已解析的 `cover_image`，带可用的 `url` / `access_url` |
| Legacy | 键 `sheet_front` / `sheet_side` / `sheet_back` / `sheet_face` 仍可读，但已 **deprecated** |

**资产库 API（character）：**

| Method | Path | Purpose |
|--------|------|---------|
| `GET/POST` | `/assets/:id/appearance-variants` | 列出 / 创建叙事变体 |
| `PATCH/DELETE` | `/assets/:id/appearance-variants/:key` | 更新 / 软删除 |
| `POST` | `/assets/:id/appearance-variants/:key/generate` | 为单个变体生成候选 |
| `POST` | `/assets/:id/appearance-variants/:key/approve` | 批准所选候选为锚定图 |
| `POST` | `/assets/:id/appearance-variants/draft-sheet-prompt` | LLM 仅起草 `sheet_turnaround` prompt |
| `POST` | `/assets/:id/appearance-variants/generate-sheet` | 单次 turnaround T2I；设置封面 |
| `DELETE` | `/assets/:id/appearance-variants/:key/candidates/:mediaId` | 软删除一个历史候选 |

**UI：** 列表在 `/projects/:pid/assets` → 点击打开详情 `/projects/:pid/assets/:assetId`（无侧栏）。设定表控件在角色详情页。

Visual Prep 根据剧本 **起草**设定表 + 场景 prompts，**不会**自动调用图像 API。操作员在资产库生成设定表，再在 WorkflowPanel 中逐卡生成场景关键帧。Visual Prep 批准会在键存在时同步 `variant_key` → 匹配变体的 `anchor_media_id`。重新生成会追加到 `candidate_media_ids`，除非用户删除候选，否则不移除先前 Media。参考图注入优先 `sheet_turnaround`，再是旧版设定表锚定，再是 `reference_images[0]`（仅 http(s) URL）。

**说明：** 故事到视频工作流中的「角色关键图」是 Visual Prep 下的**场景上下文关键帧**，不是资产库设定表。请先在 Character **详情**页生成多视图设定表以保障身份一致性。

### Provider 模型矩阵（SiliconFlow — 已实现）

| Slot | Env / models field | Default | When used |
|------|--------------------|---------|-----------|
| Text-to-image (T2I) | `SILICONFLOW_IMAGE_MODEL` / `image` | `Qwen/Qwen-Image` | 首张设定表 / 无可用参考的关键帧 |
| Text+image-to-image (I2I) | `SILICONFLOW_IMAGE_I2I_MODEL` / `image_i2i` | `Qwen/Qwen-Image-Edit` | 有 http(s) 参考；provider 4xx/5xx（如 50507）时 **回退到 T2I** |
| Text-to-video (T2V) | `SILICONFLOW_VIDEO_MODEL` / `video` | `Wan-AI/Wan2.2-T2V-A14B` | 无 http(s) 参考帧 |
| Image-to-video (I2V) | `SILICONFLOW_VIDEO_I2V_MODEL` / `video_i2v` | `Wan-AI/Wan2.2-I2V-A14B` | 有 http(s) 参考帧 |

运行时 Provider 面板暴露这四个图像/视频槽位。更改导出的设定表常量后需重建 `@zivith/domain`。

## 2.3 Location

Location 代表物理场所。Location 为引用它们的 Scene 内所有 Shot 提供共享环境上下文。

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `LocationId` | Yes | 唯一标识符 |
| `project_id` | `ProjectId` | Yes | 所属 Project |
| `name` | `string` | Yes | 地点名 |
| `description` | `string` | Yes | 供 AI prompt 上下文使用的详细描述 |
| `type` | `enum` | No | `interior`, `exterior`, `fantasy`, `scifi`, `modern`, `historical`, `abstract` |
| `time_period` | `string` | No | 例如 `modern_day`, `1920s`, `ancient_china`, `distant_future` |
| `weather_default` | `string` | No | 默认天气，例如 `sunny`, `rainy`, `foggy` |
| `lighting_default` | `string` | No | 默认灯光，例如 `natural_daylight`, `candlelit` |
| `mood_default` | `string` | No | 默认氛围 |
| `reference_images[]` | `MediaId[]` | No | 参考图；列表/详情 API 将它们 **解析** 为带 `url` / `access_url` 的 Media DTO（裸 ID 不是有效的 `<img src>`） |
| `floor_plan_url` | `string` | No | 室内地点的可选平面图 |
| `tags[]` | `string[]` | No | 可搜索标签 |

### Location design sheet（`location_sheet`）

Location **不**使用 `AppearanceVariant` 槽位。设定表是单张多角度 T2I 图，存储为资产封面 / 首个 `reference_images[]` 条目；起草 prompt 位于 `asset.data.visual.generation_prompts.location_sheet`。

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/assets/:id/location-sheet/draft-prompt` | LLM 起草多角度环境 prompt |
| `POST` | `/assets/:id/location-sheet/generate` | 单次 T2I；将 Media 前置到 `reference_images` 作为封面 |

**UI：** 地点详情页「地点设定表」— 起草 → 审阅 → 生成（与角色 turnaround 相同模式）。

**列表 / 详情封面：** `GET /projects/:pid/assets` 与 `GET /assets/:id` 返回 `cover_image`（优先设定表或首张参考）以及已解析的 `reference_images[]` Media 对象。

## 2.4 Prop

Prop 是可能出现在 Shot 中的物理物件。

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `PropId` | Yes | 唯一标识符 |
| `project_id` | `ProjectId` | Yes | 所属 Project |
| `name` | `string` | Yes | 道具名 |
| `description` | `string` | Yes | 供 AI prompt 上下文使用的详细描述 |
| `category` | `enum` | No | `weapon`, `tool`, `vehicle`, `furniture`, `decoration`, `consumable`, `technology`, `magical`, `other` |
| `reference_images[]` | `MediaId[]` | No | 参考图 |
| `tags[]` | `string[]` | No | 可搜索标签 |

## 2.5 Style

Style 定义可应用于创作层级任意层的视觉呈现设置。

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `StyleId` | Yes | 唯一标识符 |
| `project_id` | `ProjectId` | Yes | 所属 Project |
| `name` | `string` | Yes | 风格名，例如 "Studio Ghibli Inspired" |
| `rendering` | `string` | No | `photorealistic`, `anime`, `3d_cgi`, `stop_motion`, `hand_drawn`, `oil_painting`, `pixel_art` |
| `color_palette[]` | `string[]` | No | 默认调色板 |
| `saturation` | `string` | No | `desaturated`, `natural`, `vibrant`, `hyper_real` |
| `contrast` | `string` | No | `low`, `medium`, `high` |
| `aspect_ratio` | `string` | No | `16:9`, `9:16`, `1:1`, `4:3`, `21:9` |
| `fps` | `int` | No | 默认帧率 |
| `negative_prompt` | `string` | No | 默认负向 prompt token |
| `reference_images[]` | `MediaId[]` | No | 风格参考图 |
| `prompt_prefix` | `string` | No | 该风格激活时前置到每个 prompt |
| `prompt_suffix` | `string` | No | 该风格激活时追加到每个 prompt |

## 2.6 Media

Media 资产是上传到或在 Project 内生成的二进制文件。

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `MediaId` | Yes | 唯一标识符 |
| `project_id` | `ProjectId` | Yes | 所属 Project |
| `name` | `string` | Yes | 显示名 |
| `media_type` | `enum` | Yes | `image`, `video`, `audio`, `3d_model`, `document` |
| `mime_type` | `string` | Yes | 例如 `image/png`, `video/mp4` |
| `url` | `string` | Yes | 存储 URL |
| `thumbnail_url` | `string` | No | 媒体浏览器缩略图 |
| `file_size_bytes` | `int` | No | 文件大小 |
| `resolution` | `string` | No | 图像/视频，例如 `1920x1080` |
| `duration_seconds` | `float` | No | 视频/音频 |
| `source` | `enum` | Yes | `uploaded`, `generated`, `imported` |
| `generation_metadata` | `json` | No | 若为生成：model、prompt、parameters |
| `tags[]` | `string[]` | No | 可搜索标签 |

## 2.7 Scene Visual Asset Bindings

`VisualAssetRequirement` 是 Scene 视觉准备阶段中的持久实体。它不替代项目级 Character 或 Location Asset；它记录某一 Asset 在单个 Scene 中的具体主图或变体图需求，以及其审阅结果。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `VisualAssetRequirementId` | Yes | 唯一标识符 |
| `scene_id` | `SceneId` | Yes | 所属 Scene |
| `asset_type` | `enum` | Yes | 首发为 `character` 或 `location`；Props 不参与视觉准备 |
| `asset_id` | `AssetId` | Yes | 被引用的 Character 或 Location |
| `variant_key` | `string` | Yes | 稳定的 Scene 变体键，例如 `default`、`midnight_moonlight` 或 `attic_corridor`。自 V0.4（plan W2）：当键匹配 Character `AppearanceVariant.key` 时，该变体的锚定图是首选生成参考；未匹配的自由形式键仍有效以保持向后兼容 |
| `required` | `boolean` | Yes | 是否为生成该 Scene 的 Shot 的前置条件 |
| `reason` | `string` | Yes | 为何必须生成、复用或重新生成该图 |
| `status` | `enum` | Yes | `pending`, `generating`, `review`, `approved`, 或 `rejected` |
| `candidate_media_ids[]` | `MediaId[]` | No | 等待审阅的候选图 |
| `approved_media_id` | `MediaId` | No | 为本 Scene 选定的单张图 |
| `generation_job_id` | `ImageGenerationJobId` | No | 当前或最近的图像生成 job |
| `version` | `int` | Yes | 乐观锁版本，用于防止 Scene 变更后并发覆盖 |

**选择规则：**

1. 视频生成优先使用同一 Scene 中 `approved` 绑定的 `approved_media_id`。
2. 仅当 Scene 没有已批准绑定时，才回退到 Character 或 Location Asset 的项目级主 `reference_images[]`。
3. `voice_only` 与 `implied` 角色不创建角色绑定。首发版本中，重要 Props 仅作为 prompt 上下文，不创建绑定。
4. 对 Scene 的 Location、时间、天气、情绪、参与角色或地点子区域的变更，会使受影响绑定回到 `pending`。已批准 Shot 与既有 Output 保留其创建时 Media 快照。

**参考图注入（V0.4 W1 — 已实现）：** 图像生成请求可携带带标签的 `reference_images`，解析顺序为 AppearanceVariant `anchor_media_id`（当 `variant_key` 匹配）→ 优先 `sheet_turnaround` → 否则 Asset `reference_images[0]`（**仅 http(s)**；跳过 `data:` / SVG 占位）。Adapter 声明 `supportsReferenceImages`；当所选模型无法以图像为条件时，生成继续且不注入，并将 `generation_metadata.reference_injection` 设为 `skipped_unsupported`（UI 显示「本次未注入参考图」）。当选择 I2I 但 provider 返回 4xx/5xx（如 SiliconFlow `50507`）时，管线 **重试 T2I** 并记录 `skipped_i2i_error`。已应用的注入在 Media 元数据上记录 `reference_media_ids[]`。视频 image-to-video 使用 Scene 已批准绑定的 Media URL（规则 1），而非原始 Media ID。

## 2.8 Knowledge

Knowledge 资产存储用于维持叙事一致性的结构化世界观信息。

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `KnowledgeId` | Yes | 唯一标识符 |
| `project_id` | `ProjectId` | Yes | 所属 Project |
| `name` | `string` | Yes | 知识条目名 |
| `category` | `enum` | Yes | `lore`, `world_rule`, `relationship`, `timeline_event`, `glossary`, `style_guide`, `custom` |
| `content` | `text` | Yes | 结构化知识内容（Markdown） |
| `related_assets[]` | `AssetId[]` | No | 相关 Characters、Locations 等 |
| `tags[]` | `string[]` | No | 可搜索标签 |

## 2.9 Prompt Template

Prompt Templates 是可复用配置，控制如何将结构化 Shot 数据组合为视频生成 prompt。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `TemplateId` | Yes | 唯一标识符 |
| `project_id` | `ProjectId` | Yes | 所属 Project |
| `name` | `string` | Yes | 模板名 |
| `description` | `string` | No | 何时使用该模板 |
| `sections[]` | `object[]` | Yes | 有序 section 列表（见 Shot-Specification.md §5.2） |
| `system_prompt` | `string` | No | 用于 prompt 构造的 LLM system prompt |

---

# 3. Asset 生命周期

每个 Asset 遵循相同生命周期：

```
[Draft] → [Active] → [Archived]
```

| State | Description |
|-------|-------------|
| `draft` | 正在创建或编辑，尚不可用于 Shot |
| `active` | 可在 Project 内所有 Story 中使用 |
| `archived` | 从默认视图隐藏，但为引用它的历史 Shot 保留 |

**转换规则：**

- `draft` → `active`：Asset 已完成并可供使用
- `active` → `draft`：返回编辑（影响尚未批准的继承 Shot）
- `active` → `archived`：从活跃使用中退役
- `archived` → `active`：恢复为活跃使用

已归档 Asset 对已经引用它们的 Shot 仍可解析。已归档 Character 不能加入新 Shot。

Asset 为 `active` 表示可供引用；这不是视觉批准。某图是否可用于特定 Scene，由 `VisualAssetRequirement.status: approved` 决定。

---

# 4. Asset 所有权与共享

## 4.1 Project 所有权

所有 Asset 恰好属于一个 Project。Asset 不跨 Project 共享。

未来版本可能引入「全局资产库」，使用户可跨 Project 发布 Asset，但 v1 强制 Project 作用域所有权。

## 4.2 引用模型

Asset 始终按 ID 引用。当 Shot 引用 Character 时，它存储 `CharacterId`，而非 Character 数据的副本。

```
Shot.characters[0].character_id = "char_abc123"
```

在渲染 Shot 或构造其 prompt 时，系统解析引用并应用任何本地覆盖。

## 4.3 Asset 修改的影响

当 Asset 被修改时：

| Asset State | Impact on Referencing Shots |
|-------------|----------------------------|
| `active` Asset 被修改 | 所有未批准 Shot 在下次生成时自动反映变更 |
| `active` Asset 被修改 | 已批准 Shot 不受影响（它们已冻结） |
| `archived` Asset | 既有引用继续解析；新引用被阻止 |

在提议的 [Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md) 架构下，Asset 或 AppearanceVariant 更新还会创建不可变的 EntityRevision 与 ChangeEvent。Shot/Scene 顺序将所选 Character State 放在 Presentation Time 轴上；World Time 默认跟随，仅对时间偏离使用可选的 Project 定义绑定。Track 是视图泳道，不是替代版本分支。未来的 `CreativeBranch` 可持有提议的 Asset/AppearanceVariant State，而不修改当前行。已接受的变更将受影响且未冻结的 VisualAssetRequirements 与 Shots 标记为 stale；已批准 Shot 与既有 Output 继续使用创建时快照。这些能力已设计但尚未实现。

---

# 5. Prompt 构造中的 Asset 解析

构造 Shot 的生成 prompt 时，系统按此顺序解析被引用的 Asset：

1. 从 Shot 的本地字段开始
2. 对每个 `null` 或不存在的字段，从 Scene overrides 解析
3. 对剩余 `null` 字段，从 Story overrides 解析
4. 对剩余 `null` 字段，从 Project defaults 解析
5. 对 Asset 引用（Character、Location、Style），获取完整 Asset 记录
6. 若 Character 有 `base_character_id`，先解析基础 Character 的 `appearance` 与默认服装，再本地合并当前 Character 的非 null 字段
7. 对 Characters 与 Locations，先解析已批准的 Scene visual-asset binding；仅当无绑定时，才回退到 Asset 的项目级主参考图
8. 在已解析 Asset 数据之上应用任何 Shot 级覆盖
9. 将已解析数据送入 Prompt Template，产出 `prompt.positive`

**示例 — Character 解析：**

```
Project has Character "Sun Wukong":
  appearance.hair = "golden brown fur"
  default_outfit = "golden armor with red cape"

Shot references "Sun Wukong":
  character_id = "char_swk"
  outfit_override = "torn monk's robe"    ← overrides default_outfit
  emotion = "furious"                      ← Shot-level addition

Resolved for this Shot:
  appearance.hair = "golden brown fur"     ← from Character
  outfit = "torn monk's robe"              ← override applied
  emotion = "furious"                       ← Shot-level
```

---

# 6. Asset API Surface

| Operation | Description |
|-----------|-------------|
| `CreateAsset(project_id, asset_type, data)` | 创建新 Asset |
| `UpdateAsset(asset_id, patch)` | 部分更新 |
| `GetAsset(asset_id)` | 带解析的完整 Asset |
| `ListAssets(project_id, type?, tags?)` | 带可选过滤器的查询 |
| `SearchAssets(project_id, query)` | 跨 name、description、tags 的全文搜索 |
| `ArchiveAsset(asset_id)` | 移至 `archived` 状态 |
| `RestoreAsset(asset_id)` | 从 `archived` 移至 `active` |
| `DeleteAsset(asset_id)` | 永久删除（仅当无活跃引用时） |
| `GetAssetReferences(asset_id)` | 列出引用该 Asset 的所有 Shots/Scenes/Stories |
| `UploadMedia(project_id, file)` | 上传 Media Asset |
| `DuplicateAsset(asset_id)` | 创建 `draft` 状态的副本 |
