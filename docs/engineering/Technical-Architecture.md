# 技术架构

> Zivith 技术架构
>
> Version: 1.1
>
> Status: Active — 已于 2026-07-28 同步（SiliconFlow 模态槽位 + I2I 回退）
>
> Related: [Core-Domain-Model.md](../domain/Core-Domain-Model.md), [AI-Agent-Collaboration.md](../domain/AI-Agent-Collaboration.md), [Shot-Specification.md](../domain/Shot-Specification.md), [Asset-Model.md](../domain/Asset-Model.md), [Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md), [ADR-0007](../architecture/adr/0007-preserve-current-state-with-immutable-creative-history.md)

---

# 1. 目的

本文档定义 Zivith 的技术架构。描述系统边界、组件职责、数据流与集成模式。

架构以技术无关的方式描述。具体技术选型（语言、框架、数据库）留待实施规划阶段决定。本文档中的模式可在任何合理的现代技术栈中实现。

---

# 2. 架构总览

## 2.1 系统边界

```
                         ┌──────────────────────┐
                         │   External AI APIs    │
                         │ (LLM, Image, Video)   │
                         └──────────┬───────────┘
                                    │
┌───────────────────────────────────┼───────────────────────────────────┐
│                          Zivith System                                │
│                                   │                                   │
│  ┌──────────────────┐   ┌────────┴─────────┐   ┌──────────────────┐  │
│  │   Web Frontend   │   │  API Gateway      │   │  Background      │  │
│  │   (SPA)          │──▶│  (REST + SSE)     │──▶│  Workers         │  │
│  │                  │   │                   │   │  (Job Queue)     │  │
│  └──────────────────┘   └────────┬─────────┘   └────────┬─────────┘  │
│                                  │                       │            │
│                          ┌───────┴───────┐       ┌──────┴───────┐    │
│                          │  Application   │       │  AI Agent     │    │
│                          │  Services      │       │  Runtime      │    │
│                          └───────┬───────┘       └──────┬───────┘    │
│                                  │                       │            │
│                          ┌───────┴───────────────────────┴───────┐    │
│                          │          Domain Layer                 │    │
│                          └───────────────────┬───────────────────┘    │
│                                              │                        │
│                          ┌───────────────────┴───────────────────┐    │
│                          │          Data Layer                   │    │
│                          │  ┌──────────┐  ┌──────────────────┐   │    │
│                          │  │ Primary  │  │  Object / Media  │   │    │
│                          │  │ Database │  │  Storage         │   │    │
│                          │  └──────────┘  └──────────────────┘   │    │
│                          └───────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘
```

## 2.2 架构原则

| 原则 | 说明 |
|-----------|-------------|
| **Bounded Contexts（限界上下文）** | 领域模型映射到清晰分离的服务边界 |
| **Ports & Adapters（端口与适配器）** | 外部集成（AI API、存储）置于接口之后 |
| **Event-Driven（事件驱动）** | 状态转换发出事件；相关服务响应 |
| **Stateless Services（无状态服务）** | 应用服务无状态；状态保存在数据库与任务队列中 |
| **Async by Default（默认异步）** | 任何可能超过 1 秒的操作使用异步任务处理 |

---

# 3. 限界上下文

领域划分为八个限界上下文。每个上下文拥有自身数据并暴露定义良好的 API。

## 3.1 上下文映射

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Project    │     │    Asset     │     │    Story     │
│   Context    │◀───▶│   Context    │◀───▶│   Context    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │            ┌───────┴───────┐            │
       └───────────▶│  Agent        │◀───────────┘
                    │  Orchestration│
                    │  Context      │
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
       ┌──────┴──────┐ ┌───┴────┐ ┌──────┴──────┐
       │   Prompt    │ │Generation│ │   Media     │
       │   Context   │ │ Context │ │   Context   │
       └─────────────┘ └────────┘ └─────────────┘
