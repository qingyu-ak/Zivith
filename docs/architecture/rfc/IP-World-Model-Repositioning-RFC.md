# IP World Model Repositioning RFC

> 为什么 Zivith 从 AI Video Workflow 转向 AI-understandable IP System
>
> Version: 1.0
>
> Status: Accepted — 2026-07-31
>
> Author: Zivith 架构组
>
> Decider: 项目所有者
>
> Spawned ADRs: [ADR-0008](../adr/0008-zivith-is-an-ai-understandable-ip-creation-system.md)（Constitutional Amendment）、[ADR-0009](../adr/0009-skill-is-a-capability-layer-not-a-domain-entity.md)、[ADR-0010](../adr/0010-creator-chat-is-a-guided-world-creation-wizard.md)
>
> Related: [architecture-principles.md](../architecture-principles.md), [Product-Positioning.md](../../product/Product-Positioning.md), [Entity + State + Timeline + Track](../entity-state-timeline-track.md), [ADR-0007](../adr/0007-preserve-current-state-with-immutable-creative-history.md)

---

## 1. Problem statement

一个想长期经营 IP 的创作者，今天在 Zivith 里能做的是「把一个故事拍出来」，不能做的是「让 AI 持续理解这个世界」。

具体的挫折是这样的。创作者花了三周建立起一个东方玄幻世界：主角林夜从普通学生觉醒能力、最终成为领袖，中间牵扯师徒、宿敌、门派三层关系，跨越两次时间跳跃。他把这些写进了第一个 `Story` 的剧本里。当他开始写第二个 `Story` 时，系统对这个世界一无所知——它知道有一个叫林夜的 `Asset(type=character)`，有一张参考图，但不知道林夜此刻处于哪个阶段、和谁决裂了、哪场战斗改变了他。创作者只能把这些重新写进新剧本的提示词里，每一个新 `Story` 都要重述一遍世界。

代价是三重的。第一，世界知识没有累积，创作者投入的时间随 `Story` 结束而蒸发，直接违背 P8「记忆复利」。第二，AI 无法在世界层面提供帮助——它只能在单个 `Story` 的上下文里工作，看不到跨 `Story` 的一致性。第三，新用户面对的第一屏是 `Story` 编辑器，而他脑子里想的是「我有一个世界」，产品的入口和用户的意图错位。

同时存在一个入口问题：想创建世界的普通用户，第一次使用就要面对 `Story` → `Scene` → `Visual Prep` → `Shot` 的完整专业流程，门槛过高。

## 2. Vision alignment

本 RFC 直接推进 North Star 阶梯的第 2 级 **compounding universes**（长期项目明显优于新项目，因为记忆复利、资产累积），并为第 3 级 **alternating operators** 提供前置条件——人与 agent 交替操作共享状态的前提，是这份状态本身足够语义化、AI 能读懂。

它同时强化第 1 级 **regeneration superiority**：当世界状态被结构化保存后，多年前描述的意图可以在新模型上重新渲染，而不是只有一个 `Shot` 的文字描述可供重放。

本 RFC 不推进第 4 级 assumed substrate，且刻意不触碰 D1（`.ziv` 格式发布）。

## 3. Constitutional check

**服务的原则：**

- **P1（创作意图是资产）** — 把世界状态本身提升为一等意图资产，扩大了「意图 > 产物」的适用范围
- **P2（领域模型是契约）** — 所有新概念通过显式映射落到既有契约上，不引入影子模型
- **P4（波动性隔离）** — Skill 被明确为能力层，加固而非削弱 capability boundary
- **P8（记忆复利）** — 这是本 RFC 的核心动机

**紧张的原则：**

- **§3「模型靠加深而非加宽生长」** — 本 RFC 提议新增 `WorldEvent`（以及后续可能的 `Organization`、`Relationship`）。缓解措施：`IP` 映射到既有 `Project` 而非新增实体；`Skill` 被明确拒绝为实体（ADR-0009）；`WorldEvent` 与 `Organization` 采用逐个 slice、需晋级证据的推进方式，而非一次性铺开。净效果是：本 RFC 拒绝的新概念多于它引入的。
- **§9.2「Zivith 永不成为 chatbot」** — Creator Chat 接近这条红线。按 [adr-guide.md](../adr-guide.md) §5 的 Rung 3「加围栏」处理，围栏与 tripwire 记录在 ADR-0010，红线本身不撤销。

**触碰的 Never 清单条目：** §9.2（见上）。本 RFC 另**新增**一条 Never 条目（不自研基础模型），属于收紧而非放宽。

**触碰的 deferral registry：** 无。D1–D6 均不激活。D4 被交叉引用以确认专业剪辑仍在延迟状态。

## 4. Scope lock 与 non-goals

### 本 RFC 决定的事

