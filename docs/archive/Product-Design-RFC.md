# Zivith 设计哲学（历史 RFC）

> Version: v0.1
>
> Status: **历史** — 已被 [`../Design-Philosophy.md`](../product/Design-Philosophy.md) 取代
>
> Last Updated: 2026-07
>
> Archived: 2026-07-21
>
> 请勿将本文件作为实现的真相来源。

---

# 第 1 章 · 创作层级

## 为什么是 Zivith？

多数 AI 视频工具围绕单一交互构建。

```
Prompt
    ↓
Video
```

当生成结果不满意时，用户通常不得不从头重新生成一切。

这种工作流把视频生成当作一次性过程，而非创作过程。

Zivith 采取不同路径。

Zivith 不直接生成视频，而是对整个影视制作工作流建模。

每一个创作产物都变得可复用、可编辑、可审核。

Zivith 的目标不是生成一条视频。

目标是构建完整的 AI 原生影视制作工作流。

---

# 创作层级

Zivith 内的每一个项目都遵循相同的创作层级。

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

每一层代表不同的抽象级别。

---

## Project

Project **不是**一条视频。

Project 代表整个创作宇宙。

它包含在同一 IP 内持续一致地创作内容所需的一切。

示例：

- Journey to the West
- Cyberpunk City
- My Original Novel
- Brand Commercial Campaign

Project 拥有：

- Knowledge Base
- Characters
- Locations
- Assets
- Stories
- Generated Videos

Project 被设计为随时间演化，而非在一次导出后丢弃。

---

## Story

Story 代表一章或一个完整叙事。

一个 Project 可包含多个故事。

示例：

Journey to the West

- Chapter 1
- Chapter 2
- Chapter 3

一部个人小说也可能包含数十章。

每一个 Story 共享同一 Project 级知识与资产。

---

## Scene

Scene 代表一个连续地点或叙事片段。

示例：

Chapter 1

Scene 1

Flower Fruit Mountain

Scene 2

Heavenly Palace

Scene 3

Dragon Palace

角色、环境、光照与氛围通常在一个 Scene 内保持稳定。

Scene 存在的目的是组织多个 Shot。

---

## Shot

Shot 是 Zivith 内最小的创作单元。

最终一切都会落到 Shot。

一个 Shot 包含：

- Camera
- Composition
- Character State
- Dialogue
- Action
- Prompt
- Video Result

Shot 可独立再生。

它们也可重排、替换或精炼，而不影响 Story 的其余部分。

Shot 是整个系统的核心对象。

---

## Video

Video 是产出。

它**不是**真相来源。

Video 始终可从其对应 Shot 再生。

这使得未来模型升级成为可能，而不会丢失创作资产。

---

# 设计原则

## 故事优先

每一件创作工作都从故事开始。

---

## 场景组织叙事

Scene 组织叙事结构。

---

## 镜头是核心

每一次 AI 操作最终都指向一个或多个 Shot。

---

## 资产持久

Characters.

Locations.

Knowledge.

Reference Images.

Styles.

这些属于 Project，而非个别 Story。

---

## 产出可弃

Video 始终可以再生。

创作资产绝不应当丢失。

知识是永久的。

Shot 可编辑。

Video 可复现。

---

# 愿景

Zivith 不是 AI 视频生成器。

Zivith 是 AI 原生影视制作工作室。

它管理整个创作过程，而不仅仅生成最终结果。
