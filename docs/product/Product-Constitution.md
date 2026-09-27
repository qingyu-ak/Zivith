# Zivith 产品宪法

> 本文即 `ZIVITH_PRODUCT_MATURITY.md`。自 **2026-09-16** 起作为 Zivith **产品宪法**。
>
> 权重：高于功能任务书、planning 笔记、单次 Agent 对话、未确认的设计草稿。
> 变更：产品所有者明示修订。不是 ADR 流程的替代品，也不被 ADR 默默覆盖。
>
> 与 [架构宪章](../architecture/architecture-principles.md) 并存，分工如下：
>
> | 问题 | 听谁 |
> |------|------|
> | 要不要做、用户能否独立完成、算不算完成 | **本文** |
> | 世界在系统里如何表示、领域契约、ADR | **架构宪章** |
>
> 冲突时：Journey 验收与开发方式听本文；不得为了「功能完整」违反本文；也不得为了 Journey 擅自改领域模型——先报告，等确认。
>
> 原文：`C:\Users\AK\Desktop\Zivith\ZIVITH v0.1\ZIVITH_PRODUCT_MATURITY.md`（仓库外工作副本）。本文件为 Studio 仓库内宪法。
>
> 与旧文档冲突时：**以本文为准**。术语如何落到现有系统，见下方「立宪裁决」。

---

## 立宪裁决（2026-09-16）

产品所有者裁定：旧规划、旧 ADR 的**产品目标与完成定义**与本文冲突时，听本文。历史 ADR 仍记录当时为什么那样做；它们不再把过时的产品禁令当成完成标准。

**不因此新建领域实体。** `Project` 仍是世界的唯一顶层存贮；`WorldEvent` / `Relationship` / `MemoryAtom` 仍按架构宪章表示。改变存储契约必须另开 ADR，不能从本文直接改表。

### 术语

| 用户 / 本文说法 | 系统里是什么 | 不要理解成 |
|-----------------|--------------|------------|
| 世界 | `Project`（一个创意宇宙） | 新建一张 `World` 表 |
| 创建项目 → 创建世界（Journey A） | 创建一个可打开的 `Project`，再进入 World Builder 填设定 | 两个顶层对象 |
| 项目（模块表 Project） | 管理多个世界：创建、打开、删除、恢复 | 世界之上再套一层 IP |
| Universe | 多个世界之间的选择与可视化 | `Project` 之上的领域实体 |
| World Map | `Location` 层级可视化，帮助理解世界 | 独立地图产品 / 游戏引擎 |
| 对话记录 | 会话工作底稿 | 世界本身（架构宪章 §9.2 仍禁止） |

### 聊天与世界（覆盖 M3「扮演不反写」）

本文要求：与角色互动**可以**产生记忆、事件、关系、世界状态变化；用户必须能看见、确认、修改；之后的对话必须用到这些变化（Journey C / E）。

仍禁止：

- AI 未经确认写入世界
- 把聊天日志当作世界

当前代码：世界构建对话已走「提案 → 确认 → 写入」；扮演只沉淀记忆、不提议 `WorldEvent`。这是 **Journey 缺口**，不是产品禁令。旧文「扮演不得反写世界层」停止作为完成定义。扮演若写世界，必须与世界构建同一套确认围栏，不得静默落库。

### 记忆

用户必须能理解「角色为什么记得这件事」。产品分类是展示与验收口径；存储仍用 [ADR-0014](../architecture/adr/0014-layered-memory-system.md) 的 L0 / L1 / L2。

| 产品分类 | 落到 |
|----------|------|
| 事实 | `MemoryAtom` + `MemoryCore` |
| 事件 | `WorldEvent`（世界层）以及 `MemoryAtom`（`fact_type=event`） |
| 关系 | `Relationship` 以及关系类原子 |
| 用户偏好 | 记忆层中可编辑条目（尚未单独成类则标缺口，不另起实体） |
| 角色自身经历 | 该角色参与的 `WorldEvent` + 情节原子 |
| 临时上下文 | `ThreadContextState` 滚动摘要，不作为世界事实 |

缺分类、不能查看/修改、改完 Chat 不用 → 记忆模块未达到本文成熟标准。不要为了「对齐分类」再建一套记忆表。

### 现在做什么

验收单位是 Journey A–F，不是功能列表、不是 [`Next-Tasks.md`](../planning/Next-Tasks.md) 的工程轨道。工程待办可以存在，但不能覆盖本文的优先级。上一份 P0 总任务书与 [`docs/features/new-world-flow.md`](../features/new-world-flow.md) 未按 §25 确认前不执行。

