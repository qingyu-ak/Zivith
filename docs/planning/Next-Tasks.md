# 下一步任务

> 当前实施轨道的工程待办
>
> Status: Active
>
> Synced: 2026-08-16
>
> Priority policy: **创造层 v1 已闭环**（2026-08-16 合并进 `main`）。H6 可变世界时间绑定、H7 派生 Track（Camera/Style/Prompt/Model，只读投影）已落地。下一步：I3 `Organization`（需真实项目晋级证据，不随计划启动）；Phase 3 生成生产化继续后移（[ADR-0008](../architecture/adr/0008-zivith-is-an-ai-understandable-ip-creation-system.md)）。
>
> Related: [Product-Positioning.md](../product/Product-Positioning.md), [UI-Information-Architecture.md](../product/UI-Information-Architecture.md), [Implementation-Plan.md](Implementation-Plan.md), [Technical-Architecture.md](../engineering/Technical-Architecture.md), [Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md), [IP World Model Repositioning RFC](../architecture/rfc/IP-World-Model-Repositioning-RFC.md)

---

## 当前基线

创造层 v1 已闭环（2026-08-16 合并进 `main`）：

- Backend：世界线 / WorldEvent / Relationship / Creator Chat 路由（[`apps/api/src/routes/world.ts`](../../apps/api/src/routes/world.ts)）；World Builder Agent + 冲突检测（H9 v1，只报告不修复）+ 提案应用（`apply-intent`，全部 `draft` + 幂等键）；`entity_revisions` / `change_events` / `project_sequences` 表 + 双写助手（per-Entity 开关默认关）
- Frontend：`/` Creator Chat 默认页（无登录，浅色独立对话壳 + 可收起历史侧栏）；`/projects/:id/world` 三栏世界工作区（Explorer / 世界线 / Inspector 可编辑 + 冲突列表 + 「在对话中继续」）；Inspector 可编辑世界时间绑定与时间维度；`/production` 与 `/settings` 承接原工作流与提供商面板
- Domain：[`packages/domain/src/history/*`](../../packages/domain/src/history/) 快照与 ChangeEvent schema；WorldEvent / Relationship / Timeline Track/Item schema；H6 `TemporalDimension` + `WorldTimeBinding` 信封
- Database：`20260804000000_creator_layer_world` 迁移（world_events / relationships / project_timelines / timeline_tracks / timeline_items / creator_chat_threads / creator_chat_messages）；`20260816000000_h6_world_time_binding`（`temporal_dimensions` / `world_time_bindings`）；`Project.worldview` Json（K5 世界观单点表示）

仍为 stub（501）：BYOK 凭证、提供商用量/限额/回调 — 见 [`apps/api/src/routes/stubs.ts`](../../apps/api/src/routes/stubs.ts)。

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
## Track H — Entity + State + Timeline + Track（H4/H5 转 `feat/creator-layer-first` 世界线视图优先）

目标：建立不可变 Entity State 演化，再在以 Presentation 为主的 Timeline 上可视化。World Time 默认跟随 Presentation 顺序，仅在偏离时增加可变的项目自定义绑定。此工程待办「Track H」不是 TimelineTrack。来源：[Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md)。写路径清单：[entity-history-write-paths.md](../architecture/entity-history-write-paths.md)。

