# Zivith

> AI 可理解的 IP 创作系统
>
> Version: 0.1.0-pre
>
> Status: 实现中 — 创造层 v1 已闭环；M1 记忆 / M2 小说导入 / M3 角色扮演已落地；长篇导入验收已通过；I3 Organization 仍待晋级证据
>
> Last Progress Sync: 2026-08-31 · 重新定位 2026-07-31（[ADR-0008](architecture/adr/0008-zivith-is-an-ai-understandable-ip-creation-system.md)）

---

## Zivith 是什么？

**Zivith 不是一个 AI 生成工具。Zivith 是一个 AI 可理解的 IP 创作系统。**

模型负责执行生成。Zivith 管理生成无法承载的东西：创作意图、世界规则、角色关系、时间发展与制作上下文。模型越强，这一点越重要，而不是越不重要——完整 IP 从来不是一句话能生成的；生成模型越强，管理创作上下文的系统就越有价值。

多数 AI 视频工具从 prompt 直达视频。结果不满意时，只能从头重生成，什么都积累不下来。

Zivith 走另一条路：每一件创作产物都是持久的、可编辑的、可复用的。角色、地点、事件与知识属于你的 Project——即世界——而不属于某条视频。影视制作是这个世界被表达与交付的方式。

完整说明见 [Product Positioning](product/Product-Positioning.md)：Zivith 是什么、不是什么。

---

## 两层结构

```
世界层              Project（即 IP）
                       ↓
                   Character · Location · WorldEvent · Relationship · Timeline
                       │
                       │  经由表达层呈现
                       ↓
表达层             Story  →  完整叙事（电影、剧集、章节）
                     └─ Scene  →  连续叙事单元（地点、时间、情绪）
                         │   └─ Visual Prep  →  已批准的角色/地点视觉需求
                         └─ Shot  →  最小可编辑单元（机位、动作、对白）
                             └─ Prompt  →  已批准的视频生成指令
                                 └─ Video  →  生成输出（可丢弃、可复现）
```

世界层回答*存在什么、处于什么状态*；表达层回答*如何讲述*。表达依赖世界，绝不能反过来——因此一部完成的 Story 不会把世界一起带走。

注意：`Location`（世界中的地点）与 `Scene`（叙事单元）是不同概念；IP *就是* `Project`——没有单独的 IP 对象。术语约定见 [Core Domain Model](domain/Core-Domain-Model.md)。

规定的制作工作流是：**Story → Scene → Scene 评审 → Visual Prep → 视觉资产评审 → Shot → Prompt → Prompt 评审 → Video → 评审**。视觉资产通过评审后才能进入 Shot 或 Video 工作；Prompt 评审为必经关卡。

---

## 文档结构

文档按**谁可以改、多久改一次**分组。文件夹位置决定权重：`product/` 的陈述高于 `planning/` 的笔记；`planning/` 笔记是快照，不是契约。

**产品宪法**（[Product Constitution](product/Product-Constitution.md)）自 2026-09-16 起约束「做什么、如何验收、Agent 如何执行任务」。**架构宪章**（[Architecture Principles](architecture/architecture-principles.md)）继续约束「世界如何被系统表示」。功能任务书与 planning 笔记不得覆盖产品宪法。

| 文件夹 | 回答什么 | 变更节奏 | 变更权限 |
|--------|---------|----------------|---------------------|
| [`product/`](product) | Zivith 为何存在、产品如何验收 | 年级别 | 产品宪法由所有者明示修订；其余定位/术语走 ADR |
| [`domain/`](domain) | 对象是什么 | 按决策 | ADR 或 RFC |
| [`engineering/`](engineering) | 如何构建 | 按阶段 | 常规 PR 评审 |
| [`planning/`](planning) | 接下来做什么 | 周级别 | 常规 PR 评审 |
| [`architecture/`](architecture) | 决定了什么、为何 | 只追加 | ADR / RFC 流程 |
| [`archive/`](archive) | 曾经为真的内容 | 冻结 | 禁止编辑 |

### 我该看哪里？