```
## 3.2 上下文职责

### Project Context（项目上下文）
- Project CRUD
- 项目级设置与默认值
- 每项目的 Agent 配置

### Asset Context（资产上下文）
- Character、Location、Prop、Style 的 CRUD
- Knowledge 管理
- 资产搜索与标签
- 引用解析

### Story Context（故事上下文）
- Story CRUD
- Scene CRUD
- Shot CRUD
- 层级管理（排序、改挂父级）
- 继承解析
- 审批状态管理

### Agent Orchestration Context（Agent 编排上下文）
- 工作流定义与配置
- 工作流执行（运行工作流）
- Agent 调度与结果收集
- 并行执行管理
- 审阅门禁管理
- 工作流状态持久化与恢复
- 版本化 Agent 系统提示词位于 `apps/api/prompts/<agent>/system.{zh,en}.md`，支持 `{placeholder}` 填充（加载器在 API 启动时校验；`{knowledge_context}` 预留给 P8）

### Prompt Context（提示词上下文）
- 提示词模板管理
- 从已解析 Shot 数据构造提示词
- 提示词版本管理
- LLM Agent 系统提示词（Story / Scene / Visual Trait）从文件加载 — 不在 TypeScript 中嵌入多行字符串

### Generation Context（生成上下文）
- 外部 AI 模型适配器
- 图像与视频生成任务管理
- 限流与排队
- 结果入库（将生成视频存为 Output）

### Media Context（媒体上下文）
- 文件上传与下载
- 缩略图生成
- 媒体元数据提取
- 对象存储抽象

### User Context（用户上下文，横切）
- 认证与授权
- 用户偏好
- 项目成员关系

### Entity State & Timeline Context（实体状态与时间线上下文，横切；拟议）
- 不可变 Entity 修订与 ChangeEvent 查询
- 以 Presentation Time（呈现时间）为主轴的 Project Timeline，可选绑定项目自定义的 World Time（世界时间）
- 语义 Track 配置与派生 Track 投影
- 乐观修订检查、命令幂等性，以及依赖过期传播

该上下文规范见 [Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md)，尚未实现。它不拥有 Story、Shot、Asset、Workflow 或 Generation 的当前状态；各既有限界上下文仍负责其专用表与领域转换。

## 3.3 上下文通信模式

| 模式 | 用例 |
|---------|----------|
| **同步 API 调用** | 当上下文 A 需要立即获取上下文 B 拥有的数据（例如提示词构造时的 Asset 解析） |
| **异步事件** | 当上下文 A 中的动作应触发上下文 B 的反应（例如 Shot 已批准 → 通知 Generation Context） |
| **共享 ID 引用** | 当上下文 A 存储指向上下文 B 实体的外键（例如 Shot 存储 `character_id`） |

---

# 4. API 设计

## 4.1 API 风格

公开 API 遵循 REST 约定。实时更新使用 Server-Sent Events（SSE）。

**Base URL：** `/api/v1`

## 4.2 资源端点

### Projects（项目）

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `GET` | `/projects` | 列出用户的项目 |
| `POST` | `/projects` | 创建项目 |
| `GET` | `/projects/{id}` | 获取项目详情 |
| `PATCH` | `/projects/{id}` | 更新项目 |
| `DELETE` | `/projects/{id}` | 删除项目 |
| `GET` | `/projects/{id}/settings` | 获取项目设置 |
| `PUT` | `/projects/{id}/settings` | 更新项目设置 |

### Stories（故事）

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `GET` | `/projects/{pid}/stories` | 列出项目中的故事 |
| `POST` | `/projects/{pid}/stories` | 创建故事 |
| `GET` | `/stories/{id}` | 获取故事及其场景 |
| `PATCH` | `/stories/{id}` | 更新故事 |
| `DELETE` | `/stories/{id}` | 删除故事 |

### Scenes（场景）

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `GET` | `/stories/{sid}/scenes` | 列出故事中的场景 |
| `POST` | `/stories/{sid}/scenes` | 创建场景 |
| `GET` | `/scenes/{id}` | 获取场景及其镜头 |
| `PATCH` | `/scenes/{id}` | 更新场景 |
| `DELETE` | `/scenes/{id}` | 删除场景 |
| `POST` | `/scenes/{id}/reorder` | 重排场景 |

### Scene Visual Requirements

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `GET` | `/scenes/{id}/visual-requirements` | 列出视觉需求、候选与批准状态 |
| `POST` | `/scenes/{id}/visual-requirements` | 创建或确认视觉需求 |
| `PATCH` | `/scenes/{id}/visual-requirements/{rid}` | 更新需求、变体或复用选择 |
| `POST` | `/scenes/{id}/visual-requirements/{rid}/generate` | 生成候选图像 |
| `POST` | `/scenes/{id}/visual-requirements/{rid}/approve` | 选择并批准一个候选 Media 项 |
| `POST` | `/scenes/{id}/visual-requirements/{rid}/reject` | 拒绝候选并保留需求以便重试 |

### Shots（镜头）

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `GET` | `/scenes/{sid}/shots` | 列出场景中的镜头 |
| `POST` | `/scenes/{sid}/shots` | 创建镜头 |
| `GET` | `/shots/{id}` | 获取完整镜头详情 |
| `PATCH` | `/shots/{id}` | 更新镜头（部分） |
| `DELETE` | `/shots/{id}` | 删除镜头 |
| `POST` | `/shots/{id}/generate-prompt` | 从结构化字段生成提示词 |
| `POST` | `/shots/{id}/prompts/{promptId}/approve` | 视频生成前的强制批准 |
| `POST` | `/shots/{id}/generate` | 触发视频生成 |
| `POST` | `/shots/{id}/approve` | 批准镜头 |
| `POST` | `/shots/{id}/unfreeze` | 解冻已批准镜头 |
| `POST` | `/shots/{id}/duplicate` | 复制镜头 |
| `POST` | `/shots/{id}/reorder` | 重排镜头 |

### Assets（资产）

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `GET` | `/projects/{pid}/assets` | 列出资产（可按类型过滤） |
| `POST` | `/projects/{pid}/assets` | 创建资产 |
| `GET` | `/assets/{id}` | 获取资产详情 |
| `PATCH` | `/assets/{id}` | 更新资产 |
| `DELETE` | `/assets/{id}` | 删除资产 |
| `GET` | `/assets/{id}/references` | 列出引用该资产的实体 |
| `POST` | `/assets/media/upload` | 上传媒体文件 |

### Workflows（工作流）

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `POST` | `/workflows/story-to-video` | 启动完整故事到视频工作流 |
| `GET` | `/workflows/{runId}` | 获取工作流状态 |
| `POST` | `/workflows/{runId}/review` | 提交审阅决策 |
| `POST` | `/workflows/{runId}/cancel` | 取消工作流 |
| `GET` | `/workflows/{runId}/events` | 实时进度的 SSE 流 |

### Entity State, Timeline, and Tracks（拟议）

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `GET` | `/projects/{pid}/entities/{type}/{id}/revisions` | 列出不可变 Entity 修订 |
| `GET` | `/projects/{pid}/changes` | 游标分页的已提交 ChangeEvent |
| `GET` | `/projects/{pid}/timeline` | 以选定视图查询唯一的 Project Timeline：`presentation`、`world_overlay`，或二者 |
| `GET` | `/projects/{pid}/timeline/tracks` | 列出语义 Scene/Character/Event/Shot 等 Track |
| `POST` | `/projects/{pid}/timeline/items` | 将 Entity State 放置到 Presentation Time，可选绑定 World Time |
| `PATCH` | `/projects/{pid}/timeline/items/{itemId}` | 移动或重标注显式 TimelineItem |

这些端点是设计契约，尚非当前可用路由。写操作携带 `expected_revision` 与幂等键；修订冲突返回 HTTP 409。

**One Timeline, several views.（一条时间线，多种视图。）** 一个 Project 恰好有一个 `ProjectTimeline`，以 Presentation Time 作为稳定主轴存储，可选的 World Time 绑定作为跟随层（ADR-0007）。`view` 参数选择该唯一存储的投影 — 面向产品的 *World View（世界视图）* 与 *Production View（制作视图）*（[UI-Information-Architecture.md](../product/UI-Information-Architecture.md) §5.2）是两种此类投影，而不是两条持久化时间线。工作流运行与生成任务是执行对象，永不出现在这条 Timeline 上；它们仅通过产出溯源与之关联。

### Generation（生成）

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `GET` | `/shots/{id}/outputs` | 列出镜头的产出 |
| `POST` | `/shots/{id}/outputs/{oid}/activate` | 设置激活的产出版本 |

### Provider Credentials and Usage（提供商凭证与用量）

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `PUT` | `/provider-credentials/{provider}` | 存储或替换已认证用户的 BYOK 凭证 |
| `DELETE` | `/provider-credentials/{provider}` | 移除已存储凭证 |
| `GET` | `/projects/{pid}/provider-usage` | 列出按项目、按提供商的用量、成本与已配置限额 |
| `PUT` | `/projects/{pid}/provider-limits/{provider}` | 设置按项目、按提供商的成本与用量限额 |

## 4.3 通用模式

### Pagination（分页）
```
GET /projects/{pid}/assets?type=character&limit=20&cursor=abc123
```
响应包含用于游标分页的 `next_cursor`。

### Partial Updates（部分更新）

所有 `PATCH` 端点接受 JSON Merge Patch（RFC 7396）：
```json
PATCH /shots/shot_123
{
  "camera": {
    "shot_type": "close_up"
  }
}
```
仅更新指定字段。`null` 值将字段重置为从父级继承。

### Error Response（错误响应）
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Shot validation failed",
    "details": [
      {
        "rule": "character_refs_valid",
        "severity": "error",
        "field": "characters[0].character_id",
        "message": "Character 'char_missing' not found in project"
      }
    ]
  }
}
```
---

