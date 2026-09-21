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

## 2026-09-21 · c58e82a · feat(chat) · 角色感、群聊再开、扮演角色刻度回退

收完 09-16 积压 4，并修 Journey D 走查里挡住闭环的洞。群聊提示词把角色卡「个性」提前成说话锁，每拍最多一个括号动作且禁用近期动作，空拍不再把长亲历当讲义。归档后再点「开始群聊」不再 404（死线程关掉、`force_new`）。World Builder 同一条 event_order_collision 不再每轮复述。扮演侧边横条可回退到角色句（头指针 + 抑制 + 软删本场写入）；Studio Agent 仍只能回退用户句。D 主路径 2.1–2.5 已实测。未改：已写入事件再提会再出卡；免 Docker。

- **feat(api)** `character-voice.ts` `buildVoiceLock` / `clampStageDirections`；`canRollbackToMessage`；归档时关闭 `RoleplayThread`；`force_new`；`unreportedConflicts`；重试 `lastMessageForTurn`
- **feat(web)** 群聊启动一律 `forceNew`；死 `thread_id` 不再复用
- **test** `character-voice` / `group-chat-flow` / `conversation-rollback` / `conflict-detector` / `workspace`
- **docs** `task-s25-character-voice.md`、`task-s25-character-tick-rollback.md`、`human-walk-journey-de.md`
- 模块：roleplay / creator-chat / world-builder / conversation-rollback

## 2026-09-21 · e41650a · feat(chat) · 群聊拍间 3.5s、侧面刻度、扮演 AI 接管

落地 2026-09-16 群聊实测积压的前三项（Journey D）。拍间留白改为上一句上屏后再等 3.5 秒（用户开口后的第一句不拖）。Chat / 扮演每句对白一条右侧竖条，悬停展示说话人与摘要，点选回退；Studio Agent 仍只给用户句打点。用户「你扮演」为书中角色时可点「AI 接管」，生成句以 `role=user` 写入该角色；「我来演」或打字接回。读者身份无此按钮。剩「角色感不强」未做。

- **feat(web)** `GROUP_BEAT_MS = 3500`；`conversation-ticks-rail.tsx`；Chat `dialogueTicks` / Agent `userTicks`；`AI 接管` / `我来演`
- **feat(api)** `ghostwrite`：空内容、说话人为 `user_character_asset_id`，落库 `role=user`；空拍不再把上一句用户（含代打）当「读者沉默」
- **test** api `group-chat-flow` / `group-continue` / `roleplay-agent`；web `group-chat-rhythm` / `conversation-ticks`
- **docs** `task-s25-ai-takeover.md`、`next-session-2026-09-16.md`
- 模块：roleplay / creator-chat / studio-agent-panel

## 2026-09-16 · 927b49b · feat(studio) · 新建世界到群聊一直说入库；实测积压留到下次

从扮演世界变化之后的工作区一次入库：新建世界 / TXT / 第一个角色、按世界时间记得与交谈三层、群聊 v1（分人认知、暂停/插话/用户句回退）以及互聊节奏、「让他们一直说」、空拍自己找话题。产品所有者实测问题（互聊太快、角色句回退与侧面竖条、扮演中途 AI 接管、角色感）记在 [next-session-2026-09-16.md](next-session-2026-09-16.md)，下次先出修改计划。人工 Journey D/E 走查仍缺。

- **feat(api,web)** 群聊、回退、记忆窗口、新建世界与角色
- **docs** `task-s25-*`、`next-session-2026-09-16.md`
- 模块：roleplay / creator-chat / memory / novel-import / prisma group_chat_rollback

## 2026-09-13 · 23b0c7e · docs · 工程加固冻结基线纳入 Track V

用户拍板 Track V 进冻结。基线 HEAD 含 `7900f7e`（语音）与 `c6d2157`（导入记忆可编辑）。Stage A 仍等冻结文档入库后开。

- 模块：`hardening-roadmap.md`、`hardening-baseline.md`、`Next-Tasks.md`

## 2026-09-13 · c6d2157 · feat(web,api) · 导入角色的记忆可改可增

小说导入后右侧「TA 记得什么」短事实原先只能删除。补 PATCH/POST 记忆原子，角色档案与记忆面板可编辑、可新增；角色卡按钮改为「编辑角色卡」，避免和记忆编辑挤在一起。

- **feat(api)** `PATCH /memory/atoms/:id`、`POST /memory/projects/:id/atoms`
- **feat(web)** `character-archive.tsx` / `memory-panel.tsx`
- 模块：memory 路由与服务、Inspector 角色档案

## 2026-09-13 · 7900f7e · feat(voice) · 本地流式听写（ADR-0017 Track V）

Creator Chat 与 Studio Agent 输入条增加本机 sherpa-onnx 流式听写：音频经 AudioWorklet → 回环 WebSocket → API 适配器，零持久化、失败不回退云端。V0 实测后改用标准版双语 zipformer（int8 ≈190MB）。纳入工程加固冻结基线。

- **feat(api)** `ports/stt.ts`、`adapters/sherpa-stt.ts`、`contexts/voice/`、`routes/voice.ts`
- **feat(web)** 麦克风按钮、worklet、转写插入输入框（发送前可编辑）
- **feat(desktop)** 仅对本应用 origin 放行 `media`
- **chore** `scripts/voice-model.mjs` sha256 供给；`.voice-models/` gitignore
- 模块：voice 适配器 / 路由 / chat-composer / studio-agent-panel / main.cjs

## 2026-09-12 · 243e03a · fix(desktop) · 修复「桌面端打不开」：隐形窗口不再霸占单实例锁

用户桌面端无法打开：屏幕无窗口但残留 4 个 Zivith.exe 持有单实例锁，再次双击时新进程 `app.quit()`、旧实例 `second-instance` 只对 `show:false` 的隐形窗口做 `focus()`，毫无效果。根因是 `mainWindow.loadURL(WEB_URL)` 被 `void` 吞掉：web 编译期加载失败后窗口永不 `ready-to-show`，进程带着隐形窗口常驻。修复：`loadMainWindowUrl` 失败重试（5 次每次 2s），仍失败强制 `show()` + 错误弹窗，保证窗口可见可关闭；`second-instance` 增加对不可见窗口的 `show()`。现场处理：taskkill 僵尸实例后经 Zivith.vbs 重启，窗口正常显示并获焦。

- **fix(desktop)** `apps/desktop/src/main.cjs`
- 回归验证：node --check 语法通过；prettier 全绿；实机重启后窗口出现（list_apps 确认 Zivith active）

## 2026-09-12 · f055390 · fix(api,web) · 世界身份保护：重绑定 / 运行副本 / 导入收回

审查 30b36b9 的四个必修项。**H1**：`openWithRebind` 先检查 `workspace.json`（§19 worldId 校验后再绑路径）——目标文件夹属于本地存活/归档的其他世界时拒绝（`WORLD_IDENTITY_CONFLICT`，绝不覆盖其身份文件）；外来孤儿 worldId 允许显式重绑（§18.3 [重新绑定]）；损坏标记拒绝（走 §18.2）；无标记文件夹允许绑定（无可破坏身份，是找回丢失标记世界的唯一入口）。**H4**：孤儿「运行副本」沿用文件里的稳定 worldId（`createWorldProject` 支持显式 id），不再新造 UUID 回写 workspace.json。**H3**：§18.1 对话改走 `/world/folders/open` + `on_missing=import`，由服务端收回已有绑定（含归档）或导入新世界，不再被 create 的 `WORLD_PATH_CONFLICT` 卡死。**H2**：新建项目表单增加可选世界文件夹（桌面端，走 `/world/folders/create`，§7）；未绑定项目卡增加「绑定文件夹」。附带：复制文件夹抢占 currentPath 时报 `WORLD_IDENTITY_CONFLICT` 需显式选择；studio 菜单栏打开失败弹出原因不再静默跳转。

