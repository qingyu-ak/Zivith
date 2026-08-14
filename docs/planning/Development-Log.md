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

## 2026-08-14 · pending · feat(web,api) · hand off studio focus and make conflicts editable

「在对话中继续」立刻交接选中实体（带真名、不问主线、不写「未命名」）；模型把 `open_questions` 写成字符串时不再把校验 JSON 丢进对话；冲突卡片标出互相打架的原文，Inspector 可直接改描述。

- **feat(web)** `focus_name` + `auto_send` 交接；冲突 evidence +「编辑描述」
- **feat(api)** Studio handoff 短接；`open_questions`/`conflicts` 字符串收成数组；SSE 不泄露 Zod 原文
- 验证：web `creator-chat-nav` `world-conflicts`；api `guidance` `conflict-detector` `world-builder-stream`
- 模块：`apps/web/{lib,components}`、`apps/api/src/{routes,contexts/world-builder}`

## 2026-08-14 · `81aba7c` · feat(web,api) · name creator chats after their world

确认创建世界后，对话标题跟随项目名；无自定义标题时侧栏和顶栏显示项目名。

- **feat(api)** apply `create_project` 时写入 thread.title；GET 线程带 `project_name`
- **feat(web)** `threadDisplayTitle`
- 验证：web `chat-history`
- 模块：`apps/api/src/routes/world.ts`、`apps/web/{lib/chat-history*,components/creator-chat}`

## 2026-08-14 · `a55b258` · feat(web,api) · continue chat from a studio entity

Studio 选中实体后打开该项目对话，关注点只注入本轮 World Builder，不写入聊天记录。线程列表/详情改为 snake_case DTO。

- **feat(web)** Inspector「在对话中继续」；Chat 关注条；按项目解析最近线程
- **feat(api)** `sendMessageBody.focus` 进 prompt；mock 对关注实体出 `update_entity`
- 验证：web `creator-chat-nav`；api `guidance`；web/api `tsc --noEmit`
- 模块：`apps/web/{lib,components}`、`apps/api/src/{routes,contexts/world-builder}`、`docs/planning/Next-Tasks.md`

## 2026-08-14 · `842adb1` · feat(web) · show locations and world-time drift on the world line

世界线补地点轨；角色按参与事件、地点按所属场景锚定；刻度用事件标题；世界时间信封偏离呈现序时可见（不改写主轴）。创作线 / 制作实现未动。

- **feat(web)** `buildWorldLineModel` 四轨道 + `axisMarks`；时间线竖导轨 / hover / 琥珀色偏离
- **feat(web)** Inspector 世界事件展示「跟随 / 偏离」
- 验证：web `world-line`；web `tsc --noEmit`
- 模块：`apps/web/lib/world-line*`、`apps/web/components/world/*`、`docs/planning/*`

## 2026-08-14 · `cc12416` · feat(web,api) · guided chat and light collapsible studio

World Builder 按缺口主动追问。Creator Chat 改为浅色独立对话面（可收起历史侧栏、Studio ↗）。Studio 白底、左右栏可收起。Web 开发服务固定 `127.0.0.1:3100`。

- **feat(api)** `guidance.ts` 缺口检测；mock/LLM 回合合并 `open_questions`
- **feat(web)** 浅色 Chat/Studio 壳、可收起侧栏、会话列表守卫
- **chore** `next dev --hostname 127.0.0.1 --port 3100`；去掉 turbo `--parallel`
- 验证：api `guidance` 7；web `chat-history` / `sidebar-state` / `world-conflicts`；web `tsc --noEmit`
- 模块：`apps/api/src/contexts/world-builder/*`、`apps/web`、`packages/ui`、`docs/planning/*`

## 2026-08-13 · `8f2d8f0` · feat(web,api) · world conflict checks and concise creator chat

H9 规则冲突检测（只报告不落库）+ Creator Chat 收成简洁对话面；世界摘要、冲突列表与 Inspector 放在 Studio。