# 5. 数据存储

## 5.1 存储职责

| 存储 | 用途 | 数据类型 |
|---------|---------|------------|
| **Primary Database（主数据库）** | 领域实体与关系 | Projects、Stories、Scenes、Shots、Assets、Workflows、Users |
| **Object Storage（对象存储）** | 二进制媒体文件 | 视频、图像、音频、3D 模型、文档 |
| **Job Queue（任务队列）** | 异步任务管理 | 生成任务、工作流步骤、通知 |
| **Cache（缓存）** | 频繁访问、很少变更的数据 | 已解析 Asset 数据、提示词模板、模型能力 |

拟议的 State/Timeline 层在 PostgreSQL 中存储 `EntityRevision`、`ChangeEvent`、`ProjectTimeline`、`TimelineTrack` 与 `TimelineItem`。专用业务表仍是当前状态权威；修订是状态历史权威。Timeline 行需要 Presentation 放置，并可选择携带不透明的项目自定义 World Time 绑定。大型快照使用对象存储引用加规范哈希，而不是把二进制或提供商载荷复制进 PostgreSQL。

## 5.2 主数据库 — 实体关系总览
```
User 1──N Project
Project 1──N Story
Project 1──N Asset (Character, Location, Prop, Style, Knowledge, Media, Template)
Story 1──N Scene
Scene 1──N Shot
Shot 1──N Output
Shot N──M Character (via shot_characters join)
Scene N──M Character (via scene_characters join)
Shot N──1 Location (reference)
Shot N──1 Style (reference)
WorkflowRun 1──N WorkflowStep
Entity 1──N EntityRevision (logical reference; proposed)
Project 1──N ChangeEvent (proposed)
Project 1──1 ProjectTimeline (proposed)
ProjectTimeline 1──N TimelineTrack (proposed)
TimelineTrack 1──N TimelineItem (proposed)
TimelineItem N──1 EntityRevision (logical reference; proposed)
```