---

# ZIVITH_PRODUCT_MATURITY.md

> Zivith 产品成熟度与用户体验验收标准
> Version: V0.x
> Status: **Product Constitution** — 2026-09-16 立宪

---

# 1. 文档目的

本文件用于判断 Zivith 当前产品是否真正达到可用、稳定、成熟的状态。

Zivith 不以“功能数量”作为主要成熟度指标。

核心判断标准：

> **用户能否在没有开发者指导的情况下，完成一个完整目标，并理解自己正在做什么、发生了什么、下一步该做什么。**

因此，Zivith 的开发方式从：

```text
想到功能
    ↓
让 Agent 实现
    ↓
测试功能
    ↓
继续增加功能
```

转变为：

```text
用户目标
    ↓
完整 User Journey
    ↓
观察用户行为
    ↓
发现问题
    ↓
记录问题
    ↓
分类问题
    ↓
修复
    ↓
重新验证
    ↓
进入下一轮
```

---

# 2. 核心产品原则

## 2.1 不以功能数量衡量产品成熟度

错误：

```text
已经有 30 个功能
→ 产品应该比较成熟
```

正确：

```text
核心用户 Journey 是否完整？
用户是否能够独立完成？
系统状态是否清晰？
失败后是否可以恢复？
不同模块的数据是否一致？
```

---

# 3. Zivith 的核心产品定义

Zivith 是：

> **一个让 AI 能够理解、持续维护并参与其中的 IP / 世界系统。**

因此：

```text
World
├── Characters
├── Locations
├── Events
├── Relations
├── Memories
├── Timeline
├── States
└── Assets
        ↓
      AI
        ↓
   Chat / Agent
        ↓
   World Changes
        ↓
      Studio
        ↓
   Continue / Edit
```

核心不是：

```text
AI Chat
```

而是：

```text
世界
 ↓
角色
 ↓
互动
 ↓
事件
 ↓
记忆
 ↓
关系
 ↓
世界状态
 ↓
继续生活
```

---

# 4. 产品成熟度等级

每一个功能、模块和 Journey 都必须单独评估。

## Level 0 — Concept

只有想法。

```text
[ ] 产品定义
[ ] 使用场景
[ ] 用户目标
```

## Level 1 — Prototype

功能能够演示。

特点：

- 可以运行
- 可以展示
- 可以完成 Happy Path

但是：

- 异常情况未处理
- 状态不完整
- 数据可能不稳定
- 用户可能需要开发者指导

## Level 2 — Functional

功能真正可以使用。

必须具备：

- 正常流程
- 数据保存
- 基础错误处理
- Loading
- 基础反馈
- Retry

## Level 3 — Usable

普通用户可以独立使用。

必须考虑：

- 空状态
- Loading
- Error
- Retry
- Cancel
- Edit
- Delete
- 状态反馈
- 用户引导
- 下一步提示

## Level 4 — Mature

功能与其他系统形成完整闭环。

必须考虑：

- 跨模块数据同步
- 状态一致性
- 历史记录
- Undo / Recovery
- 权限 / 确认
- 数据完整性
- 极端情况
- 长时间使用
- 用户误操作

## Level 5 — Product-ready

达到可以正式面对陌生用户的程度。

必须具备：

- 新用户可以独立完成核心任务
- 核心 Journey 完整
- 数据可靠
- 错误可恢复
- 核心体验稳定
- 用户反馈渠道
- 基础安全
- 基础日志
- 基础版本管理
- 可持续迭代能力

---

# 5. Feature Maturity Checklist

任何新功能，在进入开发前都应该回答以下问题。

## 5.1 用户价值

```text
[ ] 用户为什么需要它？
[ ] 用户希望通过它完成什么？
[ ] 如果没有这个功能，用户会遇到什么问题？
[ ] 它是否真正服务于 Zivith 核心体验？
```

## 5.2 入口

```text
[ ] 用户从哪里发现它？
[ ] 用户是否知道它是什么？
[ ] 用户是否知道什么时候应该使用它？
[ ] 是否需要 onboarding？
[ ] 是否需要 tooltip / hint？
```

## 5.3 正常流程

```text
[ ] 用户如何开始？
[ ] 第一步是什么？
[ ] 中间有哪些步骤？
[ ] 最终结果是什么？
[ ] 完成后用户知道自己完成了吗？
```

---

