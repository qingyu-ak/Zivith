# Looser Creative Flow RFC (Thin)

> Zivith「更松创作流」方向稿 — 局部重算、资产优先视觉、可选故事分段
>
> Version: 0.2
>
> Status: 已接受（2026-07-23）— 范围锁定 + 能力递进；非实现清单
>
> Opened: 2026-07-22（产品方向）；0.2 更新 2026-07-23 — Slice C 领域 ADR 已接受（[ADR-0006](../adr/0006-story-segments-are-ordered-scene-groupings.md)）；实现排期见 [V0.4-Modification-Plan.md](../../archive/V0.4-Modification-Plan.md)（Slice A = W4，Slice B 资产侧 = W2，Slice C = W3）
>
> Related: [architecture-principles.md](../architecture-principles.md)（P5、P6），[AI-Agent-Collaboration.md](../../domain/AI-Agent-Collaboration.md) §10–11，[Asset-Model.md](../../domain/Asset-Model.md)，[Design-Philosophy.md](../../product/Design-Philosophy.md)，[Next-Tasks.md](../../planning/Next-Tasks.md)，[Director-Copilot-RFC.md](Director-Copilot-RFC.md)

---

## 1. 目的

记录 Zivith 如何从今天的**单次线性 Story→Video 运行**（MVP 引导路径）走向**更松、但仍分层**的创作循环——而不变成节点画布、章节文件编辑器，或绕过门禁的聊天。

创作者今天可以跑完完整的 mock/真实管线，但感觉流程被「绑死」：故事以一整块到达；视觉主要存在于工作流门禁内；场景/镜头工作无法在本地重跑，除非取消+重启。这种摩擦是真实的；架构已点名解药（工作流即数据、局部重算），但产品面尚未落地。

---

## 2. 问题陈述（用户世界）

已批准更早门禁的创作者无法：

1. **在局部编辑后只重跑一个 Scene / Shot / 视觉需求**，而无需重启整次运行。
2. **在资产库中独立生长 Character/Location 关键艺术**，不依赖活动中的 Story→Video 运行，并在 Visual Prep 复用这些图像。
3. **以更小的叙事单元迭代故事**（例如按幕 / 场景节拍），而非一整块 Story Agent 输出。

代价：被放弃的运行、重复的 brief、仅为打通 DAG 而批准占位视觉，以及对「Shot 是核心 / 资产会持久」失去信任。

---

## 3. 愿景对齐

推进**交替操作者**（人类以更细粒度导演）与**可复利宇宙**（资产与已批准视觉在单次运行之外累积）。当局部重算成为一等能力时，再生优势随之提升。这不是底层 substrate 工作。

---

## 4. 宪章核对

| 原则 | 影响 |
|-----------|--------|
| **P5** 工作流即数据；原语包含扇出与**局部重算** | **服务** — 本 RFC 是这些原语的产品面 |
| **P6** 人类权威是架构性的；门禁放置是策略 | **服务** — 更细循环必须保留审核能力；强制门禁（visual-assets、prompt）保留，除非另有 ADR 移动它们 |
| **P1** 意图即资产；产出可弃 | **服务** — 局部再生从意图再生产出 |
| **P3** 无头核心 | **服务** — 每一个新动作首先是 API/Orchestrator 操作 |
| **§3 加深，不加宽** | **约束** — 优先加深 Story/Scene/Shot/Asset + Orchestrator；除非 ADR 证明层级不足，不新增顶层「Chapter 文件」产品 |
| **D3** 不以节点画布为主要 UX | **不得违反** — 引导式层级 + 面板仍为默认 |
| **Never list / Copilot** | 咨询面不得绕过门禁（与 Director Copilot 同一规则） |

**张力：** 更丰富的重算 UX 可能冲击*默认简单*。缓解：保留线性 Story→Video 启动表单为默认；更松的动作出现在既有实体（Scene、Shot、Asset）与当前门禁重试上——而非第二个首页。

---

## 5. 决策（v0.1 已锁定）

| 主题 | 决策 |
|-------|----------|
| 默认路径 | 保留**引导式线性 Story→Video** 作为简单默认启动 |
| 非主要 UX | **无**节点图画布；**无**自由形式「章节文档」作为工作区 |
| 引擎方向 | 针对既有 Orchestrator + 领域 ID 实现**局部重算** |
| 门禁策略 | 强制 **visual-assets** 与 **prompt** 审核保留；更细循环在适用时仍停在这些门禁 |
| 时间旅行 | **任意重开任意过去门禁**保持**范围外**（与 Next-Tasks D4 相同）— 使用当前门禁拒绝/重试、实体解冻、取消+重启，或有范围重算 |
| 故事分段 | **ADR 已决议（2026-07-23）：** [ADR-0006](../adr/0006-story-segments-are-ordered-scene-groupings.md) — 分段是 Story 内有序的 Scene 分组（`StorySegment`），不是顶层 Chapter；UI 分段必须由持久化实体支撑 |
| 排期 | **不**阻塞完成 Phase 2.5 C7/C8；本 RFC 接受后 Slice A 可并行启动 |

---

## 6. 能力递进