## 5.3 关键模式决策

### Inheritance Storage（继承存储）

继承字段在数据库中存为 `null`。解析在查询时沿层级向上行走完成。这避免数据重复，并确保父对象变更自动传播。
```sql
-- Example: resolving a Shot's aspect_ratio
-- If shot.style_aspect_ratio IS NULL, check scene
-- If scene.style_aspect_ratio IS NULL, check story  
-- If story.style_aspect_ratio IS NULL, use project default
```

### Soft Deletes（软删除）

所有实体支持软删除（`deleted_at` 时间戳）。硬删除需要显式确认，且仅在不存在活跃引用时允许。

### Audit Trail（审计轨迹）

当前实现会在 `audit_logs` 中记录选定的 Shot 与 Workflow 动作；覆盖并不完整，且该表不是事件存储。

拟议的 [Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md) 迁移会在与当前状态写入同一事务中引入仅追加的 `EntityRevision` 与 `ChangeEvent` 记录。迁移期间保留 `AuditLog`，可暂时双写，仅在查询、保留、权限与回填等价性验证通过后才退役。工作流尝试与队列进度仍留在专用表中。ChangeEvent 历史不是创作 Timeline：Timeline 首先导出 Presentation 顺序；除非可选的可变维度绑定另有说明，World Time 跟随其后。

