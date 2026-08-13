# Design Philosophy

> Zivith 产品哲学
>
> Version: 2.0
>
> Status: Draft — 已按 [ADR-0008](../architecture/adr/0008-zivith-is-an-ai-understandable-ip-creation-system.md) 对齐到 IP 世界模型
>
> Last Updated: 2026-07-31
>
> Related: [Product-Positioning.md](Product-Positioning.md), [Core-Domain-Model.md](../domain/Core-Domain-Model.md), [architecture-principles.md](../architecture/architecture-principles.md)

---

# Zivith 为何存在

多数 AI 视频产品围绕同一种交互构建。

```
Prompt
    ↓
Video
```

流程虽简单，却把创作过程藏了起来。

生成结果不满意时，创作者往往只能从头全部重生成。

创作决策消失在黑箱之后。

Zivith 走另一条路。

> Zivith 不是一个 AI 生成工具。Zivith 是一个 AI 可理解的 IP 创作系统。

模型负责执行生成。Zivith 管理生成无法承载的东西：创作意图、世界规则、角色关系、时间发展与制作上下文。

模型越强，这一点越重要，而不是越不重要。完整 IP 从来不是一句话能生成的。需求要被探索，方向要被修订，世界规则要被维护，关系要演化。生成模型越强，管理创作上下文的系统就越有价值。

方向是：

> 先创建世界。再制作内容。

持久的 Entity 及其演化中的 State 构成世界。Story、Scene、Shot、Prompt 与 Video 是这个世界被表达与交付的方式——不是一次性的 prompt 会话，也不是系统的顶层目的。

---

# 两层结构

Zivith 组织为世界层与表达层。

```
World Layer        Project (the IP)
                       ↓
                   Entity  ·  State  ·  Relationship  ·  WorldEvent  ·  Timeline

                       ↓  expressed through

Expression Layer   Story
                       ↓
                   Scene
                       ↓
                   Shot
                       ↓
                   Video
```

世界层回答*存在什么、处于什么状态*。表达层回答*如何讲述与交付*。

两层没有谁更重要，但依赖方向是固定的：表达依赖世界，绝不能反过来。一部结束的 `Story` 不会把世界一起带走——正因如此，创作知识才能跨年累积，而不是在每一次制作结束时蒸发。

---

# 创作层级

在表达层内，每个项目遵循同一套创作层级。

```
Project
    ↓
Story
    ↓
Scene
    ↓
Shot
    ↓
Video
```

每一层都有清晰职责。

这套层级代表的是影视制作过程，而不是生成过程。

---

# Project

`Project` 代表整个创作宇宙。

`Project` 不是一个视频项目。

它是一个 IP 的持久工作空间。

一个 `Project` 拥有：

- Knowledge
- Characters
- Locations
- Assets
- Stories
- Generated Outputs

`Project` 被设计为持续演化。

**`Project` 就是 IP。** Zivith 不在其上另设独立的 IP 对象。当产品语言说「一个 IP」时，系统指的就是一个 `Project`。

---

# 世界

世界是 AI 协作者在能够帮忙之前必须理解的东西。

`Character` 与 `Location` 是世界的第一公民，以 Project 级 Asset 持有。`WorldEvent` 记录故事世界里发生了什么、改变了哪些实体。`Relationship` 记录实体之间如何相待——师徒、敌对阵营、一个家庭。`Timeline` 把这一切排入顺序，使系统能回答每一个 AI 协作者首先需要回答的问题：

> 这个世界现在处于什么阶段？

有两处区分承重且容易丢失。

**`Location` 是地点；`Scene` 是叙事单元。** 山门是否有人在此拍摄都存在——它是 `Location`。发生在山门、拥有其 Shot 的一段连续叙事，是 `Scene`。把二者坍缩，会使世界依赖碰巧造访它的故事。

**角色的演化是 State，不是新角色。** 林夜作为普通学生、觉醒后的林夜、成为领袖的林夜，是同一个 `Character` 的三个已提交 State——不是三个角色。身份永久；内容可版本化。

世界一次生长一个实体，每个实体以真实项目中的证据换取席位。契约见 [Core Domain Model](../domain/Core-Domain-Model.md)，架构见 [Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md)。

---

# Story

`Story` 代表一个完整的叙事单元。

依项目不同，一个 `Story` 可以是：

- 一部电影
- 一集剧集
- 一章
- 一支广告
- 一支 MV
- 任何完整的叙事单元

`Story` 组织叙事。

---

# Scene

`Scene` 代表一个连续的叙事环境。

通常一个 `Scene` 包含：

- 一个地点
- 一种氛围
- 一个时间段
- 多个 Shot

`Scene` 为其 Shot 提供共享上下文。

AI 可以自动将 Story 切分为 Scene，但最终编辑权始终属于用户。

---

# Shot

`Shot` 是最小可编辑创作单元。

`Shot` 是整个系统的核心对象。

每个 `Shot` 可以包含：

- Character State
- Location
- Camera
- Composition
- Action
- Dialogue
- Emotion
- Lighting
- Audio
- Prompt
- References
- Generated Outputs

每一条视频都由一个或多个 Shot 生成。

绝不能反过来。

---

# Video

Video 是产出。

