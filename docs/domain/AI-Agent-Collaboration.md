# AI Agent 协作模型

> Zivith AI Agent Collaboration Model & Workflow Spec
>
> Version: 2.1
>
> Status: Active（生效）— 已于 2026-07-28 同步（prompt-draft Visual Prep + 延后 generate）；Agent 角色已于 2026-07-31 按 IP 世界模型重组（[ADR-0008](../architecture/adr/0008-zivith-is-an-ai-understandable-ip-creation-system.md)）；2026-08-30 增补 Roleplay Agent（非流水线角色）
>
> Related: [Product-Positioning.md](../product/Product-Positioning.md), [Core-Domain-Model.md](Core-Domain-Model.md), [UI-Information-Architecture.md](../product/UI-Information-Architecture.md), [Shot-Specification.md](Shot-Specification.md), [Asset-Model.md](Asset-Model.md), [Next-Tasks.md](../planning/Next-Tasks.md), [ADR-0009](../architecture/adr/0009-skill-is-a-capability-layer-not-a-domain-entity.md), [ADR-0010](../architecture/adr/0010-creator-chat-is-the-world-first-continuous-conversation-surface.md), [ADR-0014](../architecture/adr/0014-layered-memory-system.md), [ADR-0015](../architecture/adr/0015-novel-import-is-batch-memory-ingest.md), [Memory-Novel-Roleplay-Design.md](../planning/Memory-Novel-Roleplay-Design.md)

---

## 目录

**第一部分 — 四个角色。** 谁做什么，用领域语言说明。

1. 目的
2. World Builder Agent
   - 2.3 Roleplay Agent（扮演；非第五流水线角色）
3. Lore Keeper Agent
4. Production Planner Agent
5. Generation Agent
6. 非角色：Orchestrator
7. 角色与阶段映射

**第二部分 — 流水线。** 默认 Story-to-Video 工作流，逐阶段说明。

8. 流水线总览
9. 阶段详情

**第三部分 — 执行机制。** 运行时行为：重跑、并发、门禁、失败。

10. 迭代精炼
11. 并行执行
12. Agent 间通信
13. 人机协同集成
14. 错误处理与恢复

**第四部分 — 参考。** 契约与配置。

15. Agent 接口
16. 自动化级别
17. 按项目的 Agent 配置

---

## 第一部分 — 四个角色

四个角色划分工作。前两个构建并维护世界；后两个把世界变成成品素材。

### 1. 目的

本文档定义 Zivith 的 AI Agent 架构——有哪些 Agent、各自负责什么、如何协作，以及人类如何参与工作流。

Zivith 不是单一 AI 在做视频。它是一支在持久世界上协作的专业化 Agent 团队。设计必须支持：

- **一个比任何单次制作更长久的世界**：Agent 先构建并维护 IP 世界，再从中规划制作
- **顺序工作流**：World → Story → Scene → Scene review → Visual Prep → visual-assets review → Shot → Prompt → prompt review（强制）→ Video → review
- **迭代精炼**：可从任意阶段重新生成，无需重启整条流水线
- **人机协同**：每一阶段都有评审门禁，自动化级别可配置
- **并行执行**：相互独立的 Shot/Scene 可并发处理
- **上下文共享**：所有 Agent 共享 Project 级知识与 Asset

#### 1.1 角色与阶段彼此分离

本文档区分了早期版本混为一谈的两件事。

**角色（role）** 是领域层面对「谁做这类工作」的回答。共有四个：World Builder、Lore Keeper、Production Planner、Generation。

**阶段（stage）** 是工作流的执行单元：拥有一个 `AgentId`、在 DAG 中的位置，以及可能的评审门禁。共有九个阶段标识符，与早期版本一致，也与代码一致（`packages/domain/src/agent.ts`）。

一个角色可跨越多个阶段。Production Planner 拥有其中四个；Generation 拥有三个。这种分离使 Agent 词汇可以围绕 IP 世界重组，而无需移动任何评审门禁——**门禁绑定的是产物，不是角色**（见 §13.1）。

### 2. World Builder Agent

**创建世界、提出问题、补齐设定。**

它根据创作者用自然语言描述的内容，起草 `Project` 世界设定、`Asset(type=character)`、`Asset(type=location)`、`WorldEvent` 以及 Relationship 结构。它也是 Creator Chat 持续对话背后的引擎（[ADR-0010](../architecture/adr/0010-creator-chat-is-the-world-first-continuous-conversation-surface.md)，2026-08-04 修订），因此其产出一律经提案与用户确认后以 `draft` 进入，并可编辑、可拒绝。

| 方面 | 详情 |
|---|---|
| 输入 | 创作者的自然语言描述、参考图、既有世界状态（角色含 Studio 角色卡） |
| 输出 | 世界实体草稿及其初始 State |
| 执行阶段 | `asset` |
| 实现 | `apps/api/src/contexts/agent/asset-agent.ts` — 所需的输入契约反转见 §2.2 |

