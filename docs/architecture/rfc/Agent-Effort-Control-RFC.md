# Agent Effort Control RFC

> Zivith Agent 工作深度控制
>
> Version: 0.1
>
> Status: 草案 — 策略契约；非实现清单
>
> Opened: 2026-07-29
>
> Related: [AI Creative IDE RFC](AI-Creative-IDE-RFC.md), [Director Copilot RFC](Director-Copilot-RFC.md), [AI Agent Collaboration](../../domain/AI-Agent-Collaboration.md)

---

## 1. 问题陈述

创作者在不同时刻需要不同的取舍。一次快速命名建议不该支付跨世界一致性审查的延迟与成本；一次重大故事修订也不该只得到浅层速答待遇。今天，调用方可选择工作流与自动化级别，却无法通过一个稳定的产品控件表达期望的推理深度。

## 2. 愿景对齐

Effort Control 强化人类对 AI 调度的控制。它使成本、延迟与创作深度显式化，同时保留相同的 Entity 契约、审核权威与溯源。

## 3. 宪章核对

| 原则 | 影响 |
|---|---|
| P3 无头核心 | Effort 是 API 策略，而非仅聊天内开关 |
| P4 波动性隔离 | 级别描述行为/预算，从不描述提供商或模型 ID |
| P5 工作流即数据 | 编排器把 effort 解释为有边界的执行策略 |
| P6 人类权威 | Effort 不能移动或绕过审核门禁 |
| P7 可记录/可计价 | 有效策略与花费被持久化 |
| P8 记忆复利 | 深度一致性发现可成为经审核的 Project 知识 |

**张力：** effort 抽象可能承诺其无法保证的质量。因此标签描述资源策略与检查项，而非结果质量。

## 4. 范围锁定

### 控制范围

- Agent 扇出上限；
- 上下文预算；
- tool/skill 调用预算；
- 一致性检查范围；
- 批评/修订轮次；
- 延迟与花费护栏。

### 不控制范围

- 用户权限；
- 强制审核门禁；
- 领域转换是否合法；
- 领域中的提供商/模型身份；
- 是否允许超出 Project 限额的花费；
- 是否允许未经确认的突变。

## 5. 级别

| 级别 | 预期用途 | 策略形态 |
|---|---|---|
| `fast` | 局部回答或小幅编辑 | 一个主 Agent、窄上下文、无大范围跨 Track 扫描 |
| `balanced` | 默认创作工作 | 相关 Entity 邻域、标准工具、定向一致性检查 |
| `deep` | 重大创作决策 | 更广 Project 上下文、有界并行专家、批评轮次、跨 Track 一致性 |

服务器同时返回请求策略与有效策略。预算、能力或管理员限制可能降级执行，但 UI 必须披露降级。

```ts
interface AgentEffortRequest {
  level: 'fast' | 'balanced' | 'deep';
  max_cost?: number;
  max_latency_ms?: number;
}

interface EffectiveAgentEffort {
  requested_level: AgentEffortRequest['level'];
  effective_level: AgentEffortRequest['level'];
  policy_version: string;
  limits: {
    max_agents: number;
    max_tool_calls: number;
    max_context_tokens: number;
    max_revision_passes: number;
  };
  downgrade_reason?: string;
}
```

精确数值默认值属于版本化配置，不属于本 RFC。

## 6. 执行契约

1. 客户端随 Agent 命令提交 effort。
2. 服务器将请求级别与 Project 预算、用户权威、工作流策略及可用能力求交。
3. 有效策略在执行前持久化。
4. 编排器在硬上限内调度。
5. 每一次生成/工具调用保持归因与计量。
6. 结果记录请求/有效级别、已执行检查、截断与花费。

Effort 向下可建议、向上有边界：运行时在限额要求时可做得更少，但不得静默超出上限。

## 7. UI 行为

- Composer 控件：Fast / Balanced / Deep。
- 除非 Project 策略另有规定，默认 Balanced。
- 运行前展示相对延迟/成本预估。
- Deep 展示将额外运行哪些检查。
- 降级或部分完成在结果中可见。
- 记住每 Project/用户偏好，但每条命令展示有效级别。
- 不暗示「Deep = 正确」或「Fast = 低质量」。

## 8. 与自动化的关系

Effort 与自动化正交：

- 自动化控制系统在何处为人类权威暂停；
- effort 控制在已允许的 Agent 执行内使用的资源；
- Deep 运行仍会在强制门禁处停止；
- full_auto 不授予无限 Deep 花费；
- 重试保留或显式更改 effort，并获得新的命令关联。

## 9. 风险评估

| 类别 | 风险 | 缓解 / 负责人 |
|---|---|---|
| 领域契约 | effort 泄漏进创作 State | 仅存为执行溯源；领域负责人 |
| 持久数据 | 策略变更使旧运行不清晰 | 持久化 `policy_version`；编排负责人 |
| 承诺 | 用户把级别解读为质量保证 | 以策略为中心的文案；产品负责人 |
| 权威 | Deep 扇出超出确认边界行动 | 相同的命令/门禁边界；安全负责人 |
| 经济 | 扇出放大花费 | 硬性 Project/用户上限与预检估算 |
| 锁定 | 级别映射到厂商档位 | 仅能力驱动的调度器 |
| 复杂度 | agent 选择不一致的策略 | 版本化策略测试与可观测性 |

## 10. 迁移

1. 在 Agent 命令信封中增加可选 `effort`；缺省表示 Balanced。
2. 在 WorkflowStepAttempt/usage 元数据中持久化请求/有效策略。
3. 初期将所有级别映射到既有单 Agent 执行，同时收集指标。
4. 先启用 Fast 收窄，再在特性开关后启用 Deep 检查。
5. 回滚方式为将每个请求映射到 Balanced；历史溯源仍可读。

## 11. 验收标准

- Fast/Balanced/Deep 可通过 API 与 UI 使用。
- 有效策略对给定策略版本是确定性的，并对用户可见。
- 任何级别都不能绕过权限、审核门禁、状态机或花费限额。
- 提供商/模型名称不出现在领域 effort 契约中。
- 每一次付费调用保持计量与关联。
- 降级、截断与部分检查被披露。
- Deep 跨 Track 检查通过正常读 API 消费 Entity State/Timeline。
- 回滚到仅 Balanced 无需创作数据迁移。
