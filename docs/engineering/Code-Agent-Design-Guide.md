# 代码 Agent 设计指南

> Zivith 面向代码 Agent 的设计规范
>
> Version: 1.0
>
> Status: Draft（草案）
>
> Audience: 实现 Zivith 功能的 AI 代码 Agent
>
> Related: 全部项目文档

---

# 1. 目的

本文档是负责实现 Zivith 的 AI 代码 Agent 的入口。它确立约定、引用权威设计文档，并提供实现护栏。

阅读本文档的代码 Agent 应能理解完整系统、定位任意任务的相关规格，并产出与代码库其余部分一致的代码。

---

# 2. 文档地图

代码 Agent 在实现前应按以下顺序阅读文档：

| 优先级 | 文档 | 目的 |
|----------|----------|---------|
| 1 | [`product/Design-Philosophy.md`](../product/Design-Philosophy.md) | 理解产品愿景与设计原则 |
| 2 | [`domain/Core-Domain-Model.md`](../domain/Core-Domain-Model.md) | 理解创作层级与所有权模型 |
| 3 | [`domain/Shot-Specification.md`](../domain/Shot-Specification.md) | 理解核心领域对象 schema |
| 4 | [`domain/Asset-Model.md`](../domain/Asset-Model.md) | 理解可复用资源分类 |
| 5 | [`domain/AI-Agent-Collaboration.md`](../domain/AI-Agent-Collaboration.md) | 理解 Agent 架构与工作流 |
| 6 | [`architecture/architecture-principles.md`](../architecture/architecture-principles.md) | 理解约束一切决策的架构宪章 |
| 7 | [`engineering/Technical-Architecture.md`](Technical-Architecture.md) | 理解系统边界与数据流 |
| 8 | [`planning/Implementation-Plan.md`](../planning/Implementation-Plan.md) | 理解分阶段路线图与各阶段范围 |
| 9 | `engineering/Code-Agent-Design-Guide.md` | （本文档）实现约定 |

具有架构重要性的变更还必须遵循
`architecture/adr-guide.md` 与 `architecture/rfc-guide.md`：不可逆决策记录为 ADR，跨上下文或带迁移的变更在实现前需要 RFC。

---

# 3. 语言与本地化约定

## 3.1 分层语言规则

| 层 | 语言 | 规则 |
|-------|----------|------|
| UI 标签与文案 | Chinese（中文） | 所有面向用户的 UI 文本必须为中文 |
| 源代码注释 | English | 注释与 JSDoc/TSDoc 使用英文 |
| 变量与函数名 | English | 所有标识符使用英文（例如 `getSceneShots`，而非 `获取场景镜头`） |
| 数据库字段值 | 源语言 | 保留创作者原文（中文故事文本保持中文） |
| Git 提交信息 | English | Conventional Commits 格式，英文 |
| API 响应消息 | Chinese | 面向用户的错误消息使用中文 |
| API 字段名 | English（snake_case） | `character_id`，而非 `角色ID` |

## 3.2 AI Agent 提示词语言策略
```
Domestic LLM (Qwen, DeepSeek, etc.)
  └─ System prompts: Chinese
  └─ User prompts: Chinese (original story language)
  └─ Structured output: Chinese content, English field names

Overseas LLM (Claude, GPT, etc.)
  └─ System prompts: English
  └─ User prompts: English (translate if source is Chinese)
  └─ Structured output: English content, English field names

Video Generation Model
  └─ Kling (domestic): Chinese prompt
  └─ Vidu/Veo (international): English prompt  
  └─ The Prompt Agent must detect model provider and translate accordingly
```

**权威来源（V0.4 W6）：** 版本化文件位于 `apps/api/prompts/<agent>/system.{zh,en}.md`。加载器填充 `{placeholder}`（始终为 P8 包含空的 `{knowledge_context}`）。API 启动时运行占位符 lint。运行时当前对 Story/Scene/VisualTrait 加载 `en`，以保持 mock E2E 标记（`STORY_AGENT` / `SCENE_AGENT` / `VISUAL_TRAIT_AGENT`）行为等价；稍后按提供商依据上表切换语言区域。