# 6. UI State Checklist

所有重要功能至少考虑以下状态。

## Empty State

```text
[ ] 第一次使用怎么办？
[ ] 没有数据怎么办？
[ ] 没有角色怎么办？
[ ] 没有世界怎么办？
```

必须告诉用户：

```text
现在是什么状态
为什么是这个状态
下一步应该做什么
```

## Loading State

```text
[ ] 是否需要 Loading？
[ ] Loading 是否有明确反馈？
[ ] 长时间等待怎么办？
[ ] 是否可以取消？
```

避免：

```text
一直转圈
```

## Streaming State

AI 功能必须考虑：

```text
[ ] Streaming
[ ] Stop
[ ] Retry
[ ] Partial response
[ ] 网络中断
[ ] API 超时
```

## Success State

```text
[ ] 成功后是否明确反馈？
[ ] 数据是否已经保存？
[ ] 下一步是什么？
```

## Error State

禁止：

```text
Error
500
Request Failed
```

优先：

```text
发生了什么
为什么可能发生
用户可以做什么
```

例如：

```text
角色回复生成失败

可能是 API 暂时不可用。

[重新生成]
[更换模型]
[查看错误]
```

---

# 7. 用户控制权

Zivith 是 Agent 产品。

但：

> Agent 自动化 ≠ 用户失去控制权。

重要操作需要考虑：

```text
[ ] 自动执行
[ ] 半自动
[ ] 手动确认
```

例如：

### 普通聊天

```text
AI 自动回复
```

### 世界修改

```text
AI 提议修改
      ↓
用户确认
      ↓
写入世界
```

### 高风险操作

```text
删除角色
删除世界
批量修改
覆盖历史状态

        ↓

必须确认
```

---

# 8. 数据与世界状态

Zivith 的核心数据不是孤立的。

应该形成：

```text
Character
    ↕
Relation
    ↕
Memory
    ↕
Event
    ↕
Timeline
    ↕
World State
```

任何重要交互都需要考虑：

> **这个动作是否会改变世界？**

---

# 9. Chat 不是孤立聊天

普通 AI Chat：

```text
User
 ↓
Message
 ↓
AI
 ↓
Message
```

Zivith：

```text
User
 ↓
Conversation
 ↓
Character
 ↓
Memory
 ↓
Relation
 ↓
World Context
 ↓
AI
 ↓
Response
 ↓
Potential Event
 ↓
World State
```

因此需要明确：

```text
[ ] 当前使用哪个角色？
[ ] 当前世界是什么？
[ ] 当前地点是什么？
[ ] 当前世界时间是什么？
[ ] 当前相关角色是谁？
[ ] AI 使用了哪些上下文？
[ ] 是否产生新的记忆？
[ ] 是否产生事件？
[ ] 是否改变关系？
[ ] 是否改变世界状态？
```

---

# 10. Multi-Character Chat

多角色聊天不能只实现：

```text
User
 ↓
Character A
Character B
Character C
```

需要定义：

## 角色

```text
[ ] 添加角色
[ ] 删除角色
[ ] 调整角色
[ ] 查看角色
[ ] 角色状态
```

## 发言机制

```text
[ ] AI 自动选择发言者
[ ] 用户指定发言者
[ ] 用户插话
[ ] 指定某角色回答
[ ] 多角色同时响应
```

## 对话控制

```text
[ ] 自动模式
[ ] 半自动模式
[ ] 手动模式
[ ] 暂停
[ ] 继续
[ ] 重新生成
```

## 世界影响

```text
[ ] 对话是否产生事件？
[ ] 是否更新记忆？
[ ] 是否更新关系？
[ ] 是否更新角色状态？
[ ] 是否更新世界时间？
```

---

# 11. Character

角色不是：

```text
头像
+
名称
+
Prompt
```

角色应该逐渐成为：

```text
Character
├── Identity
├── Personality
├── Background
├── Goals
├── Memories
├── Relationships
├── Current State
├── Location
├── Timeline
└── Behavior
```

必须考虑：

```text
[ ] 创建
[ ] 编辑
[ ] 删除
[ ] 查看
[ ] 导入
[ ] 导出
[ ] 记忆查看
[ ] 记忆修改
[ ] 状态查看
[ ] 状态修改
```

---

# 12. Memory

Memory 必须区分：

```text
事实
事件
关系
用户偏好
角色自身经历
临时上下文
```

必须考虑：

