# Zivith Architecture Review Based on waoowaoo

> 同领域开源项目架构评审 — [waooAI/waoowaoo](https://github.com/waooAI/waoowaoo)（13.3k stars, MIT-like license, Next.js 单体）
>
> Version: 0.1
>
> Status: Review — 供 V0.4 规划与 Track E / C7 / C8 决策参考
>
> Reviewed: 2026-07-23（基于 waoowaoo main 分支 v0.4.1 时点的公开代码结构，未复制任何代码）
>
> Related: architecture-principles.md, Asset-Model.md, AI-Agent-Collaboration.md, Looser-Creative-Flow-RFC.md, Next-Tasks.md

---

## 第一部分：waoowaoo 架构分析

### 1. 项目定位

**「小说 → 短剧/推文视频」的一站式成片工具**。整个产品只有一条产品模式（数据模型即名为 `NovelPromotion*`）：输入小说文本，自动产出带配音、口型、剪辑时间线的完整竖屏视频。宣传语「工业级全流程」指的是**生产吞吐量**，不是创作深度——它是一条产线，不是一个工作空间。

### 2. 核心用户

短剧 / 小说推文商业化创作者（个人或小团队），目标是**日更式量产**：默认 9:16 竖屏、720p、按集（Episode）组织、TTS 语速默认 +50%。用户自带 API Key（OpenRouter / FAL / 火山 / 阿里百炼），平台内置余额与计费体系。

### 3. 解决了什么问题

- 从小说文本到成片的**全自动流水线**（剧本分析→分镜→图→视频→配音→剪辑）
- 量产场景下的**角色/场景视觉一致性**（详见 7/8）
- 长流程的**断点续跑与失败重试**（GraphRun 检查点机制）
- 多供应商模型的**成本核算与预算控制**（余额冻结 + 幂等流水）

### 4. 整体技术架构

| 层 | 选型 |
|----|------|
| 应用 | **Next.js 15 单体**：App Router API routes、React 19 前端、workers 同仓同进程模型 |
| 数据库 | MySQL + Prisma（单一 schema，约 40 个模型） |
| 队列 | Redis + BullMQ；`Task`/`TaskEvent` 表持久化任务态（dedupeKey、attempt、heartbeat、billing） |
| 存储 | MinIO/S3；`MediaObject` 统一媒体表（sha256、storageKey、尺寸时长元数据） |
| 模型接入 | 用户级 BYOK（加密存 DB）；**每能力一个模型字段**：analysisModel / characterModel / locationModel / storyboardModel / editModel / videoModel / audioModel / lipSyncModel / voiceDesignModel，另有每类并发上限 |
| 认证/计费 | NextAuth；UserBalance + BalanceFreeze（预冻结）+ BalanceTransaction（幂等流水）+ UsageCost（每次 API 调用记账） |

### 5. AI 生成流程

```text
小说文本
  → episode_split（按集切分）
  → Clip（剧情片段；screenplay_conversion 转结构化剧本）
  → agent_storyboard_plan（Clip → panels JSON：每 ~15 字 1 镜，
      强制 characters[{name, appearance, slot}] 从资产库精确选名）
  → agent_storyboard_detail / agent_cinematographer / photography_rules
      （光照方向、screen_position、posture、景深、色调 → 结构化 JSON）
  → Panel 出图（带标签参考图注入 + 原文交叉验证 prompt）
  → Panel 出视频（normal / 首尾帧两种模式）+ lip sync（口型）
  → voice_analysis → VoiceLine（TTS，按 SRT 与 Panel 对齐 matchedPanelId）
  → VideoEditorProject（时间线 JSON + 渲染任务 → 成片）
```

人的参与方式：**没有审核门禁**。人以「逐 artifact 操作」介入——每张图有候选数组 + `selectedIndex`、`previous*` 撤销字段、按提示词重生成、修图模型局部改。流程不会等人，人随时改结果。

### 6. 数据模型设计

- `Project` 1:1 `NovelPromotionProject`（产品即单模式）
- 主链：`Episode → Clip → Storyboard → Panel`；Panel 是**去范式化巨表**（40+ 字段：imagePrompt/imageUrl/imageHistory/videoPrompt/videoUrl/lipSync/sketch/actingNotes/photographyRules/previous*…）
- 角色：`NovelPromotionCharacter → CharacterAppearance[]`（**多形象**，`appearanceIndex` + `changeReason` 表达剧情状态变化，如换装/受伤/成长；每形象有候选图数组 + 选中索引 + 撤销字段）
- 场景：`NovelPromotionLocation → LocationImage[]`（多图 + `availableSlots` **可站位锚点** + `isSelected`）
- 媒体：`MediaObject` 统一表 + `LegacyMediaRefBackup`（从 URL 字段迁移的备份审计表）
- 执行：`GraphRun / GraphStep / GraphStepAttempt / GraphEvent / GraphCheckpoint / GraphArtifact` —— 一套**持久化图执行引擎**（lease + heartbeat 抢占、按 nodeKey 的版本化 checkpoint、seq 单调事件流、attempt 级 inputHash 幂等 + provider/usage 记录）
- 大量 JSON 以 `String @db.Text` 存字符串，弱结构；版本历史靠 `previousXxx` 平行字段而非历史表

### 7. 人物一致性方案

**三层：资产锚定 → 名字绑定 → 出图注入。**

1. **多形象资产锚定**：一个角色按剧情状态维护多个 Appearance，每个形象先生成并人工选定一张锚定图（candidate → selected）
2. **分镜阶段名字绑定**：`agent_storyboard_plan` 强制 `characters: [{name, appearance}]` 必须与资产库完全一致；prompt 明令「禁止身份称呼（母亲/父亲），必须用资产库名字」「禁止主观情绪词，只写可视化动作」
3. **出图阶段参考注入**：选定形象图作为**带文字标签的参考图**输入图像模型；prompt 规定「参考图标签仅供识别、禁止画入」「角色风格线条色彩必须匹配参考图」；另有 reference-to-character（上传照片→角色 sheet）与 editModel 局部修图兜底

### 8. 场景一致性方案

- Location 多图 + `available_slots`（可站位置文字锚点）；分镜 plan 要求 slot **完整复制原文**，禁止缩写改写
- `photography_rules` 结构化约束：光照方向、角色 screen_position（左/中/右）、posture、景深、色调
- prompt 规定「场景参考图仅参考构图布局与氛围，必须按镜头角度重绘，禁止贴图当背景」
- 人物连续性规则写进分镜 prompt：进场后不许凭空消失、按景别决定需交代哪些在场角色（特写/反打可省略）

### 9. 生成资产管理

- **项目资产 + 全局资产中心**两层：GlobalCharacter / GlobalLocation / GlobalVoice + 一层文件夹；复制进项目时记录 `sourceGlobalCharacterId`（复制语义，非引用语义）
- 每资产多候选图 + 选中 + 一步撤销
- MediaObject 统一去重（sha256）与元数据；音色库（VoicePreset + 自定义音色 + AI 音色设计）
- **无审批状态机**：资产没有 draft/active/approved 生命周期，选中即用

### 10. Agent / Workflow 设计

**有实质设计，且是该项目工程上最强的部分：**

- **Prompt 即 Agent**：`lib/prompts/**/agent_*.{zh,en}.txt` 外置版本化提示词文件（分镜规划师/摄影指导/演技指导/角色档案/镜头变体分析……），双语
- 两个编排器：story-to-script、script-to-storyboard（含 clip 匹配、阶段就绪判断 stage-readiness）
- 通用 workflow-engine（registry + dependencies）+ GraphRun 持久层：**可中断、可续跑、可重试、attempt 可审计**
- 但：**无人审门禁原语**、无 per-stage automation 概念、编排图是代码写死而非数据定义

---

## 第二部分：与 Zivith 对比

> Zivith 侧以仓库现状为准：层级为 **Project → Story → Scene → Shot**（无 Chapter——按 [Looser-Creative-Flow-RFC](../rfc/Looser-Creative-Flow-RFC.md) Slice C，幕/章分段需先过域模型 ADR）。

| 领域 | waoowaoo | Zivith 当前设计 | 差异 |
|------|----------|----------------|------|
| 产品定位 | 小说→短剧成片**产线**，效率/量产优先 | AI 原生影视**创作操作系统**，意图资产化、Human Directs | 产线 vs 工作空间；前者优化吞吐，后者优化创作 IP 复利 |
| 用户场景 | 推文/短剧量产者，竖屏日更 | 创作者/导演型用户，长期经营创意宇宙 | waoowaoo 用户要「快出片」；Zivith 用户要「可控可回溯」 |
| Story 管理 | Episode（集）→ Clip（片段）→ 剧本转换，**文本切分驱动** | Story 单体（logline/synopsis/screenplay），审核门禁推进 | waoowaoo 已验证「分段叙事单元」可行；Zivith Slice C 的 ADR 可直接引用其 Episode/Clip 作为证据 |
| Character 模型 | 角色 + **多 Appearance（剧情状态形象）** + 每形象锚定图 + 音色绑定 | Asset(character) + `reference_images[]` + VisualAssetRequirement 按 Scene 变体 | **waoowaoo 更深**：形象随剧情状态版本化；Zivith 的 variant_key 挂在 Scene 需求上，角色本体无多形象结构 |
| Scene 模型 | Location 多图 + available_slots 空间锚点 | Scene 承载连续性语义（时间/天气/情绪）+ Location asset + 继承 | Zivith 语义层更强（继承/连续性）；waoowaoo 空间锚点工程更实用，两者互补 |
| Shot 模型 | Panel：去范式化巨表，photography_rules JSON | Shot：结构化 camera/composition/lighting/color/mood + 继承解析 + 版本化 prompt | Zivith 合同化更好；缺 screen_position/slot 级空间约束与 actingNotes 类字段 |
| Asset 管理 | 项目资产 + **全局资产中心**（复制语义）+ 音色库；无审批态 | Project-scoped 资产 + 状态机（draft/active/archived）+ VisualRequirement 审批 | Zivith 治理强；waoowaoo 跨项目复用已落地（Zivith v1 明确 project-scoped，Global Library 是未来项） |
| RAG 设计 | **无 RAG**。仅把角色介绍/道具描述文本注入 prompt | P8 记忆复利为宪法承诺；Knowledge asset 规划中（Phase 4），未实现 | 双方都未落地向量检索；Zivith 有架构位置，waoowaoo 无此概念——这是 Zivith 的差异化空间 |
| AI Agent 架构 | prompt 文件即 agent + 两个代码编排器 + workflow-engine registry | AgentRuntime + 六个 Agent 类 + Orchestrator + **审核门禁/自动化级别** | Zivith 有治理原语（P6）；waoowaoo 有更细的职业化 agent 分工（摄影指导/演技指导）与外置 prompt 管理 |
| 视频生成 Pipeline | 图→视频（normal/**首尾帧**）+ **口型同步** + TTS/SRT 对齐 + 时间线渲染成片 | Shot→Prompt→Video 单段生成（SiliconFlow/Mock），无口型/无成片装配（Phase 4） | waoowaoo 端到端闭环完整；Zivith 后段（装配/音画对齐）尚是空白 |
| 数据库设计 | MySQL；JSON 存 Text 字符串；previous* 字段做撤销；**版本间不兼容需清库** | PostgreSQL；Prisma Json + domain schema 校验；identity permanent / 软删除 / 迁移纪律 | Zivith 兼容性纪律是宪法级（§8）；waoowaoo「升级先 down -v」在 Zivith 属不可接受 |
| 前后端架构 | Next.js 单体（API routes + workers 同进程），UI 即产品 | Monorepo：apps/api（Fastify headless）+ apps/web + packages/domain，**P3 core headless** | Zivith 面向多客户端未来（agent 调用）；waoowaoo 能力只存在于 UI 路径中 |
| 执行引擎 | **GraphRun/Step/Attempt/Checkpoint/Event**：lease、heartbeat、inputHash 幂等、按节点 checkpoint | WorkflowRun/Step + 内存/BullMQ 队列 + boot recover；attempt 细节不持久化 | **waoowaoo 明显更强**——这是 Zivith 长流程稳定性目标下最值得吸收的一块 |
| 成本/计费 | 余额 + 预冻结 + 幂等流水 + 每调用 UsageCost | P7 宪法要求「每次生成有价可溯」，C8 未实现 | waoowaoo 是 C8 的现成参考实现形态 |

---

## 第三部分：值得借鉴的工程经验

### A. 强烈建议吸收（直接提升 Zivith 架构）

| # | 经验 | 对应 Zivith 落点 |
|---|------|------------------|
| A1 | **角色多形象模型**：Appearance per 剧情状态（changeReason）+ 每形象锚定图。角色一致性的单位不是「角色」而是「角色×状态」 | 深化 Asset(character)——在 asset 语义内加 AppearanceVariant（不加新顶层概念，符合 §3 deepen-not-widen）；VisualRequirement.variant_key 改为引用它 |
| A2 | **参考图注入出图管线**：选定形象图作为带标签参考输入图像模型 + 「标签仅识别禁画入」「风格必须匹配参考图」类 prompt 合约 | 当前 `SiliconFlowImageAdapter` 只支持 text-to-image——**这是 Zivith 一致性承诺最紧迫的实现缺口**。ImageGenerationRequest 需增加 `reference_images[]` 能力位 |
| A3 | **步骤级 attempt 持久化**：inputHash（幂等/缓存）、provider、usage、错误码逐次记录 | 直接服务 P7 溯源与 Track E 局部重跑；在 WorkflowStep 下加 attempt 记录，或扩展 Task 表 |
| A4 | **结构化摄影约束**：photography_rules（光照方向/screen_position/posture/景深/色调）+ Location available_slots 空间锚点 | Shot 模型已有 camera/lighting——补 screen_position 与 slot 语义；Visual Prep 为 Location 生成可站位描述 |
| A5 | **候选集语义**：每次生成 N 候选 + 人工选中 + 一步撤销 | Zivith `candidateMediaIds[]` 已有雏形，把「多候选并发生成 + 选中 + 回退」升为审核门禁内的标准交互 |
| A6 | **预算冻结 + 幂等计费流水**（BalanceFreeze → 结算/释放） | C8 Usage/cost 的参考形态；agent 自主消费前必须先有计量（§7 governance precedes autonomy） |
| A7 | **Prompt 外置版本化**（双语 .txt 文件，与代码分离） | Zivith agent prompt 目前内嵌代码；外置后可审阅、可 diff、可 A/B，也是 P8 记忆注入的挂载点 |

### B. 可以参考（未来版本考虑）

| # | 经验 | 说明 |
|---|------|------|
| B1 | 全局资产中心（跨项目复制 + 来源 ID 记录） | Asset-Model v1 明确 project-scoped；未来 Global Asset Library 落地时，「复制留源」是比「跨项目引用」更安全的初版语义 |
| B2 | 时间线装配（VideoEditorProject：JSON 时间线 + 渲染任务） | Zivith Phase 4 用 FFmpeg 批量装配；宪法 D4 禁止完整 NLE，但「时间线即数据 + 渲染即任务」的形态兼容 D4 |
| B3 | 口型同步 + 首尾帧视频模式 + VoiceLine↔Panel SRT 对齐 | 音画一致是成片质量的下一战场；Zivith audio adapter 已有，缺对齐模型 |
| B4 | 每能力独立模型字段（角色图/分镜图/修图分开配模型） | 比 Zivith 单一 image model 更贴实战（角色图与分镜图最优模型常不同）；provider 仍需按 P4 隔离在 domain 之外 |
| B5 | 修图模型（editModel）作为一致性兜底 | 「重生成整图」之外的低成本修正路径 |

### C. 不建议采用（与 Zivith 定位冲突）

| # | waoowaoo 做法 | 冲突点 |
|---|--------------|--------|
| C1 | Next.js 单体、能力生长在 UI/API routes 里 | 违反 P3（headless core）；Zivith 的多客户端未来（agent 即调用者）不允许 |
| C2 | Panel 去范式化巨表 + previous* 平行字段做版本 | 违反「identity permanent, content versioned」；版本应是历史记录，不是每字段留一个 previous 坑位 |
| C3 | 无审核门禁、生成不携带审批溯源 | 违反 P6/P7；Zivith 的门禁不是流程负担，是产品本体 |
| C4 | 版本间数据库不兼容、升级先清库 | 直接触犯宪法 §8「compatibility debts are repaid, never defaulted」 |
| C5 | JSON 以 Text 字符串存储、弱 schema | Zivith domain 是 contract（P2），必须结构化可校验 |
| C6 | 复制语义的全局资产（改源不传播） | 与 Zivith 继承哲学（引用+读时解析）相反；若未来做全局库需另行设计传播语义 |

---

## 第四部分：Zivith V0.4 架构优化建议

> 原则：不推翻现有设计；全部建议都是对既有方向的增强，且与 Next-Tasks Track E / C7 / C8 对齐。

### 4.1 Core Domain Model

- **角色多形象深化（吸收 A1）**：在 Asset(character) 语义内引入 appearance variants（状态、changeReason、锚定 media、生效范围），`VisualAssetRequirement` 从「scene × variant_key 字符串」升级为引用真实形象实体。不新增顶层概念。
- **Story 分段决策（Slice C 的 ADR）**：用户口中的 Chapter 层，waoowaoo 的 Episode/Clip 提供了正面证据——**分段单元应服务生产（切分→分镜→配音按段推进），而不是文学结构**。建议 ADR 方向：Chapter/Act 作为 **Story 内的结构化分段（组织 Scene 的有序分组）**，不是 Project 下的新顶层实体。
- **Shot 补空间语义（吸收 A4）**：characters 数组增加 screen_position/slot/posture 可选字段；Location 增加可站位描述。

### 4.2 AI Workflow

- **执行引擎补课（吸收 A3）**：为 WorkflowStep 增加持久化 attempt 记录（inputHash、provider、model、usage、error），为长跑步骤加 checkpoint 与 lease/heartbeat。这直接强化 Track E Slice A（局部重跑需要知道「上次这步的输入 hash 是否变了」）。
- **保持 Zivith 独有的门禁原语不动**——waoowaoo 证明了没有门禁也能出片，但那正是两个产品的分野；Zivith 的门禁 + per-stage automation 是面向 agent 时代的治理资产。

### 4.3 Asset System

- **候选集标准化（吸收 A5）**：`generate` 支持 count>1，审核卡片支持多候选选择与回退；撤销走 Media 历史而非 previous 字段。
- **媒体统一化**：Media 表补 sha256 去重与尺寸/时长元数据（对齐 waoowaoo MediaObject 的优点，保留 Zivith 的 provenance 字段）。
- **资产库独立出图 = Track E Slice B**，waoowaoo 的资产中心交互（形象卡 + 候选图 + 选中）可作 UI 参照。

### 4.4 Knowledge Base（RAG）

waoowaoo **没有** RAG——它把角色介绍/道具描述整段塞 prompt。这提示两点：

1. **短期**：先做**结构化上下文组装**（context packing），把「角色形象 + 场景锚点 + 摄影规则 + 原文片段」按 agent 精确注入——waoowaoo 的一致性 80% 靠这个，不靠向量库。Zivith 的继承解析天然适合做这件事。
2. **中期差异化**：P8 落地——把审核决策、重试反馈、风格纠正结构化进 Knowledge asset，检索后注入。这是 waoowaoo 完全没有、且其数据模型难以补上的能力（它不记录「为什么被拒」）。

### 4.5 Agent System

- **Prompt 外置版本化（吸收 A7）**：`packages/` 或 `apps/api/prompts/` 下按 agent 存版本化提示词（中英），代码只做变量填充；为 P8 反馈注入预留槽位。
- **新增两个专业 agent 方向可参考其分工**：摄影指导（photography plan）与演技指导（acting notes）——都可作为现有 Shot Agent 的深化输出字段，不必新建顶层 agent。

### 4.6 Generation Pipeline

- **参考图注入（吸收 A2，最高优先级）**：`ImageGenerationRequest` 增加 `reference_images[]`（带角色/场景标签）；SiliconFlow adapter 接 image-edit / multi-image 类模型；Visual Prep 出图与 Shot 分镜图都改走「approved 锚定图 → labeled reference → 生成」链路。**没有这条，角色一致性只是审核出来的错觉。**
- 视频段：参数化首尾帧模式；为 Phase 4 装配预留 VoiceLine↔Shot 对齐字段。
- **计费（C8，吸收 A6）**：Task 增加 billing 元数据，引入预冻结-结算流水；这是 P7 从「记录」走向「控制」的一步。

---

## 第五部分：最大技术风险与竞争壁垒

### 最大技术风险

1. **一致性的实现缺口（最紧迫）**。Zivith 的一致性目前是「治理层」的：靠审核门禁让人把关。waoowaoo 证明一致性 80% 是**上下文组装工程**：多形象锚定图 + 带标签参考注入 + 空间 slot + 摄影规则。Zivith 当前图像管线是纯 text-to-image，**参考图根本进不了模型**——门禁审得再严，模型也画不出同一张脸。这是产品核心承诺与实现之间的最大落差。
2. **执行引擎的深度差距**。长流程稳定性上，waoowaoo 的 GraphRun（checkpoint/lease/attempt/inputHash）比 Zivith 现状（step 状态 + boot recover）扎实一代。Zivith 的 P5 蓝图更高（workflow-as-data），但蓝图与在产代码之间的距离就是风险。
3. **宪法开销 vs 迭代速度**。waoowaoo 单人开发拿到 13.3k stars，靠的是砍掉一切治理直奔成片。Zivith 的 ADR/RFC/门禁纪律是长期资产，但若 Phase 3 前拿不出「参考图一致性 + 成片闭环」的可见成果，会在生态时间窗上输给产线型产品。**建议：治理文档节奏不变，代码侧把 A2（参考注入）提到最高优先级。**

### 竞争壁垒（Zivith 真正能赢的地方）

1. **意图资产化（P1）**：waoowaoo 的 Panel 是快照——模型换代，旧片重生成要人肉重跑提示词。Zivith 的 Shot/继承/溯源意味着 2031 年的模型可以自动重渲 2026 年的整个作品库。这是产线做不到的复利。
2. **记忆复利（P8）+ Knowledge**：waoowaoo 不记录「为什么重生成、为什么被拒」；Zivith 的审核门禁天然是高质量偏好数据的采集点。做成闭环后，这是竞品换模型也追不上的壁垒。
3. **治理先行的 agent 架构（P6/P7）**：当创作 agent 开始自主消费预算、批量操作项目时，门禁 + 计量 + 审计不是负担而是准入条件。waoowaoo 的架构要补这些需要重写；Zivith 是原生的。
4. **开放与不锁定（P4 + 导出保证）**：headless core + 供应商隔离 + 全量导出，使 Zivith 有资格成为「IDE/OS」而非「某模型的前端」。

**一句话结论**：waoowaoo 赢在**产线工程**（一致性注入、执行引擎、计费闭环），Zivith 赢在**领域模型与治理**（意图资产、门禁、记忆）。V0.4 的正确姿势是把对方产线工程里的 A1–A7 吸进自己的域模型框架，而不是被拉去做第二条产线。

---

## 附：建议的落地顺序（对齐现有 backlog）

> **2026-07-23 更新**：本节已由正式计划取代 — 见 [V0.4-Modification-Plan.md](../../V0.4-Modification-Plan.md)（W2→W1→W3→W4→W5→W6→W7）与 [ADR-0006](../adr/0006-story-segments-are-ordered-scene-groupings.md)（Story 有序分组已裁决）。以下为评审时点的原始建议，保留作历史记录。

```text
1. A2 参考图注入管线（新任务，建议插队为最高优先级）
2. A1 角色多形象（域模型 ADR + Slice B 前置）
3. Track E Slice A 局部重跑 + A3 attempt 持久化（同一次改造）
4. A5 候选集标准化（随 Slice B 资产库出图一起）
5. A6/C8 计费冻结 + A7 prompt 外置（Phase 3 前）
6. Slice C Story 分段 ADR（引用本评审 §4.1 证据）
```