- **fix(api)** `apps/api/src/contexts/world/workspace.ts`（rebind 门禁 / 孤儿沿用 worldId / 副本冲突检测）
- **fix(web)** `apps/web/lib/world-folder.ts`（§18.1 走 import）、`projects/page.tsx`（§7 表单 + 绑定入口）、`studio-menu-bar.tsx`
- **test** api workspace 33 例（+4：重绑定三态门禁、副本冲突）；web world-folder 9 例
- 回归验证：turbo typecheck 6/6；test 全绿（api 265+1 skipped、web 137、domain 58）；eslint / prettier 全绿

## 2026-09-12 · 30b36b9 · feat(api,web) · 世界文件夹身份 V1（world-folder-v1 设计落地）

按 [world-folder-v1.md](world-folder-v1.md) 把 Track W1 的临时标记升级为 V1 规范：`.zivith/workspace.json` 写入 `format/formatVersion/worldId/createdAt/zivith.minVersion`（兼容读取旧 `{version,id,name}`）；`initializeWorldFolder` 建 `.zivith/` + `world/ characters/ locations/ stories/ scenes/ sources/ assets/{images,audio,video}` 基础目录（幂等、失败严格报错）。新增 `createWorldInFolder`（§7 创建：文件夹检查 → 初始化 → 数据库 World 同 worldId，初始化失败补偿删行）。`openWorldFolder` 不再静默降级（§18）：默认对 `NOT_A_ZIVITH_WORLD` / `WORKSPACE_CORRUPT` / `WORLD_NOT_FOUND` 明确报错，由前端 inspect → 确认对话框 → `on_missing/on_corrupt/on_orphan/rebind_project_id` 显式选择；移动/改名/换盘符仍按 worldId 重绑（§9），归档世界重新打开自动恢复；路径被另一项目绑定时报 `WORLD_IDENTITY_CONFLICT`（§18.4，不自动合并）。路由新增 `/world/folders/inspect`、`/world/folders/create`，`/world/folders/open` 支持选项；`GET /projects` 带 `workspace_exists`，`DELETE /projects/:id/workspace` 解绑（§19）。Web 端 `lib/world-folder.ts` 统一流程接入 projects 页 / studio 菜单栏 / chat 面板，项目卡展示「当前文件夹不存在 → 重新定位 / 移除本机绑定」。设计文档入库为 `docs/planning/world-folder-v1.md`。

- **feat(api)** `apps/api/src/contexts/world/workspace.ts`（核心服务重写）、`apps/api/src/routes/world.ts`、`apps/api/src/routes/resources.ts`
- **test(api)** `apps/api/test/workspace.test.ts` 重写扩至 29 例：spec 格式/旧格式兼容/损坏/基础目录/创建补偿/孤儿/冲突/重绑定/移动改名重绑定/不静默创建
- **feat(web)** `apps/web/lib/world-folder.ts`（+11 例测试）、`projects/page.tsx`、`studio-menu-bar.tsx`、`chat-panel.tsx`、`lib/types.ts`
- 回归验证：turbo typecheck 6/6；test 全绿（api 261+1 skipped POSIX-only、web 139、domain 58）；eslint / prettier 全绿

## 2026-09-12 · d0cd17a · fix(api) · SSE flush 类型与 Node ServerResponse 对齐

`flushHttpStream` 参数写成弱类型 `{ flush?: () => void }`，`reply.raw`（ServerResponse）无法赋入。改成 `object` 再探测 flush，桌面壳及时刷出 SSE 的行为不变。

- **fix(api)** `apps/api/src/lib/sse.ts`
- 模块：`sse.ts`（world / roleplay 流式路由调用处）

## 2026-09-12 · b55fba9 · fix(web) · 补上 typecheck：侧栏 desktop 与 AssetDTO description

CI typecheck 在 `@zivith/web` 失败：`ChatSidebarRail` 引用了未定义的 `desktop`；`agent-mentions` 测试夹具缺 `AssetDTO.description`。

- **fix(web)** 收起侧栏用 `isDesktopApp()` 写 aria-label
- **test(web)** 角色/地点夹具补 description
- 模块：`chat-sidebar.tsx`、`agent-mentions.test.ts`

## 2026-09-12 · 33aee5f · chore · Prettier 对齐并清掉 lint，修复 CI 格式门禁

feat 合进 main 后 `pnpm format:check` 报 58 个文件未排版。本轮 `pnpm format` 写回，并修 23 处 ESLint（未使用变量、finally 里 return、冗余联合类型等）。`pnpm/action-setup` 升到 v5，去掉 Node 20 警告。

- **chore** Prettier 写回合入 feat 的源文件
- **fix** ESLint 错误（chat-panel / agent 面板 / providers / 记忆摘要等）
- **chore** `.github/workflows/ci.yml` `pnpm/action-setup@v5`
- 模块：web/api 源码与测试、`ci.yml`

## 2026-09-12 · d7a1689 · fix(ci) · 本地对象存储改用可拉取的 Silo 镜像

GitHub Actions 在 `docker compose up` 拉 `minio/minio` 时 403（上游社区镜像已停发）。改用 MinIO 兼容的 `pgsty/silo` + `pgsty/mc` 固定 tag，健康检查改为 `silo healthcheck ready`。Actions 升到 checkout@v5 / setup-node@v5，去掉 Node 20 弃用警告。

- **fix** `compose.yaml` 对象存储与 mc 初始化镜像
- **chore** `.github/workflows/ci.yml` action 版本
- 模块：`compose.yaml`、`.github/workflows/ci.yml`

## 2026-09-12 · 053788d · feat(web,api) · 对话重试 / @提及 / 思考摘要 / SSE 及时刷出

Creator Chat 与 Studio Agent 对齐 Cursor 式一轮操作：失败可重试且不插重复 user、消息复制、输入 `@` 把实体设为本轮 focus、记忆操作收进「想了一下」、提案确认用 updateMany 抢占避免双击、线程列表带待确认条数。SSE 对 Node HTTP 显式 flush，桌面壳不再只看到 user 事件。浏览器选文件夹改说明文案；`/signup`、`/studio` 做别名重定向。

- **feat(api)** `chat-turn` 复用末条 user；提案 pending/null 均可确认或拒绝；world/roleplay 流 flush；线程 DTO `pending_proposal_count`
- **feat(web)** mention 菜单、message-actions、error banner、thought-summary；Agent 侧栏与 composer 共用
- 模块：`apps/api/src/lib/chat-turn.ts`、`routes/world.ts`、`routes/roleplay.ts`、`studio-agent-panel.tsx`、`creator-chat/*`

## 2026-09-06 · cad776e · feat(web,api) · Studio 菜单栏 + L2 档案编辑 + Agent 侧栏（两股工作合并提交）

app-shell / chat-panel 两股改动交织，合并为一笔。①（Grok-A）Studio 顶部菜单栏（文件/编辑/视图/设置/帮助，无假菜单）、L2 核心块新建与编辑（`saveCore`/`patchCore` 路由 + 记忆面板编辑 + 测试）、资源加载收编壳级 provider、`?select=` 深链、`backLeaving` 覆盖层后退、实体创建流、写入模式说明。②（ZCode-A）Agent 侧栏面板（类 Cursor）：壳级右侧 380px 可收起面板，内嵌当前项目世界构建者对话——`resolveThreadForProject` 解析线程、SSE 流式、提案卡就地确认（`parseProposals` 抽到 `lib/chat-proposals.ts` 共用）、选中实体自动作为 focus、努力程度选择；顶栏星形按钮开关，状态持久化。

- **feat(web)** `studio-agent-panel.tsx`、`lib/chat-proposals.ts`（+测试）、app-shell 挂载与开关
- **feat(web,api)** 菜单栏 `studio-menu-bar.tsx`、L2 编辑路由与面板、`agent-write-mode`、`character-archive`、`settings-return` 等
- 模块：详见提交文件清单（app-shell / chat-panel / memory 链路 / world 组件为两股交织）