- **feat(api)** `conflict-detector`：同名、关系循环、事件顺序、题材偏离、极性事实；World Builder 合并进 `world_state.conflicts`
- **feat(web)** Studio 副驾驶冲突列表；聊天去掉右侧世界状态，提案一行确认
- 验证：api `conflict-detector` 14 + `world-builder-stream` 7；web `world-conflicts` 2 + `chat-history` 1；api/web `tsc --noEmit` 0 error
- 模块：`apps/api/src/contexts/world-builder/*`、`apps/web/{components,lib}`、`docs/planning/*`

## 2026-08-13 · `35eb9e1` · feat(web,api) · character lanes, creator-chat SSE, local no-login API

创造层收尾三块：世界线角色条目叠在同一条「角色」轨内并钳制起点；Creator Chat 流式回复（`Accept: text/event-stream`，JSON 回退）；ADR-0013 无 JWT 自动本地会话，Studio 接口打开即用。

- **fix(web)** 角色不拆成独立轨道；条带左缘不盖住「角色」标签
- **feat(api,web)** 发消息走 SSE delta，提案仍在 `done` 后确认落库；旧 `POST /messages` 保留
- **feat(api,web)** `createAuthenticate` 绑定 `local@zivith.local`；`ensureProjectMember` v1 自动放行；`GET /projects` 列出本机项目
- 验证：api `local-auth` 4 + `world-builder-stream` 5 + `app` 5；web `sse` + `world-line`；api/web `tsc --noEmit` 0 error
- 模块：`apps/api/src/{routes,contexts,lib}`、`apps/web/{components,lib}`、`docs/planning/*`

## 2026-08-13 · `b3ea182` · feat(web,api) · editable world inspector and production shot track

创造层 S1/S2：Studio Inspector 可编辑角色/地点/事件/关系/场景/故事；制作视图补 Shot 轨道（镜头嵌在所属场景刻度区间）。resources 对资产走 `assetDto`、场景走 `sceneDto`。

- 黑盒：`apps/api/scripts/verify-inspector-shot-bb.ts` **33/33**（login → 创建并 PATCH 全类实体 → resources 展平/持久化）；页面 SSR `/` 307→`/creator-chats`，`/projects` `/world` `/login` 200。未发现需修复的产品缺陷。
- 模块：`apps/api/src/routes/world.ts`、`apps/web/components/world/*`、`apps/web/lib/{types,world-line*}`、`docs/planning/*`

## 2026-08-06 · `6eb58cb` · fix(api,web) · 混合批次跳过重复 create_project，实体提案照常应用

LLM 偶尔在项目已存在时仍误产出 `create_project`，与真实实体提案混在同一批。原 apply 逻辑只要遇到 `create_project` 且项目已存在就抛 `PROJECT_ALREADY_EXISTS`，导致整批实体提案（角色/地点/事件等）全部无法应用，表现为「新出现的实体不能添加到世界」。

- **fix(api)** `apps/api/src/routes/world.ts`：批内遍历改为「跳过 + 继续」——`create_project` 与既有项目冲突时记录到 `skipped` 并继续应用其余提案；仅当全部提案均被跳过（纯重复建项目）才保留原 400 语义；响应改为 `{ applied, skipped }`
- **fix(web)** `proposal-card.tsx`：消费 `skipped`，成功后显示琥珀色提示「项目已存在，已跳过「创建项目」提案；其余实体提案已应用。」
- **test** `verify-proposal-flow.ts`：新增第 12 节「混合批次」回归——构造 create_project + create_character 同消息，断言 apply 200 不被阻断、skipped 含 create_project、applied 含 asset、角色已落库 draft、消息标记 applied
- 验证：`verify-proposal-flow.ts` **53/53 全过**（旧语义保留：纯 create_project 仍 400）；api/web `tsc --noEmit` 0 error
- 模块：`apps/api/src/routes/world.ts`、`apps/web/components/creator-chat/proposal-card.tsx`、`apps/api/scripts/verify-proposal-flow.ts`