## 3.3 提示词翻译流程
```
1. Prompt Agent resolves Shot data (may contain Chinese text)
2. Prompt Agent detects target model language requirement
3. If translation needed: call LLM to translate Shot fields to English
4. Construct final prompt in target language
5. Store both the constructed prompt and its source language
```

---

# 4. 编码标准

## 4.1 通用原则

| 原则 | 规则 |
|-----------|------|
| Domain-Driven（领域驱动） | 代码结构镜像 Technical-Architecture.md 中的限界上下文 |
| Type-First（类型优先） | 所有领域对象有与规格文档匹配的显式类型定义 |
| Immutable by Default（默认不可变） | 领域对象不可变；变更创建新实例 |
| Explicit Over Implicit（显式优于隐式） | 无魔法值；所有枚举与常量在中心位置定义 |
| Fail Fast（快速失败） | 在系统边界校验；无效状态应无法表示 |

## 4.2 命名约定

### Domain Types（领域类型）

领域类型必须与规格文档完全一致：
```
Project, Story, Scene, Shot, Output, VisualAssetRequirement
Character, Location, Prop, Style, Media, Knowledge, PromptTemplate
WorkflowRun, WorkflowStep
ImageGenerationJob, VideoGenerationJob, GenerationResult
```

### ID Types（ID 类型）

所有实体 ID 使用 branded types：
```typescript
// Correct: branded types prevent ID confusion
type ProjectId = string & { readonly __brand: 'ProjectId' };
type StoryId = string & { readonly __brand: 'StoryId' };
type SceneId = string & { readonly __brand: 'SceneId' };
type ShotId = string & { readonly __brand: 'ShotId' };
type CharacterId = string & { readonly __brand: 'CharacterId' };
type LocationId = string & { readonly __brand: 'LocationId' };
type OutputId = string & { readonly __brand: 'OutputId' };
type MediaId = string & { readonly __brand: 'MediaId' };
type VisualAssetRequirementId = string & { readonly __brand: 'VisualAssetRequirementId' };
type ImageGenerationJobId = string & { readonly __brand: 'ImageGenerationJobId' };
type VideoGenerationJobId = string & { readonly __brand: 'VideoGenerationJobId' };
type AssetId = string & { readonly __brand: 'AssetId' };
type WorkflowRunId = string & { readonly __brand: 'WorkflowRunId' };

// Incorrect: plain strings allow passing ShotId where SceneId is expected
type ShotId = string;  // ❌
```

### Enum Values（枚举值）

枚举值使用 `snake_case`：
```typescript
// Correct
type ShotState = 'draft' | 'prompting' | 'generating' | 'review' | 'approved';
type ShotType = 'close_up' | 'medium_shot' | 'wide_shot' | 'extreme_close_up';

// Incorrect
type ShotState = 'Draft' | 'Prompting'; // ❌
type ShotType = 'closeUp' | 'mediumShot'; // ❌
```

### File Organization（文件组织）
```
src/
├── contexts/                    # One directory per bounded context
│   ├── project/
│   │   ├── domain/              # Types, entities, value objects
│   │   ├── application/         # Use cases, services
│   │   ├── infrastructure/      # Database, external integrations
│   │   └── api/                 # HTTP handlers, DTOs
│   ├── story/
│   ├── asset/
│   ├── agent/
│   ├── prompt/
│   ├── generation/
│   ├── media/
│   └── shared/                  # Cross-cutting types and utilities
├── infrastructure/              # Shared infrastructure
│   ├── database/
│   ├── queue/
│   ├── storage/
│   └── llm/
└── api/                         # API gateway, middleware
```

---

# 5. 实现领域对象

## 5.1 类型定义