```text
[ ] Memory 创建
[ ] Memory 查看
[ ] Memory 修改
[ ] Memory 删除
[ ] Memory 来源
[ ] Memory 时间
[ ] Memory 是否重要
[ ] Memory 是否参与 AI Context
```

重要原则：

> 用户必须能够理解“角色为什么记得这件事情”。

---

# 13. Event

Event 是连接 Chat 与 World 的重要桥梁。

基本结构：

```text
Event
├── Name
├── Time
├── Location
├── Participants
├── Description
├── Cause
├── Result
└── World Impact
```

必须考虑：

```text
[ ] 创建事件
[ ] 修改事件
[ ] 删除事件
[ ] 查看事件
[ ] 时间排序
[ ] 关联角色
[ ] 关联地点
[ ] 影响关系
[ ] 影响记忆
```

---

# 14. Timeline

Timeline 不是简单展示数据。

它应该成为：

> **世界状态随时间变化的可视化入口。**

必须考虑：

```text
[ ] 世界时间
[ ] 作品时间
[ ] 事件
[ ] 角色状态
[ ] 地点状态
[ ] 时间范围
[ ] 缩放
[ ] 定位
[ ] 编辑
[ ] 删除
[ ] 恢复
```

---

# 15. Studio

Studio 不应该只是：

```text
查看世界
```

而应该逐渐成为：

> **用户理解、检查和修改世界状态的工作空间。**

至少考虑：

```text
[ ] 查看
[ ] 编辑
[ ] 创建
[ ] 删除
[ ] 时间定位
[ ] 角色定位
[ ] 事件定位
[ ] 地点定位
[ ] 关系查看
[ ] 状态查看
[ ] Undo
```

---

# 16. World Map / Universe

Zivith 的世界可视化应该服务于：

> **帮助用户理解自己的世界。**

而不是为了炫技。

### 单世界

```text
Universe
 ↓
Planet
 ↓
Continent
 ↓
Region
 ↓
Location
```

### 多星球 / 科幻世界

```text
Universe
 ↓
Star System
 ├── Planet A
 ├── Planet B
 └── Planet C
```

核心要求：

```text
[ ] 层级清晰
[ ] 可以缩放
[ ] 可以定位
[ ] 可以进入地点
[ ] 与 World 数据同步
```

---

# 17. 数据一致性

任何功能都必须回答：

> **如果我在这里修改了数据，其他地方会不会同步？**

例如：

```text
Studio 修改角色
        ↓
Character 页面是否同步？

Character 修改记忆
        ↓
Chat 是否使用新记忆？

Chat 产生事件
        ↓
Timeline 是否更新？

Timeline 修改事件
        ↓
World State 是否更新？
```

如果答案是“不一定”，则需要明确系统规则。

---

# 18. Undo / Recovery

成熟产品必须允许用户犯错。

需要考虑：

```text
[ ] Undo
[ ] Restore
[ ] History
[ ] Version
[ ] Confirmation
```

例如：

```text
删除角色
    ↓
软删除
    ↓
30 秒内撤销
```

或者：

```text
World History

09:00
09:30
10:00
10:30 ← 当前
```

用户可以恢复历史状态。

---

# 19. 用户 Journey 验收

Zivith 最重要的验收单位不是 Feature。

而是：

# User Journey

---

## Journey A：第一次使用

```text
打开 Zivith
 ↓
理解 Zivith
 ↓
创建项目
 ↓
创建世界
 ↓
创建角色
 ↓
开始聊天
```

验收：

```text
[ ] 不需要开发者解释
[ ] 用户知道下一步
[ ] 用户不会迷路
[ ] 用户知道自己创建了什么
```

---

## Journey B：创建世界

```text
创建 Project
 ↓
World Builder
 ↓
World
 ↓
Character
 ↓
Location
 ↓
Relation
 ↓
Event
```

验收：

```text
[ ] 数据完整
[ ] 数据可修改
[ ] 数据可删除
[ ] 数据互相引用正确
```

---

## Journey C：第一次与角色生活

```text
进入 Chat
 ↓
选择角色
 ↓
开始聊天
 ↓
AI 回复
 ↓
用户继续交流
 ↓
角色记住重要信息
```

验收：

```text
[ ] 角色一致
[ ] 上下文正确
[ ] Memory 正确
[ ] 错误可以恢复
```

---

## Journey D：多角色互动

```text
选择多个角色
 ↓
开始群聊
 ↓
角色互相交流
 ↓
用户介入
 ↓
产生事件
 ↓
世界发生变化
```

验收：

