# Core Domain Model

> Zivith 核心领域模型
>
> Version: 1.2
>
> Status: Active — synced 2026-08-16（WorldEvent / Relationship 已入契约，ADR-0011 / ADR-0012；世界观 Json 与世界线 v1 已落地）
>
> Last Updated: 2026-08-16
>
> Related Documents:
>
> - [Product-Constitution.md](../product/Product-Constitution.md)（产品宪法；用户说的「世界」= `Project`）
> - [Product-Positioning.md](../product/Product-Positioning.md)
> - [Design-Philosophy.md](../product/Design-Philosophy.md)
> - [Shot-Specification.md](Shot-Specification.md)
> - [Asset-Model.md](Asset-Model.md)
> - [AI-Agent-Collaboration.md](AI-Agent-Collaboration.md)
> - [Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md)
> - [ADR-0007](../architecture/adr/0007-preserve-current-state-with-immutable-creative-history.md)
> - [ADR-0009](../architecture/adr/0009-skill-is-a-capability-layer-not-a-domain-entity.md)
> - [IP World Model Repositioning RFC](../architecture/rfc/IP-World-Model-Repositioning-RFC.md)

---

# 1. 目的

本文档定义 Zivith 的核心领域模型。

它不描述数据库、API 或实现细节。

相反，它定义根本的创作对象、它们的职责、所有权关系与生命周期。

每一个后端服务、前端模块、AI 工作流与数据库 schema 都应从本领域模型推导而来。

---

# 2. 设计目标

领域模型围绕五条原则设计。

## 持久创造力

创作资产应超越单次生成而持续存在。

生成结果是临时的。

创作知识是永久的。

---

## 清晰所有权

每个对象恰好有一个所有者。

所有权决定生命周期、权限与持久化。

---

## 引用而非复制

对象应尽可能引用可复用资源。

避免复制数据。

优先继承与覆盖。

---

## AI 原生

每个领域对象都应既能被人类理解，也能被 AI Agent 理解。

对象为结构化推理、编辑与生成而设计。

---

## 渐进式编辑

每个 AI 生成的对象都应保持可编辑。

没有任何生成结果变成死胡同。

---

# 3. 世界层

领域分为两层。**世界层**描述创作宇宙中存在什么、处于何种状态。**表达层**——第 4 节的创作层级——描述该世界如何被讲述与交付。产品宪法口中的「世界」就是这里的 `Project`，不另建 `World` 实体。

```

World Layer        Project (the IP)
                       │
                       ├── Character      (Asset)
                       ├── Location       (Asset)
                       ├── Object         (Asset, planned)
                       ├── WorldEvent     (ADR-0011)
                       ├── Organization   (planned)
                       └── Relationship   (ADR-0012)
                                │
                            Timeline

                       ↓  expressed through

Expression Layer   Story → Scene → Shot → Video

```

依赖方向是单向的：表达层依赖世界层，从不反过来。一部结束的 `Story` 不会带走世界。

---

## 术语契约

产品用语与领域契约使用同一套词汇。下表为权威来源；当产品文档与代码不一致时，以本表为准。

| Product wording | Domain contract | Rule |
|-----------------|-----------------|------|
| IP | **`Project`** | IP *就是* Project。任何层级都不存在单独的 IP 对象 |
| Character | **`Asset(type=character)`** + `EntityRevision` history | 阶段演化是 State 历史，绝不是重复角色 |
| A place in the world | **`Location`** (`Asset(type=location)`) | ⚠️ 不是 `Scene`。见下文 |
| A narrative unit | **`Scene`** | 地点、时间与情绪连续的叙事单元，拥有 `Shot` |
| Event in the story world | **`WorldEvent`**（已入契约，ADR-0011） | 不同于 `ChangeEvent`。见下文 |
| Relationship between entities | **`Relationship`** 独立可查询实体（ADR-0012） | 独立表、多态 EntityRef、directed/undirected；v1 无 `at=` 回溯 |
| World line / chronology | **`Timeline`** (Presentation-led, ADR-0007) | 无新概念；Presentation Time 是稳定轴 |
| Skill / conversion layer | *Not a domain object* | 见第 11 节 |

两处区分是承重的：