#### 2.1 专用工作流：`asset` 阶段

`asset` 阶段运行在主 Story→Video 流水线之外。当用户想创建或精炼世界时调用。

```
User describes Character → asset stage drafts Character → User reviews/refines
User uploads reference image → asset stage extracts visual traits → User reviews
User provides world lore → asset stage structures Knowledge → User reviews
```

该阶段也可在主工作流中按上下文调用。若 `shot` 阶段判定所需 Character 不存在，会提示用户：「本 Scene 需要角色『Forest Spirit』。现在创建吗？」——从而内联触发 `asset` 阶段。

#### 2.2 输入契约反转

这是本版本中影响最大的一处变更，且尚未实现。

**今天（制作 → 世界）：** `asset` 阶段大多是反应式的。它从 Scene 上下文反向推断角色与地点，填补制作过程中发现的缺口。世界是制作的副产品。

**目标（世界 → 制作）：** 世界先存在。创作者通过 Creator Chat 或 World Workspace 构建世界，Scene *引用* 已存在的实体，而不是导致它们被发明出来。上下文内联创建仍作为缺口的逃生舱保留，而非主路径。

| | 今天 | 目标 |
|---|---|---|
| 触发 | Scene 上下文暴露缺失实体 | 创作者直接描述世界 |
| 方向 | Production → World | World → Production |
| 主界面 | Workflow 面板、内联提示 | Creator Chat 向导、World Workspace |
| 输出状态 | Draft | Draft（不变） |

两个约束在两个方向上都成立。该阶段产出一律经提案与用户确认后以 `draft` 进入，并保持可编辑、可拒绝——Creator Chat 不得写入已批准状态（[ADR-0010](../architecture/adr/0010-creator-chat-is-the-world-first-continuous-conversation-surface.md)）。且该阶段不扩展领域模型：它产出 `Asset`、`WorldEvent` 与 Relationship State，均定义于 [Core-Domain-Model.md](Core-Domain-Model.md) §3。

此次反转的落地顺序见 [Next-Tasks.md](../planning/Next-Tasks.md) 的 Track I（世界实体）与 Track J（Creator Chat 持续对话）。UI 侧为 Track K，规范见 [UI-Information-Architecture.md](../product/UI-Information-Architecture.md)。

#### 2.3 Roleplay Agent（扮演）

**在世界时间锚点上以角色口吻对话；不是第五个流水线角色。**

它复用 Creator Chat 的 `CreatorChatThread` / `CreatorChatMessage` 与 SSE，旁表 `RoleplayThread` 记录角色 Asset 与可选 `WorldEvent` 锚点。侧栏「角色」Tab 列出扮演线程，与世界构建历史分开（[UI-Information-Architecture.md](../product/UI-Information-Architecture.md) §6）。实现：`apps/api/src/contexts/roleplay/roleplay-agent.ts`。

| 方面 | 详情 |
|---|---|
| 输入 | Studio 角色卡（Asset 名称/简介/个性/别名）+ MemoryCore 档案补充、锚点 T 之前该角色亲历 WorldEvent、关系快照、用户对白 |
| 输出 | 扮演回复（SSE）；可选 episodic `MemoryAtom`（链接该角色） |
| 执行阶段 | 无 — 不在 Story→Video DAG 中 |
| 硬约束 | **不创建或修改** `Asset` / `WorldEvent` / `Relationship` / `Project.worldview`。反写世界层必须走 World Builder 提案确认（ADR-0010）。Studio「在对话中继续」不得打开扮演线程 |

设计见 [Memory-Novel-Roleplay-Design.md](../planning/Memory-Novel-Roleplay-Design.md) §6。

### 3. Lore Keeper Agent

**检查一致性，策展知识。**

它回答世界是否仍然自洽：某 `Character` 的 State 是否与更早修订矛盾、某 `WorldEvent` 是否与 Timeline 冲突、某 Relationship 是否与另一条矛盾。它策展 `Asset(type=knowledge)`，使人类修正成为持久的 Project 记忆，而非一次性修补（P8，「分歧即数据」）。

| 方面 | 详情 |
|---|---|
| 输入 | 实体 State 与修订、WorldEvent、Relationship、Timeline、评审历史 |
| 输出 | 一致性发现与**提案**——绝不静默修复 |
| 执行阶段 | 尚无独立流水线阶段 — v1 挂在 World Builder 回合与 `GET /world/projects/:id/resources` 上只读计算 |
| 规划为 | Track H **H9**，以及 [AI Creative IDE RFC](../architecture/rfc/AI-Creative-IDE-RFC.md) 的 Slice D |

**状态：v1 已落地（2026-08-13）。** 规则检测器报告同名重复、关系自指/对向循环、事件顺序撞车、题材偏离与极性事实矛盾；发现进入 `world_state.conflicts` 与 Studio 副驾驶。**不写入任何实体。** 未做：跨修订 State、发现驳回持久化、`Asset(type=knowledge)` 策展。

