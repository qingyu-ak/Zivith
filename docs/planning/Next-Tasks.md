# 下一步任务

> 当前实施轨道的工程待办
>
> Status: Active
>
> Synced: 2026-07-31
>
> Priority policy: **Track H 进行中**，分支 `feat/track-h-entity-history`（H3 已完成 → 下一步 H4）。Track H 是 IP Core 基础并继续不间断推进。H4 之后，**Track I**（IP Core 世界实体）与 **Track J**（Creator Chat 向导）排在 Phase 3 生成生产化之前（[ADR-0008](../architecture/adr/0008-zivith-is-an-ai-understandable-ip-creation-system.md)）。**Track K**（世界优先 UI）并行推进；其 K1 无依赖，可立即开始。
>
> Related: [Product-Positioning.md](../product/Product-Positioning.md), [UI-Information-Architecture.md](../product/UI-Information-Architecture.md), [Implementation-Plan.md](Implementation-Plan.md), [Technical-Architecture.md](../engineering/Technical-Architecture.md), [Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md), [IP World Model Repositioning RFC](../architecture/rfc/IP-World-Model-Repositioning-RFC.md)

---

## 当前基线

近期已落地（提交至 `05d078e`）：

- Backend：Mock agents、orchestrator、`MockWorkflowRunner`、generation + shot-prompts + visual-requirements + workflow 路由
- Frontend：项目页上的 [`apps/web/components/workflow-panel.tsx`](../../apps/web/components/workflow-panel.tsx)；镜头编辑器提示词批准 + mock 产出
- Domain：[`packages/domain/src/workflow.ts`](../../packages/domain/src/workflow.ts)

仍为 stub（501）：BYOK 凭证、提供商用量/限额/回调 — 见 [`apps/api/src/routes/stubs.ts`](../../apps/api/src/routes/stubs.ts)。（Workflow SSE 与 visual-requirement generate 已实现。）

---
## Track A — 稳定 WIP（优先做）

目标：在不扩大到真实提供商范围的前提下，使 Mock Story→Video 回路可靠且可审阅。

| ID | 任务 | 原因 | 主要界面 | 状态 |
|----|------|-----|------------------|--------|
| A1 | WorkflowPanel 门禁的手动 E2E 通过 | 确认 story/scene/visual/shot/prompt/video 审阅路径；记录破损 UX | `workflow-panel.tsx`, `workflows.ts`, `mock-runner.ts` | 已完成 2026-07-22 |
| A2 | 加固审阅产物加载 | 候选 media / prompt id 缺失时明确失败；避免静默空网格 | `workflow-panel.tsx`, visual-requirements + shot-prompts APIs | 已完成 2026-07-21 |
| A3 | 面板中的 story / scene / shot 审阅内容 | 今日详细卡片主要存在于 visual/prompt/video；更早门禁仅显示步骤芯片 | `workflow-panel.tsx` | 已完成 2026-07-21 |
| A4 | 启动表单中的自动化控件 | API 接受每阶段自动化；UI 硬编码 `assisted` | `workflow-panel.tsx`, `workflows.ts` | 已完成 2026-07-21 |
| A5 | Shot 页 ↔ 工作流一致性 | 工作流运行后提示词批准 / 生成 / 产出保持同步 | `shots/[shotId]/page.tsx`, `shot-prompts.ts`, `generation.ts` | 已完成 2026-07-21 |
| A6 | 审阅动作回归测试 | 覆盖 approve_all / reject / retry_with_feedback 与必需提示词门禁 | `apps/api/test/mock-workflow-runner.test.ts`, `workflow.test.ts` | 已完成 2026-07-21 |
| A7 | 刷新 / 取消 / 重启 UX 打磨 | 避免卡住的忙碌状态；取消后刷新最新运行；确认重启语义 | `workflow-panel.tsx`, orchestrator cancel | 已完成 2026-07-21 |