---

# 6. 外部 AI 集成

## 6.1 适配器模式

所有外部 AI 模型交互隔离在按能力划分的适配器之后。领域与工作流代码可以引用提供商与模型标识符，但绝不引用提供商 SDK 或提供商特定的请求形状。

| 能力 | 支持的提供商 | 首批集成集合 |
|------------|---------------------|-----------------------|
| 文本 | DeepSeek、Qwen、GPT、Claude | **DeepSeek** |
| 图像 | SiliconFlow（Qwen-Image / Edit、Z-Image、FLUX、Kolors，…） | **SiliconFlow** |
| 视频 | SiliconFlow（Wan2.2 T2V / I2V）、Kling、Vidu、Veo | **SiliconFlow Wan2.2** |
| 音频 | SiliconFlow（CosyVoice / Moss-TTSD，…） | **SiliconFlow** |

### 6.1.1 SiliconFlow 模态模型槽位（已实现）

运行时目录（`GET/PUT /providers`）与环境默认值为每条模态路径暴露**独立**的模型 ID：

| 槽位 | 配置键 | 典型默认 | 选择规则 |
|------|------------|-----------------|----------------|
| T2I | `SILICONFLOW_IMAGE_MODEL` / `models.image` | `Qwen/Qwen-Image` | 无可使用的参考图 |
| I2I | `SILICONFLOW_IMAGE_I2I_MODEL` / `models.image_i2i` | `Qwen/Qwen-Image-Edit` | 存在 http(s) 参考；提供商错误时**回退到 T2I** |
| T2V | `SILICONFLOW_VIDEO_MODEL` / `models.video` | `Wan-AI/Wan2.2-T2V-A14B` | 无 http(s) 参考帧 |
| I2V | `SILICONFLOW_VIDEO_I2V_MODEL` / `models.video_i2v` | `Wan-AI/Wan2.2-I2V-A14B` | 存在 http(s) 参考帧 |