| ID | 任务 | 备注 | 状态 |
|----|------|-------|--------|
| H0 | 修订架构、ADR、IDE RFC 与 Agent Effort RFC | Track=语义泳道；Branch 分离 | 已完成 2026-07-29 |
| H1 | 规范 Entity 快照 + ChangeEvent schemas | `@zivith/domain` `history/*`；Shot/PromptVersion/Output/AppearanceVariant/VisualRequirement；ADR-0007 Accepted | 已完成 2026-07-30 |
| H2 | EntityRevision/ChangeEvent 表与基线回填 | Prisma 表 + `backfillEntityBaselines`；无读路径切换 | 已完成 2026-07-30 |
| H3 | 先影子写再事务性 State 双写 | 功能开关默认 **关**；经 env 按 Entity 使用 `shadow` / `dual` | 已完成 2026-07-30 |
| H4 | 只读 Presentation Timeline | 导入既有 Scene/Shot 顺序；World Time 默认跟随；**2026-08-04 起以世界线视图优先落地**（非均匀刻度 + 轨道化）；**2026-08-05 世界线 v1 已落地（`/projects/:id/world`）** | **已完成 v1（2026-08-05）** — Production 视图后续 |
| H5 | 最小 Track UI（世界线优先） | v1 先 event/character/scene 轨道；**2026-08-14** 补地点轨、事件标题刻度、角色按 `character_ids` 锚定事件、地点按场景 `location_id` 锚定、世界时间偏离可见（信封 label 原样展示，不改写呈现主轴）；首发无拖拽编辑 | **已完成 v1（2026-08-05）+ 2026-08-14 细化** — 高级 track/编辑后续 |
| H6 | 可变 WorldTime 绑定 | 自定义维度、模糊/区间/相对/平行时间；核心只校验信封，不解释历法值 | **已完成（2026-08-16）** |
| H7 | 高级派生 Track 投影 | Camera/Style/Prompt/Model 只读投影 | **已完成 v1（2026-08-16）** — 制作视图投影，不落库 |
| H8 | Object/Event/Organization Entity 扩展 | **已被 Track I 取代** — 世界实体扩展现有独立的分片门禁轨道 | 已取代 2026-07-31 |
| H9 | AI 一致性建议 | 跨 State/时间绑定检查；需人工确认。**Lore Keeper 第一片（2026-08-13）**：规则检测同名、关系自指/对向循环、事件顺序撞车、题材偏离、极性事实矛盾；`GET /world/projects/:id/resources.conflicts` + Creator Chat「检查设定冲突」；**只报告，从不静默修复**。后续：跨修订 State、发现驳回持久化、`Asset(type=knowledge)` 策展 | **已完成 v1（2026-08-13）** — 修订级/知识策展后续 |
| H10 | CreativeBranch 评估 | 仅稍后；不是 Timeline Track 依赖 | 已延期 |

**Track H 退出标准：** 架构验收条件通过；Presentation Time 仍为稳定主轴；缺失 World Time 绑定时跟随主轴且无重复存储；自定义维度保持不透明；Track 不意味着 Branch；Timeline 移动不能静默变更 Entity State；既有资源 API 保持兼容。

---
## Track I — IP Core 世界实体（受 H4 门禁）

目标：让 AI 理解持续发展的世界。来源：[IP World Model Repositioning RFC](../architecture/rfc/IP-World-Model-Repositioning-RFC.md) §5 能力节奏；定位：[Product-Positioning.md](../product/Product-Positioning.md)。

**本轨道每次推进一块。** 上一块未从真实项目产出晋级证据（而非假设）之前，下一块不得开始。这是防止领域模型膨胀为杂物袋的主要防线。

| ID | 任务 | 备注 | 状态 |
|----|------|-------|--------|
| I0 | `WorldEvent` 进入领域契约的 ADR | 所有权、字段、与 `ChangeEvent` 的边界、继承参与（预期无） | **已完成 2026-08-04（[ADR-0011](../architecture/adr/0011-world-event-is-a-domain-creative-entity.md)）** |
| I1 | `WorldEvent` 建模 + 落库（draft） | 项目级：世界时间信封、受影响 Entity、前置条件、后果；v1 只读 + 创建 draft，不参与 Shot 依赖与继承解析；挂世界线视图事件轨道 | **已完成 2026-08-05**（建模 + draft 落库 + 世界线事件轨道；`verify-proposal-flow` 48 项 E2E 断言全过） |
| I2 | `Relationship` 可查询性 | **晋级为独立实体（[ADR-0012](../architecture/adr/0012-relationship-is-an-independent-queryable-entity.md)）**：独立表、多态 EntityRef、directed/undirected、可选世界时间有效期；`GET /projects/:pid/relationships`；v1 不做 `at=` 回溯 | **已完成 2026-08-05**（独立表 + 多态 EntityRef + 查询面 + 世界线关系连线；`at=` 回溯后续） |
| I3 | ADR + `Organization` 实体 | 晋级证据不变；`Relationship` 晋级已由 ADR-0012 提前完成 | 计划中（后续） |

**晋级证据：**

- I1 → I2：创作者无需提示即创建 `WorldEvent`，且 Timeline 能回答「这个世界处于什么阶段」。**触发条件已由创造层实现满足**（世界线关系层 + 对话确认落库需要跨实体查询，[ADR-0012](../architecture/adr/0012-relationship-is-an-independent-queryable-entity.md)）。
- I2 → I3：出现 State 字段无法服务的真实跨实体关系查询。**I3（`Organization`）仍需真实项目证据，不随本计划启动。**