#### 3.1 职责范围

Lore Keeper 只回答一个问题：*世界是否仍然自洽？*

| 检查 | 发现示例 |
|-------|-----------------|
| 跨修订的 State 矛盾 | 某 `Character` 的 State 写着「围城时失明」，后续 Scene 却让其阅读信件 |
| WorldEvent 与 Timeline | 两个 `WorldEvent` 都声称是同一角色的初次相遇 |
| Relationship 矛盾 | A 是 B 的导师；B 又是 A 的导师 |
| 制作偏离世界 | 某 `Scene` 描述的 `Location` 状态，世界称其三场事件前已离开 |
| 知识衰减 | 评审门禁上的创作者修正从未变成持久的 Project 记忆 |

第二项职责是策展 `Asset(type=knowledge)`。当人类在评审门禁上覆盖 Agent 时，那次分歧是关于世界的信号，而非应丢弃的噪声（P8，「分歧即数据」）。Lore Keeper 的工作是把它变成后续阶段会读取的知识。

#### 3.2 硬约束：只提案，不修复

Lore Keeper **不得静默修改任何实体。** 它发出发现与提案；由人类决定。

这不是风格偏好。它来自 P3（人类对创作决策拥有权威），以及一致性「修复」往往是伪装成技术问题的创作决策——当世界中两则事实冲突时，选择哪一则存活本身就是作者权。既有计划也已携带同一约束：Track H 的 **H9** 与 [AI Creative IDE RFC](../architecture/rfc/AI-Creative-IDE-RFC.md) 的 Slice D 都规定禁止自动静默修复。本文档将其采纳为常设规则，而非按切片临时约定。

具体而言：

- 未经人类明确批准，不得写入实体 State、`WorldEvent` 或 Relationship
- 不得代创作者创建修订
- 发现可被驳回，驳回本身也是知识——同一发现不应原样再次浮现
- 它没有自己的评审门禁，也不阻塞任何阶段；它是建议性的，独立于流水线运行

唯一可不经询问写入的，是它自己的发现。

#### 3.3 与既有计划的关系

| 来源 | 切片 | 覆盖内容 |
|--------|-------|----------------|
| [Next-Tasks.md](../planning/Next-Tasks.md) Track H | **H9** | 首个一致性检查切片 — Lore Keeper 的初始落地点 |
| [AI Creative IDE RFC](../architecture/rfc/AI-Creative-IDE-RFC.md) | **Slice D** | IDE 体验中的一致性界面 |

二者都不排在 Track I、J 之前：Lore Keeper 需要 `WorldEvent` 与 Relationship 先存在，才有实质可查。H9 v1 没有独立 `AgentId`，不阻塞流水线。

### 4. Production Planner Agent

**把世界变成制作计划：World → Story → Scene → Shot。**

它读取世界状态与创作意图，产出表达层。这是最大的角色，跨越四个带门禁的阶段，也是今日已实现 Agent 行为的主要所在。

| 方面 | 详情 |
|---|---|
| 输入 | 世界状态（Character、Location、WorldEvent、Relationship、Timeline）加上创作者对本制作的意图 |
| 输出 | `Story`、`Scene`、`VisualAssetRequirement`、`Shot` |
| 执行阶段 | `story`、`scene`、`visual_prep`、`shot` |
| 实现 | `story-agent.ts`、`scene-agent.ts`、`visual-prep-agent.ts`、`shot-agent.ts` |

**Story 的输入契约已变更。** 过去它从创意 brief 起步。在 IP 世界模型下，它从世界状态加意图起步——brief 现在只是若干可选输入之一，不再是工作的起点。

#### 4.1 专用工作流：`visual_prep` 阶段

`visual_prep` 阶段在 Scene review 之后运行。它将 Scene 需求与既有资产及形象设定表锚点比对，产出每 Scene 的视觉复用/生成清单，并**起草**生成提示词（包括角色 `sheet_turnaround` / 地点 `location_sheet` 为空时）。仅当操作者点击生成时才调用图像 API（设定表走资产库；关键帧走 WorkflowPanel）。已批准的 Media 写回 Scene 绑定；设定表还会写回 Asset 封面 / `reference_images[]`。必须完成其必需审批门禁后，`shot` 阶段才能开始。详见 [Asset-Model.md](Asset-Model.md)。

复用是两个角色交汇之处。World Builder 维护的世界越丰富，本阶段就越能复用而非生成——这正是 IP 世界自我回报的实践理由。

### 5. Generation Agent

**调用模型。**

它从已解析的 `Shot` 字段构造提示词、调用提供商并存储结果。这是 [ADR-0009](../architecture/adr/0009-skill-is-a-capability-layer-not-a-domain-entity.md) 中的能力层——提示词构造属于此处，不属于领域。

| 方面 | 详情 |
|---|---|
| 输入 | 已解析的 `Shot` 字段、Prompt Template、模型参数 |
| 输出 | `PromptVersion`、`Output` |
| 执行阶段 | `prompt`、`generation`、`review` |
| 实现 | `prompt-agent.ts`、`GenerationService`；`review` 阶段（分析产出质量并提出 Shot 变更）仍未实现 |

