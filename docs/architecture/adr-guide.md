# ADR 指南

> Architecture Decision Records — Zivith 的治理
>
> Version: 1.0
>
> Status: Ratified — companion to the Architecture Constitution
>
> Horizon: 5–10 years
>
> Related: [architecture-principles.md](architecture-principles.md)（宪章）, [rfc-guide.md](rfc-guide.md)

---

## 目的

Architecture Decision Record（ADR）是 Zivith 为何如此成形的永久记忆。代码展示决定了什么；只有 ADR 保留被拒绝了什么、放弃了什么交易，以及何种证据驱动了选择。

在 5–10 年视野内，做出今日决策的每个人终将离去——被新工程师、新 AI 代理，或已遗忘的自己的未来所取代。ADR 存在，是为了无人再需从实现反推意图，也是为了原则不会通过一连串各自合理的决策而默默侵蚀。

本指南刻意与技术无关。它治理关于边界、契约与权威的决策——不是关于库的决策。

---

## 1. 何时需要 ADR

宪章（§8）按可逆性分类决策。该分类即触发条件。

### 当决策满足下列情形时，ADR **强制**：

| 触发 | 为何不可逆 |
|---------|------------------------|
| 变更**领域契约**——实体、层级语义、继承规则、身份、审批状态 | 用户的创意宇宙依其存储（P2） |
| 变更**已存创意数据的含义或生命周期**，包括溯源与版本语义 | 历史绝不可被默默改写（宪章 §3） |
| 做出或变更**公开承诺**——可编程接口契约、导出格式、兼容保证 | 第三方依承诺构建；收回承诺是背叛，不是重构 |
| 增加、移除或重定义**编排原语**（持久步骤、中断、恢复、扇出、局部重算） | 每个工作流定义都依赖原语集（P5） |
| 在任一方向移动**评审门禁的强制状态** | 门禁放置是策略，但变更会重新分配人类权威（P6），必须留下痕迹 |
| 变更**能力边界**——系统向外部模型要求什么，或如何隔离波动性 | 边界使系统其余部分长寿（P4） |
| 触及**边界治理**——身份、权限、预算或速率语义 | 治理先于自治（§7）；削弱它是安全事件 |
| **牵制或违背任何宪章原则**，或解决原则之间的冲突 | 见下文 §5 |
| **激活延期决策**（宪章 §11，D1–D6）或变更其再议触发 | 延期本身是架构决策；结束它必须同样刻意 |

### 下列情形**不**需要 ADR：

- 可逆、局部选择——任何可由限于稳定边界后单一组件的变更撤销者。
- 在已决定边界内的实现选型（哪个库、哪个算法、哪个存储引擎）。
- 重述宪章已解决之事。仅重新论证已批准原则的 ADR 是噪音。

**检验：** *若该决策两年后被证明错误，撤销成本是什么？* 若答案是「有界重写」，则迅速、局部决定。若答案涉及迁移已存数据、向第三方重新承诺，或重新谈判人类权威——写 ADR。

在可逆决策上耗仪式，与在不可逆决策上跳过仪式，同样是失败。存疑时问检验问题，而非本表。

---

## 2. 与架构宪章的关系

权威层级严格且单向：

```
Architecture Constitution        (what must remain true)
        ↓ constrains
ADRs                             (how the Constitution is applied to a decision)
        ↓ constrain
RFCs and implementation plans    (how a change is designed and executed)
```

关系规则：

1. **每份 ADR 必须引用宪章。** 模板中的 *Principles at Stake（攸关原则）* 一节不可省略。ADR 必须点名决策**服务**哪些原则、**牵制**哪些原则。「无牵制」仅在论证后才是合法答案，不可断言。
2. **默默与宪章相悖的 ADR 无效**——这重申宪章自身的至上条款。日后发现此类 ADR，意味着两份文档之一必须被正式纠正。
3. **ADR 解释；不修订——仅有一类例外。** **宪章修订 ADR（Constitutional Amendment ADR）** 是宪章变更的*唯一*机制（§8：「宪章可修订；不漂移」）。它承担更重负担：驱动变更的证据、重配置阶梯的耗尽（模型 → 工作流定义 → 门禁策略 → 领域加深 → 修订），以及被修改原则的全文。
4. **平局时宪章胜。** 当决策诱人而原则禁止时，默认结果是决策落败。举证责任始终在变更一方，从不在原则一方。
5. **先例向下累积。** Accepted ADR 约束未来 ADR，方式同宪章约束它们，直至被取代。新 ADR 仅可显式推翻旧 ADR（见生命周期，§6）。

---

## 3. ADR 标准模板

一决策一文件：`docs/architecture/adr/NNNN-short-slug.md`，顺序编号，永不重编号，永不删除。

