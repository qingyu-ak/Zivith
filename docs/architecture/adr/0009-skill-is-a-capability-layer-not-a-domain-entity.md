# ADR-0009: Skill is a capability layer, not a domain entity

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** Project owner / architecture maintainer
- **Class:** Standard
- **Reversibility:** Reversible
- **Source RFC:** [IP World Model Repositioning RFC](../rfc/IP-World-Model-Repositioning-RFC.md)

## Context

[ADR-0008](0008-zivith-is-an-ai-understandable-ip-creation-system.md) 确立的新定位需要一个词来指称「把世界状态转换成生成请求」这条链路。产品讨论中这个词是 **Skill**：给定 `Character` 的当前 State、一个 `WorldEvent`、以及所处的 `Timeline` 位置，转换出可执行的生成指令。

问题在于这个词很容易滑向领域实体。一旦 `Skill` 有了 id、有了版本、能被 `Shot` 引用，领域模型就会变成 `Project / Character / Location / Scene / Shot / Skill / Asset / Workflow` 的并列清单——每加一种 AI 能力就加一个领域对象，十年后无法维护。宪法 §3 对此有明确规定：「模型靠加深而非加宽生长；每个新顶层概念都必须论证它为什么不能是既有概念的丰富化。」

更关键的是，这条链路**已经存在**，并且已经有正确的架构位置。宪法 P4 规定外部模型是外设，系统按能力（write、depict、animate、voice）而非按厂商寻址它们，中间隔着稳定的 capability boundary。现有的 `Shot Specification → Prompt Builder → PromptVersion → Video Provider → Output` 就是一条完整的能力链路。Skill 想要指称的东西，是这条既有链路的名字，不是一个新东西。

本 ADR 记录一次**拒绝**。按 [adr-guide.md](../adr-guide.md) §5 Rung 2，提案被拒绝但很可能反复出现时，应当留下「不，以及为什么」的记录，避免每年重新辩论一次。

## Principles at Stake

- **Serves P4（波动性隔离）：** 把 Skill 明确为 capability boundary 的命名，而非领域概念，加固了「无 provider 概念可进入 domain」这条边界。
- **Serves P2（领域模型是契约）：** 避免把一个尚在快速演化的能力抽象写进用户数据所依赖的契约里。
- **Serves §3（加深而非加宽）：** 这是本 ADR 的直接依据。
- **Strains：** 表达便利性。产品讨论中会反复出现「这个 Skill 的版本是哪个」这类问题，而系统里没有可指向的对象。这是可接受的——需要版本化的是 `PromptVersion`、模型配置与 `Output` 的 provenance，它们已经各自被版本化，Skill 本身不需要。

## Decision

我们把 **Skill 定义为能力层的命名，不是领域实体**。

Skill 没有 identity、没有 revision、没有 ownership，不落库，不出现在导出数据中，不能被任何领域对象引用。

分层关系是：

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

`Shot Generation Skill` 这样的命名指的是既有链路 `Shot Specification → Prompt Builder → PromptVersion → Video Provider → Output`，是讨论用的标签，不是新对象。

增强 AI 能力的正确做法是**增强 Skill 实现、替换 Provider**，而不是新增模型相关的领域对象。

## Alternatives Considered

### 新增 `Skill` 领域实体，带 id 与版本

让 Skill 可被引用、可被版本化，生成 provenance 可以指向具体 Skill 版本。它输在两点：一是它要解决的 provenance 问题已经由 `PromptVersion` 与 `Output` 的模型配置记录解决，属于重复建模；二是它把一个演化速度最快的层写进了演化速度最慢的契约，与 P2、P4 的分层意图完全相反。

### 把 Skill 建成 `Asset(type=skill)`

复用既有 Asset 机制，看似是「加深而非加宽」。它输在语义不成立：Asset 是属于创作宇宙、能跨年复用、可导出的创作资产；Skill 是系统能力，不属于用户的 IP，导出一个 Skill 对创作者毫无意义。硬塞进 Asset 会污染 Asset 的定义。

### 把 Skill 建成 workflow definition 的一部分

workflow-as-data（P5）已经是数据化的，Skill 可以是其中一类步骤定义。这个方案**部分成立**，且不被本 ADR 排除——若未来需要把能力调用参数化并让用户配置，正确的落点就是 workflow definition，而不是新领域实体。本 ADR 只拒绝「Skill 成为领域实体」，不拒绝「Skill 调用出现在 workflow 定义里」。

### 完全不引入 Skill 这个词

最保守。它输在产品讨论确实需要一个词来指称这条链路，禁用词汇不会消除概念，只会让讨论中出现各种临时叫法，反而更容易漂移。

## Trade-off Record

| We gained | We gave up | Horizon |
|-----------|------------|---------|
| 领域模型不因 AI 能力增加而膨胀 | 用统一对象描述「一次能力调用」的表达便利 | 当 provenance 需求无法由 `PromptVersion` + 模型配置覆盖时重新审视 |
| 一个可用于产品讨论的清晰词汇 | 该词汇没有对应的系统对象，需要反复解释 | 永久 |
| capability boundary 的边界更硬 | 用户自定义能力组合的近路 | 若出现真实的用户自定义能力需求，落点是 workflow definition（P5），届时另开 ADR |

## Consequences

- 任何 schema、API 或导出格式中都不得出现 `Skill` 作为实体。
- 新增 AI 能力的标准动作是：在 capability boundary 后新增或增强实现，必要时新增 Provider Adapter，领域模型不变。
- 产品文档使用 Skill 一词时，必须能指出它对应的既有链路。
- 若未来需要用户可配置的能力组合，走 workflow-as-data（P5）路径并另开 ADR，不复活 Skill Entity。
- 本 ADR 的存在本身是一份预防性记录：再次出现「加一个 Skill 表」的提案时，先读这里。

## Compliance

- Prisma schema、`packages/domain` 类型定义、API 契约中出现名为 `Skill` 的持久化模型即为违规。
- 导出数据中出现 Skill 对象即为违规。
- 任何领域对象持有 `skill_id` 字段即为违规。
- 代码评审与 ADR 评审时，凡提案引入新的顶层领域概念，须先检查它是否能表达为既有概念的加深——本 ADR 是该检查的判例。
