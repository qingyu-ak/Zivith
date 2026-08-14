# ADR-0012: Relationship is an independent queryable entity

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Project owner / architecture maintainer
- **Class:** Standard
- **Reversibility:** Reversible
- **Source:** [IP World Model Repositioning RFC](../rfc/IP-World-Model-Repositioning-RFC.md) §5 Slice 2（提前晋级）；与 [ADR-0010](0010-creator-chat-is-the-world-first-continuous-conversation-surface.md) 2026-08-04 修订同批生效

## Context

IP RFC 原设计把 `Relationship` 作为 Entity State 的结构化字段（Slice 2），到 Slice 3 出现真实需求时才晋级独立实体。现实需求已在「创造层优先」计划中提前出现：

1. **世界线视图的关系连线层**需要跨实体查询（「列出某角色的全部关系」），State 字段形态无法服务这类查询面；
2. **Creator Chat 的自动落库**（ADR-0010）需要把对话中确认的关系（师徒、敌对、血缘……）写入独立可查询的载体。

按 IP RFC §9 的触发条件（真实需求来自实现而非假设），本 ADR 提前执行 Slice 2 → 独立实体的晋级；RFC 状态已同步更新。

## Decision

**`Relationship` 提升为独立可查询实体**，建独立表。

- **多态引用：** `source` / `target` 为 `EntityRef`（`{type, id}`），类型枚举 = 既有实体类型（project / story / asset / scene / world_event / relationship）。**无物理外键**，实体存在性由服务层校验（`findUnique` 存在检查），保持迁移简单、避免多态外键。
- **方向与有效期：** `direction: 'directed' | 'undirected'`；可选世界时间有效期 `validFrom?` / `validUntil?`（世界时间信封，见 ADR-0011 的 opaque 约束）。
- **查询面：** `GET /projects/:pid/relationships?entity_id=&kind=`（entity_id 双向命中 source/target；kind 过滤关系类型）。**v1 不做 `at=` 时态回溯查询**，标为后续迭代。

## Alternatives Considered

- **保持 State 字段形态（RFC 原 Slice 2）：** 拒绝。无法回答跨实体查询；世界线关系层与对话确认的关系落库都需要独立查询面，状态字段会变成「隐藏的关系表」，查询靠全表扫描 + 反规范化。
- **物理外键 + 级联删除：** 拒绝。多态引用无法用单外键表达；级联删除对创作宇宙事实（历史关系应保留）语义有害。服务层存在性校验足够，且回滚只涉及单表。

## Consequences

- 新表 `Relationship`（schema 迁移 1）；`HISTORY_ENTITY_TYPES` 增加 `'relationship'`，`snapshots.ts` 新增 `serializeRelationshipSnapshot`。
- 世界线视图的关系连线层直接消费该实体；Creator Chat 的关系提案落库走 `relationships` service。
- `Organization`（Slice 3）仍按原触发条件推进，不因本次晋级而提前。