Qwen T2I 优先 `image_size` `1328x1328`；Edit 使用 `1024x1024`。角色主设定表（`sheet_turnaround`）始终调用 T2I。参见 [Asset-Model.md](../domain/Asset-Model.md) 与 `.env.example`。
```typescript
interface ImageGenerationAdapter {
  readonly provider: string;
  readonly supportedModels: ModelInfo[];
  /** Capability bit (ports/adapters only — never a domain/provider field). */
  readonly supportsReferenceImages: boolean;

  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
  getStatus(jobId: string): Promise<JobStatus>;
  cancel(jobId: string): Promise<void>;
  getCapabilities(): ImageModelCapabilities;
}

interface ImageGenerationRequest {
  request_id: string;
  model: string;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  /** Desired candidate count 1–4 (default 1). Callers may loop; adapters may ignore (V0.4 W5). */
  count?: number;
  /** Optional labeled references for identity/style conditioning (V0.4 W1). */
  reference_images?: Array<{
    media_id: string;
    label: string;
    role: 'character' | 'location' | 'style';
    url?: string;
  }>;
}

interface ImageModelCapabilities {
  supports_reference_images: boolean;
}
```

当提供了参考但所选模型无法据此条件生成时，适配器不得静默失败：它们在不注入的情况下生成，并设置 `metadata.reference_injection = 'skipped_unsupported'`。成功注入则设为 `applied`，调用方在 Media 的 `generation_metadata` 上持久化 `reference_media_ids[]`。I2I 路径失败并在 T2I 重试后可设置 `skipped_i2i_error`。

## 6.2 提供商抽象
```
Generation Context
       │
       ▼
┌──────────────────┐
│  Adapter Registry │
│  (provider →      │
│   adapter)        │
└──────┬───────────┘
       │
       ├──▶ LLM: DeepSeekAdapter (first), QwenAdapter, GPTAdapter, ClaudeAdapter
       ├──▶ Image: SiliconFlowImageAdapter (first; T2I/I2I model slots), FluxAdapter, …
       └──▶ Video: SiliconFlowVideoAdapter (first; T2V/I2V slots), KlingAdapter, ViduAdapter, VeoAdapter
```

适配器注册表将能力加提供商映射到适配器实例。新增提供商意味着实现相应适配器，无需改动领域逻辑。

## 6.3 LLM 集成

同样，LLM 交互（用于 Agent）经由 LLM 适配器：
```typescript
interface LLMAdapter {
  readonly provider: string;
  readonly supportedModels: ModelInfo[];

  complete(request: CompletionRequest): Promise<CompletionResult>;
  completeStructured<T>(request: StructuredRequest): Promise<T>;
}
```

Agent 配置指定使用的 LLM 模型。LLM 适配器处理提供商特定格式（系统提示词、工具使用、结构化输出）。首批集成集合使用 DeepSeek；Qwen、GPT 与 Claude 仍可作为可互换配置。

## 6.4 图像生成任务流
```
1. After Scene review, Visual Prep produces visual requirements.
2. The user confirms which Character/Location visuals to reuse or generate.
3. Generation Context creates an ImageGenerationJob (status: queued).
4. A worker combines Asset description, Scene variant, and style, then calls ImageGenerationAdapter.generate().
5. If asynchronous, a webhook or polling monitors completion.
6. On completion, the worker creates generated Media with provider, model, prompt, and parameter metadata.
7. The user approves a candidate and binds it as the Asset key image or Scene variant.
8. The workflow may start Shot decomposition only after every required visual is approved.
```

首批集成集合使用 `TongyiWanxiangAdapter`。提供商认证、参数与回调格式保留在适配器内部，不得出现在领域实体中。

## 6.5 视频生成任务流
```
1. User/Agent requests video generation for a Shot after mandatory prompt approval.
2. Validate that the Shot's Scene has all required visual assets approved; otherwise return `visual_assets_approved`.
3. Create a VideoGenerationJob and Output (status: queued), snapshotting the prompt and Media IDs.
4. A worker resolves inheritance and asset references, then calls VideoGenerationAdapter.generate().
5. If async: webhook or polling monitors job completion.
6. On completion, update the same Output record; transition the Shot to `review` only when the Output is `completed`.
7. Send an SSE event to the frontend.
```