1. Zivith 的产品定位正式表述为「AI-understandable IP creation system」（ADR-0008 修订宪法 §1 / §9 / §10）
2. 产品概念到领域契约的强制术语映射（见 [Product-Positioning.md](../../product/Product-Positioning.md) §3）
3. Skill 是能力层而非领域实体（ADR-0009）
4. Creator Chat 是引导式向导而非对话创作面（ADR-0010）
5. IP Core 世界实体的推进顺序与晋级证据（见 §5 capability ramp）

### Non-goals（读者会默认包含、但明确排除的）

- **不改变创作层级。** `Project → Story → Scene → Shot` 的所有权与继承语义完全不变。`Scene` 保持叙事单元语义，不被重新定义为「地点」。
- **不降级 Shot。** `Shot` 仍是视觉创作的 source of truth（P1）。世界层在其之上，不取代它。
- **不改变任何 review gate 的强制状态。** visual-assets 与 prompt review 的 mandatory 状态原样保留。
- **不在本 RFC 内落库。** 本轮只产出文档与治理记录，不新增表、不改 API、不动 UI。
- **不激活 CreativeBranch。** 平行世界仍由 World Time 的 parallel-world 维度表达，Track H10 保持 Deferred。
- **不把 `ChangeEvent` 复用为 `WorldEvent`。** 系统审计事实与故事世界事件是两个语义，不合并。
- **不引入 IP 实体。** `IP` 即 `Project`。
- **不打断 Track H。** H4 只读 Presentation Timeline 仍是下一个工程动作。
- **不承诺 3D / 游戏 / 虚拟世界。** 长期方向，不进入任何已排期 slice。

## 5. Capability ramp

IP Core 世界实体逐 slice 推进，每个 slice 需要晋级证据才进入下一个。

| Slice | 范围 | 晋级证据 |
|-------|------|----------|
| **Slice 1 — `WorldEvent` 只读** | 新增 Project 级 `WorldEvent`：发生时间、影响的 Entity、前置条件、后续变化。挂载到 Presentation-led `Timeline` 的 event track，只读呈现 | 真实项目中创作者主动创建了 `WorldEvent`，且能在 Timeline 上定位「世界现在处于什么阶段」 |
| **Slice 2 — `Relationship` 可查询** | `Relationship` 作为 `Entity` State 的结构化字段落地，支持「查询某角色在某时点的全部关系」 | 创作者或 Agent 实际发起了跨 Entity 的关系查询，且 State 字段形态不再够用之前不推进 |
| **Slice 3 — `Organization` 与关系提升** | 新增 Project 级 `Organization`；仅当 Slice 2 暴露出真实的跨实体关系查询需求时，才把 `Relationship` 提升为独立 Entity | 出现无法用 State 字段表达的关系查询（如「列出所有敌对阵营对」），且需求来自真实项目而非假设 |

Slice 1 之前的前置条件是 Track H 的 H4（只读 Presentation Timeline）落地——`WorldEvent` 需要一个可以挂载的时间轴。

Creator Chat（Track J）与上述 slice 并行但独立排期，其自身的能力爬坡定义在 ADR-0010。

## 6. Risk assessment

风险按 likelihood × impact × detectability 评估；静默发生的风险按规则加重一级。

| 类别 | 风险 | L × I × D | 缓解与责任人 |
|------|------|-----------|--------------|
| **Domain contract risk** (P2) | `WorldEvent` 的字段形态在首批真实项目后被证明错误，迫使破坏性变更 | 中 × 高 × 高（有迁移流程可见） | Slice 1 只读、不参与继承解析、不被 `Shot` 引用，把回退成本限制在单表。落库时须另开 ADR（见 §9）。责任人：架构 owner；tripwire：首批 `WorldEvent` 出现第二次字段变更 |
| **Stored-data risk** (§3, §8) | 已有 `Project` 在新叙事下被重新解读，创作者原有数据语义漂移 | 低 × 高 × 中 | 本轮零 schema 变更；术语映射表把新说法绑定到既有契约，既有数据的含义不变。责任人：架构 owner |
| **Promise risk** (§4, D1) | 「AI 可理解的 IP 系统」被外部读作对某种可编程世界模型格式的承诺 | 中 × 中 × 低（静默，加重一级） | 定位文档明确 D1 未激活、不发布格式；RFC non-goals 显式排除。责任人：文档 owner；tripwire：外部方开始基于导出数据构建产品 |
| **Authority risk** (P6, §6) | Creator Chat 在自然语言引导中变相绕过 review gate | 中 × 高 × 低（静默，加重一级） | ADR-0010 规定向导产物一律为 draft、必须经既有 gate；实现时须有可观测的 gate 通过记录。责任人：Track J owner；tripwire：出现任何未经 gate 的向导产物 |
| **Economic risk** (P7, §7) | 引导式向导在后台连续调用 LLM，产生无归属花费 | 中 × 中 × 中 | 向导的每次生成沿用既有 metering 与 budget 归属，不新增计费路径。责任人：Track J owner |
| **Lock-in risk** (P4, §9) | Skill 命名让读者误以为绑定某供应商的 skill 体系 | 低 × 中 × 中 | ADR-0009 明确 Skill 不落库、不出现在导出数据里，仅为既有 capability boundary 的产品化命名。责任人：架构 owner |
| **Complexity risk** (§3) | 领域模型因世界实体而膨胀成大杂烩 | 中 × 高 × 中 | 这是本 RFC 最主要的风险，也是它拒绝 Skill Entity 与 IP Entity 的原因。逐 slice 晋级证据机制是核心缓解手段。责任人：架构 owner；tripwire：任一 slice 未取得晋级证据即开工下一个 |