**Track A 退出标准：** 一名操作者可启动 brief、走完每个审阅门禁、批准必需视觉资产 + 提示词、收到 mock 视频、中途取消并重启 — 无 console/API 意外。

---

## Track B — 关闭剩余 Phase 2 缺口

在 Track A 退出后进行。

| ID | 任务 | 备注 | 状态 |
|----|------|-------|--------|
| B1 | 为生成任务接线 BullMQ 入队 + worker | Redis → BullMQ；无 Redis → 内存队列 | 已完成 2026-07-21 |
| B2 | 实现 `GET /workflows/:runId/events` SSE | 轮询快照流；WorkflowPanel 订阅 | 已完成 2026-07-21 |
| B3 | 在 API 启动时调用 `recoverInterruptedRuns()` | 从 `server.ts` 调用 | 已完成 2026-07-21 |
| B4 | 轻量生成队列界面 | 项目页 `GenerationQueuePanel` | 已完成 2026-07-21 |
| B5 | 暂停 / 恢复 UX | 已延期 — 取消 + 启动恢复对 MVP 已足够 | 已延期 |

**Track B 退出标准：** Implementation Plan 中 Phase 2 关于队列 UI、SSE 与恢复的复选框从部分完成变为已完成。

---

## Track C — Phase 2.5 首批提供商集成

在 Track B 之后（或明确重新优先级）。

| ID | 任务 | 状态 |
|----|------|--------|
| C1 | Story/Scene/Shot/Prompt agents 的 `DeepSeekAdapter` 结构化输出 | 已完成 |
| C2 | SiliconFlow 图像适配器 + visual prep 接线 | 已完成 |
| C3 | SiliconFlow 视频适配器 + 生成路径 | 已完成 |
| C4 | SiliconFlow 音频 / 对白 TTS + Media | 已完成 |
| C5 | 提供商目录 + 运行时选择 API/UI（保持多厂商选择） | 已完成 |
| C6 | 契约测试（mock fetch） | 已完成 |
| C7 | 按项目 BYOK 凭证存储（替换 stubs） | 稍后 |
| C8 | 用量/成本记录 | 已完成 2026-07-23（首轮 `usage_records`；freeze/limits 稍后） |

**提供商集合（2026-07-21 决策）：** 文本用 DeepSeek；图像 / 视频 / 音频用 SiliconFlow。Mock 仍为无密钥回退。

---
## Track D — 工作流回看与 Visual Prep 深度

在 Track C 核心之后（或与打磨并行）。

| ID | 任务 | 状态 |
|----|------|--------|
| D1 | 点击已完成/当前工作流步骤以**只读**回看产物 | 已完成 2026-07-21 |
| D2 | Visual Prep：Character/Location 上的 LLM 特征草稿 + 按需求生成提示词 | 已完成 2026-07-21 |
| D3 | `POST .../visual-requirements/:rid/generate`（编辑提示词 → 重新生成图像） | 已完成 2026-07-21 |
| D4 | 任意步骤时间旅行回滚 / 重新打开任何已通过门禁 | **未计划** — 从不是一等文档项；使用当前门禁 `reject`/`retry`、实体解冻，或取消+重启 |

**产品说明：** 文档从未把「点击已完成步骤以编辑历史」或完整时间线回滚列为目标。Track D 仅增加**只读回看**。Visual Prep 对齐「特征/生图提示词 → 可审 → 出图」，使用故事 + 已批准场景（不是 Chapter 文件模型）。

---

## Track E — Looser Creative Flow（RFC）

权威来源：[Looser-Creative-Flow-RFC.md](../architecture/rfc/Looser-Creative-Flow-RFC.md)（Accepted 0.2）。

默认线性 Story→Video **保留**。无节点画布；无门禁时间旅行（D4）。