---

# 7. 前端架构

## 7.1 模块映射
```
┌─────────────────────────────────────────────┐
│                App Shell                     │
│  ┌─────────────────────────────────────────┐│
│  │         Navigation + Project Switcher   ││
│  └─────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────┐│
│  │                                         ││
│  │         Active Module Area              ││
│  │                                         ││
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ ││
│  │  │ Project  │ │ Story    │ │ Asset   │ ││
│  │  │ Dashboard│ │ Editor   │ │ Browser │ ││
│  │  └──────────┘ └──────────┘ └─────────┘ ││
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ ││
│  │  │ Scene    │ │ Shot     │ │ Review  │ ││
│  │  │ Canvas   │ │ Editor   │ │ Panel   │ ││
│  │  └──────────┘ └──────────┘ └─────────┘ ││
│  │                                         ││
│  └─────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────┐│
│  │         Status Bar + Generation Queue   ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

## 7.2 核心模块

### Project Dashboard（项目面板）
- 带缩略图的项目列表
- 创建/删除/归档项目
- 项目级统计（故事数、资产数、生成成本）

### Story Editor（故事编辑器）
- 有序的 Story/Scene 结构视图；当前列表/重排界面是未来 Timeline 的 Presentation 顺序输入，而不是完整的 Entity State 工作区
- 幕/场景组织，支持拖放重排
- 故事级 AI 动作（生成、扩展、改写）

### AI Creative IDE（拟议）
- 左侧 Project Explorer：层级与世界 Entity
- 中央以 Presentation 为主的 Timeline，可选 World Time 叠加与语义 Track
- 下方 Director Console / Agent Chat
- 右侧 Entity Inspector：当前 State 与修订历史
- Fast / Balanced / Deep 使用执行策略，不改变权限或门禁
- 完整范围与节奏：[AI Creative IDE RFC](../architecture/rfc/AI-Creative-IDE-RFC.md) 与 [Agent Effort Control RFC](../architecture/rfc/Agent-Effort-Control-RFC.md)

### Scene Canvas（场景画布）
- 按序列显示镜头缩略图的可视化场景布局
- 场景上下文面板（地点、时间、情绪、角色）
- 镜头重排与快速预览

### Shot Editor（镜头编辑器，复杂度最高）
- 匹配 Shot-Specification.md schema 的完整 Shot 表单
- 分区：Camera、Composition、Lighting、Color、Characters、Action、Dialogue、Audio
- 实时提示词预览面板（显示构造出的提示词）
- 产出画廊（生成视频缩略图）
- 版本历史侧栏
- AI 辅助按钮：「建议镜头」「生成提示词」「描述动作」

### Asset Browser（资产浏览器）
- 所有 Asset 类型的网格/列表视图
- 搜索、按类型过滤、基于标签过滤
- 带编辑能力的资产详情面板
- 引用图：「用于 3 个 Scene、12 个 Shot」

### Review Panel（审阅面板）
- 并排对比：Shot 规格 vs. 生成视频
- 展示 Review Agent 反馈
- 批准/拒绝/重试动作
- 多镜头批量审阅模式

### Generation Queue（生成队列）
- 活跃生成任务的实时进度
- 队列位置、预计完成时间
- 取消单个任务

## 7.3 状态管理
```
┌────────────────────────────────────────────┐
│              Client State Store             │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Project  │ │ Editor   │ │ Generation  │ │
│  │ State    │ │ State    │ │ State       │ │
│  │          │ │          │ │             │ │
│  │ • list   │ │ • current│ │ • queue     │ │
│  │ • active │ │   story  │ │ • progress  │ │
│  │ • assets │ │ • current│ │ • history   │ │
│  │          │ │   scene  │ │             │ │
│  │          │ │ • current│ │             │ │
│  │          │ │   shot   │ │             │ │
│  │          │ │ • dirty  │ │             │ │
│  │          │ │   fields │ │             │ │
│  └──────────┘ └──────────┘ └────────────┘ │
│                                             │
│  SSE Connection for real-time updates       │
└────────────────────────────────────────────┘
```

## 7.4 实时更新

前端为以下事项维持持久 SSE 连接：

- 生成任务进度
- 工作流步骤转换
- 资产修改通知（编辑 Shared 上下文时）
- 协作编辑信号（未来）

---

# 8. 后台处理

## 8.1 Worker 架构
```
┌──────────────────────────────────────────────┐
│                Job Queue                      │
│  ┌─────────┐ ┌─────────┐ ┌───────────────┐  │
│  │Generate │ │Generate │ │Prompt/Workflow│  │
│  │Video    │ │Image    │ │Orchestration  │  │
│  └────┬────┘ └────┬────┘ └───────┬───────┘  │
└───────┼────────────┼──────────────┼──────────┘
        │            │              │
        ▼            ▼              ▼
