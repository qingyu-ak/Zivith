# 开发记录（Development Log）

> Zivith 逐次修改的开发日志
>
> Status: Active
>
> Created: 2026-08-05
>
> 约定：**每次代码修改提交时必须同步在本文件追加一条记录**（最新在上）。条目格式：日期 · commit hash · 类型 · 摘要 · 涉及模块。类型沿用 Conventional Commits（feat/fix/docs/test/chore/refactor）。
>
> Related: [Next-Tasks.md](Next-Tasks.md), [Implementation-Plan.md](Implementation-Plan.md), [Code-Agent-Design-Guide.md](../engineering/Code-Agent-Design-Guide.md)

---

## 2026-08-05 · `7b71079` · test(api) · 提案流脚本增加数据库落库完整性断言

在 `verify-proposal-flow.ts` 中新增 20 项 DB 层断言：每一步 apply 后直接查库验证字段级持久化——project（name/description/ownerId/defaults/settings + 自动 World Line timeline + thread.project_id）、asset（name/type/state= draft/projectId/description，覆盖韩立、南宫婉、天南大陆）、world_event（title/description/state/world_time_envelope/presentation_order）、relationship（kind/sourceType/targetType/direction/label/description/state + 两端引用项目内真实实体），末尾增加 DB 汇总计数防多余/缺失实体。检查数 28 → 48，全部通过。

- 模块：`apps/api/scripts/verify-proposal-flow.ts`

## 2026-08-05 · `2f322c4` · test(api) · 新增 mock 提案流回归验证脚本

新增 `verify-proposal-flow.ts`：进程内构建 mock-LLM 临时 API（零外部调用、随机端口），走真实 HTTP 路由层模拟多实体创建对话流——建项目 → 角色 → 地点 → 事件 → 增量角色 → 关系 → 纯提问（无提案）→ 错误路径（400 NO_PROPOSAL / 409 PROPOSAL_ALREADY_HANDLED / 400 PROJECT_ALREADY_EXISTS）→ resources 汇总，28 项检查。同步修复 mock 规则引擎：纯提问（如「主角还有什么秘密？」）不再误触发实体提案（声明信号 vs 疑问句判定，`declaring` 优先）。

- 模块：`apps/api/scripts/verify-proposal-flow.ts`、`apps/api/src/contexts/world-builder/world-builder-agent.ts`

## 2026-08-05 · `84b5d69` · fix(api) · 提案生成与批量 apply 加固（阶段 E hardening）

修复三个问题：LLM 空承诺（只回文字不产提案）→ prompt 新增规则 #8 + `respond()` 规则兜底（提案为空时调用 mock 规则引擎提取设定信号）；批量提案 500（create_project + 同批 entity 提案时后续提案缺 project_id）→ apply 端引入 `currentProjectId` 跟踪变量并回绑 thread；`extractEntityName` 正则误提取（「记录一个角色」提取出「一个」）→ 重写提取优先级。会话关联项目链路修复（thread.project_id 正确回写）。

- 模块：`apps/api/src/contexts/world-builder/`、`apps/api/src/routes/world.ts`

## 2026-08-05 · `e10bd04` · feat(web) · Creator Chat 页面（阶段 E）

Web 端 Creator Chat：列表页 `/creator-chats`（加载会话 + 项目，新建对话表单）+ 对话页 `[threadId]`（bubbles、系统消息、spinner、textarea）+ 提案卡片（`parseProposals` 数组解析、apply 按钮、`entity_type === 'project'` 时「进入项目工作区」链接）。App shell 导航加「创作聊天」，auth guard 放行 `/creator-chats`（ADR-0013 无登录）。修复 Next.js 15+ 的 `params` Promise 解析问题。

- 模块：`apps/web/app/(studio)/creator-chats/`、`apps/web/components/creator-chat/`、`apps/web/lib/types.ts`

## 2026-08-04 · `dcb94e2` · feat(api) · World Builder Agent（阶段 D）

Creator Chat 会话运行时 + World Builder Agent：`world-builder-agent.ts`（zod 结构化输出 `worldBuilderResponseSchema`、mock 规则引擎 `mockWorldBuilderResponse`、`extractEntityName` 提取）、prompt 模板（规则 #8：有信息必提案、禁止空承诺、项目存在性检查）、`world-context.ts`（`buildWorldContext` 聚合 project/stories/assets/world_events/relationships）。修复阶段类型错误 5 处（latestUserMessage 空值、characters[0] guard、presentationOrder 映射、row.role 收窄、apply handler thread 查询）。

- 模块：`apps/api/src/contexts/world-builder/`、`apps/api/src/routes/world.ts`

## 2026-08-04 · `be8e7cc` · feat(api) · 世界创建层路由（阶段 C）

Creator 层 API 路由：Creator Chat 会话 CRUD（`/creator-chats`，无 JWT authenticate，ADR-0013）、消息发送（40 条历史 → `buildWorldContext` → agent respond → assistant 消息带 proposal 数组 + proposalKey/State）、提案 apply（`/proposals/:messageId/apply`，`currentProjectId` 批量跟踪，幂等，全部落 draft）、resources 汇总（GET `/projects/:pid/resources`）、世界事件/关系/时间线资源路由。`proposal-applier.ts` 按 kind 分发既有 service（create_project / create_world_event / create_character / create_location / create_scene / create_relationship / update_entity），多态 EntityRef 校验。

- 模块：`apps/api/src/routes/world.ts`、`apps/api/src/contexts/world/proposal-applier.ts`、`apps/api/src/contexts/world/local-user.ts`

## 2026-08-04 · `05cceea` · feat(database) · 创造层世界 schema 与领域契约（阶段 B）

Prisma schema 新增创造层模型：`WorldEvent`（项目级、世界时间信封、presentation_order、state=draft）、`Relationship`（独立可查询实体，多态 EntityRef source/target，ADR-0012）、`ProjectTimeline` / `TimelineTrack` / `TimelineItem`（世界线）、`CreatorChatThread` / `CreatorChatMessage`（proposal Json? / proposalKey / proposalState，ADR-0013 无 userId）。`@zivith/domain` 增加 world.ts 契约（worldEventCreateSchema、relationshipCreateSchema、proposalSchema 等）。

- 模块：`packages/database/prisma/schema.prisma`、`packages/domain/src/world.ts`

## 2026-08-04 · `36fc160` · docs(governance) · 采纳创造层优先治理（阶段 A）

文档治理：ADR-0010 修订为「Creator Chat 是世界优先的持续对话面」（取代一次性向导）、新增 ADR-0011（WorldEvent 为领域创作实体）、ADR-0012（Relationship 为独立可查询实体）、ADR-0013（本地单用户模式、无登录）；同步 constitution / IDE RFC / UI 信息架构 / 跟踪文档（Next-Tasks、README 状态表）。确立分支 `feat/creator-layer-first` 及创造层优先路线。

- 模块：`docs/architecture/adr/`、`docs/README.md`、`docs/planning/Next-Tasks.md`

---

## 如何更新本文件

每次提交代码后：

1. 在本文件顶部（`---` 分隔线之下）追加一条记录，**最新在上**
2. 记录含：日期 · commit hash · 类型 · 摘要 · 涉及模块
3. 摘要说明「改了什么、为什么、修了什么 bug」，并在最后标注回归验证（如 verify 脚本通过数）
4. 若修改了架构决策或新增实体，同时遵循 ADR 流程，勿只写日志