## 2026-08-06 · `ee2c801` / `a26dfac` · feat(web) · Studio Production 视图（K4 完成）

「一条 Timeline 的两种视图」补齐制作视图：世界线工作区顶部新增「世界 / 制作」tab 切换，制作视图沿 Presentation 顺序展示制作链路——故事（Story）轨道 + 场景（Scene）轨道（全局展示序号定位，非均匀刻度 + 轨道化复用世界时间线布局），左栏切换为故事列表，右栏 Inspector 复用（story/scene 选中展示）。数据复用 `GET /world/projects/:id/resources` 的 `entities.stories/scenes`，零后端改动；`StoryDTO` 补 `order` 字段；`buildProductionLineModel` 纯函数派生（mock 断言 5 项全过：双轨道/锚点连续/scaleDomain/无连线）。Shot 轨道与高级 track 留后续（K4 状态已更新）。

- 模块：`apps/web/lib/world-line.ts`、`apps/web/lib/types.ts`、`apps/web/components/world/{world-workspace,world-timeline}.tsx`、`docs/planning/Next-Tasks.md`

## 2026-08-06 · `0188241` + `ee2c801` + `a26dfac` · feat(web,api,domain) · 世界优先 Studio 阶段成果提交 + Creator Chat Trae 三栏

一次性提交此前累积的未提交工作（世界优先 Studio UI + 世界观闭环 + 生产/设置页 + 世界实体后端），并叠加本次 Creator Chat 改造：

- **fix(api)** `0188241`：`verify-proposal-flow.ts` 类型修复——`logger: false`（原 `{level:'error'}` 类型不符）、threadId/projectId 非空守卫、关系两端 `row?.sourceId/targetId` 收窄 + `projectId ?? undefined`、`asString` 安全转字符串（47+/35-）
- **feat(web)** `ee2c801`：Creator Chat 改为 Trae 风格三栏——左会话边栏（常驻历史会话列表 + 内联新建对话表单）、中对话流（assistant 头像气泡 + 输入区圆角容器 + Enter/Shift+Enter 提示）、右世界状态面板（`world-status-panel.tsx`：阶段徽标/世界观摘要/实体计数/最近实体/进入 Studio，复用 resources 接口）；API 失败降级为三栏骨架 +「对话加载失败」可重试卡片（不再误报「对话不存在」）
- **feat(web,api,domain)** `a26dfac`：Project.worldview 结构化字段 + parse/merge 助手、resources 读写、production/settings 页承接原面板、Inspector/Explorer/副驾驶摘要增强、世界实体后端（world 路由/proposal-applier/world-builder-agent）、history baseline 修复、docs 同步（49 files，1511+/181-）

- 验证：web `tsc --noEmit` ✓ 0 error；dev 编译 ✓；browser_use 沙箱验证 Creator Chat 三栏骨架渲染 + 无 JS 崩溃 + 降级逻辑稳定；本机 HTTP 确认 resources 数据源（stage/实体计数）；API 运行正常
- 模块：`apps/api/scripts/verify-proposal-flow.ts`、`apps/web/components/creator-chat/{chat-panel,world-status-panel}.tsx`、`apps/web/app/(studio)/projects/[projectId]/{production,settings}`、`docs/*`

排查「对话有角色但 Studio 没有」时发现库内存在三个同名「凡人修仙传」：`239cb924`（韩立/天南大陆/2 事件/已确认对话）、`b62f238b`（1 条对话含 pending 韩立提案，无实体）、`4c50e7cc`（验证项目，无数据）。用户确认合并为一个、保留所有数据。