┌──────────────────────────────────────────────┐
│              Worker Pool                      │
│                                               │
│  Worker 1: picks GenerateVideo jobs           │
│  Worker 2: picks GenerateImage jobs           │
│  Worker 3: picks PromptConstruct/Workflow jobs│
│  Worker N: generic worker                     │
└──────────────────────────────────────────────┘
```

## 8.2 任务类型

| 任务类型 | 优先级 | 最大重试 | 超时 |
|----------|----------|-------------|---------|
| `prompt_construct` | 高 | 3 | 30s |
| `image_generate` | 普通 | 2 | 300s |
| `video_generate` | 普通 | 2 | 600s |
| `workflow_step` | 高 | 3 | 300s |
| `review_analysis` | 低 | 1 | 60s |
| `thumbnail_generate` | 低 | 3 | 30s |
| `media_process` | 低 | 2 | 120s |

## 8.3 幂等性与提供商回调

每个图像或视频生成任务必须有内部 `idempotency_key` 与提供商的 `provider_job_id`。Worker 重试、webhook 重放与工作流恢复只能更新已有的 Job 与 Media/Output 记录；绝不可创建重复的 Media 或 Output 记录。

所有异步提供商回调经 `POST /internal/providers/{provider}/callbacks` 进入。该端点验证提供商签名与时间戳，按 `provider_job_id` 幂等处理回调，并保留原始回调用于审计。提供商 API 密钥与回调密钥绝不可包含在 Media `generation_metadata` 中。

---

# 9. 安全考虑

| 关注点 | 做法 |
|---------|----------|
| 认证 | 基于 JWT，由认证服务签发 |
| 授权 | 资源级：用户必须是项目成员 |
| API 限流 | 按用户、按端点限流；生成端点更严格 |
| 文件上传安全 | MIME 类型校验、病毒扫描、大小限制 |
| AI API 密钥管理 | BYOK 凭证静态加密，作用域为已认证用户加提供商，因而可在该用户的项目间复用；凭证从不返回给前端，也不由前端直接使用 |
| 提供商成本控制 | 按 Project 与提供商记录消耗；在入队调用前强制执行已配置的按提供商用量与成本限额 |
| 提供商回调 | 验证签名与时间戳；按提供商 job ID 幂等处理并拒绝重放 |
| 生成内容 | 存于私有桶；通过签名 URL 访问 |

---

# 10. 监控与可观测性

| 信号 | 埋点 |
|--------|-----------------|
| API 延迟 | 按端点 p50/p95/p99 |
| 生成任务时长 | 按模型、按时长直方图 |
| Agent token 用量 | 按 agent、按工作流运行计数 |
| 错误率 | 按上下文、按操作 |
| 队列深度 | 按任务类型仪表 |
| SSE 连接数 | 活跃连接仪表 |
| 存储用量 | 按项目、按资产类型计数 |
