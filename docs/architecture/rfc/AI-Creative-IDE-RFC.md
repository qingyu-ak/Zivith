# AI Creative IDE RFC

> Zivith Entity-first 创作工作区
>
> Version: 0.1
>
> Status: 草案 — 产品布局与能力递进；非实现清单
>
> Opened: 2026-07-29
>
> Related: [Entity + State + Timeline + Track](../entity-state-timeline-track.md), [Director Copilot RFC](Director-Copilot-RFC.md), [ADR-0007](../adr/0007-preserve-current-state-with-immutable-creative-history.md)

---

## 1. 问题陈述

创作者目前在 Project、Story、Asset、Workflow、Shot 页面之间来回切换。他们无法在同一处检视世界 Entity、观察其 State 如何随世界编年变化、把该编年与 Story 中展示的顺序关联起来，并在同一选定上下文中向 AI 导演提问——除非手工重建这些上下文。

代价是上下文碎片化：Entity 一致性靠创作者记忆维持，Timeline 推理被简化为列表顺序，Agent 对话缺少稳定的视觉焦点。

## 2. 愿景对齐

该工作区推进可复利的创作宇宙，以及人/AI 交替操作。它以持久的 Entity State 为创作中心，同时保留结构化的 Story → Scene → Shot 语义与无头（headless）命令。

## 3. 宪章核对

| 原则 | 影响 |
|---|---|
| P1 意图即资产 | 服务：Inspector 与 Timeline 在产出之前暴露结构化意图 |
| P2 领域即契约 | 服务：UI 读取专用的 Entity/State 契约 |
| P3 无头核心 | 约束：每一次编辑与 Timeline 移动都必须存在对应 API 命令 |
| P6 人类权威 | 服务：AI 建议需确认；审核门禁保留 |
| P8 记忆复利 | 服务：State 历史与 Timeline 成为可见的工作记忆 |
| D3 不以节点画布为主 | 合规：用 Timeline 与层级，而非工作流图 |
| D4 不做完整 NLE | 约束：语义 Track 不会变成帧级剪辑/特效 |

**张力：** 四栏 IDE 可能冲击「默认简单」。因此默认工作区打开聚焦的 Entity/Story 视图；高级 Track 与控制台保持可折叠。

## 4. 范围锁定

### 是

- 以 Project 为范围的 AI 创作 IDE；
- Entity Explorer、以 Presentation 为主的 Timeline（可选 World Time 叠加）、Director Console、Entity Inspector；
- 各栏之间的选择同步；
- 由 API 支撑的 Entity State 与 Timeline 编辑；
- 中文优先 UI，支持键盘与指针操作。

### 不是

- 节点工作流画布；
- 非线性视频编辑器；
- 全局聊天机器人首页；
- Story → Scene → Shot 层级的替代品；
- AI 编辑或审批的权限旁路；
- 在替代能力未对齐前移除现有聚焦路由的理由。

## 5. 布局

```text
┌──────────────┬───────────────────────────────┬────────────────┐
│ Project      │ Timeline                     │ Entity         │
│ Explorer     │ Presentation + World Overlay  │ Inspector      │
│              ├───────────────────────────────┤                │
│              │ Director Console / Agent Chat │                │
└──────────────┴───────────────────────────────┴────────────────┘
```

### Project Explorer

- Project → Story → Scene → Shot 层级；
- Character、Location、Object、Event、Organization 集合；
- 搜索、筛选、过期/审核徽章；
- 选择变更会更新 Inspector，并高亮 Timeline Items。

### Timeline

- Presentation 顺序为稳定主轴；除非展示显式绑定，否则 World Time 跟随；
- 可切换或叠加 Project 定义的世界维度，无需归一化；
- 语义 Track 分组；
- 虚拟化渲染；
- 明确区分固定 revision 与跟随当前的 Item；
- 移动 Item 仅提交 Timeline 命令。

### Director Console

- 绑定到 Project 与当前选择；
- 解释 State/历史/一致性；
- 后续可提议带 diff 与确认的命令；
- 工作深度选择器由 [Agent Effort Control RFC](Agent-Effort-Control-RFC.md) 定义。