### 6. 非角色：Orchestrator

Orchestrator 不是 Agent。它是规划执行并管理状态转换的工作流引擎，实现为 `apps/api/src/contexts/workflow/mock-runner.ts` 中的 `MockWorkflowRunner`。为兼容性保留 `orchestrator` 标识符。

### 7. 角色与阶段映射

角色是领域词汇。阶段是带 `AgentId`、DAG 位置与评审门禁的执行单元。九个阶段标识符保持不变，代码中亦不变。

| 执行阶段（`AgentId`） | 所属角色 | 产出 | 门禁 |
|------------------------------|-------------|----------|------|
| `asset` | World Builder | 世界实体 | — |
| `story` | Production Planner | `Story` | story |
| `scene` | Production Planner | `Scene` | scene |
| `visual_prep` | Production Planner | `VisualAssetRequirement` | visual_assets（**强制**） |
| `shot` | Production Planner | `Shot` | shot |
| `prompt` | Generation | `PromptVersion` | prompt（**强制**） |
| `generation` | Generation | `Output` | video |
| `review` | Generation | 评审备注 | —（未实现） |
| `orchestrator` | —（引擎） | 执行计划 | — |

Lore Keeper 不出现在任何行：它在 story-to-video 流水线中不拥有阶段，并独立于流水线运行。Roleplay Agent 同样不占阶段。

---

## 第二部分 — 流水线

默认创作工作流是一条带评审门禁的线性流水线。

它不从空白提示词开始。它从世界开始——由 World Builder 与 Lore Keeper 角色构建并维护——再由 Production Planner 转化为制作。下方标注了阶段归属；阶段本身、其顺序与门禁均未改变。

### 8. 流水线总览

```
        ┌───────────────────────────────────┐
        │  World state  (World Builder)     │  ← 世界状态
        │  Character · Location · WorldEvent│
        │  Relationship · Timeline          │
        └─────────────────┬─────────────────┘
                          │  + creative intent for this production  ← 本次制作的创作意图
                          ↓
                    ┌─────────────┐
                    │  User Input │  ← 用户输入
                    └──────┬──────┘
                           ↓
┌──────────────────────────────────────────────────┐
│              Orchestrator (engine)                │  ← 规划执行、管理状态转换
│    Plans execution, manages state transitions     │
└──────────────────────────────────────────────────┘
                           ↓
              ┌─────────────────────┐
              │  story stage        │
              │  Production Planner │
              │  Generate/refine    │  ← 生成/精炼叙事
              │  narrative          │
              └──────────┬──────────┘
                         ↓
                   ┌───────────┐
                   │  Review   │ ← Human decision gate（人类决策门禁）
                   └─────┬─────┘
                         ↓
              ┌─────────────────────┐
              │  scene stage        │
              │  Production Planner │
              │  Story → Scenes     │
              └──────────┬──────────┘
                         ↓
                   ┌───────────┐
                   │Scene review│ ← Human decision gate（人类决策门禁）
                   └─────┬─────┘
                         ↓
              ┌─────────────────────┐
              │  visual_prep stage  │
              │  Production Planner │
              │ Scene → visual reqs │  ← Scene → 视觉需求（复用/生成）
              │ (reuse / generate)  │
              └──────────┬──────────┘
                         ↓
                   ┌───────────────┐
                   │Visual-assets  │ ← Required approval gate（必需审批门禁）
                   │    review     │
                   └──────┬────────┘
                          ↓
              ┌─────────────────────┐
              │  shot stage         │
              │  Production Planner │
              │  Scene → Shots      │
              │  (per Scene)        │
              └──────────┬──────────┘
                         ↓
                   ┌───────────┐
                   │  Review   │ ← Human decision gate（人类决策门禁）
                   └─────┬─────┘
                         ↓
              ┌─────────────────────┐
              │  prompt stage       │
              │  Generation         │
              │  Shot → Prompt      │
              │  (per Shot)         │
              └──────────┬──────────┘
                         ↓
                   ┌───────────┐
                   │  Review   │ ← Mandatory prompt review gate（强制 prompt 评审门禁）
                   └─────┬─────┘
                         ↓
              ┌─────────────────────┐
              │  generation stage   │
              │  Generation         │
              │  Prompt → Video     │
              │  (per Shot)         │
              └──────────┬──────────┘
                         ↓
                   ┌───────────┐
                   │  Review   │ ← Human decision gate（人类决策门禁）
                   └─────┬─────┘
                         ↓
                   ┌───────────┐
                   │ Approved  │  ← 已批准
                   └───────────┘
```

### 9. 阶段详情

#### 阶段 1：Story 生成

**阶段：** `story` · **角色：** Production Planner

**触发：** 用户提供创作意图，或选择「Generate Story」