## 2026-09-06 · 4f5a017 · docs(web) · 帮助文档补 VoiceStudio 本地配音接入

帮助页新增「接入 VoiceStudio 本地配音（可选）」卡：VoiceStudio（全本地 TTS/ASR 套件，16 TTS 引擎，OpenAI 兼容 /v1/audio/speech，AGPL-3.0 独立进程）安装后把 SiliconFlow Base URL 指到 127.0.0.1:3900/v1、语音槽位填引擎 ID，即可把制作线配音换成本地引擎。注明三点：SiliconFlow 图像/视频与配音共用 Base URL 的临时性、默认 OmniVoice 权重 CC-BY-NC 禁商用、克隆须本人同意与 AudioSeal 水印。

- **docs(web)** `help/page.tsx` 新增文档卡
- 模块：`apps/web/app/(studio)/help/page.tsx`

## 2026-09-06 · ac151fb · docs(web) · 帮助文档补 WeClone 分身接入

帮助页新增「接入 WeClone 数字分身（可选）」卡：WeClone（聊天记录 LoRA 微调数字分身，AGPL-3.0 独立进程）训练后用 `weclone-cli server` 起 OpenAI 兼容服务（默认 127.0.0.1:8005/v1，模型名 gpt-3.5-turbo、Key 任意），在设置 → 模型设置以自定义供应商接入，对话/扮演可直接切换选用。注明 AGPL 边界与 AI 生成提醒。

- **docs(web)** `help/page.tsx` 新增文档卡
- 模块：`apps/web/app/(studio)/help/page.tsx`

## 2026-09-06 · 4ba861a · feat(web) · Chat/Studio 分壳跳转 + Studio 侧栏重做（S1+S2）

跨页只留一对跳转（Chat 顶栏「Studio」、Studio 顶栏「Chat」）；上一步/下一步按壳分栈互不串。Studio 去掉 56px 活动栏：项目切换、制作、设置进顶栏，左侧只剩 EntityExplorer 树，/world 里那列左树删除，选中态提升为壳级共享。

- **feat(web)** `NavigationHistory` 按 surface 分栈（chat/studio），换壳不把对岸页面推进当前栈，回壳恢复各自栈
- **feat(web)** 顶栏加 `middle`/`right` 插槽：Studio = 项目切换（六边形下拉，切完落 /world）+ 制作/设置/Chat；Chat = 「Studio」（有项目进 world，无项目回 /projects）
- **feat(web)** `EntityExplorer` 提升到 `AppShell`；`StudioSelectionProvider` 壳级选中态（树点选不在 /world 时先跳 /world 再选中）；工作区自带左栏与左宽拖拽移除，深链 /assets、/stories 保留
- **feat(web)** Studio「Chat」点击时 `resolveThreadForProject`（排除扮演，无则建）进对应线程；无项目回 /creator-chats；Explorer 空态 = 打开文件夹 / 去选项目
- 模块：`top-bar.tsx`、`navigation-history.ts`、`creator-chat-nav.ts`、`app-shell.tsx`、`world/studio-selection.tsx`、`world/world-workspace.tsx`、`chat-panel.tsx`

## 2026-09-06 · e219945 · feat(web) · Chat 与 Studio 共用顶栏（logo 槽 + 收起 + 前进/后退）

参考 ZCode / Cursor 顶栏节奏：最顶上一条横跨侧栏与主区，28×28 圆角 logo 槽、侧栏收起、应用内上一步/下一步（会话级路径栈，与浏览器历史独立；Chat 线程、Studio 页、设置互跳都进栈）。侧栏里原「ZIVITH 字 + 收起」一行让位给顶栏，搜索留在侧栏。

- **feat(web)** `TopBar` 共用组件接 `app-shell`（Studio 收起按钮作用于活动栏）与 `chat-panel`（接现有 `useCollapsedSidebar('chat')`）
- **feat(web)** `NavigationHistory` 会话级路径栈：push 幂等、回退后新跳转截断前进栈、到头 disabled
- **chore(web)** `nav-icons` 增加左右箭头；聊天侧栏头部与收起态主区头部去掉 ZIVITH 字让位 logo 槽
- 模块：`components/top-bar.tsx`、`lib/navigation-history.ts`、`app-shell.tsx`、`chat-panel.tsx`、`chat-sidebar.tsx`、`nav-icons.tsx`

## 2026-09-06 · c491a4b · feat(web) · 帮助与反馈页（/help）

账号菜单「帮助与反馈」从占位链接改为独立页面：设置壳风格左栏两模块。帮助 = 与产品实际能力对应的使用文档与注意事项；反馈 = 故障信息一键复制 + 开发者联系方式（群号/账号集中在 `lib/help-feedback.ts`，由开发者填真实值，未填显示「待补充」不放假链接）。

- **feat(web)** 新增 `/help` 页（快速上手 / 对话与模型 / 记忆系统 / 扮演与桌面版 / 注意事项五个文档卡 + 反馈模块）
- **feat(web)** `buildBugReportTemplate` 生成含版本/时间/页面/环境的故障模板，`navigator.clipboard` 一键复制
- **fix(web)** 账号菜单「帮助与反馈」href 从 `/creator-chats` 改为 `/help`
- 模块：`app/(studio)/help/page.tsx`、`lib/help-feedback.ts`、`account-menu.tsx`

## 2026-09-05 · bf5e5d0 · fix(web) · 设置分区改走查询参数深链

「管理模型」用 `?section=models` 打开模型设置；左栏切换写入 URL。兼容旧的 `#models`。避免只改 hash 时客户端导航仍停在常规页。

- **fix(web)** `settings/page.tsx` 从 search/hash 恢复分区；`chat-composer` 深链改查询参数
- 模块：`settings/page.tsx`、`chat-composer.tsx`

## 2026-09-05 · e501867 · feat(web,api) · 系统设置重组：三组五页 + 模型选择器开关

设置页从「供应商+用量拼盘」改为真设置：左栏基础设置（常规/外观/模型设置）、Agent 能力（记忆）、数据统计（使用统计），只放有真实能力的页。

- **feat(api)** `PUT /providers/model-visibility`（进程内持久化）+ `GET /providers` 回传 `hidden_models`；删供应商/删模型时同步清理
- **feat(web)** 模型选择器搜索 + 每条开关；`llmChoices` 过滤隐藏模型，当前在用的保留直到另选；composer「管理模型/管理提供商」深链到模型分区
- **feat(web)** 常规（变更前确认锁定开启 + 默认努力程度）、外观（真实固定项说明）、记忆（能力说明 + 世界工作区入口）、使用统计（`UsageSummaryCard` 从本页挪入，年度热力图不做）
- 模块：`routes/providers.ts`、`settings/page.tsx`、`model-visibility.tsx`、`chat-composer.tsx`、`lib/chat-composer.ts`、`lib/types.ts`

## 2026-09-05 · da14981 · fix(api) · 清掉最后两处 typecheck 既有错误

api 侧 `tsc --noEmit` 归零；行为不变，纯类型收紧。

- **fix(api)** `updateCustomProvider` patch 类型放宽 `| undefined`（exactOptionalPropertyTypes 下 zod 解析产物如此；函数内逐字段守卫，无行为变化）
- **fix(test)** `lightReport` 的 tier 放宽为 `'light' | 'full'`，幂等用例可改写
- 模块：`apps/api/src/providers/custom-providers.ts`、`apps/api/test/novel-import-upgrade.test.ts`

## 2026-09-05 · c041df5 · feat(api,web) · 记忆冲突确认卡 + L2 核心块面板

冲突不再只报不记：矛盾落库成清单，对话流内联确认（保留新卡 / 保留已有卡），记忆面板可看 L2 核心块并溯源到原子。只写记忆层，不静默改世界实体。