**`Location` 不是 `Scene`。** 一座山门无论是否被拍摄都存在——那是 `Location`，由 Project 拥有，可跨所有 Story 复用。发生在山门、拥有其 Shot 的一段连续叙事是 `Scene`，由 Story 拥有。把二者坍缩，世界就会依赖造访它的故事。

**`WorldEvent` 不是 `ChangeEvent`。** `ChangeEvent` 记录已提交的系统事实——Zivith 里发生了什么，用于审计与因果。`WorldEvent` 记录故事世界里发生了什么——初战、觉醒、背叛——以及它改变了哪些实体。二者都可排序；这不是合并它们的理由。

---

## 世界实体

### Character

以 `Asset(type=character)` 持有。管理基本信息、外观、性格、背景、能力、关系，以及随时间的状态变化。

角色演化表达为同一身份上已提交的 `EntityRevision` State：

```

Character: 林夜
  State @ stage 1   ordinary student
  State @ stage 2   power awakened
  State @ stage 3   becomes a leader

```

身份永久；内容版本化。三个阶段是一个 `Character`，不是三个。

### Location

以 `Asset(type=location)` 持有。管理地点、环境、历史、相关事件与关联角色。

### WorldEvent

Project 级实体（已入契约，[ADR-0011](../architecture/adr/0011-world-event-is-a-domain-creative-entity.md)），记录故事世界内的一次发生：世界时间信封、受影响实体、前置条件，以及随之而来的后果。v1 为只读 + 创建 `draft`（批准提升），不参与 Shot 依赖与继承解析；与 `ChangeEvent`（系统审计事实）严格区分。

### Relationship

记录实体之间如何相待——师徒、对立阵营、家族——以及这如何随时间变化。**已提升为独立可查询实体**（[ADR-0012](../architecture/adr/0012-relationship-is-an-independent-queryable-entity.md)）：独立表、多态 EntityRef、directed/undirected、可选世界时间有效期；查询面 `GET /projects/:pid/relationships`；v1 不做 `at=` 回溯。

### Organization（planned）

阵营、公司、宗门、家族——Project 级的持久组织。进入契约前需要 ADR，且需要真实项目的跨实体查询证据（Track I3；随创造层计划不启动）。

### Timeline

把世界实体及其 State 排成顺序，使系统能回答每个 AI 协作者首先需要的问题：**这个世界此刻处于哪个阶段？**

Presentation Time 是稳定的主轴。World Time 默认跟随它，仅当创作者表达闪回、近似时期、区间、时间跳跃或平行世界时才偏离。见 [Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md)。

世界线 v1 已落地（2026-08-05，`/projects/:id/world`：非均匀刻度 + 轨道化 + 关系连线；2026-08-14 细化地点轨、事件刻度标题、角色/地点锚定与世界时间偏离标记）。H6 可变 WorldTime binding 已落地（2026-08-16）：Project 自定义 `TemporalDimension`，`WorldTimeBinding` 信封表达 follow / 时刻 / 区间 / 相对 / 平行；核心不解释历法值。

---

# 4. 创作层级

每个创作项目遵循同一层级。

```

Project
↓
Story
↓
Scene
↓
Shot
↓
Video

```

每一层有不同的职责。

该层级代表的是制片流程，而非生成管线。它是**表达层**：展开并交付第 3 节所描述的世界，依赖世界而非定义世界。

**故事分段（[ADR-0006](../architecture/adr/0006-story-segments-are-ordered-scene-groupings.md)，V0.4）：** 在 Story 内，Scene 可组织为有序的 **StorySegment**（章/幕）。Segment 是带标题、草稿文本、顺序与审批状态的分组——它*不是*层级节点：Scene 仍由 Story 拥有，没有 Segment 的 Story 完全有效。Segment 的存在，是为了让故事起草与审阅可以按章推进，并让作用域重算可以针对一个叙事切片。

---

# 5. 核心领域对象

## Project

### 定义

Project 代表一个完整的创作宇宙。

它是 Zivith 内最高层级的对象。

Project 不是视频项目。

它代表整个 IP、世界或长期创作工作区。**Project 就是 IP**——其上或其旁不存在单独的 IP 对象。

---

### 职责

Project 负责：

- 世界知识
- 可复用资产
- 故事
- 工作流设置
- AI 配置
- 创作历史

---

### 拥有

Project 拥有：

- Knowledge Base
- Asset Library
- Stories
- Workflow Settings
- Project Metadata