**`story` 阶段输入：**
```yaml
project_id: "proj_abc"
brief: "A 3-minute sci-fi short about a robot discovering nature"
tone: "hopeful, contemplative"
target_duration_seconds: 180
reference_stories: []  # Optional existing stories for style reference
constraints:
  max_characters: 3
  language: "en"
```

在 IP 世界模型下，本阶段会读取世界状态——已存在的 `Character`、`Timeline` 当前所处位置、已发生的 `WorldEvent`——以及上述字段。`brief` 成为描述*本*制作意图的可选输入之一，而不再是世界的起源。

**`story` 阶段输出：**
```yaml
story:
  title: "The Last Seed"
  logline: "A maintenance robot on a dead Earth discovers the planet's final living seed."
  synopsis: "..."
  genre: "science_fiction"
  theme: "hope"
  tone: "contemplative"
  screenplay: "INT. DEAD CITY - DAY\n..."
  # Optional (ADR-0006 / V0.4 W3): persisted StorySegment drafts for chapter-wise review
  segments:
    - title: "The Gray World"
      synopsis: "Robot R-7 performs routine maintenance in an abandoned city."
      draft: "INT. DEAD CITY - DAY\nR-7 sweeps dust from silent solar panels."
    - title: "Discovery"
      synopsis: "R-7 finds a glowing seedling in a collapsed greenhouse."
      draft: "INT. GREENHOUSE - DAY\nA single green shoot breaks through concrete."
    - title: "Guardian"
      synopsis: "R-7 protects the seedling from a scavenger drone."
      draft: "EXT. GREENHOUSE ROOF - DUSK\nR-7 raises a welding torch as a shield."
```

**评审门禁：** 用户评审故事结构、logline，以及（若存在）每个已持久化的 StorySegment。各 segment 可独立批准或重写；仅当每个 segment 都获批准时 story 门禁才完成（若故事零 segment——则走遗留的单块评审）。

#### 阶段 2：Scene 分解

**阶段：** `scene` · **角色：** Production Planner

**`scene` 阶段输入：**
```yaml
story_id: "story_seed"
project_id: "proj_abc"
automation_level: "assisted"
```

**`scene` 阶段输出：**
```yaml
scenes:
  - order: 1
    label: "Dawn Patrol"
    location_id: "loc_city"
    time: "early_morning"
    mood: "melancholic, quiet"
    summary: "R-7 begins its daily maintenance routine..."
    characters: ["char_r7"]
    estimated_shots: 4
    estimated_duration_seconds: 25
  - order: 2
    label: "The Anomaly"
    location_id: "loc_city"
    time: "mid_morning"
    mood: "curious, unsettling"
    summary: "R-7 detects an unusual life-sign reading..."
    characters: ["char_r7"]
    estimated_shots: 5
    estimated_duration_seconds: 35
  # ... more scenes
```

#### 阶段 3：视觉准备

**阶段：** `visual_prep` · **角色：** Production Planner

本阶段在 Scene review 之后按 Scene 运行。它对照已批准的 Project 资产，评估 Scene 的角色、地点、时间、天气、情绪与子地点，然后列出所需视觉绑定。`voice_only` 与 `implied` 角色不需要角色图像。

**当前实现（Track G）：**

1. 确保每个 Character 有 `sheet_turnaround` 槽位；从剧本**起草**多视图设定表提示词（不自动 T2I）。
2. 经 `visual_trait` agent（`purpose`：`character_sheet` / `location_sheet` / `keyframe`）丰富 Character/Location 特征，并将 `generation_prompt` 持久化到 Asset / requirement。
3. 以 `pending` 状态 upsert `VisualAssetRequirement` 行，候选为空——**不要**批量生成场景关键帧。
4. 操作者流程：资产库起草/生成角色 turnaround + 地点设定表 → WorkflowPanel **按卡片生成一张关键帧** → 在进入 Shot 前批准所有必需绑定。

```yaml
visual_requirements:
  - asset_type: "character"
    asset_id: "char_r7"
    variant_key: "default"
    required: true
    reason: "First on-screen appearance; no reusable approved key image exists"
  - asset_type: "location"
    asset_id: "loc_city"
    variant_key: "early_morning_melancholic"
    required: true
    reason: "The Scene needs an environmental reference for the abandoned city at dawn"
```

每个必需视觉必须恰好有一个已批准的 `approved_media_id`。在所有必需视觉需求获批之前，`shot` 阶段与视频生成均被阻塞。

#### 阶段 4：Shot 分解

**阶段：** `shot` · **角色：** Production Planner

**`shot` 阶段输入：**
```yaml
scene_id: "scene_1"
project_id: "proj_abc"
automation_level: "assisted"
```