- **feat(api)** 新增 `memory_conflicts` 表（迁移 `20260905120000`）；ingest 冲突落库，SSE `memory_ops` 带回冲突 id
- **feat(api)** `POST /memory/conflicts/:id/resolve`（keep_new = 新原子取代旧卡 / keep_existing = 维持旧卡）、`GET /memory/projects/:id/conflicts`、`GET /memory/projects/:id/cores/:coreId` 展开源原子
- **feat(web)** Creator Chat 内联冲突卡（内容对比 + 确认/丢弃，刷新后按线程补拉未裁决项）；记忆面板补 L2 列表、展开溯源、按实体过滤
- 模块：`schema.prisma`、`contexts/memory/*`、`routes/memory.ts`、`chat-panel.tsx`、`memory-panel.tsx`、`lib/memory-conflicts.ts`

## 2026-09-05 · 7f3f28a · feat(web,api) · Creator Chat 与扮演 UI 补齐

对话壳能拒绝提案、停止生成；扮演可从侧栏/实体树/资产页启动，并可在顶栏改时间锚点。降级模式可见。不写工作区文件，不插队 I3。

- **feat(api)** `POST .../proposals/:messageId/reject` 将提案标为 rejected
- **feat(web)** Composer 发送中改为停止；SSE 可 Abort
- **feat(web)** 侧栏角色 Tab 空态/加号打开扮演选择；Explorer 与资产页「与此角色对话」
- **feat(web)** 扮演顶栏改锚点（新线程复用三元组）；Mock/未配置密钥显示降级模式
- 模块：`proposal-card.tsx`、`chat-panel.tsx`、`chat-sidebar.tsx`、`roleplay-launch.tsx`、`entity-explorer.tsx`、`assets`、`world.ts`

## 2026-09-05 · 7f3f28a · feat(api) · W1 工作区标记

打开文件夹时写入 `.zivith/workspace.json`；搬家后靠 id 重绑 `workspacePath`。库仍是权威。

- **feat(api)** `openWorldFolder` 优先读标记 id，再回退路径匹配
- **feat(api)** 改项目显示名同步标记 `name`，不重命名磁盘目录
- 模块：`workspace.ts`、`resources.ts`、`workspace.test.ts`

## 2026-09-03 · 91530bd · feat(web) · Studio 轨道剪辑块

世界线用剪辑块表达呈现序与关系：左右拖改位置、拉两端改跨度、拖轨名换上下。轴仍是呈现顺序，不是秒/帧。

- **feat(web)** 事件/场景块可拖拽；松手写回 `presentation_order` / `scene.order`
- **feat(web)** 角色跨其参与事件、地点跨所属场景，用重叠体现联系；轨序记在 localStorage
- **fix(web)** 时间线只保留底栏一条横向导航（藏起原生横条）；HTML 热区可左右拉长短；右键拖动画布；横/纵缩放
- 模块：`apps/web/components/world`、`apps/web/lib/world-line.ts`

## 2026-09-03 · 91530bd · feat(desktop) · Windows 一键启动

双击启动本机创作面，启动屏使用 ZIVITH logo。Electron 负责拉起 Docker 与 Web/API，并打出带图标的 `Zivith.exe`。不是免 Docker 安装包。

- **feat(desktop)** 启动屏 + 自动 `docker compose` / `pnpm dev`；任务栏与 exe 使用三道杠图标
- **fix(desktop)** 启动窗圆角；logo/图标抠成透明底，避免 JPEG 灰黑方框；图标外沿圆角
- **fix(web)** 对话模型菜单限高可滚动，可搜索；长 id 只显示 `/` 后的短名
- **feat(desktop)** `pnpm desktop:pack` → `apps/desktop/dist/win-unpacked/Zivith.exe`；仓库根目录 `Zivith.vbs`
- **fix(desktop)** 启动探测改走 3100 端口是否在听，不再用会编译 8–10 秒的 `GET /`；避免误报超时并叠起第二套编译进程
- 模块：`apps/desktop`、`Zivith.vbs`、`package.json`

## 2026-09-02 · 91530bd · feat(web,api) · Chat 输入条接到对话链路

输入框被 `busy` 卡住无法打字。侧栏改成文件夹树；输入区补上标红的模型 / 用量 / 确认 / 努力程度控件，并接到真实对话。仍是浅色壳。确认围栏不变。

- **fix(web)** 创建对话后释放 busy；输入框发送中只只读，不再因打开文件夹禁用
- **feat(web)** 侧栏「项目」文件夹 + 缩进对话 + 相对时间；底栏本机账号
- **feat(web)** 输入工具条：变更前确认、上下文容量、LLM 选择、Fast/Balanced/Deep
- **feat(api)** 每轮提交 effort；按级别收窄上下文、召回与冲突扫描；`PUT /providers/selection` 立即作用于下一轮 World Builder / Roleplay
- **feat(api)** `GET /world/creator-chats/:id/context` 返回当前预算窗口；用量弹层读项目 `/usage`
- **feat(web)** 设置页改成 Cursor 式：左供应商、右密钥/模型列表；可添加 OpenAI 兼容自定义端点
- 模块：`model-settings.tsx`、`custom-providers.ts`、`chat-composer.tsx`、`chat-sidebar.tsx`、`chat-panel.tsx`、`account-menu.tsx`、`agent-effort.ts`、`world.ts`、`roleplay.ts`

## 2026-09-02 · 4be67b9 · feat(desktop,api,web) · Electron 工作区路径

本地创作面改为 Electron 窗口，用系统对话框拿到绝对路径。`Project.workspacePath` 标识世界；Chat 侧栏恢复「选择文件夹 / 项目内新聊天 / 改名 / 删聊天」。不把实体写成磁盘文件（阶段 F）。

- **feat(desktop)** `apps/desktop`；根脚本 `pnpm desktop`
- **feat(api)** `workspace_path` 列；`POST /world/folders/open { path }`
- **feat(web)** 侧栏按工作区分组；无桌面壳时提示用 `pnpm desktop`
- **docs** ADR-0016；UI-IA；Next-Tasks Track D 完成、Track W（工作区文件）后做
- 模块：`apps/desktop`、`workspace.ts`、`world.ts`、`chat-sidebar.tsx`、`chat-panel.tsx`

## 2026-09-02 · 4be67b9 · feat(web) · Chat 只聊天，项目文件夹在 Studio

一个项目文件夹装着 IP Core、实体和聊天。Chat 页面只保留对话列表与消息流；选文件夹、改项目名、看实体都在 Studio。打开工作区默认选中 IP Core，Inspector 可改世界观与实体属性。

- **feat(web)** Chat 侧栏收成当前项目对话列表；无项目时引导去 `/projects`
- **feat(web)** Studio Explorer 增加 IP Core 节点；工作区默认选中项目；`/projects` 打开本地文件夹进 `/world`
- **docs** UI-IA v1.3：Chat 只聊天，Studio 管项目文件夹
- 模块：`chat-panel.tsx`、`chat-sidebar.tsx`、`entity-explorer.tsx`、`world-workspace.tsx`、`inspector-panel.tsx`、`projects/page.tsx`

## 2026-09-02 · 4be67b9 · feat(api,web) · 选择文件夹作为世界项目

对话侧栏不再新建空文件夹。顶栏「+」选择本地目录或已有项目作为世界；项目里可新建聊天、重命名项目/聊天、删除聊天。

- **feat(api)** `POST /world/folders/open` 按文件夹名打开或绑定项目；`PATCH /world/creator-chats/:id` 改聊天标题
- **feat(web)** 选择文件夹面板；双击/右键重命名；右键删除对话
- **docs** UI-IA：选择文件夹，不从 Chat 新建空项目
- 模块：`workspace.ts`、`world.ts`、`chat-sidebar.tsx`、`chat-panel.tsx`

## 2026-09-01 · 4be67b9 · feat(api,web) · Chat 侧栏按 Cursor 项目树操作

对话历史改成项目文件夹：顶栏「+」新建项目，项目行聊天气泡「+」在该项目新建聊天，右键删除项目或对话。去掉顶栏大按钮和行内垃圾桶。