| ID | 任务 | 备注 | 状态 |
|----|------|-------|--------|
| E0 | 接受 / 修订 Looser Creative Flow RFC | 范围锁定 + 节奏（A→B→C） | 已完成 2026-07-23（Accepted 0.2） |
| E1 | Slice A：经 Orchestrator 的作用域 Scene/Shot/视觉重算 | 实现为 [V0.4 plan](../archive/V0.4-Modification-Plan.md) **W4** | 已完成 2026-07-23 |
| E2 | Slice B：资产库图像生成 + Visual Prep 复用 | 资产侧 = V0.4 **W2**（外观变体 + 资产页生成） | 已完成 2026-07-23（W2）；W1 注入锚点 |
| E3 | Slice C：故事分段（有序 Scene 分组） | 领域 ADR 已完成：[ADR-0006](../architecture/adr/0006-story-segments-are-ordered-scene-groupings.md)；实现为 V0.4 **W3** | 已完成 2026-07-23 |

**Track E Slice A 退出标准：** 操作者可重算一个 Scene 的 visual prep（或一个 Shot 的提示词/视频）而无需取消+重启；线性新人路径仍可用。

---
## Track F — V0.4 Modification Plan（首轮已完成）

权威来源：[V0.4-Modification-Plan.md](../archive/V0.4-Modification-Plan.md)（来自 [waoowaoo architecture review](../architecture/review/Zivith-Architecture-Review-Based-on-waoowaoo.md) A1–A7 + ADR-0006）。每行是一条可独立合并的工作流，验收标准见该计划。

| ID | 工作流 | 来源 | 优先级 | 状态 |
|----|------------|--------|----------|--------|
| F1 | W2 Character 外观变体（`asset_appearance_variants`） | Review A1 / RFC Slice B | P0 | 已完成 2026-07-23 |
| F2 | W1 参考图注入流水线（ports + adapters + 提示词契约） | Review A2 — 最大一致性缺口 | P0 | 已完成 2026-07-23 |
| F3 | W3 StorySegment：分段故事草稿 + 每段审阅 + Scene 分组 | ADR-0006 / RFC Slice C | P1 | 已完成 2026-07-23 |
| F4 | W4 作用域重算 API + `workflow_step_attempts` 持久化 | RFC Slice A / Review A3 | P1 | 已完成 2026-07-23 |
| F5 | W5 候选集（count>1 生成 + 挑选 + 无 `previous*` 字段） | Review A5 | P2 | 已完成 2026-07-23 |
| F6 | W6 外置版本化 agent 提示词（`{knowledge_context}` 槽位） | Review A7 | P2 | 已完成 2026-07-23 |
| F7 | W7 用量记录（C8 首轮；freeze/limits 第二轮） | Review A6 / C8 | P3 | 已完成 2026-07-23 |

**Track F 退出标准：** V0.4 计划 §10 完成定义 — 全部 W1–W6 验收项通过，W7 首轮落地，线性新人路径无回归，文档已同步。

---
## Track G — 真实提供商稳定性打磨（已于 2026-07-29 完成）

目标：在 Phase 3 生产化之前，使 SiliconFlow / DeepSeek 生成对日常操作者可靠可用。

