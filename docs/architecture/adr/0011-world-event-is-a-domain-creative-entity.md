# ADR-0011: WorldEvent is a domain creative entity

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Project owner / architecture maintainer
- **Class:** Standard
- **Reversibility:** Reversible
- **Source:** [IP World Model Repositioning RFC](../rfc/IP-World-Model-Repositioning-RFC.md) §5 Slice 1；与 [ADR-0010](0010-creator-chat-is-the-world-first-continuous-conversation-surface.md) 2026-08-04 修订同批生效

## Context

Track I 需要回答「这个世界现在处于什么阶段」：Timeline 的 event track 需要一个项目级实体来承载世界时间中的事件（大战爆发、角色陨落、王朝更迭），而既有的 `Scene` 是叙事单元（属于某条 Story 的镜头场景），无法承载跨故事、跨角色的事件。IP RFC §5 Slice 1 已登记该需求，并约定「落库时须另开 ADR」。

同时，Creator Chat 修订（ADR-0010）把「对话中确认的事件」纳入自动落库范围——`WorldEvent` 正是这个世界事实的载体。

## Decision

**`WorldEvent` 是创作层领域实体**，记录「创作宇宙里发生了什么」——发生的时间、受影响的实体、前置条件与后果。它与 `ChangeEvent` 的边界是硬边界：

| | `WorldEvent` | `ChangeEvent` |
|---|---|---|
| 语义 | 创作宇宙事实（故事世界内发生的事） | 系统提交操作（对系统状态一次变更的审计记录） |
| 消费者 | 世界线视图、Agent 世界知识、跨实体查询 | 审计、回溯、EntityRevision 历史 |

两者不合并：`WorldEvent` 的创建本身会产生一条 `entity.created` 的 `ChangeEvent`（Track H 双写），两条线并存，各司其职。

**v1 边界（本计划实现范围）：**

- **只读 + 创建 draft：** `GET` 全量可用；写入一律进入 `draft`，必须经既有 review gate 才能被下游依赖；**不参与 `Shot` 依赖与继承解析**（回滚限定在单表内）。
- **时间一律使用世界时间信封**（opaque `WorldTimeBinding`：`{dimension_id, mode: 'instant' | 'range' | 'relative', ...}`），**不做任何真实时间轴换算**——世界线刻度是纯展示坐标（宪法约束），信封值只承载「这个世界自己如何计时」。
- **挂载锚点：** `anchorStoryId?` + `presentationOrder?` 用于世界线视图的锚点序列（锚点 = `WorldEvent` 与带可选 `world_time_bindings` 的 `Scene`，按 `presentation_order` 排序，边界间隙与「三年后」式跳跃以断点表达，不做均匀刻度）。

## Alternatives Considered

- **复用 `ChangeEvent` 表达世界事实：** 拒绝。系统审计与故事世界事实是两个语义域，合并会同时污染两条查询路径，且 `ChangeEvent` 属于系统层、不参与创作层导出。
- **作为 `Scene` 的子资源：** 拒绝。`Scene` 是叙事单元（属于 Story），世界事件跨场景、跨故事存在，子资源形态无法表达。
- **作为 `Asset(type=event)`：** 拒绝。Asset 是资产载体（character/location 等带视觉与引用语义），事件是时间轴语义，混入 Asset 会让时间线查询与资产语义互相干扰。

## Consequences

- `packages/domain/src/history/types.ts` 的 `HISTORY_ENTITY_TYPES` 增加 `'world_event'`；`snapshots.ts` 新增 `serializeWorldEventSnapshot`。
- 查询面：`GET /projects/:pid/world-events?story_id=&state=`（story_id 过滤沿 `anchorStoryId`）。
- 时态回溯查询（`at=`）列为后续迭代，不在 v1。H6 显式世界时间绑定已于 2026-08-16 落地（`TemporalDimension` + `WorldTimeBinding` 信封；核心不做真实时间轴换算）。
- 违反边界的诱惑（把对话记录塞进 WorldEvent 的 summary、把 ChangeEvent 当世界事实）由 ADR-0010 围栏与本次边界描述双重拦截。