- **feat(api)** `DELETE /world/creator-chats/:id` 归档单条对话
- **feat(web)** 侧栏「项目」分组、空项目仍显示、右键菜单
- **docs** UI-IA：侧栏加号语义与右键删除
- 模块：`workspace.ts`、`world.ts`、`chat-sidebar.tsx`、`chat-panel.tsx`、`chat-history.ts`

## 2026-09-01 · 4be67b9 · feat(api,web) · 对话侧栏可删除世界项目

Chat 历史栏项目分组原先只能「+ 新开对话」，无法删掉整个世界文件夹。删除走既有 `DELETE /projects/:id` 软删，并归档该项目下全部对话，避免幽灵会话。

- **feat(api)** `archiveWorldWorkspace`：软删项目 + 线程 `state=archived`；列表/打开已删对话不再返回
- **feat(web)** 侧栏分组旁垃圾桶；删当前世界后回到 `/creator-chats`
- **docs** UI-IA：侧栏可删除整个世界工作区
- 模块：`workspace.ts`、`resources.ts`、`world.ts`、`chat-sidebar.tsx`、`chat-panel.tsx`

## 2026-09-01 · 4be67b9 · feat(api,web) · 世界聊天即建项目文件夹

开世界聊天立刻创建一个空 `Project`（IP Core 工作区），像 Cursor 打开代码文件夹。确认「创建世界」只给这个文件夹改名，不另建项目。同一项目可多条对话；Studio Explorer 改成文件树（对话 / 角色 / 地点 / 事件 / 故事）。

- **feat(api)** `POST /creator-chats` 无 `project_id` 时创建 seed 工作区 + 线程；`create_project` 认领 seed
- **feat(web)** 侧栏按项目分组；「在此世界新开对话」/「新世界」；活动栏「对话」打开当前项目聊天
- **feat(web)** 世界工作区 Explorer 为可折叠文件树，对话条目跳回 Chat
- **docs** UI-IA：一个世界 = 一个项目 = 一个 IP Core
- 模块：`workspace.ts`、`world.ts`、`proposal-applier.ts`、`chat-sidebar.tsx`、`entity-explorer.tsx`、`app-shell.tsx`

## 2026-09-01 · 4be67b9 · feat(web) · Studio 收成图标活动栏（IDE 壳）

Studio 非 Chat 路由不再展开 248px 文字菜单。活动栏只留图标：对话 / 项目 / 世界 / 实体 / 故事 / 制作，设置在底部齿轮。切项目落到 `/world`，与 Chat「Studio」一致。项目主页、production、settings 去掉 `ProjectSubNav`。世界工作区顶栏「制作」改称「创作线」，避免和活动栏「制作」（`/production`）撞名。

- **feat(web)** `AppShell` 始终 ~56px 活动栏；顶部紧凑项目切换进 `/world`
- **feat(web)** `/projects` 卡片打开 `/world`；活动栏「故事」仍进项目根故事列表
- **feat(web)** 删除 `project-sub-nav.tsx`；工作区顶栏与 Inspector 文案改为「创作线」
- **docs** UI-IA v1.2：Studio = IDE 壳，主画布 `/world`，Chat 仍是独立壳；Next-Tasks K6
- 模块：`app-shell.tsx`、`projects/page.tsx`、`projects/[projectId]/{page,production,settings}`、`world-workspace.tsx`、`inspector-panel.tsx`、`docs/product/UI-Information-Architecture.md`

## 2026-09-01 · docs · 验收《龙族Ⅴ》导入：撤销重导通过

对「龙族V」项目撤销旧导入后重导《龙族Ⅴ·悼亡者归来》（236 章 / 约 44 秒）。名单与时间轴达到验收标准，不改抽取代码。

- **验收** 章失败后续跑：第 2 章强制失败时不写世界层；retry 后续抽并写入；撤销后 Asset/事件/导入记录均为 0
- **验收** 旧世界撤销干净（stage 回到 bootstrap）；重导 40 角色 / 8 地点 / 60 事件 / 30 关系
- **验收** 舰长 / 神官 / 尔特先生不在名单与 skipped；图灵先生收成图灵；芬格尔仍在全量卡
- **验收** 60 条事件按 `chapter_index` 升序，`presentation_order` 0–59；第 4/11 章回叙提及仍靠前（预期）
- **docs** Track M2 记长篇验收；下一刀改为无默认编码任务，不插队 I3
- 验证：`vitest` novel-import 25 项；本机 API 撤销 + 重导；世界工作区路由 200
- 已知限制未当作失败：轻量卡仍有「整个 / 姐姐 / 站起身」等规则噪声；「路明非 · 毕业」标题重复
- 模块：`Next-Tasks.md`、`docs/README.md`

## 2026-08-31 · 4d477e4 · fix(api) · 导入人名去掉舰长/神官/先生残片

规则抽取把头衔和「某某先生」切出来的碎片当成角色。本轮把头衔列入停用词，剥先生/小姐等称呼，并丢掉尔特这类音译尾巴。

- **fix(api)** 停用词增加舰长/神官/先生等；`TITLE_SUFFIX` 剥离后再验名；尔特/格尔不进卡
- **test** 舰长/神官/尔特先生不进名单，芬格尔仍保留
- **docs** Track M2、抽取规则、README 下一刀改为验收长篇导入质量
- 验证：`vitest` `novel-import` 17 项
- 模块：`novel-extract.ts`、`novel-import.test.ts`

## 2026-08-31 · 23182b2 · fix(api,web) · 世界层写入失败时报告保留已落库 ID

章抽完后写 Asset 中途失败会把报告抹成 `{ error }`，撤销对不上，重试还会再写一张卡。本轮失败时保留部分清单，retry 按名字复用，撤销按 `importId` 扫孤儿。

- **fix(api)** `WORLD_WRITE_FAILED` 不覆盖已写入 ID；process 幂等续写；undo 扫描 `Asset.data.importId`
- **feat(web)** 失败且已有部分角色时显示「写入未完成」并仍可重试/撤销
- **test** `novel-import-world-write`：失败保留林澈、重试不重复创建、无报告 ID 也能撤孤儿
- **docs** Track M2、错误处理 §9、API 地图；下一刀改为收紧抽取噪声
- 验证：`vitest` world-write 3 项 + retry 5 项
- 模块：`service.ts`、`novel-import-panel.tsx`

## 2026-08-31 · e8f311d · feat(api,web) · 导入按章失败后可从断点重试

整本一锅煮时一章出错就整单失败，无法续跑。本轮按章记状态，原文留在 config.sourceText（接口不回传），全部章成功前不写世界层。

- **feat(api)** `POST /novel-imports/:id/retry`；章行 pending→processing→done/failed；同章最多 3 次；无原文则 409
- **feat(web)** 失败时显示失败章并提供「重试失败章节」
- **test** `novel-import-retry`：失败不写世界层、从失败章续抽、无原文拒绝、已完成直接返回、三次耗尽
- **docs** Track M2、API 地图、设计 §5.2/§8/§9；下一刀改为验收长篇失败后续跑，不插队 I3
- 验证：`vitest` `novel-import-retry` 5 项；导入面板未在浏览器里点过失败重试
- 模块：`service.ts`、`novel-imports.ts`、`novel-import-panel.tsx`

## 2026-08-31 · fa2bdfe · feat(api,web) · 导入轻量条目可升级为全量角色卡

次要角色只有 draft 轻量条目、没有 persona，扮演与世界构建都偏弱。本轮按设计 §5.6 提供升级：写 persona、Asset 置为 active，可超过 15 张全量上限。

- **feat(api)** `POST /novel-imports/:id/upgrade`；幂等；只能升级该次导入的角色
- **feat(web)** 导入面板列出轻量条目并升级；Inspector「升级为角色卡」；Explorer 标注轻量
- **test** `novel-import-upgrade`：升级写卡、已是全量则跳过、非导入角色拒绝
- **docs** Track M2、API 地图、导入报告 §5.6；下一刀改为按章 retry
- 验证：单元测试；本机对「龙族y」轻量卡升级返回 `tier=full`
- 模块：`service.ts`、`novel-imports.ts`、`novel-import-panel.tsx`、`inspector-panel.tsx`