规格文档中定义的每个领域对象都必须有对应的 TypeScript 类型。使用规格中的精确字段名。不要缩写或重命名。
```typescript
// From Shot-Specification.md §3.2.1
interface ShotCamera {
  shot_type?: 'close_up' | 'medium_shot' | 'wide_shot' | 'extreme_close_up'
    | 'full_shot' | 'over_the_shoulder' | 'pov' | 'aerial' | 'dutch_angle';
  angle?: 'eye_level' | 'low_angle' | 'high_angle' | 'birds_eye' | 'worms_eye';
  movement?: 'static' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down'
    | 'dolly_in' | 'dolly_out' | 'tracking' | 'handheld';
  focal_length?: string;
  depth_of_field?: 'shallow' | 'deep';
  custom?: string;
}
```

## 5.2 继承解析

继承引擎是最关键且最易出错的组件之一。实现必须严格匹配以下规则：

1. 沿层级向上：Shot → Scene → Story → Project
2. 对 Shot 中为 `null` 或 `undefined` 的每个字段，检查父级
3. 取第一个非空值
4. 已批准（approved）的 Shot 排除在继承更新之外
```typescript
function resolveField<T>(
  shot: Shot,
  scene: Scene,
  story: Story,
  project: Project,
  fieldPath: string[]
): T | undefined {
  if (shot.state === 'approved') {
    return getNestedValue(shot, fieldPath);
  }
  return (
    getNestedValue(shot, fieldPath) ??
    getNestedValue(scene, fieldPath) ??
    getNestedValue(story, fieldPath) ??
    getNestedValue(project, fieldPath)
  );
}
```

**必需测试用例：**

- 字段仅在 Project 级设置 → 所有 Shot 继承
- 字段在 Scene 级设置 → 该 Scene 内 Shot 继承；其他 Scene 的 Shot 从 Project 继承
- 字段在 Shot 级设置 → Shot 使用本地值；父级变更不影响
- 处于 `approved` 状态的 Shot → 父级变更不影响
- Shot 解冻 → 对非本地字段立即继承当前父级值

## 5.3 状态机

Shot 状态转换必须实现为严格状态机：
```typescript
const SHOT_TRANSITIONS: Record<ShotState, ShotState[]> = {
  draft: ['prompting'],
  prompting: ['generating', 'draft'],
  generating: ['review', 'draft'],
  review: ['approved', 'draft'],   // reject or edit returns to 'draft'
  approved: [],                    // only UnfreezeShot may leave this state
};

function transitionShot(shot: Shot, target: ShotState): Shot {
  if (!SHOT_TRANSITIONS[shot.state].includes(target)) {
    throw new InvalidStateTransitionError(shot.id, shot.state, target);
  }
  return { ...shot, state: target };
}

function unfreezeShot(shot: Shot): Shot {
  if (shot.state !== 'approved') {
    throw new InvalidStateTransitionError(shot.id, shot.state, 'draft');
  }
  return { ...shot, state: 'draft' };
}
```

`transitionShot` 绝不可允许 `approved` → `draft`。专用的 `unfreezeShot` 用例是唯一可这样做的路径。不要引入单独的 `rejected` Shot 状态，也不要从 `review` 转到 `rejected`。

## 5.4 视觉资产需求与生成任务

将 `VisualAssetRequirement` 实现为持久化的 Scene 实体，使用 `Asset-Model.md` 中的精确字段与状态值。其 `asset_type` 限于 `character` 与 `location`；首发版本中 Prop 不是视觉需求。

使用独立的 `ImageGenerationJob` 与 `VideoGenerationJob` 类型及其对应 branded ID。在需要这些领域特定任务之处，不要使用通用字符串或通用 `GenerationJob`。

`GenerateVideo` 必须校验：该 Shot 所属 Scene 的每个必需 Visual Asset Requirement 均为 `approved` 且具有 `approved_media_id`。先解析该 Scene 级已批准绑定，再回退到 Asset 的项目级主图。`voice_only` 与 `implied` 角色不产生角色需求。