```text
Slice A  Partial recompute (Scene / Shot / visual requirement)
    ↓ evidence: operators re-run one unit without cancel+restart
Slice B  Asset-library image generate + approve → Visual Prep reuse
    ↓ evidence: key art created with no active story-to-video run
Slice C  Story segmentation (acts / beats) — only after domain ADR
```

### Slice A — 局部重算（首建）

**范围内：**

- 从既有 Story / Scene / Shot / `VisualAssetRequirement`，经 Orchestrator API 请求**有范围**的 agent+生成工作
- 按 [AI-Agent-Collaboration.md §10.1](../../domain/AI-Agent-Collaboration.md) 将下游**未批准**产物标为过期；在已适用门禁处要求重新批准
- 实体页 / WorkflowPanel 当前门禁上的 UI 入口（「重跑本场景视觉准备」「重跑本镜头提示词/视频」）— 中文文案
- 溯源：每一次重算都是已记录的生成/工作流事务（P7）

**Slice A 范围外：**

- 将已完成门禁重开为可编辑历史（D4）
- 无冲突规则时对同一 Shot 的并行多运行编辑
- Story 幕/节拍模型

**晋级证据 → Slice B：** 至少一名操作者完成「编辑一个 Scene 字段 → 重算视觉 → 批准 → 继续」，无需取消+重启，且测试覆盖过期标记。

### Slice B — 资产优先视觉

**范围内：**

- Asset Agent / 资产库：在 Story→Video **之外**生成 Character/Location 参考图
- 已批准 Media 写入 Asset `reference_images[]`；当 Scene 绑定允许时，Visual Prep **优先复用**（[Asset-Model.md](../../domain/Asset-Model.md)）
- 与 Phase 2.5 相同的图像提供商/适配器；领域中无提供商概念（P4）

**Slice B 范围外：** 完整 Prop/Style/Knowledge 分类 UI（Phase 4）；全局跨项目资产库

**晋级证据 → Slice C：** 创作者可在零工作流运行下产出已批准关键艺术，然后启动 Story→Video 并看到复用建议。

### Slice C — 故事分段

**ADR 问题已由** [ADR-0006](../adr/0006-story-segments-are-ordered-scene-groupings.md) **回答**（已接受 2026-07-23）：幕/章是 **StorySegment — Story 内有序的 Scene 分组**，自带草稿文本与批准状态；不是新的层级节点，也不是文档文件。Scene 所有权（`story_id`）不变；`segment_id` 是可选分组引用。

实现排期为 [V0.4-Modification-Plan.md](../../archive/V0.4-Modification-Plan.md) **W3**：分段的 Story Agent 输出、在既有 story 门禁内按分段做故事审核、按已批准分段展开 Scene Agent。

常设规则仍是：**无**无持久化 StorySegment 行支撑的 UI 分段。

---

## 7. 定位

```text
Default:  Brief → linear WorkflowPanel gates (unchanged simple path)

Loose:    Project hierarchy entities
            ├─ Asset library  →  depict / approve key art (Slice B)
            ├─ Scene / Shot   →  scoped recompute (Slice A)
            └─ Story          →  segmented draft (Slice C, after ADR)
                    │
                    └─ all paths still hit Orchestrator + review gates
```

- **是：** 在既有层级上的更细粒度导演  
- **不是：** 第二个产品；聊天机器人；节点 IDE；绕过 visual-assets / prompt 门禁  

---

## 8. 与既有系统的关系

| 组件 | 角色 |
|-----------|------|
| `WorkflowOrchestrator` / workflow-as-data | 获得有范围重算计划；仍是运行的 SoT |
| `MockWorkflowRunner` / agents | 为实体**子集**调用的阶段专家 |
| Asset Agent + Asset CRUD | Slice B 的主表面 |
| WorkflowPanel | 仍是门禁 UI；获得「有范围重试」可触点，而非画布 |
| Shot Editor | 仍是字段级 SoT；触发 Shot 范围再生 |
| Director Copilot | 后续可*解释*或*提议*有范围重算（C）；永不自动批准 |

文档已描述主管线外的局部再生与 Asset Agent；本 RFC 使之成为**已排期的产品轨道**，而非愿景文本。

---

## 9. 明确非目标

- 节点式工作流画布作为主要（或仓促的次要）体验 — 宪章 **D3**
- 任意步骤时间旅行 / 将任意已过门禁作为一等能力重开 — Next-Tasks **D4**
- 用小说/剧本文档模型替换 Project → Story → Scene → Shot
- 由任何助手自动批准强制门禁
- 在无门禁策略 ADR 的情况下折叠掉 Visual Prep
- 以本工作阻塞 Phase 2.5 BYOK/usage（C7/C8）

---

## 10. 风险（固定类别）