| ID | 任务 | 备注 | 状态 |
|----|------|-------|--------|
| G1 | 规范化 SiliconFlow 模型 ID（图像 + 视频） | 大小写敏感 API；Qwen / Wan2.2 | 已完成 2026-07-24 |
| G2 | 顺序视频入队 + worker 并发默认 1 | 避免提供商突发 / 429 | 已完成 2026-07-24 |
| G3 | I2V 优先角色关键帧而非地点 | `orderVisualMediaIdsForVideo` | 已完成 2026-07-24 |
| G4 | 阻止批准失败的占位 media | Visual + appearance 批准 | 已完成 2026-07-24 |
| G5 | UI：每卡片提示词区域内的重跑控件 | WorkflowPanel | 已完成 2026-07-24 |
| G6 | Character **turnaround** 设定表（单张 2×2 图）+ 候选删除 | 取代四次独立正/侧/背/脸生成；保留遗留键 | 已完成 2026-07-24；UX 打磨 2026-07-28 |
| G7 | 手动 E2E：使用真实 SiliconFlow 密钥的 Story→Video | 操作者确认工作流经视频审阅且 Wan 产出可播放；延后按镜头视频生成 | 已完成 2026-07-29 |
| G8 | 按场景审阅（类似故事分段） | Scene.state + WorkflowPanel | 已完成 2026-07-24 |
| G9 | Prompt-draft visual prep + 延后关键帧/视频生成 | 设定表/提示词已草稿；操作者逐个生成 | 已完成 2026-07-24 |
| G10 | Prompt constructPositive 去重 | Action/Environment 重复 | 已完成 2026-07-24 |
| G11 | 四个模型槽位：T2I / I2I / T2V / I2V | Env + Provider 面板；按参考选择 | 已完成 2026-07-24 |
| G12 | 设定表提示词模板强制脸部特写 | 2×2 + 专用脸部面板；自动追加条款 | 已完成 2026-07-24 |
| G13 | 资产列表 → 详情页（无侧栏） | `/projects/:pid/assets/:assetId` | 已完成 2026-07-24 |
| G14 | 将 `cover_image` / `reference_images` 解析为 Media URL | 修复损坏的列表封面（裸 media ID） | 已完成 2026-07-24 |
| G15 | Location 设计设定表草稿 + 生成 API/UI | `POST …/location-sheet/*` | 已完成 2026-07-24 |
| G16 | SiliconFlow 4xx/5xx（50507）时 I2I → T2I 回退 | 带设定表参考的场景关键帧 | 已完成 2026-07-24 |
| G17 | 文档同步（Asset-Model、Next-Tasks、Tech Arch、agents） | 本轮 | 已完成 2026-07-28 |
| G18 | 视频：Wan 提示词折叠 + 跳过临时 CDN I2V + 软轮询 | `wan-video-prompt`、siliconflow-video、generation service | 已完成 2026-07-29 |
| G19 | 将生成图像持久化到 MinIO（不只是 SF 临时 URL） | 关键帧 / 设定表 / 地点设定表 | 已完成 2026-07-29 |
| G20 | Provider 面板：显示 SiliconFlow 余额告警 | `/providers` + ProviderPanel | 已完成 2026-07-29 |
| G21 | 视频失败不自动重提（约 ¥2/Wan） | 去掉 I2V→T2V 自动回退；`video_generate` BullMQ attempts=1；生成前确认 | 已完成 2026-07-29 |

**Track G 退出标准：** 已满足 — 真实图像 + 视频在已文档化模型 ID 下成功；失败占位不能通过审阅；模型规范化 + I2V media 顺序单测通过；角色/地点设定表可生成并显示为列表封面；2026-07-29 确认手动 Story→Video E2E 产出可播放。

**操作者说明（G7 之后）：**

1. 若 Wan 任务长时间停留在 `InQueue`，请为 SiliconFlow 充值
2. 不要连点「生成本镜头视频」— 每次确认点击约 ¥2 并入队一个 Wan 任务
3. 失败视频**不会**自动重试；仅通过显式按钮重新生成
4. 优先使用 MinIO 持久化媒体；SF 临时 CDN URL 会过期，不适合 I2V

---
## Track H — Entity + State + Timeline + Track（在 `feat/track-h-entity-history` 上进行中）

目标：建立不可变 Entity State 演化，再在以 Presentation 为主的 Timeline 上可视化。World Time 默认跟随 Presentation 顺序，仅在偏离时增加可变的项目自定义绑定。此工程待办「Track H」不是 TimelineTrack。来源：[Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md)。写路径清单：[entity-history-write-paths.md](../architecture/entity-history-write-paths.md)。