当 Scene 变更时，将其受影响的需求返回 `pending`。已批准 Shot 与既有 Output 必须保留其已解析上下文的不可变快照，包括所选视觉 Media ID。保持 Output 提供商状态与 Shot 生命周期同步：完成的 Output 将 Shot 移至 `review`；失败的 Output 仅在没有仍在运行的任务且不存在已完成 Output 时，才将 Shot 返回 `draft`。

---

# 6. API 实现

## 6.1 端点实现模式
```typescript
// 1. Define route
// 2. Validate input
// 3. Authorize (user must be project member)
// 4. Execute use case
// 5. Return DTO

// Example: PATCH /shots/{id}
async function updateShot(req: Request, res: Response) {
  const shotId = req.params.id as ShotId;
  const patch = req.body as Partial<Shot>;

  // Validation
  const errors = validateShotPatch(patch);
  if (errors.length > 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: errors } });
  }

  // Authorization
  const shot = await shotRepository.findById(shotId);
  if (!shot) return res.status(404);
  await authorize(req.userId, shot.projectId, 'write');

  // Execute
  const updated = await updateShotUseCase.execute(shotId, patch);

  // Return
  return res.status(200).json(toShotDTO(updated));
}
```

## 6.2 DTO 模式

始终将领域对象与 API DTO 分离：
```typescript
// Domain object (internal)
interface Shot {
  id: ShotId;
  sceneId: SceneId;
  projectId: ProjectId;
  // ... all fields
}

// API DTO (external)
interface ShotDTO {
  id: string;
  scene_id: string;
  order: number;
  label: string | null;
  state: string;
  // Resolved values (inheritance already applied)
  camera: ResolvedCameraDTO;
  characters: ResolvedCharacterDTO[];
  // ...
}

function toShotDTO(shot: Shot, scene: Scene, story: Story, project: Project): ShotDTO {
  // Resolve inheritance
  // Resolve asset references to display names
  // Return snake_case keys
}
```

---

# 7. 测试要求

## 7.1 测试类别

| 类别 | 范围 | 示例 |
|----------|-------|---------|
| Unit: Domain | 隔离的领域逻辑 | 继承解析、状态机转换 |
| Unit: Use Cases | 带 mock 依赖的应用服务 | 带 mock 仓储的 `updateShotUseCase` |
| Integration: API | 带测试数据库的 HTTP 端点 | PATCH /shots/{id} 返回正确响应 |
| Integration: Agent | 带 mock LLM 的 Agent 执行 | Story Agent 产出有效 Story 结构 |
| E2E: Workflow | 从故事到视频的完整工作流 | 用户可完成故事到视频流程 |

## 7.2 关键测试场景

合并任何 PR 前，这些场景必须有测试覆盖：

1. **Inheritance（继承）**：全部 4 层字段继承、覆盖行为、已批准 Shot 隔离
2. **State Machine（状态机）**：所有合法转换成功，所有非法转换抛错
3. **Visual Asset Requirements（视觉资产需求）**：必需绑定门禁视频生成；Scene 已批准绑定优先于项目主图；voice-only 与 implied 角色被排除
4. **Asset Resolution（资产解析）**：Character/Location 引用在覆盖下正确解析，包括先解析 base-Character 再本地合并
5. **Output Synchronization（产出同步）**：完成与失败的 Output 转换遵循指定的 Shot 同步规则；Output 快照保持不可变
6. **Parallel Generation（并行生成）**：多个并发生成任务不冲突
7. **Workflow Recovery（工作流恢复）**：Orchestrator 崩溃与重启正确保留状态
8. **Authorization（授权）**：非成员无法访问项目资源

---

# 8. 错误处理

## 8.1 错误分类
```typescript
// Domain errors
class InvalidStateTransitionError extends DomainError {}
class AssetNotFoundError extends DomainError {}
class ValidationError extends DomainError {}

// Application errors
class GenerationFailedError extends ApplicationError {}
class WorkflowTimeoutError extends ApplicationError {}

// Infrastructure errors
class StorageError extends InfrastructureError {}
class QueueConnectionError extends InfrastructureError {}
```