### Entity Inspector

- 当前 State 与 state-family 徽章；
- revision 历史；
- 引用关系与受影响的下游产物；
- 通过领域专用表单编辑字段；
- 对比当前/固定 revision。

## 6. 能力递进

### Slice A — 只读同步工作区

- Explorer + Inspector；
- 基于现有 Scene/Shot 顺序的只读 Presentation Timeline；
- 仅 Scene、Character、Shot Tracks；
- 不要求 World Time 输入；缺失绑定时跟随 Presentation 顺序；
- 选择与深链接；
- 既有编辑器仍作为变更面。

晋级证据：创作者无需离开工作区即可回答「这个 Shot 使用哪个 Character State，以及它在两种时间轴上分别出现在哪里？」

### Slice B — 结构化 Entity 与 Timeline 命令

- Inspector 通过现有/新增 API 编辑；
- 显式 TimelineItem place/move/remove；
- 乐观冲突与 diff UI；
- undo 意味着补偿命令，而非删除历史。

晋级证据：编辑与移动在刷新后仍存在，保留历史，且无法绕过审核。

### Slice C — Director Console

- 先做只读问答；
- 建议变更并展示可见 diff；
- 随后才支持确认后的命令；
- 无隐藏突变。

晋级证据：用户可接受/拒绝建议，归因完整，且不绕过门禁。

### Slice D — 一致性叠加层

- Entity State、Presentation 顺序与可变 World Time 绑定之间的矛盾；
- 应用 State 变更前的影响预览；
- 不做自动静默修复。

## 7. 交互规则

- 一套全局选择模型：`{entity_ref, revision?, timeline_item_id?}`。
- URL 应在可行时编码稳定的工作区范围与选择。
- Timeline 拖拽在提交前同时展示两个轴。
- 固定 revision 的 Item 显示锁定/历史标记。
- AI 提议的变更须展示受影响 Entity、字段、过期传播，以及预估生成花费。
- 破坏性操作需要领域专用确认，而非通用聊天确认。

## 8. 风险评估

| 类别 | 风险 | 缓解 / 负责人 |
|---|---|---|
| 领域契约 | UI 可能发明 Entity State 中不存在的字段 | Schema 驱动的 Inspector；领域负责人评审 |
| 持久数据 | 拖拽/编辑可能部分持久化 | 原子命令 + expected revision；API 负责人 |
| 承诺 | 工作区 URL 与 Track 行为可能变成公共契约 | 保持草案并版本化 API；产品负责人 |
| 权威 | Console 可能在缺乏明确同意时突变 | 先只读、可见 diff、显式确认 |
| 经济 | Deep effort 可能触发昂贵工作 | 预算预览与 Agent Effort 策略 |
| 锁定 | 模型专用 UI 可能泄漏 | Model Track 只读溯源投影 |
| 复杂度 | 四栏让新手不堪重负 | 可折叠栏、聚焦默认、Slice A 可用性测试 |

## 9. 迁移

1. 新增工作区路由，不移除既有路由。
2. 复用既有 Project/Story/Shot/Asset 读取。
3. Timeline 栏位以 Entity State/Timeline API 就绪为门控。
4. 在 Slice B 完成前，保留当前编辑器作为回退。
5. 回滚方式为隐藏工作区入口；不删除任何 Entity 或 Timeline 数据。

## 10. 验收标准

- 创作者可在同一工作区导航 Entity 与层级。
- Presentation Time 可见地为主轴；显式 World Time 偏离与活动维度不含糊。
- 虚构历法值对核心 UI 保持不透明，除非 Project 维度渲染器可用。
- Track 语义与架构文档一致。
- Timeline 移动永不静默改变 Entity State。
- 不存在仅存在于 UI 的能力；突变调用持久 API。
- Director Console 不能绕过权限、审核门禁或预算。
- 迁移期间既有聚焦编辑器路由继续可用。
- 键盘导航、焦点顺序、调整尺寸与折叠行为通过无障碍评审。