以 `239cb924` 为主体执行事务合并：① `b62f238b` 的对话（thread `1a27122d`）projectId 迁移至主体，对话历史/消息原样保留；② 处理该对话的 pending 提案——`create_project` 项移除（主体项目已存在，保留会在确认时 PROJECT_ALREADY_EXISTS）、韩立描述并入主体已有韩立 asset（目标项目已有韩立，无需重复落库）、提案标记 `applied` 不留 pending 残留；③ 空壳 timeline 与其余两个项目软删（`deletedAt`，数据保留可恢复）。

- 验证：全库计数无损——threads 9→9、assets 74→74、worldEvents 3→3，projects(active) 7→5；`GET /projects`（demo）只剩 1 个「凡人修仙传」+「UI 回归验证项目」；`resources` 返回韩立（描述已并入两段）/天南大陆/2 事件；`/world/creator-chats` 2 条对话均归属主体项目、无对话指向已归档项目；浏览器回归：/projects 1 张卡片、工作区可见韩立/天南大陆/2 事件、两条对话「进入 Studio →」均指向 `239cb924`，无报错
- 模块：数据操作（无代码变更，脚本已清理）；说明：对话标题 `?????` 为早期测试乱码残留，非本次引入

## 2026-08-05 · `(pending commit)` · feat(api/web) · Studio Inspector 项目属性内联编辑（K5 衍生）

右栏 Inspector 支持项目级内联编辑：名称/描述/题材/核心设定/世界规则/补充 六项可改可存，保存后刷新持久化。进入工作区 → 左栏选中「项目」节点 → Inspector 顶部右上「编辑」→ 修改 → 保存（成功后自动刷新资源并回显）。编辑按钮置于「世界线属性」区块标题右上角，符合「动作按钮右上角快速可达」的交互偏好。

- API `PATCH /projects/:id` 扩展支持 `worldview` 字段：`projectBody` 新增 `worldview: z.record(z.unknown()).optional()`（导出 schema 便于契约单测）；**编辑器整组替换语义**——保存时以 `parseWorldview(body.worldview)` 规范化并整体落库，允许清空单个字段（与 agent 侧 `mergeWorldview` 部分合并语义区分，见 proposal-applier）；`POST /projects` 同步支持带 worldview 创建
- Web `inspector-panel.tsx`：project 分支加内联编辑表单（六输入框 + 保存/取消 + 错误提示 + 保存中态）；草稿随 `resources` 刷新重置、切换选择自动退出编辑态；保存调 `PATCH /projects/:id`，成功回调 `onProjectUpdated` 触发父级 `load()` 刷新；世界工作区 header 徽标由「v1 只读」改为「v1」
- 验证：typecheck api/web ✓ 0 error（顺带修复 Next 16 dev 生成的 `.next/dev/types/*.ts` 截断问题——重启 dev server 并清除 `.next` 缓存后重新生成）；lint ✓ 0 error；单测 `resource-contracts.test.ts` 新增「project worldview patch contract」2 例（Inspector 载荷规范化 + 清空字段整组替换语义）8/8 ✓；API 级闭环冒烟 ✓（建临时项目 → PATCH worldview 六字段 → GET 持久化 → 清空语义 genre="" rules=[] → 删除）；浏览器端到端（127.0.0.1:3100）全 PASS：登录 → /projects 见「凡人修仙传」→ 世界工作区三栏 → 选项目节点 → 编辑 → 追加描述与规则 → 保存 → 刷新后持久化确认
- 说明：上一轮清理已移除 chat 测试建的「凡人修仙传」；库内仅存两个早期孤立「凡人修仙传」（`b62f238b`/`239cb924`，owner=local 且无 ProjectMember，不在 /projects 列表、PATCH 403）。本轮验证另建 demo-owned 的「凡人修仙传」`4c50e7cc`（已带成员、可编辑），是否保留待用户确认
- 模块：`apps/api/src/routes/resources.ts`、`apps/api/test/resource-contracts.test.ts`、`apps/web/components/world/{inspector-panel,world-workspace}.tsx`