## 2026-08-31 · 8002008 · fix(api) · 导入人名去掉虚词残片

重导后轻量卡仍是「没人 / 你这 / 明非忽然」。根因是「知道/发现」当成人名引导，以及 4 次提及的碎片占满 25 个轻量槽。

- **fix(api)** 人名正则改为非贪婪；从引导词去掉知道/发现；剥轻声/忽然等语气尾巴；虚词拼词与「我/你」开头不进卡
- **fix(api)** 轻量卡提及 ≥5 次
- **test** 覆盖没人/你这/明非忽然/明非轻声/我跟你
- **docs** Track M2、导入规模控制、README 下一刀改为按章 retry / 轻量升级
- 验证：`vitest` `novel-import` 16 项；本机抽查《龙族Ⅴ》轻量名单含路鸣泽，不再含没人
- 模块：`novel-extract.ts`、`service.ts`、`novel-import.test.ts`

## 2026-08-31 · e2d4ffb · fix(api) · 锚点之后的剧情问句不再交给模型

验收时真人模型会用预训练知识确认尚未发生的事（例如锚在开篇却承认已到冰湖）。问句若与锚点之后事件的标题/摘要重叠，此轮跳过生成，角色只表示不知情。

- **fix(api)** `mentionsLaterPlot`：标题/摘要 4 字重叠 ≥2 则锁定
- **fix(api)** 锁定后不调用 LLM；空亲历不再暗示「自然编造」
- **test** `roleplay-agent.test.ts` 覆盖问句命中与提示词硬约束
- **docs** Track M3、扮演认知边界、API 地图、Agent 硬约束
- 验证：单元测试；本机扮演问冰湖/父亲不知情，闲聊仍走模型
- 模块：`roleplay-agent.ts`、`Memory-Novel-Roleplay-Design.md`、`Technical-Architecture.md`

## 2026-08-31 · b6e892a · fix(api) · 收紧小说导入人名、地点与事件标题

规则抽取把虚词和粘连地名当成实体，时间轴标题是原句截断。本轮停用词、剥粘连、地点 ≥3 次才入库，事件标题改为「谁 · 做了什么」。

- **fix(api)** 切章保留开篇，允许「第 2 章」与【】标题
- **fix(api)** 禁止「路明非心」类碎片别名；地点规范化后合并
- **fix(api)** 每章最多 2 条强情节事件；`formatEventTitle`
- **test** `novel-import.test.ts` 15 个用例
- **docs** Track M2、导入规模控制、Implementation-Plan Track M
- 验证：单元测试；《龙族Ⅴ》重导 40 角色 / 8 地点 / 60 事件
- 模块：`chapter-splitter.ts`、`novel-extract.ts`、`service.ts`

## 2026-08-31 · 89bb7d7 · feat(api,web,db) · 扮演用户可选读者或角色卡

与 AI 对话时用户默认是读者；也可选已有角色卡，或新建一张当自己。身份存在 `RoleplayThread.userCharacterAssetId`，与「对面是谁」分开。对话顶栏与 Inspector 都能切换。

- **feat(db)** `roleplay_threads.user_character_asset_id`（null = 读者）
- **feat(api)** 开线程时校验用户卡 ≠ AI 角色；复用匹配用户身份 + 锚点；提示词带用户发言人
- **feat(web)** Inspector 与对话顶栏「你是」下拉（读者 / 已有卡 / 新建我自己…）
- **docs** Track M3、扮演 Agent 输入、API 地图、README 下一刀改为验收时间锚定扮演
- 验证：`vitest` `character-card` / `creator-chat-nav`
- 模块：`character-card.ts`、`roleplay.ts`、`roleplay-agent.ts`、`chat-panel.tsx`、`inspector-panel.tsx`、`schema.prisma`

## 2026-08-30 · d8c414a · feat(api,web) · Studio 角色卡回灌扮演与世界构建对话

Studio 改角色名称/简介/个性后，扮演仍只读导入档案（MemoryCore persona），世界构建对话也不带个性。本轮让两路对话读同一张 Asset 角色卡；导入档案只作补充，不覆盖。

- **feat(api)** `character-card`：格式化卡面、卡在前档案在后；扮演 `buildCharacterState` 与 `worldContextToPrompt` 共用
- **feat(api)** 有个性则不再因简介过短追问 `character_depth`
- **feat(web)** Inspector 标明名称/简介/个性是共用角色卡
- **docs** Track M3、Asset-Model、扮演 Agent 输入改为 Asset 卡 + MemoryCore 补充
- 验证：`vitest` `character-card` / `guidance` / `world-builder-stream` / `conflict-detector`
- 模块：`apps/api/src/contexts/world/character-card.ts`、`roleplay-agent`、`world-context`、`guidance`、`inspector-panel.tsx`

## 2026-08-30 · aae14c4 · docs · 同步 M1–M3 与 PR #1 进总览 / 工程文档

创造层后续能力已合进 `main`，规划文档已写 Tab/分栏，但 README 状态表、Technical-Architecture 路由、Next-Tasks 轨道图仍停在 08-16。本轮只改文档。

- **docs** README 状态表 + Last Progress Sync 2026-08-30；Technical-Architecture 补 `/memory` `/novel-imports` `/roleplay` 与存储；Next-Tasks Track M + J4 排除扮演；Implementation-Plan 进度行
- **docs** ADR-0015 小说导入即批量记忆摄取；AI-Agent-Collaboration 扮演 Agent（非第五流水线角色、不反写世界层）；Code-Agent-Design-Guide：Prisma 从 `@zivith/database` 进口
- **docs** Development-Log：补 `eb83324` 合并记录；08-16/08-23 及部分 08-05 条目补 commit hash
- 模块：`docs/**`

## 2026-08-30 · eb83324 · docs · 合并 PR #1（zcode → main）

GitHub Actions CI #11 全绿后合并。含对话历史分 Tab、世界线可调分栏、Prettier、Prisma 进口修复。

## 2026-08-30 · d3b3e8d · fix(api) · CI lint：Prisma 从 @zivith/database 进口

PR CI 在 `pnpm lint` 失败：`novel-import/service.ts` 上 `this.db.novelImport` 被当成 `any`（`no-unsafe-*`）。`@zivith/api` 不直接依赖 `@prisma/client`，GitHub 隔离安装下该进口解析不到生成类型；本地 hoisted 所以能过。

- **fix(api)** `NovelImportService` / `roleplay` 路由与 Agent 改为 `import type { PrismaClient } from '@zivith/database'`
- 验证：`pnpm lint`
- 模块：`apps/api/src/contexts/novel-import`、`apps/api/src/contexts/roleplay`、`apps/api/src/routes/roleplay.ts`

## 2026-08-30 · ceb17cd · chore · Prettier 对齐，修复 CI format:check

GitHub Actions「检查格式」在 `pnpm format:check` 上失败：记忆 / 小说导入 / 扮演 / 世界工作区等 35 个文件未按 Prettier 排版（多为超长行折行与尾逗号）。

- **chore** `pnpm format` 写回 34 个源文件；本地 `format:check` 已全绿
- 验证：`pnpm format:check` → All matched files use Prettier code style
- 模块：`apps/api`、`apps/web`、`packages/domain/src/memory.ts`

## 2026-08-30 · aec52d4 · feat(web,api) · 对话历史分 Tab + 世界线可调分栏

世界构建与角色扮演仍共用 `/creator-chats` 与消息表，侧栏按类型分开；世界工作区时间线不再被下方面板挤扁，轴上事件标题按间距抽稀。