| 我想知道 | 阅读 |
|----------------|------|
| 产品怎么做、算不算完成、Agent 如何执行任务 | [Product Constitution](product/Product-Constitution.md) — **从这里开始（产品宪法）** |
| Zivith 是什么，以及它拒绝构建什么 | [Product Positioning](product/Product-Positioning.md) |
| 某个概念的官方名称 | [Product Positioning §3](product/Product-Positioning.md) 术语约定 |
| 某设计选择为何如此 | [ADR index](architecture/adr/README.md) |
| 我是否有权做某个设计选择 | [Architecture Principles](architecture/architecture-principles.md)，然后 [ADR Guide](architecture/adr-guide.md) |
| 哪个对象拥有某个字段 | [Core Domain Model](domain/Core-Domain-Model.md) |
| 对象端到端如何运转 | [Domain Model Walkthrough](domain/Domain-Model-Walkthrough.md) |
| 某个 Agent 角色负责什么 | [AI Agent Collaboration](domain/AI-Agent-Collaboration.md) |
| 评审关卡在哪里、是否强制 | [AI Agent Collaboration](domain/AI-Agent-Collaboration.md) |
| API 或适配器长什么样 | [Technical Architecture](engineering/Technical-Architecture.md) |
| 写代码前应遵循的约定 | [Code Agent Design Guide](engineering/Code-Agent-Design-Guide.md) |
| 现在该做什么（产品） | [Product Constitution](product/Product-Constitution.md) — Journey A–F；写代码前填 §25 |
| 现在工程上有哪些轨道快照 | [Next Tasks](planning/Next-Tasks.md)（从属于产品宪法，不是优先级） |
| 工程加固怎么走、当前版本基线 | [Hardening Roadmap](engineering/hardening-roadmap.md) · [Baseline](engineering/hardening-baseline.md) |
| 某个界面或路由应落在哪里 | [UI Information Architecture](product/UI-Information-Architecture.md) |
| 记忆、小说导入、角色扮演如何工作 | [Memory / Novel / Roleplay 设计](planning/Memory-Novel-Roleplay-Design.md) |

### product/ — 为何

| 文档 | 说明 |
|----------|-------------|
| [Product Constitution](product/Product-Constitution.md) | **产品宪法**：成熟度、Journey 验收、UI 状态、Agent 任务模板。高于功能任务书 |
| [Product Positioning](product/Product-Positioning.md) | 北极星、术语约定，以及 Zivith 刻意不构建什么 |
| [Design Philosophy](product/Design-Philosophy.md) | 产品愿景、原则、世界层与创作层级 |
| [UI Information Architecture](product/UI-Information-Architecture.md) | 世界优先的界面结构、路由图、World/Production 视图、Creator Chat 位置 |

### domain/ — 是什么

| 文档 | 说明 |
|----------|-------------|
| [Core Domain Model](domain/Core-Domain-Model.md) | 世界层、领域对象、所有权规则、继承模型 |
| [Domain Model Walkthrough](domain/Domain-Model-Walkthrough.md) | 以「阁楼上的秘密」贯穿的端到端领域走读 |
| [Asset Model](domain/Asset-Model.md) | 资产分类（Characters、Locations、Styles 等） |
| [Shot Specification](domain/Shot-Specification.md) | 完整 Shot schema、生命周期、Prompt 构建 |
| [AI Agent Collaboration](domain/AI-Agent-Collaboration.md) | 四个 Agent 角色、执行阶段、必经评审关卡、Visual Prep 工作流 |

### engineering/ — 如何做

| 文档 | 说明 |
|----------|-------------|
| [Technical Architecture](engineering/Technical-Architecture.md) | 系统设计、适配器、API、队列、BYOK 与数据存储 |
| [Code Agent Design Guide](engineering/Code-Agent-Design-Guide.md) | 面向 AI 代码 Agent 的实现约定 |
| [Engineering Hardening Roadmap](engineering/hardening-roadmap.md) | 工程加固过程（Stage A→F）；登录/多租户按 ADR-0013 不做 |
| [Hardening Baseline](engineering/hardening-baseline.md) | Phase 0 冻结快照：这个版本实际是什么状态 |

### planning/ — 何时