## 2026-08-05 · `(pending commit)` · feat(api/web/domain) · 世界观 Chat→Studio 核心闭环（K5）

愿景核对报告 + 核心闭环落地：Creator Chat 引导 IP → 自动识别世界观 → 落库 → Studio 三栏展示 → 副驾驶摘要 → 切换入口。Chat 引导/Studio 三栏/实体列表/timeline/Inspector 与愿景对齐；补齐世界观单点表示与自动识别。

- `Project.worldview Json @default("{}")`（genre/premise/rules/notes）+ additive 迁移 `20260805051706_add_project_worldview`
- `@zivith/domain`：`worldviewSchema` / `parseWorldview` / `mergeWorldview`（rules 整组替换）+ 6 项单测
- proposal-applier：`create_project` 支持 payload.worldview；`update_entity` 新增 `type='project'` 分支（merge 落库）
- world-builder：mock 正则识别世界观信号（题材/设定/规则/力量体系…，优先于实体分支）产出 `update_entity` 提案；LLM system prompt 加入世界观提炼指令；`buildWorldContext` 注入世界观到「世界现状」插槽
- `GET /world/projects/:pid/resources` 返回 `project.worldview` + `stage`（bootstrap/growing/mature）
- Web：`WorldviewDTO`/`WorldStage` 类型；新组件 `co-pilot-panel.tsx`（只读世界状态摘要）替换中栏占位；Explorer 顶部「世界观」组；Inspector project 分支展示世界观属性；chat header 常驻「进入 Studio →」入口

- 模块：`packages/database/prisma/schema.prisma`、`packages/domain/src/world.ts`、`packages/domain/test/world.test.ts`、`apps/api/src/contexts/world/proposal-applier.ts`、`apps/api/src/contexts/world-builder/{world-builder-agent,prompt,world-context}.ts`、`apps/api/src/routes/world.ts`、`apps/web/lib/types.ts`、`apps/web/components/world/{co-pilot-panel,entity-explorer,world-workspace,inspector-panel}.tsx`、`apps/web/components/creator-chat/chat-panel.tsx`
- 验证：typecheck（api/web/domain）✓ 0 error；lint ✓ 0 error；单测 domain 54 / api 95 / web 11 全过；E2E `verify-proposal-flow.ts` 48/48 ✓；API 级世界观闭环冒烟 ✓（世界观提案 → apply → worldview 落库 → resources 返回）；浏览器回归（127.0.0.1:3100，mock API）A–E 五点全 PASS（Chat 引导世界观提案/确认落库 → header 常驻「进入 Studio →」跳转 → 左栏世界观组 → 副驾驶面板阶段+摘要+计数 → Inspector 世界观属性）
- 回归期修复 6 处：① `update_entity` 的 `type='project'` 且 payload 缺 `id` 时兜底为 projectId（LLM/mock 漏带）；② mock 世界观提案显式带 `id: projectId`；③ mock 世界观 premise 正则优化（移除「设定：」前缀捕获）；④ CoPilotPanel/InspectorPanel 补 `worldview ?? { rules: [] }` 空值防护（防旧版 API 契约缺失崩溃）；⑤ **真实 LLM 占位 project_id 修复**：LLM 会在提案里填 `project_placeholder`/`proj-001` 等占位 ID，`requireProjectId` 改为上下文归属（批量 apply 的 currentProjectId / thread.projectId）优先，`type='project'` 的实体 id 恒用 projectId；apply 循环包进 `db.$transaction`（失败整体回滚、提案保持 pending 可重试，消除部分应用与重复确认死锁）。定向复测 7 项全过（占位 ID apply 200 + 角色落库于正确项目 + 批量失败回滚 + pending 可重试 + 4xx 非 500）；⑥ **Creator Chat 项目进 /projects 列表**：applyCreateProject 建项目时自动写入 `ProjectMember`（优先当前登录用户——world 路由无 auth 但前端统一带 Bearer token，apply 端点可选 `jwtVerify` 解析；匿名/无 token 回退 local owner），与手动建项目（resources.ts nested create）行为一致，按成员过滤的 /projects 列表可见。定向验证 + 浏览器端到端全 PASS（chat 建项目 → /projects 列表出现 → 可进入工作区）