它从来不是真相源。

视频始终可以从对应的 Shot 重新生成。

---

# 设计原则

## 模型生成；Zivith 管理

分工是永久的。

模型负责执行生成。

Zivith 管理创作意图、世界设定、角色关系、时间发展与制作上下文。

每一项生成能力都位于可替换边界之后。当更好的模型到来时，改变的是边界后的提供商——绝不是世界模型、Timeline 或 Entity 模型。

一个既不增强 IP 理解、也不增强世界管理、也不增强创作者控制的功能，大概率不属于 Zivith 的核心。

---

## Project 是创作宇宙

`Project` 代表长期创作世界，而不是一次性制作。

知识、资产与创作历史属于 `Project`。

Entity State 呈现在稳定的 Story 顺序上。World Time 默认跟随 Presentation Time，仅在创作者表达闪回、模糊时段、区间、时间跳跃或平行世界时才分叉。Zivith 不强迫虚构世界挤进单一历法或标量时钟；它通过最小关系信封保留 Project 自定义的时间维度。Timeline 不是工作流图，也不是非线性视频剪辑器。

---

## 故事先于视频

每一次创作从叙事开始。

视频生成是创作的最后阶段，而不是起点。

---

## AI 生成，人类导演

AI 贯穿创作工作流提供协助。

它可以生成故事、场景、镜头与视频。

人类仍负责评审、编辑与做出创作决策。

AI 加速创作。

它从不取代创作。

---

## 人类拥有创作决策

AI 有能力自主完成创作工作流。

然而，AI 生成本质上是概率性的。

人类评审的目的不是拖慢流程，
而是确保创作质量与艺术一致性。

用户可以为不同阶段选择不同的自动化程度。

AI 提议。

人类决定。

---

## 质量先于自动化

自动化是手段，不是目标。

若 AI 持续产出令人满意的结果，
用户可以选择全自动工作流。

当创作质量不确定时，
每一阶段都应保持可评审、可编辑。

自动化绝不应当取代创作判断。

---

## Shot 是真相源

`Shot` 是视觉创作的真相源。

视频是产出。

Shot 可编辑。

视频可复现。

每一个生成结果始终可以追溯到其 Shot。

---

## 资产持久存在

Characters。

Locations。

Knowledge。

Reference Images。

Videos。

Audio。

Music。

Documents。

这些都是长期创作资产。

它们属于 `Project`，而不属于个别 Story。

资产被设计为在整个创作宇宙中复用。

---

## 一切可编辑

没有任何 AI 产出应成为死胡同。

Story 可以重写。

Scene 可以重组。

Shot 可以精修。

Prompt 可以调整。

Video 可以重新生成。

每一个 AI 产出都应成为下一轮迭代的输入。

---

## 透明优于魔法

AI 不应表现得像看不见的黑箱。

创作者应始终理解：

- AI 生成了什么
- 为何如此生成
- 结果从何而来

透明建立信任。

可编辑的工作流建立创造力。

---

## 渐进专业化

Zivith 应对初学者友好，同时对专业创作者足够强大。

新用户不应感到被淹没。

专业创作者不应感到受限。

界面随着用户深入创作工作流，逐步揭示高级能力。

这就是为何同一世界有两个入口。新创作者经由创作对话（Creator Chat，应用默认页 `/`）到来，用自己的话描述想法；对话智能体询问世界背景、力量体系、主角与核心冲突，经提案与用户确认后产出结构化草稿实体，并持续维护与检查冲突（H9 v1 只报告，确认后才改）。专业创作者打开 Studio，直接编辑实体、关系、时间线与资产。

对话是可以长期回到的创作入口，不是一次性 onboarding 流程。其产出是结构化草稿实体（默认 `draft`），与其他一切一样经过同一套评审关卡——对话是持续收集与确认意图的方式，对话记录本身不是创作载体。见 [ADR-0010](../architecture/adr/0010-creator-chat-is-the-world-first-continuous-conversation-surface.md)（2026-08-04 修订）。

---

## 默认简单

默认工作流应当简单。

创作者按此思考：

```
Story
    ↓
Scene
    ↓
Shot
```

而不是技术参数。

---

## 需要时强大

每个 Shot 都可以在 Shot Editor 中打开。

高级用户可以编辑：

- Camera
- Composition
- Character
- Action
- Emotion
- Lighting
- Prompt
- Audio
- References
- Outputs

而不牺牲整体工作流的简洁。

---

# 愿景

Zivith 不是 AI 聊天机器人——对话（Creator Chat）是入口，创作宇宙的唯一表示是结构化实体。

Zivith 不是视频剪辑器。

Zivith 不是 AI 视频生成器。

Zivith 不构建模型——不构建基础模型、不构建视频模型、不构建 3D 引擎。那些属于提供商与扩展。

Zivith 是一个 AI 可理解的 IP 创作系统。

它管理内容所来自的世界，而不是仅仅生成内容。

Zivith 的使命是让 AI 理解一个世界，并帮助人类持续创造它。模型负责生成。Zivith 负责理解、组织、管理与转换——AI 创作时代人类与模型之间的桥梁。

Zivith 是什么、不是什么的完整表述，见 [Product Positioning](Product-Positioning.md)。
