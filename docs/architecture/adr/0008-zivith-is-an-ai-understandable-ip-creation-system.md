# ADR-0008: Zivith is an AI-understandable IP creation system

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** Project owner / architecture maintainer
- **Class:** Constitutional Amendment
- **Reversibility:** Costly
- **Source RFC:** [IP World Model Repositioning RFC](../rfc/IP-World-Model-Repositioning-RFC.md)

## Product Constitution overlay（2026-09-16）

用户与产品宪法口中的「世界」就是本 ADR 的 `Project`。Journey 文案可以分「创建项目 / 创建世界」两步，数据上仍是一个 `Project`。禁止新增顶层 `World` 或 `IP` 实体。电影制作仍是表达层，不是 V0.x 的第一验收单位——第一阶段听产品宪法 Journey A–F。

## Context

Zivith 当前的对外表述是「AI-native Film Production Studio」，宪法 §1 也以 filmmaking 为锚点。这个表述准确描述了已经建成的东西——`Story → Scene → Visual Prep → Shot → PromptVersion → Output` 的完整制作链路已经跑通——但它没有描述这套系统真正的长期价值所在。

推动重新审视的证据有三条。

第一，模型能力的进步方向已经清晰：视频、图像、文本、多模态生成都在快速变强，而且这个趋势没有减速迹象。若 Zivith 的价值定位建立在「把生成流程组织好」之上，那么每一次模型进步都在削弱它的存在理由。

第二，真实使用暴露出的瓶颈不在生成，而在世界知识的丢失。创作者投入数周建立的世界设定——角色阶段演化、关系网络、事件因果——随 `Story` 结束而蒸发；下一个 `Story` 开始时，系统对这个世界一无所知。这直接违背 P8。

第三，宪法自身的三条不变量（创作 IP 会复利、调用方会多样化、生成管线会变形）指向的结论，其实比「filmmaking OS」更宽：真正不随模型进步而贬值的资产，是被结构化保存的创作意图与世界状态。filmmaking 是这份状态的一种表达形式，不是它的全部。

按 [adr-guide.md](../adr-guide.md) §5 的处理阶梯，本次不是「用现有层级重新表达即可」的误诊——需要修改的是宪法对自身使命的表述（§1 Vision、§9 Never 清单、§10 North Star），这只能通过 Constitutional Amendment ADR 完成。按 §6 规则 4，宪法正文在本 ADR 的同一次变更中同步修订。

## Principles at Stake

- **Serves P1（创作意图是资产）：** 把世界状态本身确立为一等意图资产，扩大而非削弱「意图 > 产物」的适用范围。
- **Serves P4（波动性隔离）：** 明确 Zivith 不自研模型、模型是可替换外设，加固 capability boundary。
- **Serves P8（记忆复利）：** 世界知识跨 `Story` 累积，是本次修正的核心动机。
- **Serves §10 North Star：** 直接推进 compounding universes，并为 alternating operators 提供语义化状态前提。
- **Strains §3「模型靠加深而非加宽生长」：** 新定位隐含 `WorldEvent`、`Organization` 等世界实体的引入。缓解：`IP` 映射到既有 `Project` 不新增实体，`Skill` 被明确拒绝为实体（ADR-0009），世界实体逐 slice 推进且需晋级证据。本次修正拒绝的新概念多于引入的。
- **Strains §9.2「永不成为 chatbot」：** 新定位包含 Creator Chat 入口。红线不撤销，改以围栏方式处理（ADR-0010）。

## Decision

我们把 Zivith 的使命表述确立为：**Zivith 不是一个 AI 内容生成工具，而是一个让 AI 理解、管理并持续参与 IP 创作的系统。**

AI 模型负责执行生成；Zivith 负责管理创作意图、世界设定、角色关系、时间发展与制作上下文。`Story` / `Scene` / `Shot` / `Output` 是这个世界的表达与产出层，不是系统的顶层目的。

本 ADR 在同一次变更中修订宪法正文：§1 Vision 改以 IP 世界管理为锚点，§3 补充世界实体的加深规则，§9 新增「A model foundry」条并澄清 §9.2 与引导式向导的边界，§10 置顶新的北极星表述。宪法 Version 由 1.0 升至 1.1。

## Alternatives Considered

### 保留「AI-native Film Production Studio」表述，只在产品文档补充 IP 叙事