## 2026-08-05 · `(pending commit)` · feat(web) · K3 Creator Chat 设为应用默认页 `/`

Track K3 落地：根路由 `apps/web/app/page.tsx` 重定向由 `/projects` 改为 `/creator-chats`，打开应用即进入持续对话创作面（Track J 门禁已满足）。

- 模块：`apps/web/app/page.tsx`
- 验证：web typecheck ✓ / eslint ✓ / 浏览器回归（127.0.0.1:3100）：`/` 正确重定向 `/creator-chats`，侧栏「创作聊天」激活，对话列表与新建入口可用，`/projects` 回归正常，无 500

## 2026-08-05 · `(pending commit)` · feat(web) · K1 项目首页拆分为 World Overview + /production + /settings

Track K1 落地（世界优先 UI 第一步，只搬不移逻辑）：项目页移除 `ProviderPanel`/`UsageSummaryCard`/`WorkflowPanel`/`GenerationQueuePanel`，改为 World Overview（顶部项目名 + 「本地创作」徽标 + 「去创作对话」入口 + 分区导航：世界工作区/故事/实体库/制作/设置）；新增 `apps/web/app/(studio)/projects/[projectId]/production/page.tsx`（WorkflowPanel + GenerationQueuePanel）与 `settings/page.tsx`（ProviderPanel + UsageSummaryCard）；新增 `apps/web/components/project-sub-nav.tsx` 分区导航组件；侧栏新增「制作」「设置」入口并修正激活态逻辑。

- 模块：`apps/web/app/(studio)/projects/[projectId]/{page,production/page,settings/page}.tsx`、`apps/web/components/{project-sub-nav,app-shell}.tsx`
- 验证：web typecheck ✓ / eslint 5 文件 0 错误 ✓ / 浏览器回归（browser_use 对 3100 dev server）5 页全过：projects 列表、World Overview、/production、/settings、/world 均正常渲染，无 500 / 无应用级红色报错
- 已知遗留（非本任务）：API 大多数路由仍强制 JWT（仅 `/world` 免认证），ADR-0013「打开即用」后端未闭环；浏览器验证时以 seed 账号 `demo@zivith.local` 登录，并新建了「UI 回归验证项目」（ID `38701dd8-46cc-465d-a725-afebb93cb7b7`）作为验证载体，可删除

## 2026-08-05 · `(pending commit)` · test(api/domain/web) · 测试基线修复 + lint 清理 + 阶段 G 零 DB 单测补齐

复盘全量测试基线：API 95 单测、Domain 23 单测、提案流 E2E 48 项全部通过。修复 `history-baseline.test.ts` 2 项回归（mock db 缺 `worldEvent` 模型 → 补 `findMany` mock）。lint 清理 535 → 45：删除 `apps/web/scripts/syntax-check/` webpack 残留（~500 项噪音），新代码 lint 清零（剩余为既有文件基线债务，非本任务范围）。阶段 G 新增零 DB 单测：`packages/domain/test/world.test.ts`（25 项：worldEvent/relationship/timeline schema parse、世界时间信封 opaque、快照序列化、HISTORY_ENTITY_TYPES 扩展）+ `apps/web/lib/world-scale.test.ts`（11 项：createOrderScale/interpolateOrders/integerTicks 刻度算法），`apps/web/package.json` 接入 `test` 脚本（`vitest run`，依赖 workspace hoisted vitest v2.1.9）。补齐 B3 缺口：`HISTORY_ENTITY_TYPES` 增加 `'relationship'`，新增 `serializeRelationshipSnapshot` 并并入 `serializeHistorySnapshot` 分发。