| 文档 | 说明 |
|----------|-------------|
| [Next Tasks](planning/Next-Tasks.md) | 工程轨道快照（从属于产品宪法，不是「下一步做什么」） |
| [Implementation Plan](planning/Implementation-Plan.md) | 分阶段路线图与实时进度勾选 |
| [Development Log](planning/Development-Log.md) | 逐次修改的开发记录（每次提交同步追加） |
| [Memory / Novel / Roleplay 设计](planning/Memory-Novel-Roleplay-Design.md) | 分层记忆、小说导入、时间锚定扮演 |

### architecture/ — 决策

只追加。ADR 编号是永久引用，永不重编号。

| 文档 | 说明 |
|----------|-------------|
| [Architecture Principles](architecture/architecture-principles.md) | 长期**架构**宪章，约束领域契约与 ADR；不覆盖产品宪法的 Journey 验收 |
| [ADR Guide](architecture/adr-guide.md) | 何时、如何记录架构决策（[ADR index](architecture/adr/README.md)） |
| [RFC Guide](architecture/rfc-guide.md) | 重大变更的提案、评审、风险、迁移与验收流程 |
| [Entity + State + Timeline + Track](architecture/entity-state-timeline-track.md) | Entity State 历史、Presentation-led Timeline、可变 World Time 维度、语义 Tracks，以及分阶段落地 |
| [Entity history write paths](architecture/entity-history-write-paths.md) | 首批 Entity 写入面清单；H3 双写助手已落地（per-Entity 开关默认关）；世界线 v1 已落地 |
| [IP World Model Repositioning RFC](architecture/rfc/IP-World-Model-Repositioning-RFC.md) | 为何从 AI 视频工作流转向 AI 可理解的 IP 系统；IP Core 能力爬坡 |
| [AI Creative IDE RFC](architecture/rfc/AI-Creative-IDE-RFC.md) | Explorer + Presentation/World-overlay Timeline + Director Console + Entity Inspector |
| [Looser Creative Flow RFC (thin)](architecture/rfc/Looser-Creative-Flow-RFC.md) | 部分重算 / 资产优先视觉 / 故事切分爬坡 |
| [Director Copilot RFC (thin)](architecture/rfc/Director-Copilot-RFC.md) | Project 侧栏副驾驶范围锁定（Phase 3+；不是聊天机器人） |
| [Agent Effort Control RFC](architecture/rfc/Agent-Effort-Control-RFC.md) | Fast / Balanced / Deep 执行策略，不改变权限边界 |
| [Architecture Review: waoowaoo](architecture/review/Zivith-Architecture-Review-Based-on-waoowaoo.md) | 对标开源项目评审；A1–A7 采纳清单，输入 V0.4 规划 |

### archive/ — 冻结

仅作溯源保留。勿当作现行真相，勿编辑。

| 文档 | 说明 |
|----------|-------------|
| [V0.4 Modification Plan](archive/V0.4-Modification-Plan.md) | 已完成的首轮参考 — 来自 waoowaoo 评审 + ADR-0006 的工作流 W1–W7 |
| [Product Design RFC](archive/Product-Design-RFC.md) | 早期草案，已被 Design Philosophy 取代 |

---

## 设计原则

- **Models Generate, Zivith Manages** — 生成位于可替换边界之后；世界模型则不然
- **World First** — 先创建世界，再制作内容
- **Story First** — 每一次创作从叙事开始，而非技术参数
- **Shot is the Core** — Shot 是真相源；Video 是产出
- **Assets are Persistent** — 角色、地点与知识属于 Project
- **Outputs are Disposable** — 视频随时可以重新生成
- **AI Generates, Human Directs** — AI 辅助；人类做创作决策
- **Everything is Editable** — 没有生成结果会变成死胡同
- **Transparency over Magic** — 创作者理解 AI 生成了什么、为何如此

---

## 技术栈（当前）

| 层 | 技术 |
|-------|------------|
| Frontend | Next.js (App Router)，中文界面 |
| Backend API | Node.js 22 + Fastify |
| Domain / DB | `@zivith/domain` + Prisma / PostgreSQL 16 |
| Object Storage | S3-compatible（本地 MinIO） |
| Job Queue | 设置 `REDIS_URL` 时用 BullMQ；否则回退进程内内存队列 |
| AI Integration | DeepSeek（LLM）+ SiliconFlow（图像/视频/音频），带 Mock 回退；多厂商可选 |

