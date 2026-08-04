# ADR-0010: Creator Chat is the world-first continuous conversation surface

- **Status:** Accepted (revised 2026-08-04)
- **Date:** 2026-07-31（2026-08-04 修订）
- **Deciders:** Project owner / architecture maintainer
- **Class:** Standard
- **Reversibility:** Reversible
- **Source RFC:** [IP World Model Repositioning RFC](../rfc/IP-World-Model-Repositioning-RFC.md)

## Revision

2026-08-04 按「创造层优先」实现计划修订：Creator Chat 从「有终点的引导向导」改为 **Codex 风格持续对话 agent**——打开应用即进入（`/`），无登录门禁，对话围绕「世界」持续进行，确认提案即自动落库。本修订与下列治理变更同批生效：

- 修宪：`architecture-principles.md` §9.2 从「绝不做聊天机器人」改为「允许对话式创作入口，但对话记录只是会话工作底稿，创作宇宙的唯一表示形式是结构化实体」。
- [ADR-0011](0011-world-event-is-a-domain-creative-entity.md)：`WorldEvent` 进入领域契约。
- [ADR-0012](0012-relationship-is-an-independent-queryable-entity.md)：`Relationship` 提升为独立可查询实体。
- [ADR-0013](0013-local-single-user-mode-no-login.md)：本地单用户模式（无登录）。

旧决策全文保留于文末「被取代内容」区。

## Context

[ADR-0008](0008-zivith-is-an-ai-understandable-ip-creation-system.md) 确立的定位里有一个入口问题：想创建世界的普通用户，第一次打开 Zivith 时面对的是 `Story` → `Scene` → `Visual Prep` → `Shot` 的完整专业流程，而他脑子里想的只是「我想创造一个东方玄幻世界」。门槛与意图之间存在明显错位。

原 ADR-0010（2026-07-31）把 Creator Chat 定义为**有终点的引导向导**：采集意图 → 引导补全 → 交接结构化工作区。这解决了「从零开始」的问题，但两个使用事实暴露了它的局限：

1. **世界是持续演化的。** 用户不会在一次性引导后停止；他会在后续创作中不断补充事件、调整关系、修订设定。有终点 = 用户必须反复离开对话回到表单，把持续对话拆成一次次一次性引导，这与「Create Once. Understand Forever」的长期愿景相悖。
2. **产品形态已转向本地单用户（ADR-0013）。** 无登录、打开即用的工具形态（类似 Trae 本地模式）下，会话归属顾虑消失，持续对话的成本与风险显著下降。

宪法 §9.2 原文把「A chatbot」列为永久否定项。本修订通过修宪（同一变更内）把 §9.2 调整为「允许对话式创作入口，但对话记录只是会话工作底稿，创作宇宙的唯一表示形式是结构化实体」——红线的实质（聊天日志不能成为创作宇宙的表示）完整保留。按 [adr-guide.md](../adr-guide.md) §5 的处理阶梯：本修订走 **Rung 4（修宪）**，并用下述围栏保护修订后的 §9.2。

## Principles at Stake

- **Serves §10 North Star：** 降低建立与持续经营 IP 世界的门槛，直接服务 compounding universes。
- **Serves P8（记忆复利）：** 对话中确认的世界知识被写入结构化实体（`Project` / `Character` / `Location` / `WorldEvent` / `Relationship`），而不是留在对话记录里被丢弃。
- **Serves P3（核心无头）：** 对话的每个落库动作都经既有 API service 语义执行，不产生只存在于 UI 的能力。
- **Strains P6（人类权威）：** 持续对话若自动推进，可能变相绕过确认与 review gate。围栏第 1、3 条与 tripwire 直接针对这一点。
- **Serves §9.2（修订后）：** 对话是创作入口，但创作宇宙的唯一表示形式始终是结构化实体。

## Decision

我们把 **Creator Chat 定义为世界优先的持续对话创作入口（world-first continuous conversation surface）**——Codex 风格的 agent 页面，不是一次性向导，也不是通用聊天助手。