成本最低，不动宪法。它输在会制造两份互相矛盾的顶层叙事：宪法说 filmmaking，产品文档说 IP 世界。按 §8「宪法修正而非漂移」，这恰恰是必须避免的形态——实践与原则分歧时，必须裁决，不能常态化。

### 把定位改为「AI IP 生成平台」

更贴近市场常见说法，容易传播。它输在把 Zivith 重新推回生成工具的类别，正是 §9.1 明确拒绝的引力方向，且与 P1 冲突。

### 直接新增 `IP` 顶层实体，把 `Project` 降为其子级

在建模上看起来更贴合新叙事。它输在违反 §3「加深而非加宽」：`Core-Domain-Model.md` 对 `Project` 的定义本就是「a complete creative universe / an entire IP」，新增 `IP` 只会制造一个同义实体，并迫使全部存量数据迁移，收益为零。

### 推迟修正，等 IP Core 实体真正落库后再改宪法

看似更稳妥。它输在顺序颠倒：宪法约束 ADR，ADR 约束 RFC 与实施计划。在使命表述未定的情况下开工世界实体，等于让实现顺序反向决定架构意图，这正是 ADR 制度要防止的。

## Trade-off Record

| We gained | We gave up | Horizon |
|-----------|------------|---------|
| 一句可用于逐功能裁决的北极星 | filmmaking 这一具体、易传播的品类标签 | 当有证据表明 IP 叙事让用户无法理解产品做什么时重新审视 |
| 世界层作为长期价值锚点 | 短期内更聚焦的视频生成叙事 | 若 IP Core 三个 slice 均未取得晋级证据，重新审视定位是否超前 |
| 明确的「不做什么」清单 | 遇到新 AI 能力时自由扩张范围的余地 | 永久，除非由 superseding ADR 推翻 |
| 术语映射把产品语言绑定到代码契约 | 产品文档独立演化措辞的自由 | 永久 |
| Skill 与 Creator Chat 的边界一次性定死 | 后续讨论这两者时的灵活性 | 见 ADR-0009 / ADR-0010 各自的 tripwire |

## Consequences

**变得更容易的：**

- 功能取舍有了统一判据：不能增强 IP 理解 / 世界管理 / 创作者控制的提案，默认不进核心。
- Track H（Entity + State + Timeline）从一项基础设施工作升级为产品主线的地基，其优先级不再需要反复论证。
- 模型替换的边界更清晰——被替换的永远是 Skill 与 Provider Adapter。

**变得更难的：**

- 视频生成相关的产品化工作（Phase 3–5）排到 IP Core 之后，交付「能出片」的体感被推迟。
- 每个新增世界实体都要过晋级证据这道关，推进速度慢于一次性铺开。
- 对外解释产品变难：IP 世界管理不是一个已有的市场品类。

**新增义务：**

- 宪法正文须在本次变更中同步修订（已履行）。
- [Design-Philosophy.md](../../product/Design-Philosophy.md)、[Core-Domain-Model.md](../../domain/Core-Domain-Model.md)、[README.md](../../README.md)、[Implementation-Plan.md](../../planning/Implementation-Plan.md)、[Next-Tasks.md](../../planning/Next-Tasks.md) 须在同一轮对齐，不留下矛盾表述。
- 源 RFC §9 登记的三条待偿 ADR（`WorldEvent`、`Relationship` 提升、`Organization`）在各自 slice 开工时必须补齐。
- revisit trigger 已登记在源 RFC §6 风险表，由周期性架构评审检查。

## Compliance

- 任何新功能提案在 RFC 的 vision alignment 一节必须能指出它增强了 IP 理解、世界管理、创作者控制中的哪一项，或诚实声明它属于防御性 / 债务偿还工作。
- 产品文档与代码不得对同一概念使用不同名称；术语映射表（[Product-Positioning.md](../../product/Product-Positioning.md) §3）是唯一权威。
- 任何提议新增顶层领域概念的 ADR 必须先论证它无法作为既有概念的加深来表达。
- 宪法 §9 的 Never 清单被引用时以本 ADR 后的 1.1 版本为准；引用 1.0 版本条目号的旧文档须在发现时修正。
- 若后续实践与本定位分歧，须由新的 Constitutional Amendment ADR 显式 supersede 本 ADR，不得静默漂移。