「Unlikely」在本表中未被使用。Stored-data risk 评为低，是**因为**本轮零 schema 变更，风险窗口在 Slice 1 落库时才真正打开，届时由 §9 登记的 ADR 重新评估。

## 7. Migration plan

本轮为纯文档变更，`Forward path` 与 `In-flight work` 均无实质迁移动作，但仍按五问记录，供 Slice 1 落库时继承。

1. **Forward path。** 现有 `Project` / `Asset` / `Story` / `Scene` / `Shot` / `PromptVersion` / `Output` 全部原样有效，语义不变。新叙事只是在其上叠加一层解释，不重写任何存量数据。Slice 1 落库时，存量 `Project` 的 `WorldEvent` 集合为空集，属于合法状态。
2. **In-flight work。** 停在 gate 上的工作流不受影响——本轮不改变任何 gate 定义、workflow definition 或队列语义。Track H 的双写 feature flag 保持默认关闭。
3. **Rollback。** 文档变更可整体回退。ADR-0008 若被推翻，须由新的 Constitutional Amendment ADR 显式 supersede，并同步回改宪法正文；既有 ADR 记录保留不删。
4. **Coexistence window。** 「AI-native Film Production Studio」与「AI-understandable IP creation system」两种表述在文档中共存的窗口，随本轮修订结束而关闭——[README.md](../../README.md)、[Design-Philosophy.md](../../product/Design-Philosophy.md)、[Core-Domain-Model.md](../../domain/Core-Domain-Model.md)、宪法在同一轮全部对齐，不留下互相矛盾的表述。
5. **External consumers。** 无。当前没有对外发布的格式、API 契约或分发过的导出数据。

## 8. Acceptance criteria

### 8.1 Problem criteria

- 创作者能在系统记录中看到「这个世界现在处于什么阶段」，而不必翻阅 `Story` 剧本正文（Slice 1）
- 创作者能查询某个 `Character` 在某个时点的关系集合（Slice 2）
- 新用户可以从「我想创造一个世界」开始，而不是从 `Story` 编辑器开始（Track J）

### 8.2 Constitutional criteria

- 每个新产物可追溯到意图并可从意图重建（P1）
- 未引入任何只存在于单一客户端表面的能力（P3）——Creator Chat 的每一步都对应既有或新增的 API 操作
- 无 provider 概念越过 capability boundary（P4）
- 每个新步骤都保留人类 review 能力；mandatory gate 未移动（P6）
- 每条新生成路径都被计量、限额、归属（P7）
- 向导过程中采集到的世界知识被写入 `Project` 结构化状态，而非丢弃（P8）
- 导出仍包含全部内容，包括本 RFC 引入的产物（§4）

### 8.3 Governance criteria

- 不可逆决策已记录为 ADR-0008 / 0009 / 0010 并互相交叉链接 ✅
- deferral registry 未被触碰，无需更新 ✅
- 迁移债务：无存量债务；Slice 1 的债务已在 §9 登记
- revisit trigger 已写入 §6 风险表，供周期性架构评审检查 ✅

## 9. 待偿 ADR 登记

本 RFC **不**授权 schema 变更。以下决策在真正落库时必须各自开新 ADR：

- **`WorldEvent` 进入 domain contract**（Slice 1）— 新增实体、所有权规则、与 `ChangeEvent` 的边界、是否参与继承解析。触发条件：Slice 1 开工。
- **`Relationship` 提升为独立 Entity**（Slice 3，条件性）— 仅在 Slice 2 暴露出 State 字段无法表达的查询需求时触发。若未触发，无需 ADR。
- **`Organization` 进入 domain contract**（Slice 3）— 与 `Asset` 的关系、Project 级所有权。触发条件：Slice 3 开工。

按 [adr-guide.md](../adr-guide.md) §1，上述每一项都命中「Changes the domain contract」这一强制触发条件。