| 类别 | 评估 | 缓解 / 负责人 |
|----------|------------|--------------------|
| 领域契约 | Slice C 可能诱惑新增顶层实体 | Slice C 阻塞于 ADR；先加深 Story — 作者 + 领域评审人 |
| 持久数据 | 有范围重算可能孤立 Media 或留下过期批准 | 显式过期/待处理状态；永不静默重解释 — API 负责人 |
| 承诺 | 「重算」API 形态可能变动 | 置于 Orchestrator 之后；版本化运行 `input`/`state` — 引擎负责人 |
| 权威 | 有范围路径可能跳过 visual-assets / prompt | 硬规则：再生这些产物时同一门禁 — 产品决策人 |
| 经济 | 扇出重算可放大花费 | 计量每一作业（P7）；批量再生前确认 — 生成负责人 |
| 锁定 | 若适配器留在端口后则预期无 | PR 上做 P4 评审 |
| 复杂度 | 两种心智模型（线性 vs 更松） | 默认仍是线性启动；更松动作情境化 — UX 评审人 |

---

## 11. 迁移计划

1. **向前：** 既有 `story_to_video` 运行保持当前语义；新的有范围 API 为增量。
2. **进行中：** 停在门禁的运行在完成/取消前继续旧 runner 行为；有范围重算针对**实体**，不改写门禁中历史。
3. **回滚：** 禁用有范围 UI/开关；线性面板保留；无强制数据改写。
4. **共存：** 线性默认 + 有范围动作无限期共存是有意的（并非永远两个引擎 — 一个引擎，两种入口风格）。
5. **外部消费者：** 无公开 `.ziv` 格式变更（D1 不动）。

---

## 12. 验收标准

### 问题标准

- [ ] 创作者可重算**一个 Scene 的视觉准备**（或一个 Shot 的提示词/视频），而无需取消父级 story-to-video 哲学（Slice A）。
- [ ] 创作者可在资产库生成并批准 Character/Location 关键艺术，且**无**活动中的 Story→Video 运行（Slice B）。
- [ ] 线性 brief→门禁路径仍可让新手一次坐下来跑通（默认简单）。

### 宪章标准

- [ ] 每一切片满足 rfc-guide §6 第 2 层的 P1–P4、P6–P8 清单。
- [ ] 不违反 D3（无主要节点画布）。
- [ ] 不与 D4 矛盾（无任意门禁时间旅行）。

### 治理标准

- [x] 在任何幕/节拍 UI 之前写好 Slice C ADR — [ADR-0006](../adr/0006-story-segments-are-ordered-scene-groupings.md)，已接受 2026-07-23。
- [ ] 按切片更新 Next-Tasks Track E；Implementation-Plan 复选框同步。
- [ ] 不可逆的门禁策略变更须产生 ADR。

---

## 13. 可追溯性（产品问答）

| 问题 | 选择 |
|----------|--------|
| 保留线性默认？ | **是** |
| 首个切片？ | **A — 局部重算** |
| 资产库带外描绘？ | **是 — Slice B** |
| 现在做 Story 幕/节拍？ | **是 — ADR-0006 已接受；Story 内有序 Scene 分组（V0.4 W3）** |
| 节点画布 / 时间旅行门禁？ | **否** |

---

## 14. Slice A — 有范围重算（已实现于 V0.4 W4）

### API 形态

| 方法 | 路径 | 范围 | 效果 |
|--------|------|-------|--------|
| `POST` | `/scenes/:id/recompute-visual-prep` | 一个 Scene | 将未批准需求标为 pending；为该 Scene 重跑 Visual Prep；记录 `workflow_step_attempts` |
| `POST` | `/shots/:id/recompute-prompt` | 一个 Shot | 重跑 Prompt Agent；不动已批准镜头（409）；记录 attempt |
| `POST` | `/shots/:id/recompute-video` | 一个 Shot | 若提示词已批准则重跑视频生成；不动已批准镜头（409）；记录 attempt |

Orchestrator：`beginScopedRecompute` / `finishScopedRecompute` / `mergeStepOutput` — **不**推进 `current_step_index`。线性 `runUntilGate` 仍是新手路径的 SoT。

### 过期传播矩阵

| 触发 | 标为过期 | 不动 |
|---------|-------------|-----------|
| Scene 视觉重算 | 该 Scene 的非 `approved` `VisualAssetRequirement` → `pending`；Scene 内未批准 Shot → `prompting` + 清除未批准提示词批准 | 已批准需求；已批准 Shot |
| Shot 提示词重算 | 目标 Shot → `prompting`（若未批准） | 已批准 Shot（拒绝） |
| Shot 视频重算 | 仅新 Output | 已批准 Shot（拒绝）；先前 Media/Output 历史 |

### 冲突规则

运行 `state.scoped_locks` 中的锁键：`{kind}:{entity_type}:{entity_id}`。

若第二次有范围重算在 attempt 为 `running` 时命中同一键 → **409 `RECOMPUTE_IN_PROGRESS`**。

跨已完成 attempt 的相同 `input_hash` 记录在新 attempt 的 `usage.identical_input_attempt` 上（可识别；跳过优化可后续可选）。

### UI 文案（中文）

- Scene / WorkflowPanel 视觉门禁：「重跑本场景视觉准备」
- Shot / WorkflowPanel prompt|video：「重跑本镜头提示词」/「重跑本镜头视频」

在后续切片之前，将其余 RFC 章节仅视为 B/C 的范围锁定。
