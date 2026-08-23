# Zivith

> AI 可理解的 IP 创作系统
>
> Version: 0.1.0-pre
>
> Status: 实现中 — 创造层 v1 已闭环；H6 可变世界时间绑定、H7 派生 Track v1 已落地；下一步 I3 Organization（需晋级证据）
>
> Last Progress Sync: 2026-08-16 · 重新定位 2026-07-31（[ADR-0008](architecture/adr/0008-zivith-is-an-ai-understandable-ip-creation-system.md)）

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

| 文件夹 | 回答什么 | 变更节奏 | 变更权限 |
|--------|---------|----------------|---------------------|
| [`product/`](product) | Zivith 为何存在 | 年级别 | 宪法级修正 ADR |
| [`domain/`](domain) | 对象是什么 | 按决策 | ADR 或 RFC |
| [`engineering/`](engineering) | 如何构建 | 按阶段 | 常规 PR 评审 |
| [`planning/`](planning) | 接下来做什么 | 周级别 | 常规 PR 评审 |
| [`architecture/`](architecture) | 决定了什么、为何 | 只追加 | ADR / RFC 流程 |
| [`archive/`](archive) | 曾经为真的内容 | 冻结 | 禁止编辑 |

### 我该看哪里？

| 我想知道 | 阅读 |
|----------------|------|
| Zivith 是什么，以及它拒绝构建什么 | [Product Positioning](product/Product-Positioning.md) — **从这里开始** |
| 某个概念的官方名称 | [Product Positioning §3](product/Product-Positioning.md) 术语约定 |
| 某设计选择为何如此 | [ADR index](architecture/adr/README.md) |
| 我是否有权做某个设计选择 | [Architecture Principles](architecture/architecture-principles.md)，然后 [ADR Guide](architecture/adr-guide.md) |
| 哪个对象拥有某个字段 | [Core Domain Model](domain/Core-Domain-Model.md) |
| 对象端到端如何运转 | [Domain Model Walkthrough](domain/Domain-Model-Walkthrough.md) |
| 某个 Agent 角色负责什么 | [AI Agent Collaboration](domain/AI-Agent-Collaboration.md) |
| 评审关卡在哪里、是否强制 | [AI Agent Collaboration](domain/AI-Agent-Collaboration.md) |
| API 或适配器长什么样 | [Technical Architecture](engineering/Technical-Architecture.md) |
| 写代码前应遵循的约定 | [Code Agent Design Guide](engineering/Code-Agent-Design-Guide.md) |
| 现在该做什么 | [Next Tasks](planning/Next-Tasks.md) |
| 某个界面或路由应落在哪里 | [UI Information Architecture](product/UI-Information-Architecture.md) |

### product/ — 为何

| 文档 | 说明 |
|----------|-------------|
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

### planning/ — 何时

| 文档 | 说明 |
|----------|-------------|
| [Next Tasks](planning/Next-Tasks.md) | 当前工程 backlog（创造层 v1 已闭环；H6/H7 v1 已落地；I3 Organization 待晋级证据；Phase 3 稍后） |
| [Implementation Plan](planning/Implementation-Plan.md) | 分阶段路线图与实时进度勾选 |
| [Development Log](planning/Development-Log.md) | 逐次修改的开发记录（每次提交同步追加） |

### architecture/ — 决策

只追加。ADR 编号是永久引用，永不重编号。

| 文档 | 说明 |
|----------|-------------|
| [Architecture Principles](architecture/architecture-principles.md) | 长期架构宪法，约束后续所有 ADR 与 RFC |
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

## 项目状态（2026-08-16）

| 阶段 | 状态 | 说明 |
|-------|--------|-------|
| Phase 0 Foundation | ~95% done | 设置 REDIS_URL 时已接入 BullMQ；尚无 staging 部署 |
| Phase 1 Core Domain | ~90% done | 继承为读时解析；仅 Character/Location |
| Phase 2 AI Agent + Mock Gen | ~95% done | A1 E2E 关卡通过；queue + SSE + recover 已落地 |
| Phase 2.5 First Providers | ~85% done | DeepSeek + SiliconFlow；四模态模型槽位；BYOK 稍后（C7） |
| Track G polish | **Done** | 真密钥 Story→Video E2E；Wan harden / MinIO / balance / 无自动重计费 |
| Track H — IP Core foundation | H0–H7 v1 + H9 v1 | Entity/State/Timeline。双写 helpers（flags 默认关闭）；世界线 v1 已落地（世界/制作双视图、四轨道、Shot 轨道，2026-08-05 → 08-14 细化）；H6 可变 WorldTime 绑定（TemporalDimension + 信封，2026-08-16）；H7 派生 Track v1（Camera/Style/Prompt/Model 只读投影）；H9 规则冲突检测只报告不修复 |
| Track I — IP Core world entities | I1 / I2 落地 | WorldEvent（ADR-0011）与 Relationship（ADR-0012）已入 domain contract；Organization 待真实项目证据 |
| Track J — Creator Chat | **已完成** | 世界优先的持续对话创作面，应用默认页 `/`，无登录（ADR-0010 修订 / ADR-0013）；流式 SSE + 冲突检测 + 主动引导 v1 |
| Track K — World-first UI | **已完成 v1** | 项目主页 World Overview；`/world` 三栏工作区 + Inspector 可编辑；世界观 Chat→Studio 闭环；见 UI Information Architecture |
| Phase 3–5 | Not started | 生成生产化，在 IP Core 之后重新排序（ADR-0008） |

**仓库：** 活跃 monorepo（`apps/web`、`apps/api`、`packages/*`）。  
**策略：** B-Line — 先 Agent 管线；真 SiliconFlow 路径已在 Track G 验证。自 2026-07-31 起 IP Core 优先；2026-08-04 创造层优先（分支 `feat/creator-layer-first`，2026-08-16 合并进 `main`）。  
**近期焦点：** [Next Tasks](planning/Next-Tasks.md) — 创造层 v1 已闭环；H6 可变世界时间绑定与 H7 派生 Track v1 已落地；下一步 I3 Organization（需晋级证据）。资产表 + 提供商矩阵见 [Asset Model](domain/Asset-Model.md)。后续仍待：用量冻结/限额、BYOK（C7）、Phase 3 生成生产化。

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