**`shot` 阶段输出：**
```yaml
shots:
  - order: 1
    label: "Establishing wide shot of abandoned city"
    camera:
      shot_type: "wide_shot"
      angle: "high_angle"
      movement: "static"
    composition:
      framing: "rule_of_thirds"
      focus_subject: "The empty city skyline"
    lighting:
      type: "natural"
      direction: "front"
      intensity: "low"
    mood: "melancholic"
    characters: []
    action:
      description: "Dust particles float through morning light. Nothing moves."
      duration_hint: 5.0
  - order: 2
    label: "R-7 emerges from maintenance hatch"
    camera:
      shot_type: "medium_shot"
      angle: "eye_level"
      movement: "tilt_up"
    characters:
      - character_id: "char_r7"
        action: "Climbing out of a ground-level maintenance hatch"
        emotion: "neutral"
        position: "center"
    action:
      description: "R-7's optical sensors adjust to the morning light."
      duration_hint: 4.0
  # ... more shots
```

#### 阶段 5：提示词构造

**阶段：** `prompt` · **角色：** Generation

**`prompt` 阶段输入：**
```yaml
shot_id: "shot_scene1_2"
project_id: "proj_abc"
prompt_template: "cinematic_default"
```

本阶段解析所有继承值，应用 Character/Location/Style 引用，并使用已配置的 Prompt Template 构造最终提示词。完整提示词构造过程见 Shot-Specification.md §5。

#### 阶段 6：强制 Prompt 评审

每个已生成或已编辑的提示词，在视频生成前必须被显式评审。评审者可批准、编辑、拒绝或请求重新生成。自动化设置不能绕过此门禁。

#### 阶段 7：视频生成

**阶段：** `generation` · **角色：** Generation

**`generation` 阶段输入：**
```yaml
shot_id: "shot_scene1_2"
prompt_positive: "Cinematography: medium shot, eye level, tilt up movement. Lighting: natural front light, low intensity, warm. A humanoid maintenance robot with weathered steel plating climbs out of a ground-level hatch in an abandoned city. Dust particles float in golden morning light. Style: photorealistic, cinematic color grading with teal and orange palette."
prompt_negative: "cartoon, anime, low quality, blurry, text, watermark"
model: "kling"
parameters:
  duration: 4.0
  aspect_ratio: "16:9"
  fps: 24
```

#### 阶段 8：视频评审

**阶段：** `review` · **角色：** Generation · **状态：** 未实现

生成之后，本阶段可选择分析产出并提供结构化反馈：

```yaml
review:
  shot_id: "shot_scene1_2"
  output_id: "out_xyz"
  passed: true
  issues:
    - severity: "minor"
      field: "camera.movement"
      observation: "Tilt-up movement is barely perceptible. Consider increasing movement amplitude or switching to static."
      suggestion: "Change camera.movement to 'static' or add custom instruction: 'smooth slow tilt-up from ground to eye level'"
    - severity: "info"
      field: "lighting.color_temperature"
      observation: "Generated lighting appears cool (bluish) despite 'warm' specification."
      suggestion: "Adjust prompt to emphasize 'warm golden morning light, 3200K'"
  overall_quality: 0.85
```

---

## 第三部分 — 执行机制

### 10. 迭代精炼

流水线支持从任意阶段局部重新生成。

#### 10.1 重新生成场景

| 触发 | 范围 | 行为 |
|---------|-------|----------|
| 用户编辑某 Shot 的 camera 字段 | 仅该 Shot | 对受影响 Shot 重跑 `prompt` → `generation` |
| 用户向 Project 添加新 Character | 引用该 Scene 的所有未批准 Shot | 对受影响 Shot 重跑 `prompt` → `generation` |
| 用户修改 Scene 的 Location | 该 Scene 中所有未批准 Shot | 对该 Scene 全部 Shot 重跑 `prompt` → `generation` |
| 用户修改 Scene 的地点、时间、天气、情绪、角色或子地点 | 该 Scene 的视觉需求 | 将受影响需求标为 `pending`；重跑 `visual_prep` 并取得批准后，才可进行新的视频生成 |
| 用户重写 Story 结构 | 所有下游未批准对象 | 重跑 `scene` → `shot` → `prompt` → `generation` |
| 用户更改 Project Style | Project 中所有未批准 Shot | 对所有受影响 Shot 重跑 `prompt` → `generation` |
| 用户直接编辑提示词 | 仅该 Shot | 对该 Shot 重跑 `generation` |

**操作者 API（V0.4 W4）：** 作用域内重算，无需 cancel+restart —

- `POST /scenes/:id/recompute-visual-prep`
- `POST /shots/:id/recompute-prompt`
- `POST /shots/:id/recompute-video`

每次调用记录一行 `workflow_step_attempts`（`input_hash`、provider/model、usage）。同一实体上的并发重算返回 `409 RECOMPUTE_IN_PROGRESS`。见 [Looser-Creative-Flow-RFC.md §14](../architecture/rfc/Looser-Creative-Flow-RFC.md)。

#### 10.2 变更传播

```
Project.Style changed
    ↓
Affected Stories: all
    ↓
Affected Scenes: all (inherit Style from Project)
    ↓
Affected Shots: all non-approved Shots
    ↓
Action: regenerate prompts → regenerate videos
```

