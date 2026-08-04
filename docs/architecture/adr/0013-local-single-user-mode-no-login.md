# ADR-0013: Local single-user mode (no login)

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Project owner / architecture maintainer
- **Class:** Standard
- **Reversibility:** Reversible
- **Source:** 「创造层优先」计划与产品定位（类似 Trae 本地工具模式：打开即用，云服务登录仅作未来扩展点）；与 [ADR-0010](0010-creator-chat-is-the-world-first-continuous-conversation-surface.md) 2026-08-04 修订同批生效

## Context

用户明确「不要登录」：应用打开即用，类似 Trae 的本地工具模式；登录只作为未来云服务的扩展点。现状是：现有代码大量依赖 `requireUser` / session / `userId` 外键——直接删除会破坏既有功能（违反「不影响当前」的最高优先级），不处理则根路由仍指向登录页（违反「打开即用」）。

## Decision

**本地单用户模式：应用打开即用，无登录门禁。**

- **新表不带 `userId`：** `creator_chat_threads` / `creator_chat_messages` 不设 `userId` 列（新表，不受既有 schema 约束），会话归属按「本机唯一用户」隐含成立。
- **现有鉴权中间件改为「自动本地会话」：** 应用启动/首次请求时自动建立或复用本地会话；数据按 `project` 隔离而非按 `user` 隔离。成员资格校验函数保留（作为未来云模式扩展点），v1 直接放行。
- **不删除用户表、登录页与鉴权结构：** 保留为未来云服务扩展点，仅从产品入口移除——根路径 `/` 直接进入 Creator Chat，不再重定向登录。
- **云服务扩展：** 若未来引入云服务，恢复 `userId` 隔离与登录门禁时须另开新 ADR（本 ADR 的 Reversibility 为 Reversible）。

## Alternatives Considered

- **继续强制登录：** 拒绝。与用户「打开即用」的明确要求直接冲突，且本地单机场景下登录是纯摩擦。
- **大规模删除鉴权结构（表、页面、中间件）：** 拒绝。破坏既有功能与测试面，也断掉未来云服务扩展点——「不影响当前」是本变更的最高优先级约束。

## Consequences

- 根路由 `/` = Creator Chat（应用默认页，无登录门禁）；`auth-form` 登录成功跳转改为 `/`（保留表单供云模式使用）。
- 既有依赖 `userId` 的既有表（project/story/scene/asset 等）不动，不引入迁移风暴；`requireUser` 语义变为「本地会话自动放行」。
- 对话驱动的全部落库动作（ADR-0010 围栏 1）在单用户模式下依然完整保留确认与幂等链。
