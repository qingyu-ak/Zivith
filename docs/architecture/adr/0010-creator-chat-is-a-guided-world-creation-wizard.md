# ADR-0010: Creator Chat is a guided world-creation wizard, not a conversational creation surface

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** Project owner / architecture maintainer
- **Class:** Standard
- **Reversibility:** Reversible
- **Source RFC:** [IP World Model Repositioning RFC](../rfc/IP-World-Model-Repositioning-RFC.md)

## Context

[ADR-0008](0008-zivith-is-an-ai-understandable-ip-creation-system.md) 的新定位包含一个入口问题：想创建世界的普通用户，第一次打开 Zivith 时面对的是 `Story` → `Scene` → `Visual Prep` → `Shot` 的完整专业流程，而他脑子里想的只是「我想创造一个东方玄幻世界」。门槛与意图之间存在明显错位。

自然的解法是自然语言入口——用户描述想法，系统引导补全，后台产出结构化世界。但这个解法直接撞上两道既有约束：

宪法 §9.2 把「A chatbot」列为永久否定项：「Conversation may assist creation; it will never *be* the creation surface. A chat log is the weakest possible representation of a creative universe — unstructured, unversionable, unshareable, unreviewable.」

[Director Copilot RFC](../rfc/Director-Copilot-RFC.md) 进一步锁定：无 studio 全局 chat、无独立 chat 首页、v1 只读问答、Phase 3+。

按 [adr-guide.md](../adr-guide.md) §5 的处理阶梯逐级检查：

- **Rung 1（重新诊断）** — 冲突不因换个层次表述而消失。用户确实需要一个自然语言入口，这不是误诊。
- **Rung 2（拒绝）** — 拒绝意味着放弃普通用户入口，与 ADR-0008 确立的定位直接矛盾（新定位的价值前提之一就是让非专业用户也能建立 IP）。
- **Rung 3（加围栏）** — 可行。冲突的实质不在「用不用自然语言」，而在「对话记录是不是创作载体」。宪法反对的是后者。若自然语言只作为**意图采集手段**，产物是结构化实体草案而非对话记录，红线不被触碰。
- **Rung 4（修宪）** — 不需要，止于 Rung 3。

本 ADR 记录 Rung 3 的围栏与拆除围栏的 tripwire。

## Principles at Stake

- **Serves §10 North Star：** 降低建立 IP 世界的门槛，直接服务 compounding universes。
- **Serves P8（记忆复利）：** 引导过程中采集到的世界知识被写入 `Project` 结构化状态，而不是留在对话记录里被丢弃。
- **Serves P3（核心无头）：** 向导的每一步都对应既有或新增的 API 操作，不产生只存在于 UI 的能力。
- **Strains §9.2（永不成为 chatbot）：** 这是本 ADR 的核心张力。红线不撤销，改由下述围栏保护——对话是采集手段，创作面始终是结构化世界模型。
- **Strains P6（人类权威）若围栏失效：** 自然语言流程若自动推进，可能变相绕过 review gate。围栏第 3、4 条与 tripwire 直接针对这一点。

## Decision

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

## Alternatives Considered

### 做成通用对话式创作面（chat-first 产品）

体验最自然，用户可以全程对话完成创作。它输在宪法 §9.2 的核心论证依然成立：对话记录是创作宇宙最弱的表示形式——非结构化、不可版本化、不可分享、不可评审。这不是排期问题，是形态问题，Rung 3 的围栏正是为了保住这一点。

### 完全不做自然语言入口，只提供表单式向导

围栏最硬，零风险。它输在没有解决实际问题：表单式向导要求用户在填写之前就知道自己的世界有哪些维度，而新用户恰恰不知道——自然语言的价值就在于用户可以先说「我想创造一个东方玄幻世界」，由系统追问出维度。

### 扩展 Director Copilot 覆盖新建项目场景

复用既有能力，不新增表面。它输在两者的 scope 与生命周期完全不同：Copilot 绑定 `projectId`、常驻、只读问答优先；Creator Chat 面对的是尚不存在的 `Project`，且必须能写。硬合并会迫使放宽 Copilot 的 scope lock，反而削弱既有约束。

### 先做，边界之后再定

最快。它输在 [adr-guide.md](../adr-guide.md) §5 的明确禁止：在冲突未解决的情况下推进，或在代码中隐式解决冲突，是永不可接受的。

## Trade-off Record

| We gained | We gave up | Horizon |
|-----------|------------|---------|
| 普通用户可用的世界创建入口 | chat-first 产品形态的全部体验收益 | 永久，除非由 Constitutional Amendment ADR 推翻 §9.2 |
| §9.2 红线完整保留 | 向导实现复杂度高于纯对话（须产出结构化草案并接入 gate） | 若结构化产出成本被证明过高，重新审视的是实现方式而非围栏 |
| 与 Director Copilot 的边界一次性厘清 | 两条相似能力线并存的维护成本 | 当两者能力实质重叠时，考虑由 superseding ADR 合并 |
| 向导产物全部为 draft | 「一句话生成完整世界」的营销卖点 | 永久；这正是 §9.1 拒绝的形态 |

## Consequences

**变得更容易的：**

- 新用户的第一屏与其真实意图对齐，不再是 `Story` 编辑器。
- 引导采集到的世界知识直接沉淀为 `Project` 结构化状态，天然服务 P8。

**变得更难的：**

- 实现成本高于纯对话：每一步都要产出可编辑的结构化草案，并接入既有 gate。
- 产品叙述需要持续澄清「这不是 ChatGPT 式的创作」，与用户预期存在摩擦。

**新增义务：**

- Track J 实现时必须提供可观测的证据：向导产物均为 draft、均经过 gate。
- 向导的能力爬坡（先产出 `Project` 与 `Character` 草案，后扩展到 `WorldEvent` 与 Relationship）须与源 RFC 的 capability ramp 对齐。

**Tripwire —— 触发任意一条即拆除围栏、暂停 Track J 并重新评审：**

- 出现任何未经 review gate 的向导产物；
- 向导演变为常驻的通用问答界面，或出现独立 chat 首页；
- 对话记录本身开始被当作创作产物存储、版本化或导出；
- 向导直接产出 approved 状态的领域对象；
- 用户在向导中完成创作后不再进入结构化工作区——这意味着结构化世界模型实际上已被对话取代。

## Compliance

- 向导产生的每个领域对象在创建时必须为 `draft`，可通过数据库状态抽查验证。
- 向导调用的每一个操作都必须存在对应的 API 端点（P3），不得有 UI 私有路径。
- 对话记录不得进入创作层导出数据。
- 向导的每次生成必须带 provenance 与 budget 归属（P7）。
- Director Copilot 的 scope lock 不因本 ADR 而放宽；任何引用本 ADR 来扩大 Copilot 范围的提案无效。