## 8.2 错误传播
```
Domain layer: throws typed domain errors
     ↓
Application layer: catches, logs, wraps in application context
     ↓
API layer: maps to HTTP status codes + error response format
     ↓
Frontend: displays user-friendly message, logs to monitoring
```

---

# 9. 性能指南

| 指南 | 阈值 |
|-----------|-----------|
| API 响应时间（CRUD） | < 200ms p95 |
| Shot 解析（继承 + 资产） | < 100ms |
| 生成任务入队 | < 50ms |
| SSE 事件投递延迟 | < 500ms |
| 每次 Shot 解析的数据库查询 | ≤ 5 |
| 带过滤的资产列表 | 最多 1000 个资产时 < 300ms |

---

# 10. 安全检查清单

每个端点实现：

- [ ] 用户已认证
- [ ] 用户对目标资源已授权（项目成员）
- [ ] 输入已按 schema 校验（类型、长度、枚举值）
- [ ] 已防止 SQL 注入（参数化查询）
- [ ] 已应用限流（生成端点更严格）
- [ ] 敏感数据（API 密钥）从不在响应中返回
- [ ] 文件上传已校验（类型、大小、内容）

---

# 11. Mock 适配器实现（Phase 2）

Phase 2 期间，视频生成使用 Mock Adapter。每个实现必须与 Phase 3 的真实适配器兼容。
```typescript
// The Mock Adapter implements the same interface as real adapters
class MockGenerationAdapter implements VideoGenerationAdapter {
  readonly provider = 'mock';
  readonly supportedModels = [{ id: 'mock-v1', name: 'Mock (Placeholder)' }];

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    await sleep(2000 + Math.random() * 3000);
    return {
      jobId: `mock-${crypto.randomUUID()}`,
      status: 'completed',
      outputUrl: '/static/placeholder-video.mp4',
      thumbnailUrl: '/static/placeholder-thumbnail.png',
      durationSeconds: request.parameters.duration ?? 5,
      metadata: {
        model: 'mock-v1',
        modelVersion: '1.0.0',
        promptUsed: request.prompt.positive,
        generatedAt: new Date().toISOString(),
        isMock: true,
      },
    };
  }

  async getStatus(_jobId: string): Promise<JobStatus> {
    return { status: 'completed' };
  }

  async cancel(_jobId: string): Promise<void> {}

  getCapabilities(): ModelCapabilities {
    return {
      maxDuration: 120,
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
      supportsImageToVideo: true,
      supportsTextToVideo: true,
    };
  }
}
```

占位视频应以文本叠加显示 Shot 的结构化数据，以便用户验证从故事到「视频」的整条流水线可用。

# 12. PR 审阅检查清单

提交 PR 前，代码 Agent 应核实：

- [ ] 所有类型与规格文档完全匹配（字段名、枚举值）
- [ ] 使用 branded ID 类型（ID 不用普通字符串）
- [ ] 状态机转换已校验
- [ ] 视频生成前已校验必需的 Visual Asset Requirements
- [ ] 继承解析已测试
- [ ] API 响应使用 DTO 模式（snake_case 键）
- [ ] 错误响应遵循标准格式
- [ ] 关键测试场景已覆盖
- [ ] 生产代码中无 console.log
- [ ] 无硬编码凭证或 API 密钥
- [ ] 公共接口有文档注释

---

# 13. 开发策略：分层复用与开源借鉴

> 2026-08-05 采纳。目标：不重复造轮子，用成熟方案快速落地，同时保持模块独立、可替换。

## 13.1 模块独立分层

各模块按边界独立开发，层与层之间只通过稳定契约（`@zivith/domain` zod schema / Prisma 模型 / API DTO）通信，不跨层直接调用内部实现：