**护栏：** `WorldEvent` 不得与 `ChangeEvent` 合并（ADR-0011 硬边界）。`Scene` 不得被重新定义为世界地点。无 `IP` 实体。I1 中 `WorldEvent` 只读 + 创建 draft — 不被 `Shot` 引用，也不参与继承解析，使回滚限定在一张表。时间一律用世界时间信封（opaque），不做真实时间轴换算。

---
## Track J — Creator Chat 持续对话 agent（可与 Track I 并行）

目标：让创作者从「我想创造一个东方玄幻世界」开始——打开应用即进入 Creator Chat（`/`，无登录门禁），以 Codex 风格持续对话确认世界、角色、场景、事件与关系；确认「创建世界」提案即自动创建 `Project` 并绑定线程，后续提案全部挂到该世界。由 [ADR-0010](../architecture/adr/0010-creator-chat-is-the-world-first-continuous-conversation-surface.md) 划界（2026-08-04 修订：持续对话面取代一次性向导；本地单用户 [ADR-0013](../architecture/adr/0013-local-single-user-mode-no-login.md)）。

| ID | 任务 | 备注 | 状态 |
|----|------|-------|--------|
| J1 | 会话运行时 + World Builder Agent | `creator_chat_*` 表（**无 userId**）；`world-builder-agent` + 中英双语文案；mock 分支可演示落库（[AI-Agent-Collaboration.md §2](../domain/AI-Agent-Collaboration.md)） | **已完成 2026-08-05**（会话运行时 + Agent + mock 落库 E2E） |
| J2 | 提案 → 确认 → 落库 | `apply-intent` 按 kind 分发既有 service（project/character/location/world_event/relationship）；全部 `draft`；幂等键 `message_id + proposal_key`；确认「创建世界」自动建 Project 并回绑线程 | **已完成 2026-08-05**（提案→确认→落库 + 幂等 + 自动建世界；错误路径 400/409 覆盖） |
| J3 | 世界知识上下文 + 世界状态面板 | `buildWorldContext` 聚合 project/stories/assets/world_events/relationships → prompt 插槽；**2026-08-06** 曾在聊天右侧展示世界摘要；**2026-08-13** Creator Chat 改为简洁对话面（类 DeepSeek），世界摘要/冲突改由 Studio 副驾驶承担；**2026-08-14** 浅色独立对话壳 + 可收起历史侧栏，Studio 左栏与世界工作区左右栏可收起 | **已完成**；展示面 2026-08-13 收束到 Studio |
| J4 | 与结构化工作区联动 | 右侧面板/实体跳转 `/projects/[pid]/world`；对话与 Studio 双向可达。**2026-08-14**：Studio 选中实体「在对话中继续」打开该项目最近线程并立刻交接一轮（关注点只进 agent 上下文） | **已完成 2026-08-05**；**2026-08-14** 选中实体继续对话 |

**退出标准：** 每个落库动作都有可观测的用户确认记录；产物一律为通过既有 review gate 的结构化 `draft` 实体；对话记录不作为创作产物存储、不进领域模型、不参与导出；不绕过任何强制门禁；每次生成携带 usage 埋点与 provenance（P7）。

**绊线（任一即回滚该能力并重新评审）：** 未经确认的落库；产物未经 gate 进入下游；会话记录被纳入创作层导出或版本化；结构化工作区不可达。

**不属于本轨道：** [Director Copilot](../architecture/rfc/Director-Copilot-RFC.md)。那是已有世界的项目级咨询侧栏，Phase 3+，先只读。其范围锁定不因 Track J 改变。

**后续迭代（不阻塞 J1–J4）：** chat SSE 流式 **已落地 2026-08-13**；冲突检测 **已落地 v1 2026-08-13**；智能体主动引导 **已落地 v1 2026-08-13**（缺口检测：世界观/主角/关系/地点/事件/剧情节奏；「继续」只提问不建实体）；创作线转换（15 秒镜头提示词）。

---
## Track K — 世界优先 UI 信息架构

目标：打开 Project 时，创作者首先看到世界。来源：[UI Information Architecture](../product/UI-Information-Architecture.md)；布局契约：[AI Creative IDE RFC](../architecture/rfc/AI-Creative-IDE-RFC.md)。

今日项目首页打开即是 `ProviderPanel` 与 `UsageSummaryCard` — 模型选择器与用量统计占据前两屏，且任何界面都无法回答「这个世界处于什么阶段」。本轨道反转这一点。