系统跟踪哪些 Shot 字段是继承的、哪些是本地覆盖的。只有继承字段会受上游变更影响。

### 11. 并行执行

相互独立的 Shot 与 Scene 可并发处理。

#### 11.1 并行边界

| 层级 | 可并行？ | 原因 |
|-------|------------------|--------|
| Project 内的 Story | 是 | Story 彼此独立 |
| Story 内的 Scene | 是，在所有 Scene 定义完成后 | Story 既定后，Scene 定义彼此独立 |
| Scene 内的 Shot | 是，在所有 Shot 定义完成后 | Scene 既定后，Shot 定义彼此独立 |
| 跨 Shot 的提示词构造 | 是 | 每个 Shot 的提示词独立解析 |
| 跨已批准 Scene 的视觉准备 | 是 | 每个 Scene 的需求与候选视觉彼此独立 |
| 跨 Shot 的视频生成 | 是 | 生成调用是独立的 API 请求 |

#### 11.2 并行执行计划

```
story completes → produces N Scenes
                           ↓
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
      scene              scene              scene
   (Scene 1)          (Scene 2)          (Scene N)
        ↓                  ↓                  ↓
   visual_prep        visual_prep        visual_prep
   (M Shots)          (K Shots)          (P Shots)
        ↓                  ↓                  ↓
      shot               shot               shot
        ↓                  ↓                  ↓
   ┌────┼────┐       ┌────┼────┐       ┌────┼────┐
   ↓    ↓    ↓       ↓    ↓    ↓       ↓    ↓    ↓
  prm  prm  prm     prm  prm  prm     prm  prm  prm
   ↓    ↓    ↓       ↓    ↓    ↓       ↓    ↓    ↓
  gen  gen  gen     gen  gen  gen     gen  gen  gen
```

prm = `prompt` 阶段，gen = `generation` 阶段 — 二者均属 Generation 角色

### 12. Agent 间通信

Agent 通过共享工作流上下文通信，从不直接通信。

#### 12.1 共享上下文总线

```typescript
interface WorkflowContext {
  runId: string;
  projectId: ProjectId;
  userId: UserId;
  startedAt: string;
  agentResults: Record<AgentId, AgentResult<unknown>>;
  artifacts: {
    story?: Story;
    scenes: Record<SceneId, Scene>;
    shots: Record<ShotId, Shot>;
    generatedOutputs: Record<ShotId, Output[]>;
    reviews: Record<ShotId, Review[]>;
  };
  state: WorkflowState;
  errors: WorkflowError[];
}
```

#### 12.2 Agent 执行顺序

Orchestrator 根据工作流 DAG 决定执行顺序。

下方的 `agent:` 字段是**执行阶段标识符，不是角色名**。DAG 定义在阶段之上，因此重组角色不会改变执行顺序或依赖。归属标注仅供阅读：`story_agent`、`scene_agent`、`visual_prep_agent`、`shot_agent` 属于 Production Planner；`prompt_agent` 与 `generation_agent` 属于 Generation。`asset` 阶段（World Builder）不在此 DAG 中，因为它在主流水线外运行（§2.1）；Lore Keeper 则完全没有阶段。

```yaml
workflow:
  name: "story_to_video"
  stages:
    - agent: "story_agent"
      depends_on: []
      review_gate: true
    - agent: "scene_agent"
      depends_on: ["story_agent"]
      review_gate: true
    - agent: "visual_prep_agent"
      depends_on: ["scene_agent"]
      review_gate: true
      parallel: "per_scene"
    - agent: "shot_agent"
      depends_on: ["visual_prep_agent"]
      review_gate: true
      parallel: "per_scene"
    - agent: "prompt_agent"
      depends_on: ["shot_agent"]
      review_gate: true
      review_required: true
      parallel: "per_shot"
    - agent: "generation_agent"
      depends_on: ["prompt_agent"]
      review_gate: true
      parallel: "per_shot"
      rate_limit:
        max_concurrent: 3
        delay_between_ms: 2000
```

### 13. 人机协同集成

#### 13.1 评审门禁配置

门禁按**产物**键控，而非按 agent 或角色：`story` 门禁 `Story`，`scene` 门禁 `Scene`，`visual_assets` 门禁 `VisualAssetRequirement` 绑定，`shot` 门禁 `Shot`，`prompt` 门禁 `PromptVersion`，`video` 门禁 `Output`。因为产物未变，第一部分的角色重组不移动、不新增、也不删除任何门禁。两个强制门禁——`visual_assets` 与 `prompt`——保持其必需状态；迁移或弱化门禁需按 P6 提交 ADR。

```yaml
review_gates:
  story:
    enabled: true
    automation: "assisted"
    auto_approve_if:
      confidence_threshold: 0.9
  scene:
    enabled: true
    automation: "semi_auto"
    auto_approve_if:
      confidence_threshold: 0.85
  visual_assets:
    enabled: true
    automation: "assisted"
  shot:
    enabled: true
    automation: "assisted"
  prompt:
    enabled: true
    automation: "full_manual"
    required: true
  video:
    enabled: true
    automation: "full_manual"
```