- **打开应用即进入（`/`），无登录门禁**（ADR-0013 本地单用户模式）。
- 对话围绕「世界」进行：对话中确认「创建世界」提案即自动创建 `Project` 并将线程绑定到该 `projectId`；后续实体/事件/关系提案全部挂到该世界。
- **创作载体永远是结构化实体**（`Project` / `Story` / `Character` / `Location` / `WorldEvent` / `Relationship`），一律先落 `draft`。
- **自动落库 = 用户确认提案后**，由系统经既有 service 语义写入（`apply-intent` 分发到 project / assets / world-events / relationships service），不是 AI 自主写库。
- 对话记录（`creator_chat_*` 表）是**会话工作底稿**：仅用于会话连续性，不进入领域模型、不参与继承解析、不参与导出。

**围栏（fence）——以下每一条都是硬约束：**

1. **写库必须有提案且经用户确认。** AI 永不自主写库：agent 只产出结构化提案，用户确认后由系统经既有 service 语义写入；不存在任何跳过确认的路径。幂等键 = `message_id + proposal_key`。
2. **对话记录不是创作宇宙的表示。** 对话记录是会话工作底稿，不进入领域模型、不参与继承解析、不参与导出；创作宇宙的唯一表示形式是结构化实体。
3. **产物默认 draft，gate 不可绕过。** 所有落库实体一律 `draft`，必须经过既有 review gate 才能被下游依赖；不得直接产出 approved 状态的对象。
4. **走同一套治理与计费。** 每次生成沿用既有 usage 埋点、budget 与 provenance 归属（P7），不新增计费路径。

**与 Director Copilot 的关系：** 两者是不同的东西，边界不得混淆。Creator Chat 是**应用默认入口的持续对话 agent**，面向所有世界（含尚不存在的世界）；Director Copilot 是**项目内的常驻咨询侧栏**，面向已存在的项目，其 scope lock 由 [Director Copilot RFC](../rfc/Director-Copilot-RFC.md) 单独管辖，本 ADR 不放宽它的任何限制。

**Tripwire —— 触发任意一条即回滚该能力并重新评审：**

- 出现任何未经用户确认的落库；
- 任何产物绕过 gate 进入下游；
- 会话记录被纳入创作层导出或版本化；
- 结构化工作区不可达（用户无法进入 Studio 评审/编辑/版本化结构化实体）。

## Alternatives Considered

### 有终点的引导向导（原 ADR-0010 决策）

体验上更可控，流程有边界。它输在两个使用事实上：世界是持续演化的，一次性引导无法覆盖后续的世界经营；且在有登录门禁的假设下才需要「引导完成后交接」这种强边界。本次修订已由 Revision 小节记录，完整旧决策保留于「被取代内容」区。

### 完全不做自然语言入口，只提供表单式向导

围栏最硬，零风险。它输在没有解决实际问题：表单式向导要求用户在填写之前就知道自己的世界有哪些维度，而新用户恰恰不知道——自然语言的价值就在于用户可以先说「我想创造一个东方玄幻世界」，由系统追问出维度。

### 扩展 Director Copilot 覆盖新建项目场景

复用既有能力，不新增表面。它输在两者的 scope 与生命周期完全不同：Copilot 绑定 `projectId`、常驻、只读问答优先；Creator Chat 面对的是整个应用（含尚不存在的 `Project`），且必须能写。硬合并会迫使放宽 Copilot 的 scope lock，反而削弱既有约束。

### 先做，边界之后再定

最快。它输在 [adr-guide.md](../adr-guide.md) §5 的明确禁止：在冲突未解决的情况下推进，或在代码中隐式解决冲突，是永不可接受的。

## Trade-off Record

| We gained | We gave up | Horizon |
|-----------|------------|---------|
| 世界可持续演化：对话成为常态创作入口 | 一次性引导的流程确定性 | 永久 |
| 门槛降到最低：打开即用、无登录（ADR-0013） | 多用户/云服务下的会话归属 | 永久，直到引入云服务（届时由新 ADR 恢复 userId 隔离） |
| 对话记录定位为工作底稿，风险面收窄 | 对话本身不能作为创作成果被评审/导出 | 永久；这正是修订后 §9.2 的边界 |
| 产物全部为 draft、经确认与 gate | 「一句话生成完整世界」的营销卖点 | 永久；这正是宪法 §9.1 拒绝的形态 |