| ID | 任务 | 备注 | 状态 |
|----|------|-------|--------|
| K1 | 项目首页变为 World Overview | 将 `ProviderPanel` + `UsageSummaryCard` → `/settings`，`WorkflowPanel` + `GenerationQueuePanel` → `/production`；重命名并扩展侧栏导航 | **已完成 2026-08-05**（World Overview：项目名 + 「本地创作」徽标 + 「去创作对话」入口 + 分区导航；`/production` `/settings` 承接原面板只搬不移；侧栏新增 制作/设置；浏览器回归 5 页全过） |
| K2 | `/world` 工作区，IDE RFC Slice A | **左中右三栏（2026-08-04 设计）**：左实体 Explorer（世界观/角色/场景/事件）、中时间线主体 + 副驾驶 agent 面板、右 Inspector；**2026-08-14** 左右栏可收起；**2026-08-14 世界线细化**：地点轨 + 事件刻度标题 + 角色/地点锚定 + 世界时间偏离标记；**2026-08-05 v1 只读已落地**；**2026-08-13 Inspector 内联编辑**；**2026-08-13 副驾驶展示 `resources.conflicts`（H9 v1）** | 已完成 v1 + Inspector 可编辑 + 冲突列表 + 左右栏可收起 + 世界线细化 |
| K3 | Creator Chat 为应用默认页 `/` | 无登录门禁；对话产出 `draft` 实体；Chat 为独立浅色壳，Studio 左栏「创作聊天」可达 | **已完成 2026-08-05**；**2026-08-13 ADR-0013 API 闭环**；**2026-08-14** 可收起历史侧栏 |
| K4 | World View 先行 | **一条** Timeline 的两种视图；**2026-08-05 世界视图 v1 已落地**（非均匀刻度 + 轨道化 + 关系连线），**2026-08-06 Production 视图 v1**（世界/制作 tab；故事 + 场景轨道），**2026-08-13 Shot 轨道**：镜头嵌在所属场景刻度区间，Inspector 只读 + 跳转镜头编辑器 | **已完成 v1 + Shot 轨道（2026-08-13）** |
| K5 | 世界观 Chat→Studio 核心闭环 | 世界观自动识别 → 落库 → Studio 展示：`Project.worldview Json`（genre/premise/rules/notes，additive 迁移）+ mock/LLM 自动提炼（`update_entity` type='project'）+ resources 返回 worldview/stage + chat header 常驻「进入 Studio」入口 | **已完成 2026-08-05**（愿景核对报告：Chat 引导/Studio 三栏/实体列表/timeline/Inspector 均已对齐；补齐世界观单点表示与识别、副驾驶摘要） |

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
         Track H (IP Core foundation): H0–H3 ✓ → H4/H5 ✓ v1 (world-line first) → H9 ✓ v1 → H6 ✓ → H7 ✓ v1
              ↓
         Track I (world entities): I0 ✓ (ADR-0011) → I1 ✓ → I2 ✓ (ADR-0012 晋级) → [evidence] → I3
              ↓          ╲
              │           ╲ Track J (Creator Chat continuous conversation): J1 ✓ → J2 ✓ → J3 ✓ → J4 ✓
              │           ╱
              ↓          ╱
         Phase 3 (generation productionize) — continues to defer, per ADR-0008

   Track K (world-first UI) runs alongside, each step gated on its supply:
         K1 ✓ 2026-08-05 → K2 ✓ (world workspace v1, after H4 world-line first) → K3 ✓ 2026-08-05 (default page `/`, after Track J) → K4 ✓ (World View first, after Track I) → K5 ✓ 2026-08-05 (世界观 Chat→Studio 核心闭环)
```

创造层优先计划（2026-08-04）已把 H4/H5、Track I、Track J（重写为持续对话）、Track K 串入同一分支 `feat/creator-layer-first`：先 IP 核心数据库 + Creator Chat，再世界线视图。2026-08-16 创造层 v1 闭环并合并进 `main`。生产制作功能（Story→Shot、Provider、usage）只搬不移、保持可用。

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
- **把对话记录当作创作产物导出/版本化** — ADR-0010 围栏：对话记录只是会话工作底稿，创作宇宙的唯一表示形式是结构化实体
- **基础 / 视频 / 图像 / 音频模型训练、专业 NLE、3D 引擎** — Constitution §9.7；属于提供商与扩展领地

---

## 如何更新本文件

当任务交付时：

1. 将行标为已完成或删除
2. 同步 [Implementation-Plan.md](Implementation-Plan.md) 中对应复选框
3. 若阶段 % 变化，刷新 [README.md](../README.md) 中的状态表