```text
[ ] 发言逻辑自然
[ ] 用户知道谁在说话
[ ] 可以控制对话
[ ] 世界变化明确
```

---

## Journey E：世界变化

```text
Chat
 ↓
Event
 ↓
Memory
 ↓
Relation
 ↓
World State
 ↓
Timeline
 ↓
Studio
```

验收：

```text
[ ] 数据产生
[ ] 数据正确
[ ] 数据可查看
[ ] 数据可修改
[ ] 数据影响后续 Chat
```

---

## Journey F：回来继续

```text
关闭 Zivith
 ↓
再次打开
 ↓
进入项目
 ↓
继续之前的世界
 ↓
继续聊天
```

验收：

```text
[ ] 项目还在
[ ] 角色还在
[ ] Memory 还在
[ ] Event 还在
[ ] Timeline 还在
[ ] 世界状态一致
```

---

# 20. 用户测试方法

不要告诉用户：

> “请测试多角色聊天功能。”

应该给用户一个目标：

> **“创建一个世界，创造两个角色，让他们认识彼此，然后让他们发生一件小事。最后看看这个世界发生了什么变化。”**

开发者只观察。

记录：

```text
用户做了什么
用户说了什么
用户在哪里停顿
用户点了什么错误按钮
用户问了什么问题
用户什么时候迷茫
用户什么时候感到惊喜
```

---

# 21. 用户反馈记录

每一个问题记录：

```text
Issue ID:
Date:
User:
Journey:
Step:
Problem:
Expected:
Actual:
Severity:
Frequency:
Possible Cause:
Solution:
Status:
```

---

# 22. 问题分类

## P0 — 阻断

用户无法继续。

例如：

```text
无法创建项目
无法进入世界
数据丢失
程序崩溃
```

## P1 — 严重

核心体验受到影响。

例如：

```text
角色严重失忆
世界状态错误
聊天无法继续
数据不同步
```

## P2 — 一般

体验不好，但可以继续。

例如：

```text
按钮难找
提示不清楚
操作步骤多
```

## P3 — 优化

视觉或体验优化。

例如：

```text
动画
间距
图标
细节交互
```

---

# 23. Issue 优先级公式

不要看到问题就立即修改。

优先考虑：

```text
Priority =
Impact × Frequency × Core Journey Importance
```

例如：

### 问题 A

10 个用户中 8 个不知道怎么创建角色。

```text
高影响
高频
核心 Journey
```

→ 立即修。

### 问题 B

10 个用户中 1 个觉得按钮圆角不好看。

```text
低影响
低频
非核心
```

→ 暂时不修。

---

# 24. 开发规则

## Rule 1

禁止因为“感觉应该有”就添加功能。

必须说明：

```text
用户问题是什么？
```

## Rule 2

禁止只测试 Happy Path。

至少测试：

```text
正常
空
失败
取消
重复
删除
返回
重新进入
网络异常
```

## Rule 3

禁止模块孤立开发。

每个功能必须回答：

```text
它产生什么数据？
谁使用这些数据？
数据发生变化后谁需要同步？
```

## Rule 4

禁止 Agent 自行扩大需求。

Agent 只能：

```text
实现明确需求
发现问题
报告问题
提出建议
```

未经确认不得：

```text
随意增加大型功能
修改产品核心逻辑
重构无关模块
改变数据模型
```

---

# 25. Agent 开发提示模板

每次让 Coding Agent 实现功能前，提供：

```text
# Feature

功能名称：

## User Problem

用户遇到的问题：

## User Goal

用户希望完成：

## Entry

入口：

## Main Flow

正常流程：

## States

### Empty

### Loading

### Success

### Error

### Retry

### Cancel

## Data

涉及数据：

## Cross-module Impact

影响哪些模块：

## User Control

哪些操作需要用户确认：

## Recovery

如何撤销 / 恢复：

## Acceptance Criteria

完成标准：

## Out of Scope

本次明确不做：

## Implementation Constraints

实现约束：
```

---

# 26. Zivith 当前核心模块成熟度表