## Consequences

**变得更容易的：**

- 新用户的第一屏就是创作对话，与其真实意图对齐，不再是 `Story` 编辑器，也没有登录墙。
- 世界知识随对话持续沉淀为结构化实体，天然服务 P8 记忆复利。

**变得更难的：**

- 需要持续守护围栏：确认 → 落库的链路必须唯一且可观测。
- 对话记录与创作实体两套数据并存，运维上必须严格隔离。

**新增义务：**

- Track J 实现时必须提供可观测的证据：每个落库动作都有对应的用户确认记录、产物均为 draft、均经既有 gate。
- 能力爬坡按「一步一步实现」：V1.0 落地 IP 核心数据库 + Creator Chat（提案 → 确认 → 落库）+ 世界线视图；冲突检测、智能体主动引导增强（主动询问剧情节奏）、chat SSE 流式列为后续迭代。

## Compliance

- 数据库可抽查：任何对话驱动的写入均有 `message_id + proposal_key` 幂等键与用户确认记录。
- 每个落库实体状态为 `draft`；对话记录不出现在创作层导出数据中。
- 每次生成带 usage 埋点与 provenance 归属（P7）。
- Director Copilot 的 scope lock 不因本 ADR 而放宽；任何引用本 ADR 来扩大 Copilot 范围的提案无效。

---

## 被取代内容（Superseded content）

> 以下为 2026-08-04 修订前 ADR-0010 的旧决策全文，保留备查。旧决策已失效，以本文「Decision」为准。

### 旧决策

我们把 **Creator Chat 定义为引导式世界创建向导（guided world-creation wizard）**，不是对话式创作面，不是通用聊天助手。

它的职责是：用自然语言采集创作意图，引导用户补全世界背景、力量体系、主角设定与核心冲突，并产出结构化的 `Project`、`Asset(type=character)`、`Asset(type=location)`、`WorldEvent` 与 Relationship **草案**。引导完成后，用户进入结构化工作区（Studio）继续创作。

**围栏（fence）——以下每一条都是硬约束：**

1. **产物是结构化实体草案，不是对话记录。** 对话内容本身不是创作载体，不进入领域模型，不参与继承解析，不出现在导出数据的创作层。
2. **有终点。** 向导是有边界的流程，完成后交接到结构化工作区。它不是常驻的通用问答界面，不是 studio 全局 chat，不是独立 chat 首页。
3. **所有产物为 draft。** 向导产出的每个实体进入 `draft` 状态，必须经过既有的 review gate 才能被下游依赖。向导不得直接产出 approved 状态的对象。
4. **不得绕过任何 mandatory gate。** visual-assets 审核与 prompt review 的强制状态原样适用。向导没有任何特权路径。
5. **不改变权威关系。** AI 提议，人类决定（P6）。向导的每一步产物对用户可见、可编辑、可拒绝。
6. **走同一套治理与计费。** 向导的每次生成沿用既有 metering、budget 与 provenance 归属（P7），不新增计费路径。

**与 Director Copilot 的关系：** 两者是不同的东西，边界不得混淆。Creator Chat 是**入口期的一次性引导流程**，面向尚不存在的世界；Director Copilot 是**项目内的常驻咨询侧栏**，面向已存在的项目，其 scope lock 由 [Director Copilot RFC](../rfc/Director-Copilot-RFC.md) 单独管辖，本 ADR 不放宽它的任何限制。

**Tripwire —— 触发任意一条即拆除围栏、暂停 Track J 并重新评审：**

- 出现任何未经 review gate 的向导产物；
- 向导演变为常驻的通用问答界面，或出现独立 chat 首页；
- 对话记录本身开始被当作创作产物存储、版本化或导出；
- 向导直接产出 approved 状态的领域对象；
- 用户在向导中完成创作后不再进入结构化工作区——这意味着结构化世界模型实际上已被对话取代。