- **feat(api)** `GET /world/creator-chats` 列表/详情 join `RoleplayThread`，DTO 标 `kind` + `character_name`
- **feat(web)** 历史栏世界/角色 Tab；扮演按所属世界分组；Studio「在对话中继续」排除扮演线程
- **feat(web)** 世界工作区左右栏与时间线/下坞可拖拽改尺寸（localStorage）；副驾驶/记忆/导入可折叠；轴标签与导轨抽稀
- **fix(api)** 小说导入人名停用词；txt 解码 UTF-8 优先、非法时回退 GB18030
- 验证：web `chat-history` / `world-scale`；api `novel-import` / `memory-service`；`@zivith/ui` typecheck；世界页 DOM 含分栏拖动手柄
- 模块：`apps/api/src/{routes,contexts/novel-import}`、`apps/web/{components/creator-chat,components/world,lib}`、`docs/**`

## 2026-08-23 · 44a8d58 · feat(api,web,domain,db) · M1 记忆地基 + 上下文管理器落地

分层记忆（L0 原文 / L1 原子 / L2 核心）+ 双路径管线（同步规则归档 + 队列异步深加工）+ 三路混合检索（实体链接 / 向量 / bigram 关键词 RRF 融合）+ ThreadContextState 滚动摘要压缩（[Memory-Novel-Roleplay-Design.md](Memory-Novel-Roleplay-Design.md)，ADR-0014）。mock-first：无任何密钥时规则提炼 + bigram 检索全链路可用。

- **feat(domain)** MemoryIngestOps / RetrievedMemory 契约；归一化指纹；规则事实分类与实体链接
- **feat(db)** MemoryAtom / MemoryCore / MemoryPipelineState / ThreadContextState 四张表 + 迁移
- **feat(api)** MemoryService（ingest / processRefine / retrieve / getContextWindow）；本地 better-sqlite3 向量库（每项目一个文件，可重建）；Creator Chat SSE 新增 `memory` 事件；`/api/v1/memory/*` 免登录 API；记忆队列运行时（BullMQ / InMemory 双实现）
- **feat(web)** 对话流记忆反馈行（「记忆：归档 N · 重复 N…」）；世界工作区右栏记忆面板（L1 原子列表 / 删除 / 重建向量）
- 验证：api `vitest` 34 文件 164 用例全绿；api/web `tsc --noEmit`
- 模块：`packages/domain`、`packages/database`、`apps/api/src/{contexts/memory,adapters/memory,routes}`、`apps/web/{lib/api.ts,components/{creator-chat,world}}`、`docs/**`

## 2026-08-16 · 352a363 · feat(api,web) · H7 Style derived track

Style 轨从 Shot lighting/color/style/mood 投影，插入机位与提示词之间，仍不落库。

- 验证：web `world-line`；web/api `tsc --noEmit`
- 模块：`apps/api/src/routes/world.ts`、`apps/web/{lib,components/world}`、`docs/**`

## 2026-08-16 · 352a363 · feat(api,web) · H7 derived Camera/Prompt/Model tracks

制作视图增加只读派生轨：机位从 Shot.camera/composition 投影，提示词优先已批准 PromptVersion，模型来自 Output provenance。不写入 TimelineItem。

- **feat(api)** `GET /world/projects/:id/resources` 镜头附带 camera/composition/prompt/approved_prompt/output
- **feat(web)** `buildProductionLineModel` 投影 camera/prompt/model 轨；关联高亮；Inspector 只读并链到镜头真源
- 验证：web `world-line` 15；web/api `tsc --noEmit`
- 模块：`apps/api/src/routes/world.ts`、`apps/web/{lib,components/world}`、`docs/**`

## 2026-08-16 · 352a363 · feat(domain,api,web) · H6 variable WorldTime binding

可变世界时间绑定落地：Project 自定义 `TemporalDimension`，核心只校验 `WorldTimeBinding` 信封（follow / point / range / relative / crossing / unknown），不解释历法值。空信封仍跟随呈现主轴。

- **feat(domain)** TemporalDimension + WorldTimeBinding schema；follow 不重复存储；mode 别名 canonicalization
- **feat(db)** `project_timelines.temporal_dimensions`、`timeline_items.world_time_bindings`
- **feat(api)** PATCH timeline 维度；timeline items 绑定校验；`world_relation` / `dimension_id` 过滤；WorldEvent 信封升级
- **feat(web)** Inspector 编辑维度与事件绑定；世界线紫色 overlay 标记区间/相对/平行
- 验证：domain `world` 35；web `world-line` 11；api/web/domain `tsc --noEmit`
- 模块：`packages/domain`、`packages/database`、`apps/api/src/routes/world.ts`、`apps/web/{lib,components/world}`、`docs/**`

## 2026-08-16 · docs · sync docs with creator-layer v1 closure

创造层 v1 已闭环（2026-08-16 合并进 `main`），但多份文档仍停留在 2026-07 状态：Technical-Architecture 的「拟议」标记、Core-Domain-Model 的「planned」标记、docs/README 状态表、Next-Tasks 当前基线与工作顺序图。本轮按 Development-Log 约定做一次全量文档同步，不改变代码。

- **docs** Technical-Architecture v1.2：Entity State & Timeline 上下文转已实现（H1–H3 + 世界线 v1 + H9 v1）；API 契约替换为 `world.ts` 实际路由（resources / world-events / relationships / timeline / creator-chats）；ER 图去除 proposed 并补世界层表；安全表更新为 ADR-0013 本地单用户模式；AI Creative IDE 标注 v1 已落地
- **docs** Core-Domain-Model v1.2：WorldEvent / Relationship 入契约（ADR-0011 / 0012）；世界层图示与术语表更新；Timeline 补世界线 v1；§10 实现状态更新
- **docs** entity-state-timeline-track：头注状态、扩展实体表（Event 已落库 / Relationship 已晋级）、迁移目标表、V1–V3 分阶段状态
- **docs** entity-history-write-paths：同步日期；H3 范围外改为「H3 之后已落地 / 仍属后续」
- **docs** UI-Information-Architecture：Status 收口 Accepted v1；Track K 分期表 K1–K3 已完成
- **docs** docs/README：状态表（Track H/I/J/K 收口）+ Next Tasks / write-paths 条目
- **docs** Next-Tasks：Synced 2026-08-16；Priority policy 与当前基线重写；工作顺序图 ✓ 收口
- **docs** Implementation-Plan：Status 补 2026-08-16；阶段图 Track H/I/J/K 状态；V2 复选框
- 验证：`pnpm format:check`
- 模块：`docs/**`

## 2026-08-16 · test(api) · align scoped-recompute mock with ensureProjectMember

CI 测试挂在 `scoped-recompute.test.ts`：`ensureProjectMember` 已改为 `project.findFirst` + `projectMember.upsert`，测例仍 mock 旧的 `findUnique`，于是先抛 `undefined` 而不是 `SHOT_APPROVED`。

- **test(api)** 补齐 project / upsert mock
- 验证：`vitest run test/scoped-recompute.test.ts` 5/5

## 2026-08-16 · `7c92921` · chore · turn off no-unsafe-call on tests for CI

GitHub CI lint 在测试文件上报 247 条 `@typescript-eslint/no-unsafe-call`：隔离安装下 `expect`/`describe` 没有类型，typed lint 视为无法解析的调用。本地因 hoisted vitest 而过。

- **chore** 测试文件关闭 `no-unsafe-call` / `no-unsafe-return`
- 验证：`pnpm lint`

## 2026-08-14 · `84dd441` · fix(web) · declare vitest for web tests in CI

GitHub CI 在 `chat-history.test.ts` 报 10 个错误：web 包未声明 vitest，隔离安装后测例全局的 `describe`/`it`/`expect` 无法解析。

- **fix(web)** `vitest` 写入 `@zivith/web` devDependencies；`vitest-globals.d.ts`
- **chore** eslint 测试文件加上 vitest globals
- 验证：`pnpm format:check`；`pnpm lint`

## 2026-08-14 · `65cea1f` · chore · make format and lint pass on GitHub CI