| ID | 任务 | 备注 | 状态 |
|----|------|-------|--------|
| H0 | 修订架构、ADR、IDE RFC 与 Agent Effort RFC | Track=语义泳道；Branch 分离 | 已完成 2026-07-29 |
| H1 | 规范 Entity 快照 + ChangeEvent schemas | `@zivith/domain` `history/*`；Shot/PromptVersion/Output/AppearanceVariant/VisualRequirement；ADR-0007 Accepted | 已完成 2026-07-30 |
| H2 | EntityRevision/ChangeEvent 表与基线回填 | Prisma 表 + `backfillEntityBaselines`；无读路径切换 | 已完成 2026-07-30 |
| H3 | 先影子写再事务性 State 双写 | 功能开关默认 **关**；经 env 按 Entity 使用 `shadow` / `dual` | 已完成 2026-07-30 |
| H4 | 只读 Presentation Timeline | 导入既有 Scene/Shot 顺序；World Time 默认跟随 | 计划中 |
| H5 | 最小 Scene/Character/Shot Track UI | 首发无高级 track 或编辑 | 计划中 |
| H6 | 可变 WorldTime 绑定 | 自定义维度、模糊/区间/相对/平行时间 | 计划中 |
| H7 | 高级派生 Track 投影 | 先 Camera/Prompt/Model；Style 稍后 | 计划中 |
| H8 | Object/Event/Organization Entity 扩展 | **已被 Track I 取代** — 世界实体扩展现有独立的分片门禁轨道 | 已取代 2026-07-31 |
| H9 | AI 一致性建议 | 跨 State/时间绑定检查；需人工确认。**Lore Keeper Agent 的第一片**（[AI-Agent-Collaboration.md §3](../domain/AI-Agent-Collaboration.md)）— 仅提议，从不静默修复 | 计划中 |
| H10 | CreativeBranch 评估 | 仅稍后；不是 Timeline Track 依赖 | 已延期 |

**Track H 退出标准：** 架构验收条件通过；Presentation Time 仍为稳定主轴；缺失 World Time 绑定时跟随主轴且无重复存储；自定义维度保持不透明；Track 不意味着 Branch；Timeline 移动不能静默变更 Entity State；既有资源 API 保持兼容。

---
## Track I — IP Core 世界实体（受 H4 门禁）

目标：让 AI 理解持续发展的世界。来源：[IP World Model Repositioning RFC](../architecture/rfc/IP-World-Model-Repositioning-RFC.md) §5 能力节奏；定位：[Product-Positioning.md](../product/Product-Positioning.md)。

**本轨道每次推进一块。** 上一块未从真实项目产出晋级证据（而非假设）之前，下一块不得开始。这是防止领域模型膨胀为杂物袋的主要防线。

| ID | 任务 | 备注 | 状态 |
|----|------|-------|--------|
| I0 | `WorldEvent` 进入领域契约的 ADR | 所有权、字段、与 `ChangeEvent` 的边界、继承参与（预期无） | 计划中 — 阻塞 I1 |
| I1 | `WorldEvent` 只读建模 | 项目级：发生时间、受影响 Entity、前置条件、后果。挂在 Presentation Timeline 的事件 track 上 | 计划中 |
| I2 | `Relationship` 可查询性 | Entity State 上的结构化字段；回答「该 Character 在此刻的全部关系」。**无新表** | 计划中 |
| I3 | ADR + `Organization` 实体；有条件晋级 `Relationship` | 仅当 I2 暴露出 State 字段无法回答的跨实体查询时才晋级 | 计划中 |

**晋级证据：**

- I1 → I2：创作者无需提示即创建 `WorldEvent`，且 Timeline 能回答「这个世界处于什么阶段」。
- I2 → I3：出现 State 字段无法服务的真实跨实体关系查询。

**护栏：** `WorldEvent` 不得与 `ChangeEvent` 合并。`Scene` 不得被重新定义为世界地点。无 `IP` 实体。I1 中 `WorldEvent` 为只读 — 不被 `Shot` 引用，也不参与继承解析，使回滚限定在一张表。

---
## Track J — Creator Chat 引导向导（可与 Track I 并行）

