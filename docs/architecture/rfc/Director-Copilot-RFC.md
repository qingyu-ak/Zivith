# Director Copilot RFC (Thin)

> Zivith 项目侧栏「导演副驾驶」方向稿
>
> Version: 0.1
>
> Status: 草案 — 仅范围锁定；非实现规格
>
> Decided: 2026-07-21（产品问答）
>
> Related: [Design-Philosophy.md](../../product/Design-Philosophy.md), [AI-Agent-Collaboration.md](../../domain/AI-Agent-Collaboration.md), [Implementation-Plan.md](../../planning/Implementation-Plan.md), [Next-Tasks.md](../../planning/Next-Tasks.md), [AI-Creative-IDE-RFC.md](AI-Creative-IDE-RFC.md), [Agent-Effort-Control-RFC.md](Agent-Effort-Control-RFC.md)

---

## 1. 目的

记录**以项目为范围的 Director Copilot**的产品边界，使后续工作不漂移成全局聊天机器人，或绕过创作层级的旁路。

Zivith 仍是结构化影视制作 OS（Story → Scene → Visual Prep → Shot → Prompt → Video）。Copilot 是**侧边助手**，不是主要创作面。

---

## 2. 决策（已锁定）

| 主题 | 决策 |
|-------|----------|
| 放置位置 | **仅项目页**，绑定当前 `projectId` |
| 不是 | 无工作室全局聊天；无独立「聊天首页」 |
| v1 能力 | **仅问答** — 解释项目状态、层级，以及工作流卡在何处 |
| 后续能力 | **先 C 后 D**：提议/执行工作流命令并需确认；再编辑领域对象并需确认 |
| 审核门禁 | Copilot **不得**绕过强制门禁（如 visual-assets、prompt review） |
| 排期 | **Phase 3+**；**不**阻塞 Phase 2.5 提供商工作 |

---

## 3. 定位

```text
User ↔ Project sidebar Copilot
         │
         ├─ reads Project / Story / Scene / Shot / Workflow state
         ├─ answers questions in Chinese UI terms
         └─ (later) maps intent → Orchestrator / Agents / CRUD
                    with explicit user confirmation
```

- **是：** 项目副驾驶 / 导演助手  
- **不是：** 端到端视频聊天机器人；Shot Editor 或 WorkflowPanel 的替代品  
- 对齐设计哲学：*Zivith 不是 AI 聊天机器人*

---

## 4. 能力递进

### v1 — 仅回答（Phase 3+ 首个切片）

范围内：

- 汇总当前项目结构（stories、scenes、shots、assets）
- 解释活动或最近工作流运行状态，以及等待审核的步骤
- 指引用户到正确界面（如「去工作流审核提示词」「打开某镜头编辑」）
- 回答「这个门禁是什么意思？」类问题

v1 范围外：

- 启动或重试工作流
- 批准审核门禁
- 突变 Story / Scene / Shot / Asset 字段
- 直接调用真实视频/图像提供商

### 后续 — 先命令后编辑（在 v1 证明有用之后）

1. **命令（C）：** 经确认后，启动/重试工作流阶段、调整自动化级别、取消运行 — 始终通过既有 Orchestrator API；永不跳过强制审核  
2. **编辑（D）：** 经确认后，经既有 CRUD 修补领域对象；Copilot 起草变更，人类确认

v1 允许在回答中给出建议的下一步*建议*（仅文本）。真正执行这些步骤属于 C/D。

---

## 5. 与既有 agent 的关系

| 组件 | 相对 Copilot 的角色 |
|-----------|-----------------|
| Orchestrator | 工作流真相源；Copilot 后续可*请求*计划，不替代 DAG |
| Story / Scene / Shot / Prompt / Asset Agents | 阶段专家；Copilot 不吞并其职责 |
| WorkflowPanel | 人类审核 UI 对门禁仍具权威 |
| Shot Editor | 字段级创作编辑的权威面 |

Copilot 可使用与其他文本 agent 相同的 LLM 提供商适配器（例如 Phase 2.5 之后的 DeepSeek），但 v1 的工具面为**以读为主**。

---

## 6. UI 草图（非约束）

- 当前页首个切片：项目页可折叠的**右侧栏**
- 未来 AI Creative IDE：同一 Project 范围能力可出现为下方的 **Director Console**；放置位置可变，权威与范围不变
- 线程以 `projectId` 为范围（可选：清空线程 / 新线程）
- v1 显示「只读问答」徽章
- 相关时深链到工作流面板或镜头路由
- 若展示 Fast / Balanced / Deep，须遵循 Agent Effort 策略，且不能扩大 Copilot 权限

确切布局、持久化与流式 UX 在实现前由 [AI Creative IDE RFC](AI-Creative-IDE-RFC.md) 管辖。

---

## 7. 明确非目标

- 以跨所有项目的全局聊天作为默认首页  
- 从聊天自动批准强制审核门禁  
- 仅靠自由对话生成最终视频  
- 在 Phase 2.5 提供商之前或取而代之地交付 Copilot  

---

## 8. 何时扩展本 RFC

实现前，用问答扩展以下内容：

- 工具/函数列表与权限  
- 上下文打包（注入哪些 Project 状态）  
- C/D 的确认 UX  
- Copilot 发起动作的审计日志  
- 聊天记录保留策略  

在此之前，将本文档视为**范围锁定**，而非构建清单。

---

## 9. 可追溯性

| 来源 | 选择 |
|--------|--------|
| Q1 放置位置 | A — 仅项目页 |
| Q2 能力 | 先 A；后续先 C 后 D |
| Q3 门禁 | A — 不能绕过强制门禁 |
| Q4 排期 | A — Phase 3+；Phase 2.5 不被阻塞 |