CI 在 `format:check` 失败：78 个文件未过 Prettier，随后 ESLint 还有脚本/测试/若干源码规则错误。已格式化并修掉会挡门禁的 lint。

- **chore** Prettier 写回；eslint 忽略 scripts/vitest 配置，测试文件放宽 unsafe 规则
- **fix** chat-history 类型收窄、Inspector 异步保存、视频 adapter 的 cause 文案
- 验证：`pnpm format:check`；`pnpm lint`；api/web/domain `tsc --noEmit`

## 2026-08-14 · `3dac37e` · feat(web,api) · hand off studio focus and make conflicts editable

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

## 2026-08-05 · 9e9b248 · feat(api/web) · Studio Inspector 项目属性内联编辑（K5 衍生）

右栏 Inspector 支持项目级内联编辑：名称/描述/题材/核心设定/世界规则/补充 六项可改可存，保存后刷新持久化。进入工作区 → 左栏选中「项目」节点 → Inspector 顶部右上「编辑」→ 修改 → 保存（成功后自动刷新资源并回显）。编辑按钮置于「世界线属性」区块标题右上角，符合「动作按钮右上角快速可达」的交互偏好。

- API `PATCH /projects/:id` 扩展支持 `worldview` 字段：`projectBody` 新增 `worldview: z.record(z.unknown()).optional()`（导出 schema 便于契约单测）；**编辑器整组替换语义**——保存时以 `parseWorldview(body.worldview)` 规范化并整体落库，允许清空单个字段（与 agent 侧 `mergeWorldview` 部分合并语义区分，见 proposal-applier）；`POST /projects` 同步支持带 worldview 创建
- Web `inspector-panel.tsx`：project 分支加内联编辑表单（六输入框 + 保存/取消 + 错误提示 + 保存中态）；草稿随 `resources` 刷新重置、切换选择自动退出编辑态；保存调 `PATCH /projects/:id`，成功回调 `onProjectUpdated` 触发父级 `load()` 刷新；世界工作区 header 徽标由「v1 只读」改为「v1」
- 验证：typecheck api/web ✓ 0 error（顺带修复 Next 16 dev 生成的 `.next/dev/types/*.ts` 截断问题——重启 dev server 并清除 `.next` 缓存后重新生成）；lint ✓ 0 error；单测 `resource-contracts.test.ts` 新增「project worldview patch contract」2 例（Inspector 载荷规范化 + 清空字段整组替换语义）8/8 ✓；API 级闭环冒烟 ✓（建临时项目 → PATCH worldview 六字段 → GET 持久化 → 清空语义 genre="" rules=[] → 删除）；浏览器端到端（127.0.0.1:3100）全 PASS：登录 → /projects 见「凡人修仙传」→ 世界工作区三栏 → 选项目节点 → 编辑 → 追加描述与规则 → 保存 → 刷新后持久化确认
- 说明：上一轮清理已移除 chat 测试建的「凡人修仙传」；库内仅存两个早期孤立「凡人修仙传」（`b62f238b`/`239cb924`，owner=local 且无 ProjectMember，不在 /projects 列表、PATCH 403）。本轮验证另建 demo-owned 的「凡人修仙传」`4c50e7cc`（已带成员、可编辑），是否保留待用户确认
- 模块：`apps/api/src/routes/resources.ts`、`apps/api/test/resource-contracts.test.ts`、`apps/web/components/world/{inspector-panel,world-workspace}.tsx`

## 2026-08-05 · 6e74287 · feat(api/web/domain) · 世界观 Chat→Studio 核心闭环（K5）

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

## 2026-08-05 · 6e74287 · feat(web) · K3 Creator Chat 设为应用默认页 `/`

Track K3 落地：根路由 `apps/web/app/page.tsx` 重定向由 `/projects` 改为 `/creator-chats`，打开应用即进入持续对话创作面（Track J 门禁已满足）。

- 模块：`apps/web/app/page.tsx`
- 验证：web typecheck ✓ / eslint ✓ / 浏览器回归（127.0.0.1:3100）：`/` 正确重定向 `/creator-chats`，侧栏「创作聊天」激活，对话列表与新建入口可用，`/projects` 回归正常，无 500

## 2026-08-05 · 6e74287 · feat(web) · K1 项目首页拆分为 World Overview + /production + /settings

Track K1 落地（世界优先 UI 第一步，只搬不移逻辑）：项目页移除 `ProviderPanel`/`UsageSummaryCard`/`WorkflowPanel`/`GenerationQueuePanel`，改为 World Overview（顶部项目名 + 「本地创作」徽标 + 「去创作对话」入口 + 分区导航：世界工作区/故事/实体库/制作/设置）；新增 `apps/web/app/(studio)/projects/[projectId]/production/page.tsx`（WorkflowPanel + GenerationQueuePanel）与 `settings/page.tsx`（ProviderPanel + UsageSummaryCard）；新增 `apps/web/components/project-sub-nav.tsx` 分区导航组件；侧栏新增「制作」「设置」入口并修正激活态逻辑。

- 模块：`apps/web/app/(studio)/projects/[projectId]/{page,production/page,settings/page}.tsx`、`apps/web/components/{project-sub-nav,app-shell}.tsx`
- 验证：web typecheck ✓ / eslint 5 文件 0 错误 ✓ / 浏览器回归（browser_use 对 3100 dev server）5 页全过：projects 列表、World Overview、/production、/settings、/world 均正常渲染，无 500 / 无应用级红色报错
- 已知遗留（非本任务）：API 大多数路由仍强制 JWT（仅 `/world` 免认证），ADR-0013「打开即用」后端未闭环；浏览器验证时以 seed 账号 `demo@zivith.local` 登录，并新建了「UI 回归验证项目」（ID `38701dd8-46cc-465d-a725-afebb93cb7b7`）作为验证载体，可删除

## 2026-08-05 · 6e74287 · test(api/domain/web) · 测试基线修复 + lint 清理 + 阶段 G 零 DB 单测补齐

复盘全量测试基线：API 95 单测、Domain 23 单测、提案流 E2E 48 项全部通过。修复 `history-baseline.test.ts` 2 项回归（mock db 缺 `worldEvent` 模型 → 补 `findMany` mock）。lint 清理 535 → 45：删除 `apps/web/scripts/syntax-check/` webpack 残留（~500 项噪音），新代码 lint 清零（剩余为既有文件基线债务，非本任务范围）。阶段 G 新增零 DB 单测：`packages/domain/test/world.test.ts`（25 项：worldEvent/relationship/timeline schema parse、世界时间信封 opaque、快照序列化、HISTORY_ENTITY_TYPES 扩展）+ `apps/web/lib/world-scale.test.ts`（11 项：createOrderScale/interpolateOrders/integerTicks 刻度算法），`apps/web/package.json` 接入 `test` 脚本（`vitest run`，依赖 workspace hoisted vitest v2.1.9）。补齐 B3 缺口：`HISTORY_ENTITY_TYPES` 增加 `'relationship'`，新增 `serializeRelationshipSnapshot` 并并入 `serializeHistorySnapshot` 分发。

- 模块：`apps/api/test/history-baseline.test.ts`、`packages/domain/src/history/{types,snapshots}.ts`、`packages/domain/test/world.test.ts`（新增）、`apps/web/lib/world-scale.test.ts`（新增）、`apps/web/package.json`
- 验证：api / web / domain typecheck 全绿；api 95 单测 ✓、domain 48 单测 ✓（+25）、web 11 单测 ✓；新文件 eslint 0 错误
- 环境备注：本机 Node v24 触发 `engine-strict`，pnpm 命令需带 `--config.engine-strict=false`；`pnpm install` 会因「包管理器不一致」移动 node_modules 到 `.ignored` 并崩溃，勿在本机运行（已发生过一次，已手动恢复）

## 2026-08-05 · 6e74287 · fix(infra) · dev server 进程风暴修复 + 免登录可用落地

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