目标：让首次创作者从「我想创建一个东方奇幻世界」开始，而不是从 `Story` 编辑器开始。由 [ADR-0010](../architecture/adr/0010-creator-chat-is-a-guided-world-creation-wizard.md) 划界。

| ID | 任务 | 备注 | 状态 |
|----|------|-------|--------|
| J1 | 向导流程 + 意图 schema | 有界步骤：世界背景 → 力量体系 → 主角 → 核心冲突。**World Builder Agent**（[AI-Agent-Collaboration.md §2](../domain/AI-Agent-Collaboration.md)） | 计划中 |
| J2 | 结构化草稿生成：`Project` + `Character` | 全部输出进入 `draft`；每步映射到既有或新 API 操作（P3）。落地 World Builder 输入契约反转，世界 → 制作（[§2.2](../domain/AI-Agent-Collaboration.md)） | 计划中 |
| J3 | 将草稿扩展到 `Location` + Relationship | 跟随 Track I 可用性 | 计划中 |
| J4 | 交接至 Studio | 向导终止；创作者在结构化工作区继续 | 计划中 |

**退出标准：** 每个向导产物都是通过既有审阅门禁的结构化 `draft` 实体；对话日志不作为创作产物存储；不绕过任何强制门禁；每次生成携带溯源与预算归属。

**绊线（任一即暂停本轨道以重新审阅）：** 产物未经门禁进入下游工作；向导变成永久通用聊天面或独立聊天首页；对话日志被版本化或导出为创作数据；向导发出 `approved` 对象；创作者之后未进入结构化工作区。

**不属于本轨道：** [Director Copilot](../architecture/rfc/Director-Copilot-RFC.md)。那是已有世界的项目级咨询侧栏，Phase 3+，先只读。其范围锁定不因 Track J 改变。

---
## Track K — 世界优先 UI 信息架构

目标：打开 Project 时，创作者首先看到世界。来源：[UI Information Architecture](../product/UI-Information-Architecture.md)；布局契约：[AI Creative IDE RFC](../architecture/rfc/AI-Creative-IDE-RFC.md)。

今日项目首页打开即是 `ProviderPanel` 与 `UsageSummaryCard` — 模型选择器与用量统计占据前两屏，且任何界面都无法回答「这个世界处于什么阶段」。本轨道反转这一点。

| ID | 任务 | 备注 | 状态 |
|----|------|-------|--------|
| K1 | 项目首页变为 World Overview | 将 `ProviderPanel` + `UsageSummaryCard` → `/settings`，`WorkflowPanel` + `GenerationQueuePanel` → `/production`；重命名并扩展侧栏导航 | 计划中 — **无依赖，可立即开始** |
| K2 | `/world` 工作区，IDE RFC Slice A | Explorer + Inspector + 只读 Presentation Timeline；仅 Scene/Character/Shot Tracks | 计划中 — 受 **H4** 门禁 |
| K3 | Creator Chat 路由 `/projects/new` | 向导产出 `draft` 实体，再交接至 World Overview | 计划中 — 受 Track J 门禁 |
| K4 | World View / Production View 切换 | **一条** Timeline 的两种视图；世界视图上有 `WorldEvent` 与 Relationship | 计划中 — 受 Track I 门禁 |

**Timeline 决策（2026-07-31）：** World View 与 Production View 是单一 `ProjectTimeline` 的两种投影，不是两条持久化时间线。独立世界轴需要全局可排序的世界年表 — 这正是 [ADR-0007](../architecture/adr/0007-preserve-current-state-with-immutable-creative-history.md) 放弃的，因为虚构历法、模糊时段与平行世界无法合并为一条序列。ADR-0007 保持不变；无需新 ADR。工作流运行与生成任务完全不在 Timeline 上 — 执行时间是第三种时间，位于 `/production`。