任何东西都不存在于 Project 之外。

---

## Story

### 定义

Story 代表一个完整的叙事单元。

依项目而定，它可以代表：

- 一部电影
- 一集
- 一章
- 一条广告
- 一支 MV
- 一段完整叙事

---

### 职责

Story 负责：

- 叙事结构
- 剧本
- 故事推进
- Scene 组织

---

### 拥有

Story 拥有：

- Scenes
- StorySegments（可选的有序 Scene 分组——[ADR-0006](../architecture/adr/0006-story-segments-are-ordered-scene-groupings.md)，V0.4）

Story 从不拥有 Character 或 Asset。

Story 引用项目资产。

---

## Scene

### 定义

Scene 代表一个连续的叙事环境。

通常一个 Scene 包含：

- 一个地点
- 一种氛围
- 一个时段
- 一个叙事片段

Scene 的存在是为了组织多个 Shot。

---

### 职责

Scene 提供共享上下文。

示例：

- Location
- Time
- Weather
- Mood
- Participating Characters
- Visual Asset Requirements

Scene 还决定在其 Shot 生成前必须准备哪些视觉资产。每条需求指定：

- `asset_type`：`character` 或 `location`
- `asset_id`：被引用的 Character 或 Location
- `variant_key`：场景特定变体，如服装、时段、天气或地点子区域
- `required`：该视觉资产是否为视频生成的前置条件
- `reason`：为何必须生成、复用或重新生成参考图

`voice_only` 与 `implied` 角色不需要角色参考图。Character 与 Location 的项目级主图可复用；仅当 Scene 的视觉条件不同时才需要 Scene 变体图。首发版本中道具不参与视觉准备。

---

### 拥有

Scene 拥有：

- Shots
- Persistent Visual Asset Requirements

Scene 引用：

- Characters
- Locations
- Assets
- Visual Asset Requirements

---

## Shot

### 定义

Shot 是最小的可编辑创作单元。

Shot 是整个系统的核心对象。

每一次 AI 生成最终都会成为 Shot。

---

### 职责

Shot 定义一个电影瞬间。

它包含生成一个或多个视频所需的一切。

示例：

- camera
- composition
- action
- dialogue
- emotion
- prompt
- references
- outputs

---

### 拥有

Shot 拥有：

- Prompt State
- Output Versions
- Review Status
- Local Overrides

Shot 引用：

- Characters
- Locations
- Images
- Audio
- Videos
- Knowledge

---

## Video

### 定义

Video 是生成输出。

Video 从不是真相来源。

Video 始终源自 Shot。

---

### 职责

Video 存储：

- 生成结果
- 生成元数据
- 模型信息
- 生成参数
- 版本信息

---

### 所有权

Video 属于一个 Shot。

Video 可以有多个版本。

同一时刻只有一个版本可以成为活跃输出。

---

# 6. 所有权规则

所有权决定持久化。

每个对象恰好有一个所有者。

```

Project
│
├── Resource Space
│
│     ├── Knowledge
│     ├── Characters
│     ├── Locations
│     └── Assets
│
└── Creative Space
      │
      Story
          ↓
      Scene
          ↓
      Shot
          ↓
      Video

```

所有权从不向上跨越。

例如：

- Shot 从不拥有 Character。
- Scene 从不拥有 Asset。
- Story 从不拥有 Knowledge。

相反，它们引用可复用的 Project 资源。

---

# 7. 引用规则

可复用资源应始终被引用，而非复制。

示例：

Character
↓

Scene

↓

Shot

只存储 Character ID。

而不是复制完整的 Character 对象。

同一规则适用于：

- Locations
- Images
- Audio
- Videos
- Documents
- Styles

引用是默认行为。

仅在显式创建快照时才应复制。

---

# 8. 继承与覆盖

层级支持继承。

```

Project
↓

Story
↓

Scene
↓

Shot

```

每一层从其父级继承上下文。

示例：

Project

- Knowledge
- Style
- Default Characters

↓

Scene

inherits

↓

Shot

inherits

Shot 可以覆盖继承的值。

示例：

Scene

Location = Heavenly Palace

↓

Shot

Location = Heavenly Palace

Camera = Close-up

↓

Override

Location = South Gate

只有被覆盖的字段变为本地字段。

其余一切继续继承。

---

# 9. 审批与冻结

