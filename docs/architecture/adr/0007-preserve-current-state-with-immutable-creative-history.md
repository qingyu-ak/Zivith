# ADR-0007: Preserve current domain state alongside immutable creative history

- **Status:** 已接受
- **Date:** 2026-07-29
- **Accepted:** 2026-07-30（Track H 排期于 `feat/track-h-entity-history`）
- **Deciders:** 项目所有者 / 架构维护者
- **Class:** Standard
- **Reversibility:** 代价高

## 背景

Zivith 将当前创意状态存储在专用的 Project、Story、Scene、Shot、Asset、PromptVersion、Output 及相关表中。选定动作还会写入 `AuditLog`；工作流与生成执行另有持久化。这支持当前读取，但并未保存完整的不可变 State 历史，也无法为跨世界编年与作品呈现顺序可视化 Entity State 提供稳定基础。

产品设计要求：

- 持久的 Entity 身份；
- 当前 State 加上不可变 State 历史；
- 一条以 Presentation Time 为主导的创意 Timeline，World Time 作为跟随维度的变量；
- 诸如 Character、Event、Shot、Camera、Prompt 与 Model 等语义 Track。

这会改变溯源与版本语义，并需要已存数据迁移，因此 ADR 为强制。详细提案见 [Entity + State + Timeline + Track](../entity-state-timeline-track.md)。

## 攸关原则

- **Serves P1：** 生成结果可标识产生它们的已提交 Entity revision。
- **Serves P2：** 专用领域实体保持权威，而不是迁到通用 JSON 实体模型。
- **Serves P3：** State 历史与 Timeline 行为是可编程操作，而非仅 UI 功能。
- **Serves P7：** 生成溯源引用确切的 Shot、Prompt 与视觉 revision。
- **Serves P8：** 世界变更与人类决策成为可持久的 Project 记忆。
- **Strains 简单性与存储成本：** 参与写入会增加不可变历史与投影工作。分阶段 rollout 与派生 Track 控制成本。
- **若被误解则 Strains D4：** 语义创意 Timeline 可能滑向非线性视频编辑器。Track 种类与明确的非目标守住边界。

## 决策

我们保留专用领域表作为当前 State 的权威，并增加仅追加的 Entity revision 作为 State 历史的权威。Presentation Time 是 Timeline 的稳定主轴。World Time 默认跟随它，并对相对、近似、区间或平行世界时间使用可选的 Project 定义绑定；Zivith 不标准化虚构历法值。Track 是该 Timeline 内的语义泳道。

已提交的系统事实使用独立名称 `ChangeEvent`。若日后引入备选创意版本，使用 `CreativeBranch`，而非 Track。这不是 Event Sourcing，也不是非线性视频编辑器。

## 已考虑的备选方案

### 完整 Event Sourcing

事件成为唯一真相源。这提供回放能力，但要求在用户获得 Timeline 价值之前重写当前持久化与投影。它落败，因为迁移与运维负担不成比例。

### 仅快照的当前状态

只保留当前行与已批准快照。这很简单，但无法展示 Character 演化、历史世界状态、精确生成溯源，或相对作品顺序的世界时间偏离。它落败，因为这些是主要需求。

### 把审计事件当作 Timeline

对 `AuditLog` 或 ChangeEvent 排序并直接展示。这记录的是数据库变更编年，不是世界编年或呈现顺序。它无法表达闪回、重复呈现或计划中的未来状态。它落败，因为混淆了三种不同时间。

### 用 Track 表示创意分支

把 Track 建模成类 Git 的分支。分支有用，但产品中的 Track 指 Character/Scene/Event/Shot/Camera/Prompt 泳道。它落败，因为共用术语会使 UI、API 与领域契约含糊。独立术语是 `CreativeBranch`。

### 通用 Entity 表

把每个领域对象搬进多态 JSON 表。这简化通用历史机制，但削弱领域约束、所有权、可查询性与迁移清晰度。它与 P2 矛盾并落败。

## 权衡记录

| 我们得到的 | 我们放弃的 | 再审视视野 |
|-----------|------------|---------|
| 不可变的 Entity 演化 | 更低的写入路径复杂度 | 若历史写入主导延迟则再议 |
| 稳定 Presentation 轴上的可变 World Time | 可全局排序的标准化世界编年 | 仅当真实项目证明需要共享历法契约时再议 |
| 稳定的 Track 语义 | 用同一术语兼指分支与泳道 | 永久，除非产品词汇被 superseding ADR 改变 |
| 保留当前 API 的增量迁移 | 立刻普及的 Timeline 编辑 | 仅在一致性证据出现后推进各阶段 |
| 派生的 Camera/Style/Model Track | 每条泳道完全独立编辑 | 当真实用例无法映射到既有 Entity State 时再议 |

## 后果

- 每个参与的 Entity 命令原子地更新当前 State、追加 EntityRevision，并记录 ChangeEvent。
- TimelineItem 位置与 Entity State 分离；移动条目不能静默突变 Entity 内容。
- Presentation Time 是必需的 Story/内容顺序，不是 Workflow 执行时间或数据库时间。
- World Time 默认跟随 Presentation Time，且不能假定 UTC、单一历法或单一标量维度。
- 核心仅标准化绑定信封；Project 定义的时间值保持不透明。
- Track 保留给语义 Timeline 泳道。
- CreativeBranch 可选，排在 Entity + State 与 Timeline + Track 之后。
- 既有审批快照保持冻结，不能被后续 Timeline 或上游变更改写。
- 迁移期间保留 `AuditLog`，仅在验证等价后才退役。
- 运行时表双写在 Track H H2+ 之前不开始；H1 仅冻结模式。CreativeBranch 合并 API 继续延期（H10）。

## 合规

- API 与模式不得对审计/变更事实使用 `TimelineEvent`；使用 `ChangeEvent`。
- API 与模式不得对分支使用 `CreativeTrack`；使用 `CreativeBranch`。
- 每个首发 TimelineItem 都有 Presentation Time。
- 缺失 WorldTime 绑定意味着 `follow`；显式绑定标识维度与关系/模式，但不要求标准化值。
- EntityRevision 与 ChangeEvent 在数据库权限边界上仅追加。
- 并发的过期 `expected_revision` 写入返回冲突。
- 生成完成追溯到输入 Entity revision ID。
- 派生 Track 不能成为领域真相的第二来源。
- Timeline 与 Agent UI 不能绕过既有评审或预算权威。
- 详细架构文档中的验收与回滚检查是发布门禁。