| 模块 | 当前目标 | 成熟标准 |
|---|---|---|
| Landing | 让用户理解 Zivith | 用户 10 秒内理解核心价值 |
| Download | 安装 Zivith | 下载→安装→启动顺畅 |
| Onboarding | 第一次使用 | 不需要开发者指导 |
| Project | 管理世界 | 创建、打开、删除、恢复 |
| World Builder | 创建世界 | 数据结构完整且可修改 |
| Character | 创建角色 | 角色可持续使用 |
| Memory | 角色记忆 | 可查看、修改、管理 |
| Chat | 与角色互动 | 稳定、连续、可恢复 |
| Multi-Chat | 多角色互动 | 角色互动自然且可控制 |
| Relation | 管理关系 | 与角色/事件/记忆同步 |
| Event | 记录世界事件 | 可追踪、修改、恢复 |
| Timeline | 查看世界变化 | 可理解、可定位、可编辑 |
| Studio | 世界工作空间 | 查看 + 修改 + 管理 |
| World Map | 世界可视化 | 与世界数据一致 |
| Universe | 项目世界选择 | 世界之间切换自然 |
| Settings | 用户配置 | 清晰、可控 |
| API | 模型连接 | 配置简单、错误明确 |
| Feedback | 用户反馈 | 用户可以快速反馈问题 |

---

# 27. V0.x 当前开发原则

当前阶段不追求：

```text
功能最多
UI 最复杂
架构最庞大
```

优先：

```text
核心 Journey 完整
        ↓
真实用户使用
        ↓
发现问题
        ↓
修复问题
        ↓
重复验证
```

---

# 28. 第一阶段目标

Zivith 第一阶段不追求成为完整商业产品。

目标：

> **让一个完全不了解 Zivith 的用户，可以自己创造一个世界，并真正与这个世界中的角色产生持续互动。**

核心闭环：

```text
下载
 ↓
启动
 ↓
创建 Project
 ↓
创建 World
 ↓
创建 Character
 ↓
开始 Chat
 ↓
产生 Memory
 ↓
产生 Event
 ↓
产生 World Change
 ↓
Studio 查看
 ↓
修改
 ↓
继续 Chat
```

如果这条链能够稳定完成：

> Zivith 才真正拥有自己的核心产品闭环。

---

# 29. 第二阶段：多角色世界

核心：

```text
Character A
      ↕
Character B
      ↕
Character C
      ↓
Group Conversation
      ↓
Events
      ↓
Relations
      ↓
Memories
      ↓
World State
```

重点不是“支持多少角色”。

而是：

> **多个角色是否真的生活在同一个世界里。**

---

# 30. 第三阶段：世界作为作品

```text
World
 ↓
Story
 ↓
Scene
 ↓
Shot
 ↓
Media
```

此阶段再逐渐连接：

```text
Video
Voice
Image
3D
Game
Virtual World
```

这些属于 Zivith 的长期生产能力，而不是当前 V0.x 必须全部完成的功能。

---

# 31. Product Review 周期

每完成一个核心 Journey：

```text
1. 开发
2. 自己完整走一遍
3. 找至少一个陌生用户
4. 不主动指导
5. 观察
6. 记录问题
7. 分类
8. 修复 P0/P1
9. 再测试
10. 再进入下一阶段
```

---

# 32. 每周 Product Review

每周只回答五个问题：

### ① 用户在哪里卡住了？

### ② 用户在哪里不知道下一步？

### ③ 用户在哪里不相信系统？

### ④ 用户在哪里发现数据不一致？

### ⑤ 用户在哪里真正感到“有意思”？

尤其记录第 ⑤ 点。

因为：

> **成熟产品不仅要减少摩擦，还要找到用户愿意留下来的原因。**

---

# 33. 最终判断标准

Zivith 是否成熟，不看：

```text
代码多少
功能多少
页面多少
AI 模型多少
```

而看：

```text
陌生用户
 ↓
打开 Zivith
 ↓
理解它
 ↓
创造世界
 ↓
创造角色
 ↓
开始生活
 ↓
世界发生变化
 ↓
理解发生了什么
 ↓
能够修改
 ↓
能够继续
 ↓
愿意再次打开
```

如果这个循环成立：

> **Zivith 才真正成为产品。**

---

# 34. 核心原则

最后始终遵守：

> **Don't build features. Build experiences.**

> **Don't optimize for completeness. Optimize for continuity.**

> **Don't guess what users need. Observe what users struggle with.**

中文：

> **不要为了“功能完整”而开发。**
>
> **要为了“用户能够持续完成目标”而开发。**
>
> **不要猜用户需要什么。**
>
> **让用户的真实使用告诉我们下一步应该做什么。**

---

# 35. 当前 Zivith 开发口号

> **创造你的世界，和你的主角一起遨游。**

而产品层面的真正目标：

> **让用户创造一个世界，然后这个世界真正“活起来”。**