Story、Scene、Shot 等创作对象支持审阅，并持久化其审批状态。

对象可能处于两种主要状态：

Draft

Approved

Draft 对象继续接收继承更新。

Approved 对象变为冻结。

未来的 Project 或 Scene 修改不会自动改变 Approved 对象。

这在保证创作一致性的同时保留迭代编辑。

审批代表创作决策，而非技术锁。

当已批准的 Scene 被编辑时，它回到 `draft`。受影响的 Visual Asset Requirements 回到 `pending`，必须再次完成视觉审阅后才能生成新的 Shot 或 Video。先前已批准的 Shot 与既有 Output 保留其创建时上下文的快照，不会被自动更改。

---

# 10. Entity State、Timeline 与 Tracks

创作层级定义所有权，而 [Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md) 架构定义演化与时间呈现，且不改变 `Project → Story → Scene → Shot`：

- 一个 **Entity** 保持稳定身份与专用存储；
- 一个不可变的 **State revision** 记录该 Entity 在已提交时点是什么；
- 一个 Project **Timeline** 以 Presentation Time 为稳定轴；可选的 World Time 绑定跟随它，或表达相对、模糊、区间与平行世界的偏离；
- 语义 **Tracks** 组织 Scene、Character、Event、Shot、Camera、Style、Prompt 与 Model 视图。

Timeline 不是审计日志。已提交的系统事实是 `ChangeEvent`。World Time 不强制标准化虚构历法：核心存储最小的维度/关系信封，而 Project 定义的值保持不透明。Track 不是分支；未来的替代状态线使用不同术语 `CreativeBranch`。

世界 Entity 范围从 Character 与 Location 开始，并审慎扩展到 Object、Event 与 Organization。Scene 与 Shot 保留其层级语义；Workflow runs 与 queue attempts 仍是执行对象。

已批准快照仍是领域级冻结记录。修订历史或 Timeline 移动，不允许后续的 Asset、Scene、Track、Branch 或 Workflow 更改改写已批准 Shot 或既有 Output 的创建时上下文。

**实现状态（2026-08-16）：** H1–H3 已落地（`entity_revisions` / `change_events` / `project_sequences` 表 + 基线回填 + 双写助手默认关）；世界线 v1 已落地（世界/制作双视图、event/character/scene/location 四轨道、Shot 轨道、显式 Track/Item CRUD）；H6 可变 WorldTime 绑定已落地（TemporalDimension + WorldTimeBinding 信封）；H7 派生 Track v1 已落地（Camera/Style/Prompt/Model 只读投影）；H9 v1 规则冲突检测只报告不修复；WorldEvent / Relationship 已落库；Creator Chat 持续对话（ADR-0010 修订 / ADR-0013）与世界观 Json（`Project.worldview`）已落地。`Organization`（I3）与 CreativeBranch（H10）仍属后续。

---

# 11. 什么不是领域对象

领域通过加深而非拓宽生长。产品用语中出现的某些概念刻意没有领域表示。

## Skill

`Skill` 命名将世界状态转换为生成请求的能力层。它**不是**领域实体：无身份、无修订、无所有权，从不存储、从不导出、从不被任何领域对象引用。

```

Domain / IP Core
      ↓
Application Logic
      ↓
Skill / Capability
      ↓
Provider Adapter
      ↓
External Model

```

`Shot Generation Skill` 是既有链路的标签——`Shot` 规格 → prompt 构造 → `PromptVersion` → video provider → `Output`。增强 AI 能力意味着强化实现或更换 provider，绝不是向领域添加模型形状的对象。见 [ADR-0009](../architecture/adr/0009-skill-is-a-capability-layer-not-a-domain-entity.md)。

## IP

IP 就是 `Project`。不存在单独的 IP 对象。

## Conversation

Creator Chat 以持续对话收集意图，经提案与用户确认后产出结构化草稿实体（默认 `draft`）。对话记录是会话工作底稿，不是创作产物：它不被 Project 拥有，不参与继承解析，也不出现在导出的创作层中（宪法 §9.2，2026-08-04 修订）。见 [ADR-0010](../architecture/adr/0010-creator-chat-is-the-world-first-continuous-conversation-surface.md)。

## Workflow 执行

Workflow runs、steps 与 queue attempts 是具有自身语义的执行对象。它们有序，但有序并不使它们成为创作历史。