**护栏：** 在替换达到对等前不删除既有路由（IDE RFC §9）。本轨道无 Director Console — 槽位预留，Phase 3+。每个 UI 动作映射到 API 命令（P3）。`WorkflowPanel` 搬迁后每个强制门禁仍存活（P6）。此处不产生新领域实体；Track K 渲染 Track H 与 Track I 提供的内容。

---

## 建议工作顺序
```text
A1 → A2 → A5 → A3 → A4 → A6 → A7
              ↓
         Track A exit
              ↓
         B1 → B2 → B3 → B4 → (B5?)
              ↓
         Track B exit → Phase 2 closed
              ↓
         C1…C6 (Phase 2.5 core) → C7/C8 later
              ↓
         D1…D3 (revisit + visual depth) — D4 not planned
              ↓
         E0 RFC accepted (2026-07-23) + ADR-0006
              ↓
         Track F (V0.4 plan): F1 W2 → F2 W1 → F3 W3 → F4 W4 → F5 W5 → F6 W6 → F7 W7
              ↓
         Track G (provider stability polish) ✓ 2026-07-29
              ↓
         Track H (IP Core foundation): H0 ✓ → H1 ✓ → H2 ✓ → H3 ✓ → H4… on feat/track-h-entity-history
              ↓
         Track I (world entities): I0 ADR → I1 → [evidence] → I2 → [evidence] → I3
              ↓          ╲
              │           ╲ Track J (Creator Chat wizard): J1 → J2 → J3 → J4
              │           ╱   may run in parallel
              ↓          ╱
         Phase 3 (generation productionize) — now after IP Core, per ADR-0008

   Track K (world-first UI) runs alongside, each step gated on its supply:
         K1 (no dependency, start anytime) → K2 (after H4) → K3 (after Track J) → K4 (after Track I)
```

Track H 不因重新定位而中断：它已经是 IP Core 基础，H4 仍是下一步工程动作。**K1 是唯一没有上游依赖的项** — 可立即单独开始，并本身消除旧定位的最差症状：打开项目先看到模型选择器，而不是世界。

---

## 稍后才进入范围

- 完整 Asset 分类（Prop / Style / Knowledge）— Phase 4
- 生产限流 / Review Agent 打磨 — Phase 3
- Staging 云部署 — Phase 0 遗留，不阻塞 Track A
- Director Copilot 侧栏 — 见 [Director-Copilot-RFC.md](../architecture/rfc/Director-Copilot-RFC.md)；Phase 3+，v1 仅问答
- 在 2026-07-21 归档轮次之外重命名历史设计文档
- **任意工作流步骤时间旅行回滚** — 未文档化为交付物；见 Track D4
- **节点式工作流画布作为主 UX** — Constitution D3；见 Looser Creative Flow RFC 非目标
- **无持久化 `StorySegment` 行的故事分段 UI** — ADR-0006 合规规则（ADR 本身已解决）
- **顶层 Chapter 实体 / 跨项目全局资产库 / 口型同步 / 时间线编辑器** — V0.4 计划 §9 明确非目标
- **视频/音频非线性时间线编辑器仍不在范围内。** 拟议的 Project Timeline 遵循 Presentation 顺序并叠加可选 World Time 偏离；它不是 ChangeEvent 历史，也不是 NLE。
- **`Skill` 作为持久化实体** — ADR-0009；Skill 是能力层名称，从不是表、类型或外键
- **`Project` 之上的 `IP` 实体** — ADR-0008；Project *即是* IP
- **通用或工作室全局聊天面** — ADR-0010 将 Creator Chat 限制为有界入门向导
- **基础 / 视频 / 图像 / 音频模型训练、专业 NLE、3D 引擎** — Constitution §9.7；属于提供商与扩展领地

---

## 如何更新本文件

当任务交付时：

1. 将行标为已完成或删除
2. 同步 [Implementation-Plan.md](Implementation-Plan.md) 中对应复选框
3. 若阶段 % 变化，刷新 [README.md](../README.md) 中的状态表