- 模块：`apps/api/test/history-baseline.test.ts`、`packages/domain/src/history/{types,snapshots}.ts`、`packages/domain/test/world.test.ts`（新增）、`apps/web/lib/world-scale.test.ts`（新增）、`apps/web/package.json`
- 验证：api / web / domain typecheck 全绿；api 95 单测 ✓、domain 48 单测 ✓（+25）、web 11 单测 ✓；新文件 eslint 0 错误
- 环境备注：本机 Node v24 触发 `engine-strict`，pnpm 命令需带 `--config.engine-strict=false`；`pnpm install` 会因「包管理器不一致」移动 node_modules 到 `.ignored` 并崩溃，勿在本机运行（已发生过一次，已手动恢复）

## 2026-08-05 · `(pending commit)` · fix(infra) · dev server 进程风暴修复 + 免登录可用落地

解决「浏览器 502 / 登录页点了没反应 / 页面卡死」三连问题，根因是 dev server 编译 worker 崩溃-重启死循环（458 个僵尸 node 进程占满 CPU，webpack 产物损坏：login chunk 0 字节、chunk 加载超时）。

修复：① 杀光崩溃循环 worker，仅保留 API/DB/Redis 服务进程；② 删除 `.next` 损坏产物（长路径 API 逐文件清理）；③ 弃用 `--webpack`，改用 Next 16 默认 Turbopack 启动（`pnpm next dev --hostname 127.0.0.1 --port 3100`）；④ 产物验证：3 个路由 chunk 大小正常、全部页面 SSR 200。同时按产品意图落地「免登录可用」（与 TRAE 一致，登录仅为未来云服务保留）：移除 `app-shell.tsx` 的强制登录跳转，未登录时正常渲染所有本地页面，API 401 优雅降级为空态而非跳转 `/login`。保留登录入口供云服务阶段使用。

- 模块：`apps/web/components/app-shell.tsx`、`apps/web/next.config.mjs`（移除无效 envDir）、`apps/web/.env`（新增，注入 NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api/v1）、`apps/web/components/workflow-panel.tsx`（fallback 改 127.0.0.1）
- 验证：world / projects / login / creator-chats 全部 SSR 200；无 token 请求 `/api/v1/projects` 返回 401（前端降级）；dev server 日志零错误

## 2026-08-05 · `5d95566` · feat(web) · 世界线三栏工作区（阶段 F，v1 只读）

新增 `/projects/:projectId/world` 世界线工作区，IDE 式三栏布局：左实体 Explorer（角色/地点/场景/事件/故事分组树）、中 SVG 世界线时间轴（非均匀刻度 + 轨道化 + 关系连线）+ 副驾驶占位面板、右 Inspector（右上世界线属性、右下创作线属性占位）；选中项三栏联动。数据源 `GET /world/projects/:pid/resources`（无认证，ADR-0013）。App shell 导航新增「世界线」，auth guard 放行 `/world`；proposal-card「进入项目工作区」直链世界线。

开源借鉴评估落地（按 Code-Agent-Design-Guide §13.2）：vis-timeline 不采用（命令式 API、强绑定日历时间、7.x 后维护停滞）；借鉴其「轨道+条目」数据模型与 d3-scale 的 domain→range 刻度抽象，零依赖手写 `lib/world-scale.ts`（createOrderScale / interpolateOrders / integerTicks）+ `lib/world-line.ts`（resources 派生模型纯函数）。

- 模块：`apps/web/app/(studio)/projects/[projectId]/world/`、`apps/web/components/world/`、`apps/web/lib/world-line.ts`、`apps/web/lib/world-scale.ts`、`apps/web/lib/types.ts`、`apps/web/components/app-shell.tsx`
- 验证：tsc --noEmit 通过；SSR 200 + 世界线标记渲染；派生模型纯函数用真实数据 9 项断言全 PASS（3 轨道、韩立/南宫婉落位、事件锚点、关系连线映射、scaleDomain 有效）

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