基础设施决策见 [ADR index](architecture/adr/README.md)。

---

## 项目状态（2026-08-30）

| 阶段 | 状态 | 说明 |
|-------|--------|-------|
| Phase 0 Foundation | ~95% done | 设置 REDIS_URL 时已接入 BullMQ；尚无 staging 部署 |
| Phase 1 Core Domain | ~90% done | 继承为读时解析；仅 Character/Location |
| Phase 2 AI Agent + Mock Gen | ~95% done | A1 E2E 关卡通过；queue + SSE + recover 已落地 |
| Phase 2.5 First Providers | ~85% done | DeepSeek + SiliconFlow；四模态模型槽位；BYOK 稍后（C7） |
| Track G polish | **Done** | 真密钥 Story→Video E2E；Wan harden / MinIO / balance / 无自动重计费 |
| Track H — IP Core foundation | H0–H7 v1 + H9 v1 | Entity/State/Timeline。双写 helpers（flags 默认关闭）；世界线 v1 已落地（世界/制作双视图、四轨道、Shot 轨道，2026-08-05 → 08-14 细化）；H6 可变 WorldTime 绑定（TemporalDimension + 信封，2026-08-16）；H7 派生 Track v1（Camera/Style/Prompt/Model 只读投影）；H9 规则冲突检测只报告不修复 |
| Track I — IP Core world entities | I1 / I2 落地 | WorldEvent（ADR-0011）与 Relationship（ADR-0012）已入 domain contract；Organization 待真实项目证据 |
| Track J — Creator Chat | **已完成** | 世界优先的持续对话创作面，应用默认页 `/`，无登录（ADR-0010 修订 / ADR-0013）；流式 SSE + 冲突检测 + 主动引导 v1；历史栏世界/角色 Tab（2026-08-30） |
| Track K — World-first UI | **已完成 v1** | Studio 为 IDE 壳（图标活动栏，主画布 `/world`，2026-09-01）；项目根仍是故事列表；`/world` 三栏工作区（可拖分栏、轴标签抽稀，2026-08-30）+ Inspector 可编辑；世界观 Chat→Studio 闭环；见 UI Information Architecture |
| Track M — Memory / Novel / Roleplay | **M1–M3 工程 v1** | 分层记忆（ADR-0014）；小说导入批量预授权写入 + 整体撤销（ADR-0015）；时间锚定扮演。**产品宪法：** 扮演可产生需确认的世界变化；写世界仍是 Journey E 缺口，不是「永不反写」 |
| Phase 3–5 | Not started | 生成生产化，在 IP Core 之后重新排序（ADR-0008） |

**仓库：** 活跃 monorepo（`apps/web`、`apps/api`、`apps/desktop`、`packages/*`）。  
**策略：** B-Line — 先 Agent 管线；真 SiliconFlow 路径已在 Track G 验证。自 2026-07-31 起 IP Core 优先；2026-08-04 创造层优先（分支 `feat/creator-layer-first`，2026-08-16 合并进 `main`）。  
**近期焦点：** [产品宪法](product/Product-Constitution.md) 的核心 Journey。工程快照见 [Next Tasks](planning/Next-Tasks.md)。上一份 P0 总任务书未再次启用前不按其顺序插队。

---

## 快速开始（开发者）

1. 按根目录 [README](../README.md) 完成 `setup` / `pnpm dev`
2. 阅读 [Product Positioning](product/Product-Positioning.md)，了解 Zivith 是什么、不是什么
3. 阅读 [Design Philosophy](product/Design-Philosophy.md)，了解产品愿景
4. 阅读 [Core Domain Model](domain/Core-Domain-Model.md)，了解数据模型与术语约定
5. 阅读 [Technical Architecture](engineering/Technical-Architecture.md)，了解系统设计
6. 阅读 [Implementation Plan](planning/Implementation-Plan.md) 与 [Next Tasks](planning/Next-Tasks.md)
7. 写代码前阅读 [Code Agent Design Guide](engineering/Code-Agent-Design-Guide.md)

---

## License

待定。