#### 13.2 评审动作

在每个评审门禁，用户可以：

| 动作 | 效果 |
|--------|--------|
| `approve` | 接受并进入下一阶段 |
| `approve_all` | 接受本阶段全部项，跳过逐项评审 |
| `reject` | 返回上一阶段重新生成 |
| `edit` | 批准前手动修改 |
| `retry` | 以相同输入重新生成 |
| `retry_with_feedback` | 提供自然语言反馈，以修改后的输入重新生成 |

#### 13.3 反馈闭环

任意评审门禁上的用户反馈会注入到 Agent 的重试上下文中：

```yaml
retry_with_feedback:
  shot_id: "shot_scene1_2"
  feedback: "Make the robot look more weathered, with visible rust and scratches. The morning light should be warmer."
```

该反馈作为附加上下文传给 `prompt` 阶段，由其相应调整提示词。

### 14. 错误处理与恢复

#### 14.1 Agent 级错误

| 错误类型 | 行为 |
|------------|----------|
| `validation_error` | 阻塞执行，向用户返回详情 |
| `generation_timeout` | 指数退避重试最多 3 次 |
| `generation_failed` | 记录错误，将 Shot 产出标为 `failed`，允许重试 |
| `model_unavailable` | 排队重试；不可用持续 5 分钟后通知用户 |
| `rate_limited` | 遵守 retry-after 头，继续其他并行任务 |
| `context_overflow` | 通过汇总早期阶段截断上下文，然后重试 |

#### 14.2 工作流级恢复

| 场景 | 恢复 |
|----------|----------|
| Orchestrator 在工作流中途崩溃 | 工作流状态已持久化；从最后一个完成的 agent 恢复 |
| 部分并行失败 | 失败分支重试；成功分支保留 |
| 用户中止工作流 | 所有已完成产物被保存；工作流可恢复 |

---

## 第四部分 — 参考

### 15. Agent 接口

每个 Agent 实现相同的接口契约：

```typescript
interface Agent<I, O> {
  /** Unique agent identifier */
  readonly id: AgentId;

  /** Human-readable name */
  readonly name: string;

  /** Execute the agent's task */
  execute(input: I, context: AgentContext): Promise<AgentResult<O>>;

  /** Validate input before execution */
  validate(input: I, context: AgentContext): ValidationResult;

  /** Estimate cost/tokens before execution */
  estimate(input: I, context: AgentContext): CostEstimate;
}

interface AgentContext {
  projectId: ProjectId;
  userId: UserId;
  workflowRunId: string;
  previousResults: Map<AgentId, AgentResult<unknown>>;
  automationLevel: AutomationLevel;
}

interface AgentResult<T> {
  status: 'success' | 'partial' | 'failed';
  data?: T;
  warnings: AgentWarning[];
  metadata: {
    agentId: AgentId;
    modelUsed: string;
    tokensUsed: number;
    durationMs: number;
    timestamp: string;
  };
}
```

### 16. 自动化级别

每个 Agent 的行为由当前 `AutomationLevel` 调节：

| 级别 | 行为 |
|-------|----------|
| `full_manual` | Agent 提案；人类必须显式批准每一步 |
| `assisted` | Agent 执行；人类评审并可覆盖（默认） |
| `semi_auto` | Agent 执行；仅当置信度低于阈值时人类才评审 |
| `full_auto` | Agent 执行，无人类打断 |

自动化级别可按阶段配置。用户可将 Story 生成设为 `assisted`，同时将视频生成保持为 `full_manual`。

### 17. 按项目的 Agent 配置

每个 Project 存储自己的 Agent 配置，以支持不同创作风格：

```yaml
project:
  id: "proj_abc"
  agent_config:
    story_agent:
      provider: "deepseek"
      model: "<configured-deepseek-model>"
      system_prompt_override: null
      temperature: 0.8
      max_tokens: 8000
    scene_agent:
      provider: "deepseek"
      model: "<configured-deepseek-model>"
      temperature: 0.7
    visual_prep_agent:
      image_provider: "tongyi_wanxiang"
      image_model: "<configured-wanxiang-model>"
      review_required: true
    shot_agent:
      provider: "deepseek"
      model: "<configured-deepseek-model>"
      temperature: 0.6
      default_shot_duration: 5.0
    prompt_agent:
      provider: "deepseek"
      model: "<configured-deepseek-model>"
      temperature: 0.5
      prompt_template_id: "tmpl_cinematic"
    generation_agent:
      provider: "kling"
      model: "kling"
      default_duration: 5
      default_aspect_ratio: "16:9"
      max_concurrent: 3
    review_agent:
      provider: "deepseek"
      model: "<configured-deepseek-model>"
      enabled: true
      auto_fix_minor_issues: true
```