```markdown
# ADR-NNNN: <Decision title — an active sentence, not a topic>

- **Status:** Draft | Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
- **Date:** YYYY-MM-DD (of the status shown)
- **Deciders:** <who holds authority for this decision>
- **Class:** Standard | Constitutional Amendment
- **Reversibility:** Reversible | Costly | Irreversible

## Context

What situation forces a decision now? What evidence exists?
State the forces neutrally — a reader should not be able to guess
the outcome from this section.

## Principles at Stake

- **Serves:** <principle> — <how>
- **Strains:** <principle> — <how, and why this is acceptable> | None (argued)

## Decision

The decision, in one or two declarative sentences. Present tense.
("We treat X as Y." — not "we should consider…")

## Alternatives Considered

For each rejected alternative: what it was, what it offered,
and the specific reason it lost. An ADR with no real alternatives
was not a decision.

## Trade-off Record

| We gained | We gave up | Horizon |
|-----------|------------|---------|
| ...       | ...        | when this trade should be re-examined |

## Consequences

What becomes easier, what becomes harder, what new obligations exist
(migrations owed, docs to update, revisit triggers to register).
Include negative consequences honestly — they are this section's
entire reason to exist.

## Compliance

How will we know this decision is actually being followed?
(A boundary that can be violated invisibly will be.)
```

保持 ADR 简短——一至三页。篇幅通常是未决决策或数个决策捆进一条记录的症状。拆分捆绑。

---

## 4. 如何记录架构权衡

权衡是架构的实质；其余皆是画框。规则：

1. **以被牺牲方自己的术语命名牺牲。** 「我们选择一致性而非可用性」诚实。「我们两全其美」说明权衡未被理解。若 ADR 不含牺牲，要么决策琐碎（无需 ADR），要么分析不完整。
2. **为每笔交易附上视野。** 交易相对上下文做出——模型可靠性、团队规模、用户数——而上下文会变。权衡表每一行命名应再审视交易的条件（「当代理发起流量超过人类流量时」「当导出格式有外部消费者时」）。这把权衡从永久教条转为被监控的立场。
3. **区分三种货币。** 多数 Zivith 交易在以下之间交换：**可选性**（保持未来开放）、**简单性**（更少建造、更少记在脑中）、**能力**（用户现在得到什么）。点名花费了哪种货币，可防止最常见的自欺——用可选性买能力却相信用的是简单性。
4. **宪章自身的已解决张力是家风。** 每一条（自动化 vs. 强制门禁；开放格式 vs. 过早发布；工作流即数据 vs. 无节点画布；装配层 vs. 无编辑器）都以全力陈述双方，然后裁决。仿效该结构：一方被稻草人化的权衡记录，熬不过第一个持有被稻草人化观点的人。

---

## 5. 处理与既有原则冲突的决策

拟议决策终将与宪章碰撞。程序是阶梯——在解决冲突的第一级停下：

**第 1 级 — 重新审视诊断。** 多数「原则冲突」是误诊的层冲突。应用宪章的重配置阶梯（§8）：需求能否通过在能力边界后替换、重塑工作流定义，或调整门禁*策略*满足？在重框下消解的冲突从未是冲突。（先例：「工作流即数据 vs. 无节点画布」在引擎与 UI 按层分离后完全消解。）

**第 2 级 — 拒绝决策。** 默认。原则经受的考验长于提案。若提案可能反复出现，仍以短 ADR 记录拒绝——有文档的「否，理由如下」可防止同一辩论年年发生。

**第 3 级 — 约束决策。** 有时决策可在保护原则的围栏内推进：有时限、限定为实验，或禁止触及已存数据与公开承诺。ADR 须随即陈述围栏，以及拆除实验的绊线。

**第 4 级 — 修订宪章。** 若原则本身错误——世界变了、证据充分、第 1–3 级已耗尽——写宪章修订 ADR。永不同时保留原则与与之相悖的决策：包含自身矛盾的架构，把真正决策委托给最后实现的人。

**绝不可接受：** 在冲突未解决时推进，或在代码中隐式解决。宪章规则明确——实践偏离原则意味着二者之一为错，偏离本身必须被裁决，而非被常态化。

---

## 6. ADR 生命周期

```
Draft ──▶ Proposed ──▶ Accepted ──▶ Superseded by ADR-XXXX
                │                └─▶ Deprecated
                └─▶ Rejected (retained)
```

| Status | 含义 | 规则 |
|--------|---------|-------|
| **Draft** | 撰写中；尚未评审 | 可自由变更 |
| **Proposed** | 决策者评审中 | 评审窗口有界；沉默不是同意——无人决策的 Proposed ADR 应升级，而非合并 |
| **Accepted** | 生效；约束未来工作 | **不可变**，状态变更与仅追加的附录节除外。要变更决策，写新 ADR |
| **Rejected** | 已考虑并拒绝 | 永久保留；拒绝也是先例 |
| **Superseded** | 被较新 ADR 取代 | 两条记录交叉链接；旧 ADR 是历史，不是错误 |
| **Deprecated** | 不再适用（上下文消失）且无物取代 | 需要注明日期的说明，解释发生了什么变化 |

使系统持久的生命周期规则：

1. **仅追加记忆。** Accepted ADR 永不被编辑成与当下一致。若现实偏离，偏离记录在取代记录中。可被重写的决策日志不是日志。
2. **每份 ADR 命名其再议触发**（来自权衡视野，§4）。定期架构评审遍历 accepted 集合并检查触发——组织由此在生产失败*之前*注意到交易上下文已过期。
3. **取代是光荣的。** 被更好证据推翻的 ADR 完成了工作：它使原始推理廉价可再审视。应惧怕的失败模式不是被取代的 ADR；而是无可取代记录的决策。
4. **宪章修订 ADR 额外在同一变更中更新宪章正文**，使两份文档从不同意见长于一次提交。
