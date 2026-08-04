# ADR-0006: Story segments are ordered Scene groupings inside a Story

- **Status:** 已接受
- **Date:** 2026-07-23
- **Deciders:** 项目所有者（AK）
- **Class:** Standard
- **Reversibility:** 代价高（新增已存领域实体；移除将需要数据迁移）

## 背景

创作者今天体验到的 Story 阶段是一整块：Story Agent 产出单一故事产物，故事评审门禁整份批准，下游 Scene 分解也一次性完成。用户已明确要求按章/幕起草与评审（「像小说一章一章、剧本一段一段那样推进」）。

[Looser-Creative-Flow-RFC](../rfc/Looser-Creative-Flow-RFC.md) Slice C 把这个问题精确推迟到领域 ADR：幕/章是新的层级节点、Story 的字段结构，还是 Scene 分组元数据？

新证据来自 [waoowaoo 架构评审](../review/Zivith-Architecture-Review-Based-on-waoowaoo.md)：该项目的 Episode→Clip 切分表明，切分单元之所以值得存在，是因为它们能**按片驱动制作**（每段：draft → storyboard → voice），而不是为了建模文学结构。它也显示了把 segment 做成顶层的代价：waoowaoo 根本没有 Story 实体，于是 Episode 不得不吸收故事职责。

张力中的力量：宪章 §3（加深，勿加宽——不新增顶层概念）、RFC Slice C 规则（没有持久化实体就不要做假 UI segment）、P2（领域是已存契约——用户数据依其存储），以及 Simple by Default（未分组的小故事必须仍然有效）。

## 攸关原则

- **Serves:** §3 加深而非加宽 —— 切分加深 Story，而不是增加 Project 级的 Chapter 概念。
- **Serves:** P5/P6 —— segment 为局部重算与评审提供更细、稳定的寻址单元。
- **Serves:** P1 —— 每段草稿文本是已存意图；下游产物可据此再生成。
- **Strains:** Simple by Default —— 心智模型多了一个实体。可接受，因为 segment 可选：零 segment 的 Story 行为与今天完全一致。

## 决策

我们引入 **StorySegment**：Story 的子实体，是 **Scene 的有序分组**。segment 自带身份、顺序、标题、梗概/草稿文本与审批状态。Scene 仍由其 Story 拥有（`story_id` 不变），并获得一个**可选**的 `segment_id` 分组引用。StorySegment 不是 Project 级实体，不是文档/文件模型，也不改变 Project → Story → Scene → Shot 主脊。

## 已考虑的备选方案

1. **在 Story 与 Scene 之间增加顶层 Chapter 节点**（Scene 改挂到 Chapter）。层级看起来最干净。否决：它加宽领域契约（§3），迫使对每个已存 Scene 做不可逆的再挂载迁移，且 waoowaoo 证据表明顶层 segment 仅在不存在 Story 实体时才说得通。
2. **在 Story 行内用 JSON 表示 acts/beats 结构。** 上线成本最低。否决：segment 没有稳定身份，评审门禁、作用域重算与溯源（P7）无法引用它们——违反「身份永久，内容可版本化」。
3. **Scene 元数据标签**（Scene 上的 `segment: string` 标签）。否决：标签无法承载每段草稿文本或审批状态，而这正是按章起草/评审所需；这将是 RFC 禁止的「假 UI segment」。

## 权衡记录

| 我们得到的 | 我们放弃的 | 再审视视野 |
|-----------|------------|---------|
| 具有稳定身份的更细生成/评审单元；可加性（非破坏性）迁移 | Story 阶段的简单性：多一个实体、多一层需维护的排序 | 若 segment 开始需要自有资产或继承覆盖，应重新审视——那将表明它们想成为真正的层级节点（新 ADR） |
| 未分组故事仍然有效（保留可选性） | 单一规范阅读顺序现在有两个来源（scene order + segment order），必须保持一致 | 当指定 `.ziv` 导出（D1）时重新审视——届时 segment 序列化将成为公开承诺 |

## 后果

- `packages/domain` 获得 StorySegment 类型/模式；`packages/database` 获得**可加性**迁移（`story_segments` 表 + 可空的 `scenes.segment_id`）。既有行的含义不变。
- Story Agent 可产出分段草稿；故事评审门禁可按 segment 迭代。这是既有故事门禁内的门禁*策略*，不是新的强制门禁类别（为此无需再写 ADR）。
- segment 内的 Scene 排序必须与故事级 scene order 保持一致；欠领域测试。
- 欠文档：Core-Domain-Model.md（层级说明）、Looser-Creative-Flow-RFC Slice C（已解阻）、Next-Tasks Track E3、V0.4-Modification-Plan W3。
- 负面：两级排序容易引入 off-by-one/重排 bug；删除 segment 必须分离（而非删除）其 Scene。

## 合规

- PR 评审：UI 不得渲染没有持久化 StorySegment 行支撑的章/段交互（RFC Slice C 规则）。
- Segment 操作首先作为 API/Orchestrator 操作存在（P3）；WorkflowPanel 消费它们。
- 领域测试套件覆盖：可选分组（空 `segment_id`）、segment 重排、删除 segment 时分离 Scene、每段审批状态转换。