| 层 | 位置 | 职责 | 依赖规则 |
|----|------|------|----------|
| 领域契约 | `packages/domain` | 类型、schema、错误码 | 零依赖，被所有层引用 |
| 数据层 | `packages/database` | Prisma 模型、client | 只依赖 domain |
| API 应用 | `apps/api/src/contexts/*` | 按领域上下文聚合（world / world-builder / generation / workflow…） | 依赖 domain + database |
| API 路由 | `apps/api/src/routes/*` | 薄路由层：校验 → 调 context → 序列化 | 不写业务逻辑 |
| Web | `apps/web/components/*`、`app/**` | UI + 客户端数据层 | 只消费 API DTO |

落地要点：

- 新功能先落在 `contexts/` 下独立目录，不塞进既有 context
- 跨模块复用只允许通过 domain 契约或公开 service 接口，禁止复制实现
- 更换实现（如 LLM 提供商、存储适配器、队列）通过接口 + adapter 完成，业务层无感
- 模块可独立演进：一个模块的失败/回滚不影响其他模块（参见 Track J 绊线）

## 13.2 开源借鉴优先，从零重写兜底

**原则：开发新模块前，先调研 GitHub 上成熟的同类开源方案，提取思路与架构，再结合本项目约束落地——不是复制代码，而是借力。**

类比：写游戏不从引擎开始写，而是选成熟引擎（Unreal/Unity/Godot）。Zivith 同样优先复用成熟领域库与开源参考，把精力留给「AI 可理解的世界模型」这一差异化核心。

### 13.2.1 调研流程（每个新模块开工前）

1. **识别可借鉴领域**：本模块本质上是哪个成熟领域？例如——世界线时间线 ≈ 交互式时间线/甘特图（visx、vis-timeline、d3-scale）；实体 Explorer ≈ 树/目录面板（递归组件 + 拖拽库）；对话 Agent 流 ≈ Codex/Claude Code 的持续对话架构（SSE 流式、工具调用围栏）；提案确认围栏 ≈ 代码审阅/补丁审批流
2. **GitHub 检索候选**：按「领域 + 技术栈」关键词找 star 高、维护活跃、文档全的仓库；优先官方维护与用了相同技术栈（React/Next.js/Fastify/Prisma）的
3. **提取思路而非复制**：研究其数据模型、状态管理、组件拆分、边界划分；产出「借鉴清单」：哪些抽象直接采用、哪些要裁剪、哪些不适合
4. **确认许可合规**：MIT/Apache-2.0 可直接参考思路或少量借鉴；GPL/AGPL 只借鉴思路、不引入代码；复制代码必须保留版权声明
5. **落地记录**：将借鉴来源与采纳点记入开发记录（Development-Log.md），便于追溯

### 13.2.2 借鉴清单（已识别候选，后续模块逐个落实）

| 模块 | 借鉴领域 | 候选参考 |
|------|----------|----------|
| 世界线视图（Track K / H4-H5） | 交互式时间线 / 甘特图 | visx、vis-timeline、d3-scale（非均匀刻度 + 轨道化） |
| 实体 Explorer（Track K 左栏） | 树状目录 / 递归导航 | 成熟 React tree 组件 + 现有 App Shell 导航模式 |
| Creator Chat 流式（Track J 后续） | Agent 持续对话 | Codex / Claude Code 的会话 + 提案/工具围栏交互模式 |
| 提案确认围栏（已完成） | 审阅/补丁审批流 | 现有 ProposalCard + apply 模式（本项目首创落地） |
| 视频生成管线 | 媒体生成任务编排 | 现有 WorkflowOrchestrator + BullMQ（已完成，不重写） |

### 13.2.3 禁止事项

- 禁止把调研时间花在已有轮子上：monorepo 内已有能力（orchestrator、provider registry、usage 记录）一律复用
- 禁止直接 copy-paste 大型第三方组件树而不理解其状态流
- 禁止引入新的重型依赖来完成本可基于现有库组合的功能（引入前先问：现有依赖能否做到？）
- 禁止跳过许可检查引入开源代码