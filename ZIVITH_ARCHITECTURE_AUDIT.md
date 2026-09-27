# ZIVITH_ARCHITECTURE_AUDIT.md

> Zivith 架构与工程健康度审查 · 2026-09-16
>
> 范围：`apps/api`、`apps/web`、`apps/desktop`、`packages/domain`、`packages/database`、`experiments/cosmos`、`docs/`。
> 方法：全量阅读核心链路（Prisma schema、`app.ts`、`routes/world.ts`、World Builder Agent、proposal-applier、providers、auth、前端 API 层 / Studio 状态 / Inspector 写入路径），三条并行深审（前端、后端安全与错误链路、记忆 / 扮演 / 时间线 / 领域包），并实跑 `typecheck` 与全部单测。
> 本文只审查，不改代码。所有结论附文件与行号；行号为审查时的近似值。
>
> 验收口径遵循 [产品宪法](docs/product/Product-Constitution.md)（Journey A–F），领域表示遵循 [架构宪章](docs/architecture/architecture-principles.md)。

---

## 1. Executive Summary

### 1.1 Zivith 现在是什么

代码库里同时住着**两个产品**：

|          | 影视生产流水线（2026-07）                                                                                 | AI 可理解的 IP 世界（2026-08 起，现产品定位）                                      |
| -------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 顶层对象 | Project → Story → Scene → Shot → Output                                                                   | Project（= 世界）→ Character / Location / WorldEvent / Relationship / Memory       |
| 入口     | `/projects/:id`（故事）、`/production`、`/stories/.../shots`                                              | `/creator-chats`、`/projects/:id/world`                                            |
| 后端     | `routes/resources.ts` 1344 行 + 9 个流水线路由 + `mock-runner.ts` 1733 行（约 7.7k 行 contexts/adapters） | `routes/world.ts` 1655 行 + memory / roleplay / novel-import / voice（约 9.7k 行） |
| 身份     | JWT + argon2 + refresh token + ProjectMember                                                              | 无门禁「本机单用户」（ADR-0013）                                                   |
| 状态     | 未删除、未标废弃、菜单仍可达                                                                              | 主 Journey                                                                         |

`package.json` 的 description 仍是 `"AI-native film production studio"`。这不是 bug，但它准确描述了现状：**转向已经发生在文档与新代码里，尚未发生在代码库的边界上。**

### 1.2 整体状态

- 工程基线健康：`pnpm typecheck` 全绿，520 个单测（domain 65 / web 164 / api 291）全部通过，约 16 秒。现有代码**不是坏的**。
- 世界层的核心链路**存在且方向正确**：AI 只读世界 → 输出结构化提案 → 用户确认 → 事务内应用 → 落库为 `draft`。这条围栏（ADR-0010）在服务端是真的。
- 问题是**结构性的**，不是正确性的：两个产品并存、两套写入路径、两套身份、两套时间线表示、前后端两套类型；以及若干让「不像成熟产品」的具体缺口。

### 1.3 最大的 5 个问题

1. **API Key / 模型选择只存在进程内存里**。`PUT /providers/credentials`、`/providers/custom`、`/providers/selection` 全部写入模块级变量（`apps/api/src/providers/custom-providers.ts` L16–23；`routes/providers.ts` L83–86），重启即丢。`ProviderCredential` 表存在但零引用。帮助页自己写着「重启 API 后恢复为环境变量默认」（`apps/web/app/(studio)/help/page.tsx` L84）。Journey A 第 4 步「配置 API」对普通用户不成立。
2. **两个产品并存，边界未收口**。约 45% 的 API 代码属于影视流水线，与世界层共享 `Asset` 表、共享 `resources.ts`、共享菜单；用户能从「故事」菜单走进一套与产品宪法无关的编辑器。
3. **人工写入与 AI 写入是两条独立路径**。Inspector 编辑角色走 `PATCH /assets/:id`（`resources.ts` L1239–1280，JWT 组），AI 提案走 `proposal-applier.ts` 直接 Prisma；事件 / 关系的手动 PATCH 走 `world.ts` 直接 Prisma，且**不记历史**。三处各写一遍校验与落库，没有共同的 Command 层。proposal-applier 顶部注释「通过与 Studio 相同的 create/update services 应用」与实现不符。
4. **删除不做引用清理**。所有实体软删除仅置 `deletedAt`（`resources.ts` L1281–1287；`world.ts` L462–466、L546–550），`Relationship.sourceId`、`WorldEvent.characterIds`、`MemoryAtom.entityId`、`RoleplayThread.characterAssetId`、`TimelineItem.entityId` 全部残留。
5. **时间线双轨**。`ProjectTimeline / TimelineTrack / TimelineItem` 三张表有完整 CRUD API（`world.ts` L559–772），但前端**只调用** `PATCH /timeline`（改时间维度），从不创建 track / item；Studio 世界线完全由 `apps/web/lib/world-line.ts`（906 行）从 `WorldEvent` 客户端派生。文档写的「Item 权威」与实现的「WorldEvent 派生」相反。

### 1.4 最大的 5 个风险

1. **服务默认绑定 `0.0.0.0` 且实际无鉴权**（`server.ts` L22；`auth.ts` L45–53 JWT 失败即回落本地 owner；`ensureProjectMember` 对任意 userId upsert 为 owner）。同一局域网任何设备可读写全部世界。
2. **LLM 输出直接决定提案 payload**，`proposalSchema.payload` 是 `z.record(z.unknown())`（`packages/domain/src/world.ts` L463–479）；`update_entity` 的 `fields.data` 对 Asset 是**整体替换**而非合并（`proposal-applier.ts` L406–408）；确认卡片只显示一行「更新「艾琳」」，看不到改了哪个字段（`proposal-card.tsx` L43–45、L203–213）。用户在盲确认。
3. **规则回退制造低质量提案**。真实 LLM 无提案时，正则 mock 会补提案（`world-builder-agent.ts` L647–654），包括 `source === target` 的自指关系（L540–549）和「未命名主角」；用户确认后就是脏数据。
4. **半成功写入无事务**：Asset PATCH + baseline + history 三步不同事务；`archiveWorldWorkspace` 两步；novel-import 逐实体写入；memory ingest 多写。历史表可能漂移。
5. **前端从 `experiments/` 目录直接 import 生产代码**（`components/cosmos/studio-cosmos-canvas.tsx` L5–10；`next.config.mjs` `externalDir: true` + webpack alias），且 `@zivith/space` 在 tsconfig 与 webpack 中指向**两个不同文件**。这是未提交 WIP，也是「为了功能快速堆出来」的最新样本。

### 1.5 当前最值得解决的事

按「真实用户能感知」排序：

1. 把 API 配置持久化（否则 Journey A / F 从第 4 步就断）。
2. 把 `0.0.0.0` 改回回环并明确本机单用户假设。
3. 提案确认卡显示字段级 diff；`update_entity.data` 改为合并；关掉自指关系等明显错误的规则回退。
4. 删除实体时清理引用（或至少在读取时过滤幽灵 id）。
5. 给影视流水线一个明确的「归档」边界：路由前缀、菜单隐藏、`package.json` 描述——不删代码，只划线。

结构性重构（统一 Command 层、收口时间线双轨、前后端共享类型）放在这五件之后，且要小步走。

---

## 2. Current Architecture

按实际画，不按理想画。

```text
┌──────────────────────── apps/desktop (Electron) ────────────────────────┐
│ launcher.cjs: docker compose up (pg/redis/minio) → pnpm dev (api+web)    │
│ main.cjs: BrowserWindow → http://127.0.0.1:3100 ; preload: openDirectory │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
┌──────────────────────── apps/web (Next 16, React 19) ───────────────────┐
│  app/(studio)/creator-chats/*  ─── ChatPanel (1572)  ┐                    │
│  app/(studio)/projects/[id]/world ─ WorldWorkspace   │ StudioSelection   │
│     ├ EntityExplorer  ├ WorldTimeline (1215)         │ Provider (context)│
│     └ InspectorPanel (1945) ─ CharacterArchive (749) │ 全量 refetch      │
│  app/(studio)/projects/[id]/{stories,shots,production,assets} ← 影视遗留│
│  components/studio-agent-panel (960) ← 第二个 Chat 实现                  │
│  components/cosmos/* → import experiments/cosmos/src/views/* (Three.js) │
│  lib/api.ts (单客户端, localStorage JWT, SSE)   lib/types.ts (手写 DTO) │
│  lib/world-line.ts (906) ← 时间线在浏览器里派生                          │
└──────────────────────────────────────────────────────────────────────────┘
                 │ REST + SSE   (snake_case via preSerialization hook)
┌──────────────────────── apps/api (Fastify 5) ────────────────────────────┐
│ app.ts                                                                    │
│  ├ /api/v1/auth/*                        JWT 签发（失败回落本地 owner）   │
│  ├ /api/v1/{projects,stories,scenes,shots,assets,media}  resources.ts    │
│  │   + generation/workflows/recompute/appearance/visual/shot-prompts/... │
│  │   [preHandler: createAuthenticate → 恒成功]                            │
│  ├ /api/v1/world/*                        world.ts (无门禁)                │
│  │   ├ GET resources (Studio 数据源)                                       │
│  │   ├ world-events / relationships / timeline CRUD → 直接 Prisma          │
│  │   ├ folders/{inspect,create,open} → contexts/world/workspace.ts (fs)   │
│  │   └ creator-chats/* → createAssistantReply()                            │
│  │        ├ buildWorldContext (全量世界 → prompt 文本)                       │
│  │        ├ memory.ingest (同步规则抽取) + memory.retrieve (Jaccard+mock)   │
│  │        ├ WorldBuilderAgent.respond → llm.completeStructured (单次 JSON)  │
│  │        │    └ 无提案时正则 mock 回退补提案                                │
│  │        └ proposals/:id/apply → $transaction → proposal-applier.ts        │
│  ├ /api/v1/memory/*   routes/memory.ts → MemoryService                     │
│  ├ /api/v1/roleplay/* routes/roleplay.ts → roleplay-agent (只写 MemoryAtom)│
│  ├ /api/v1/novel-imports/* → novel-import/service.ts (直写世界, 可 undo)  │
│  └ /api/v1/voice/*    WS 回环校验                                          │
│                                                                           │
│ contexts/ (按业务分目录，但大部分写入仍在 routes 里)                        │
│  world · world-builder · memory · roleplay · novel-import · history        │
│  generation · workflow · visual · agent(影视) · voice · usage              │
│ ports/ (llm, generation, media, stt, storage)  providers/registry.ts       │
│ adapters/ deepseek-llm · siliconflow-* · sherpa-stt · local-vector-store  │
│ providers/custom-providers.ts ← API key / 选择 存进程变量                  │
└──────────────────────────────────────────────────────────────────────────┘
                 │ Prisma
┌──────────────────────── packages/database (Postgres 16) ─────────────────┐
│ users · refresh_tokens · projects · project_members                       │
│ stories · story_segments · scenes · shots · outputs · prompt_versions ... │
│ assets(character/location/prop/style/media/...) · asset_appearance_variants│
│ world_events · relationships · project_timelines · timeline_tracks/items  │
│ entity_revisions · change_events · project_sequences                      │
│ creator_chat_threads/messages · roleplay_threads · thread_context_states  │
│ memory_atoms · memory_cores · memory_conflicts · memory_pipeline_states   │
│ novel_imports/chapters · usage_records · provider_credentials(未用)       │
└──────────────────────────────────────────────────────────────────────────┘
        ＋ sqlite: data/memory-vectors/<projectId>.sqlite（mock 向量）
        ＋ Redis（可选，BullMQ；无则进程内队列）  ＋ MinIO（媒体）

packages/domain: zod 契约 + 少量规则函数。api 广泛引用；web 零引用。
```

与「Frontend → API → Application → Domain → Infrastructure → Database」的差距：

- **没有 Application 层**。`routes/*.ts` 既是 Controller 也是 Service：`world.ts` 约 70–80% 逻辑直接 Prisma，`resources.ts` 约 85%。
- **Domain 是契约包，不是领域层**。`packages/domain` 提供 zod schema 与纯函数（`world.ts`、`history/*`、`memory.ts`），不含实体行为、不变量或仓储接口。`EntityCommand` 类型定义了却无人使用。
- **Infrastructure 半隔离**。`ports/llm.ts` 干净；但 `contexts/memory/queue-runtime.ts`、`generation/*`、`voice/service.ts` 直接 import adapters。
- **Database 是唯一真源**，这点是对的；但客户端派生（世界线）与服务端表（TimelineItem）之间没有约定谁是谁的派生。

---

## 3. Current Module Map

| Module                                                                            | 职责                                                                                                          | 依赖                                                                                               | 被谁使用                                         | 问题                                                                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `apps/api/routes/world.ts` (1655)                                                 | 世界资源汇总、WorldEvent / Relationship / Timeline CRUD、文件夹工作区、Creator Chat 全流程、提案 apply/reject | proposal-applier、workspace、world-builder、memory、history、resources.ts 的 `assetDto`/`sceneDto` | web 的 world / chat 面                           | 上帝文件；事件/关系 PATCH 不查项目归属、不记历史；聊天与实体 CRUD 混在一起                                     |
| `apps/api/routes/resources.ts` (1344)                                             | Project / Story / Scene / Shot / Asset / Media CRUD                                                           | history、appearance-variants、location-sheet、workspace                                            | web 的 projects、Inspector 角色/地点编辑、影视页 | 影视与世界层共用；`data: json({...asset.data, ...body})` 把整个 body 塞进 `data` JSON                          |
| `contexts/world/proposal-applier.ts` (483)                                        | 提案 → Prisma 写入（唯一的「命令处理器」雏形）                                                                | domain schemas、history、workspace                                                                 | world.ts apply 路由                              | 只对 Asset 记历史；`data` 整体替换；无 delete kind；与 REST 路径重复校验                                       |
| `contexts/world-builder/*` (1550)                                                 | World Builder Agent、系统提示、世界上下文、冲突检测、引导                                                     | ports/llm、character-card                                                                          | world.ts                                         | 单次结构化调用非 Agent Loop；伪流式；正则回退产出低质提案；世界上下文无 token 预算                             |
| `contexts/world/workspace.ts` (580)                                               | 文件夹身份（`.zivith/workspace.json`）、项目创建/打开/归档                                                    | fs、local-user                                                                                     | world.ts、resources.ts                           | `normalizeWorkspacePath` 无根目录 jail；归档两步无事务                                                         |
| `contexts/memory/*` (~1500)                                                       | L0/L1/L2 记忆、冲突、上下文窗口、检索                                                                         | ports/llm、local-vector-store、mock-embedding                                                      | world.ts、roleplay.ts、memory.ts 路由            | 生产固定 MockEmbedding；LLM 在启动时闭包（不跟随模型切换）；实体删/改名无级联；`MemoryCore.topic` 用角色名匹配 |
| `contexts/roleplay/roleplay-agent.ts` (328)                                       | 角色状态构建（卡片、记忆、锚点前事件、关系、修订）、防剧透                                                    | character-card、entity-revisions、memory                                                           | roleplay.ts                                      | **最好的「AI 读世界」实现**；但不产提案、无地点状态、扮演不更新滚动摘要                                        |
| `contexts/novel-import/*` (1280)                                                  | 章节切分、实体抽取、直写世界、整体 undo                                                                       | memory、history                                                                                    | novel-imports.ts                                 | 绕过提案围栏（ADR-0015 认可）；逐实体写入无事务                                                                |
| `contexts/history/*` (810)                                                        | EntityRevision / ChangeEvent 记录、flag、基线回填                                                             | domain/history                                                                                     | resources、proposal-applier、影视路由            | 默认 off（character/location dual）；事件/关系/删除不记；无 restore                                            |
| `contexts/{generation,workflow,visual,agent}` (~5000)                             | 影视流水线                                                                                                    | providers、adapters                                                                                | 影视路由                                         | 与世界层无关，体积最大                                                                                         |
| `providers/*` (520)                                                               | provider 目录、凭证、运行时选择                                                                               | env、custom-providers                                                                              | llm-runtime、路由                                | **进程内存态**                                                                                                 |
| `apps/web/components/creator-chat/chat-panel.tsx` (1572)                          | 线程、消息、SSE、提案自动应用、扮演、记忆冲突、侧栏                                                           | api.ts、chat-proposals、agent-write-mode                                                           | `/creator-chats/*`                               | 34 个 useState；与 `studio-agent-panel.tsx` (960) 双实现                                                       |
| `apps/web/components/world/inspector-panel.tsx` (1945)                            | 每种实体的只读视图 + 编辑表单 + `persistSelection`                                                            | api.ts、CharacterArchive                                                                           | world 右栏                                       | 巨型 switch；无删除；project 保存分两次请求                                                                    |
| `apps/web/components/world/world-timeline.tsx` (1215) + `lib/world-line.ts` (906) | 世界线渲染、拖拽、缩放                                                                                        | resources                                                                                          | world 中栏                                       | 客户端派生，与 TimelineItem 表双轨                                                                             |
| `apps/web/lib/api.ts` (361)                                                       | 单 HTTP 客户端、JWT 刷新、SSE                                                                                 | —                                                                                                  | 全部                                             | `api()` 与 `request()` 重复 90 行                                                                              |
| `apps/web/lib/types.ts` (619)                                                     | 手写 snake_case DTO                                                                                           | —                                                                                                  | 全部                                             | 与 `@zivith/domain` 平行，零共享                                                                               |
| `components/cosmos/*` + `experiments/cosmos/*`                                    | Three.js 空间视图                                                                                             | three                                                                                              | world `?view=space`                              | 生产依赖 experiments 目录；路径别名双源                                                                        |
| `packages/domain` (2400)                                                          | zod 契约 + 规则函数（world / memory / history / 影视 resolution / workflow / shot-state）                     | zod                                                                                                | api                                              | 一半是影视遗留；无行为；web 不用                                                                               |
| `apps/desktop`                                                                    | Electron 壳，拉起 docker + pnpm dev                                                                           | —                                                                                                  | 用户                                             | 安全配置正确（contextIsolation / sandbox）；依赖开发者环境（Node / pnpm / Docker）                             |

---

## 4. Data Model Audit

### Project（= 世界）

- 字段合理：`worldview` Json（genre / premise / rules / notes）、`settings`、`workspacePath`。
- 问题：`ownerId` 必填 FK → 强制造出 `local@zivith.local` 用户；`ProjectMember` 在单用户模式下是仪式。
- `defaults` Json 是影视继承机制的残留。
- 判定：**边界清晰，不动**。宪法已裁定不新建 World 表，正确。

### Asset（Character / Location / Prop / Style / Media / Knowledge / PromptTemplate）

- 角色与地点共用 `Asset`，用 `type` 区分，业务字段落在 `appearance` Json 与 `data` Json。
- `data` 是垃圾场：`PATCH /assets/:id` 把整个请求 body（含 name / description / tags）合并进 `data`（`resources.ts` L1264）；`personality`、`default_outfit`、`time_period`、`stage_label` 都在里面，无 schema。
- `baseCharacterId`、`referenceImages`、`AssetAppearanceVariant` 属影视需求。
- 判定：**Character 与 Location 共表在当前阶段可接受**，但 `data` 需要一份 zod schema 约束读写（不新建表）。宪法 §11 的 Character 结构（Identity / Personality / Background / Goals / Current State）目前只有 name / description / personality 三项有落点。

### WorldEvent

- `title / description / worldTimeEnvelope Json / presentationOrder / characterIds String[] / sceneIds String[] / state / anchorStoryId`。
- 没有 `locationId`、没有 `cause / result / impact`（宪法 §13 列出的 Cause / Result / World Impact 全缺）。
- `characterIds` 是数组而非关系表：删除角色留幽灵 id、查询「某角色参与的事件」需全表扫。当前规模无性能问题，但一致性问题真实存在。
- 判定：**边界清晰，是正确的核心实体**；缺 location 与 impact 字段是产品缺口，需 ADR 再加。

### Relationship

- 多态 EntityRef（`sourceType/sourceId/targetType/targetId`），无物理 FK（ADR-0012 有意为之）。
- `validFrom / validUntil` 是 Json 时间信封，与 WorldEvent 的信封没有统一比较器。
- 提案应用时校验引用存在（`proposal-applier.ts` L299–337），REST 创建时**不校验**（`world.ts` L492–513）。
- 判定：模型可用；一致性靠应用层，而应用层只做了一半。

### Timeline（ProjectTimeline / TimelineTrack / TimelineItem）

- 见 §6。三张表有 API 无 UI 写入。`ProjectTimeline.temporalDimensions` 是唯一被使用的字段。
- 判定：**过早的抽象**。当前应明确「WorldEvent.presentationOrder + worldTimeEnvelope 是世界线权威，TimelineItem 暂不启用」，而不是两边都留着。

### Conversation（CreatorChatThread / CreatorChatMessage / RoleplayThread）

- 消息级 `proposal Json + proposalKey + proposalState` 把提案存在聊天消息上——简单有效，符合「对话是工作底稿」。
- `RoleplayThread` 复用 `CreatorChatThread` 存消息；`kind` 靠 join 推断（`world.ts` L855–892）。
- 问题：提案没有独立身份，`write-log` 只能从消息反推；应用结果（哪些 entity id）没有持久化，只在响应里返回。
- 判定：可接受；若要做「撤销某次提案」需给提案独立表——现在不需要。

### Message

- 合理。`content` 上限 100k。

### Memory（MemoryAtom / MemoryCore / MemoryConflict / ThreadContextState / MemoryPipelineState）

- 分层设计对应 ADR-0014。`MemoryAtom.entityId` 无 FK；`MemoryCore.topic` 用**角色名字符串**关联（`roleplay-agent.ts` L84–87），改名即脱节。
- `factType` 是自由字符串，宪法 §12 的分类（事实 / 事件 / 关系 / 用户偏好 / 亲历 / 临时）没有落成枚举。
- 判定：表结构够用；实体关联应改用 id，不需要新表。

### Resource（Media / Task / WorkflowRun / Output / PromptVersion / VisualAssetRequirement）

- 全部是影视流水线。与世界层无耦合。
- 判定：**留着，不碰，划线**。

### Entity 边界总评

Character / Location / Event / Relation 之间职责不混乱，问题在于：

1. 「状态」没有位置：EntityRevision 承担了「角色在某事件后的样子」，但 Event 本身不改任何实体字段（事件不产生状态变化，只是被记录）。
2. 引用一致性完全靠应用层，而应用层有三条写路径。

---

## 5. AI Agent Architecture Audit

### 5.1 目标结构与现状对照

```text
目标                      现状（Creator Chat）                          现状（Roleplay）
Chat        →   POST /world/creator-chats/:id/messages (SSE)      POST /roleplay/threads/:id/messages
Context     →   buildWorldContext: 全量实体→markdown               buildCharacterState: 卡片+记忆+锚点前事件
                + memory.retrieve (Jaccard + mock 向量)              +关系+修订快照   ← 做得最好的部分
                + 滚动摘要窗口 (effort 决定预算)
LLM         →   completeStructured 单次 JSON（无 tool calling）      complete 单次
Tool        →   不存在。「工具」= 提案 kind 枚举                     不存在
Proposal    →   proposals[] 存在 assistant 消息上, pending           不产生提案
Approval    →   客户端 apply/reject；full/semi 模式自动 apply       —
Command     →   proposal-applier.ts（唯一的命令处理器雏形）          —
Domain      →   zod 校验 + 手写字段守卫；只对 Asset 记历史          MemoryAtom 直写
Database    →   $transaction 内落库为 draft                          —
```

### 5.2 AI 是否只是 Chat API Wrapper

不是纯 wrapper，但**不是 Agent**：

- 有真实的世界读取（`world-context.ts`）、结构化输出契约（`worldBuilderResponseSchema`）、提案围栏、冲突检测器、引导缺口检测、Effort 分级（`agent-effort.ts`）。这些比「聊天 + 调 API」多。
- 但没有 Agent Loop：一次 `completeStructured`，没有工具调用、没有多步推理、没有让模型「先查再答」。`agent-effort.ts` 定义了 `max_tool_calls`、`max_agents`、`max_revision_passes`，**全部未使用**——它们是为未来预留的字段。
- 「流式」是伪流式：先等完整 JSON，再按 8 字符切片 16ms 一发（`world-builder-agent.ts` L663–671；`world.ts` L1200–1206）。Stop 按钮只能停止显示，停不了计费。

### 5.3 AI 如何读 World State

- 每轮把**全部**故事 / 角色 / 地点 / 场景 / 事件 / 关系拼成 markdown 进 system prompt（`world-context.ts` L188–271）。无 token 预算、无按相关性筛选。世界到几十个角色、上百事件时 prompt 会失控；Effort 的 `max_context_tokens` 只约束聊天历史，不约束世界上下文。
- 事件只带 `order` 与描述，不带 `worldTimeEnvelope`——AI 看不到世界时间。
- 角色只带 name / description / personality / aliases / tags，不带 `appearance`、不带 EntityRevision 阶段。

### 5.4 AI 如何写 World State

服务端围栏是真的：

- 用户消息不得携带提案（`world.ts` L1493–1495）。
- 只有 `proposals/:messageId/apply` 能写；先原子 claim `proposalState`（L1656–1672），再在同一事务内逐条 `applyProposal`；重复确认返回 409。
- 所有落库均为 `state: 'draft'`。

但有四个洞：

1. **payload 无类型**。`proposalSchema.payload = z.record(z.unknown())`。`create_world_event` / `create_relationship` 在 applier 里用 domain schema 二次校验，`create_character` / `update_entity` 靠手写 `typeof` 守卫。LLM 编造的字段名静默丢弃，编造的 `id` 靠 `assertEntityRefExists` 兜住（仅关系）。
2. **`update_entity` 对 Asset 的 `fields.data` 是整体替换**（`proposal-applier.ts` L406–408）。AI 说「把艾琳的年龄改成 24」若走 `data`，会抹掉 personality / default_outfit 等其它字段。
3. **确认是盲确认**。`ProposalCard` 只显示 `KIND「name」`，展开也只有 description（`proposal-card.tsx` L203–213）；`update_entity` 看不到 before / after。用户没有真正「确认」任何内容。
4. **规则回退补提案**。真实 LLM 无提案时，`mockWorldBuilderResponse` 用正则从用户话里抠名字生成提案（`world-builder-agent.ts` L647–654）。回退逻辑有已知缺陷：关系提案 `source` 与 `target` 同为 `world.characters[0]`（L540–549）；名字抽不到就叫「未命名主角」。冲突检测器会报「自指」，但用户点确认就落库。

### 5.5 幻觉污染数据的风险

- 中等。围栏阻止了「AI 静默写库」，但没有阻止「AI 写了错东西，用户看不清就点确认」。
- `full` / `semi` 写模式（`lib/agent-write-mode.ts` L60–72；`chat-panel.tsx` L424–441）在客户端自动调用 apply，连盲确认都跳过。默认是 `confirm`，且架构宪章 P6 允许「粒度是策略」，但产品宪法明文「仍禁止 AI 未经确认写入世界」。两部宪章在此有张力，需要产品所有者裁定；审查只指出事实。

### 5.6 当前 AI 架构能否支撑未来 Agent

- **能支撑 Phase 3 的起点**：`LLMAdapter` port 干净；提案作为「唯一写入通道」是正确的 tool-call 抽象；Effort 字段已预留。
- **不能直接长成 Agent Loop 的部分**：`WorldBuilderAgent.respond` 是同步单发；世界上下文是字符串拼接而非可查询的工具；没有「AI 请求读取更多」的回路。要做 Agent，需要把 `buildWorldContext` 拆成若干只读 tool（`list_characters`、`get_character(id)`、`find_events_involving(id)`），把提案 kind 变成写 tool 的 dry-run。这是 Phase 3 的事，现在不做。

### 5.7 「把艾琳的年龄改成 24 岁」当前实际流程

```text
用户文本
 → memory.ingest（同步规则抽取，先于 LLM；LLM 失败记忆也已写入）
 → buildWorldContext（全量世界）+ memory.retrieve
 → LLM 单次 JSON：reply + proposals[{kind:'update_entity', payload:{type:'character', id, fields:{...}}}]
 → 若 proposals 为空 → 正则回退（可能什么都抽不出）
 → 存 assistant 消息，proposalState=pending
 → 前端卡片：「更新「艾琳」」[确认][拒绝]（看不到 fields）
 → 用户点确认 → POST apply → $transaction
 → applyUpdateEntity: 若 AI 把年龄放在 fields.data → data 整体替换；若放在 description → description 覆盖
 → ensureAssetBaseline + asset.update + recordAssetHistory（actorType 'user'）
 → 响应 applied[]；前端 load() 但不刷新 Studio 世界资源（chat-panel.tsx L912–915）
```

风险：`data` 被替换、字段名不匹配被丢弃、Studio 不同步。
最小修改：applier 对 `data` 做浅合并；卡片展示 `fields` 的 key/value 与当前值；apply 成功后触发 `StudioSelectionProvider.reload`。
长期方案：给每个 proposal kind 一个 zod payload schema（domain 包），applier 只调用 Command。

---

## 6. Timeline Audit

### 6.1 现状

- **权威数据**：`WorldEvent.presentationOrder`（服务端排序）+ `WorldEvent.worldTimeEnvelope`（opaque 信封，mode / label / value / relation / confidence）+ `ProjectTimeline.temporalDimensions`（维度定义）。
- **渲染**：`apps/web/lib/world-line.ts` 从 `/world/projects/:id/resources` 派生轨道（角色 / 地点 / 事件 / 派生 Camera-Style-Prompt-Model 轨），客户端排序、缩放（`world-scale.ts`）、拖拽写回 `presentation_order` / `character_ids`（`world-track-edit.ts`）。
- **表**：`TimelineTrack / TimelineItem` 有 API 无 UI 写入；`world-line.ts` L7 注释明写「TimelineTrack/TimelineItem 表未当权威」。

### 6.2 Event 是否影响 World State

不影响。WorldEvent 是「被记录的事」，不携带 impact、不改任何实体字段。「角色在某事件后的状态」靠 EntityRevision（保存角色时可选 `as_of_world_event_id` + `stage_label`），由用户手动打标。因此：

- Character State：**有雏形**（EntityRevision + 锚点），扮演 agent 会按锚点取当时的卡片（`roleplay-agent.ts` L186–200）。这是好设计。
- Location State：同机制，但无 UI 入口证据。
- 事件 → 关系变化：无（Relationship 的 validFrom/Until 需手填）。
- 事件 → 记忆：novel-import 会生成 `fact_type=event` 原子；聊天路径不会。

### 6.3 AI 与 Timeline

- World Builder 看到事件的 `order` 与描述，**看不到世界时间信封**。
- 扮演 agent 用 `presentationOrder <= anchorOrder` 划认知边界，用 4-gram 重叠检测「问到未来剧情」——务实且有效，但完全依赖 `presentationOrder` 连续正确。
- Timeline 反向作为 AI Context：仅通过事件列表；没有「现在是世界时间 X，Y 处于状态 Z」的摘要。

### 6.4 未来风险

1. `presentationOrder` 是 nullable Int，由 `count + 1` 分配；拖拽重排后无唯一约束、可重复；删除后有洞。扮演锚点与排序都靠它。
2. 客户端派生轨道与服务端 TimelineItem 若日后同时使用，必然漂移。
3. 宪法 §14 要求的「角色状态 / 地点状态 / 编辑 / 删除 / 恢复」中，编辑有、删除 API 有 UI 待确认、恢复无。
4. 一致性：事件 `characterIds` 含已删角色 → 时间线角色轨出现无名剪辑。

### 6.5 判定

Timeline **已经是**世界状态变化的表达雏形（事件 + 锚定修订），不只是 UI 画线；但「事件不产生状态变化」意味着世界不会「活起来」——每次状态变化都要人手动去角色上打标。这是产品缺口，不是架构错误。TimelineItem 三表应冻结（不删、不用、文档标明），直到有真实需求。

---

## 7. Studio Audit

### 7.1 查看 → 编辑

| 实体                               | 查看               | 编辑                                                                                                    | 删除                                | 走哪条 API                                                              |
| ---------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| Project / 世界观                   | ✔                  | ✔ name / description / worldview / 时间维度                                                             | 项目页 `window.confirm`             | `PATCH /projects/:id` + `PATCH /world/.../timeline`（两次请求，非原子） |
| Character                          | ✔ + EntityStages   | ✔ name / description / aliases / tags / appearance / personality / default_outfit / stage_label / as_of | Inspector 无；实体库页有            | `PATCH /assets/:id`（JWT 组，`resources.ts`）                           |
| Character Memory                   | ✔ CharacterArchive | ✔ atom PATCH / DELETE；L2 core 编辑                                                                     | ✔ **无 confirm**                    | `/memory/*`                                                             |
| Location                           | ✔                  | ✔                                                                                                       | Inspector 无                        | `PATCH /assets/:id`                                                     |
| WorldEvent                         | ✔                  | ✔ title / description / envelope / 参与角色（checklist）/ 场景                                          | API 有，Inspector 未见按钮          | `PATCH /world/world-events/:id`（不记历史）                             |
| Relationship                       | ✔                  | ✔ kind / label / direction / 两端                                                                       | CharacterArchive 有，**无 confirm** | `PATCH /world/relationships/:id`（不校验引用、不记历史）                |
| Timeline                           | ✔                  | 拖拽改 order、改维度                                                                                    | —                                   | `PATCH world-events`、`PATCH timeline`                                  |
| Scene / Story / Shot               | ✔                  | ✔（影视字段）                                                                                           | 影视页                              | `resources.ts`                                                          |
| Camera / Style / Prompt / Model 轨 | ✔ 只读投影         | ✘                                                                                                       | —                                   | —                                                                       |

结论：**Studio 不是「只能看」**，主要实体都能编辑；缺的是删除入口、删除确认、以及编辑后跨面同步。

### 7.2 AI 修改与人工修改是否统一

不统一。三条路径：

```text
Inspector 编辑角色  → PATCH /assets/:id        → resources.ts 手写字段 → ensureAssetBaseline → asset.update → recordAssetHistory
Inspector 编辑事件  → PATCH /world/world-events → world.ts 直接 worldEvent.update（无历史）
AI 提案确认         → POST apply → $transaction → proposal-applier.ts 手写字段 → asset.update → recordAssetHistory（仅 Asset）
```

三处各自校验、各自决定记不记历史、各自决定 `data` 是合并还是替换（REST 合并，提案替换）。理想的

```text
UI → Command ← AI
     Command → Domain → Database
```

目前只有 `proposal-applier.ts` 长得像 Command。最小改法不是新建一层，而是让 `resources.ts` 与 `world.ts` 的 PATCH handler **调用 applier 的同一批函数**（`applyUpdateEntity` 拆成 `updateAsset(tx, ...)`、`updateWorldEvent(tx, ...)`），使三条路径共享一份字段守卫与历史记录。

### 7.3 编辑后同步

- Inspector 保存 → `onUpdated` → `reload()` 全量拉 `/resources` → Explorer / Timeline / Inspector 同步。**正确但重**。
- Chat 确认提案 → `handleApplied` 只刷聊天与线程（`chat-panel.tsx` L912–915）；若 Studio 在另一个 tab / 侧栏打开，世界不刷新。`studio-agent-panel` 在 Studio 内嵌时是否触发 provider reload 需在实现时核对。
- 无乐观更新、无局部 patch；单用户本机下可接受。

---

## 8. Frontend Audit

### 8.1 结构

- 状态：一个 `StudioSelectionProvider`（context）承载 selection / resources / threads / loading / error / reload。**没有引入 zustand / RQ 是正确的克制**。
- API：`lib/api.ts` 单客户端，中文错误兜底（`extractMessage`）、401 刷新、SSE 解析。`api()` 与 `request()` 各自实现一遍 body 序列化 + send + 401 重试（约 90 行重复）。
- 类型：`lib/types.ts` 手写 snake_case DTO，与后端 `preSerialization → toSnakeCase` 对齐；**与 `@zivith/domain` 零共享**。`unwrapList()` 同时兼容 `T[]` / `{data}` / `{items}` 三种响应形状——说明 API 响应形状不统一。

### 8.2 巨型组件

| 文件                     | 行   | useState | 应拆出                                                                                |
| ------------------------ | ---- | -------- | ------------------------------------------------------------------------------------- |
| `inspector-panel.tsx`    | 1945 | 8        | 每种实体一个 `XxxEditor`；`persistSelection` 拆成 per-kind                            |
| `workflow-panel.tsx`     | 1652 | 21       | 影视，划线后不动                                                                      |
| `chat-panel.tsx`         | 1572 | 34       | SSE 状态机（`useChatStream`）、提案区、扮演启动、记忆冲突通知                         |
| `world-timeline.tsx`     | 1215 | 8        | 与 `world-line.ts` 一起已经是「模型在 lib、渲染在组件」，拆分收益较低                 |
| `studio-agent-panel.tsx` | 960  | 20       | **与 chat-panel 双实现**，共享 `sendCreatorChatTurn` / proposals / writeMode，UI 两份 |
| `character-archive.tsx`  | 749  | 20       | 记忆分组、关系编辑可独立                                                              |

判定：`chat-panel` + `studio-agent-panel` 的双实现是最该合并的（同一业务、两套 bug）；`inspector-panel` 是最该拆的（每加一种实体就长 200 行）。

### 8.3 UI 状态覆盖（Empty / Loading / Error / Retry / Cancel）

| 面              | Empty        | Loading         | Error                            | Retry    | Cancel  |
| --------------- | ------------ | --------------- | -------------------------------- | -------- | ------- |
| projects 页     | ✔ EmptyState | ✔ Spinner       | ✔                                | ✘        | —       |
| world-workspace | ✔            | ✔               | ✔                                | ✔        | —       |
| entity-explorer | 依赖父       | 父              | 父                               | ✘        | —       |
| chat-panel      | ✔ 引导       | ✔               | ✔ ChatErrorBanner（复制 / 重试） | ✔        | ✔ Abort |
| world-timeline  | ✘ 独立       | ✘               | ✘                                | ✘        | —       |
| memory-panel    | ✔            | `busy`          | ✔ 文本                           | ✘        | —       |
| proposal-card   | —            | ✔ 「正在写入…」 | ✔                                | 手动再点 | ✔ 拒绝  |

错误文案：多数走 `errorMessage()` 中文兜底；但 LLM 侧 `DeepSeek API 401: {...body 500 字符}` 会原样透出（`deepseek-llm.ts` L156–158 → `worldBuilderPublicError` 透传非 JSON 开头的 message）。

### 8.4 「现在能跑，以后难维护」

1. `EntityDraft` 是扁平 `Record<string,string>`，所有字段序列化为字符串再 `splitList`——加一个数组字段就要加一对 join/split。
2. `resources` 全量刷新：世界大了每次保存都拉全部 shots（含 prompts / outputs）。
3. `experiments/cosmos` 直接 import + `externalDir` + 双源别名。
4. 两个 Chat。
5. `types.ts` 手写与后端漂移只能靠运行时发现。

### 8.5 桌面壳

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，preload 只暴露 `openDirectory`。正确。
- `launcher.cjs` 拉 `docker compose up` + `pnpm dev`：这意味着「下载 → 安装 → 打开」要求用户机器有 Node 22、pnpm、Docker Desktop。README 明说「不是免安装包」。**Journey A 第 1–3 步目前只对开发者成立。**

---

## 9. Backend Audit

### 9.1 分层现状

| 层                    | 现状                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Controller            | `routes/*.ts`，Fastify handler；zod 校验完整，无 `request.body as` 强转                                          |
| Application / Service | **缺失**。逻辑在 handler 里；`contexts/*` 是按业务分的函数集合，不是服务层                                       |
| Domain                | `packages/domain` zod 契约 + 纯函数；无实体行为                                                                  |
| Repository            | 无；Prisma 直接在 handler 与 contexts 中                                                                         |
| DTO                   | 后端 `assetDto` / `sceneDto` / `chatThreadDto` 手写；`preSerialization` 全局 snake_case                          |
| Validation            | zod（好）；但 proposal payload 与 `settings` / `metadata` 是 `record(unknown)`                                   |
| Exception             | `ApiError(status, code, message, details)` + ZodError + DomainError 映射；Prisma 错误落 500；**无 request id**   |
| Logging               | Fastify logger（`server.ts` 开）；9 处 `console.*` 散落（history shadow、worker、visual）                        |
| Transaction           | 提案 apply、auth refresh、部分影视 reorder / approve 有；Asset PATCH + history、archive、memory、novel-import 无 |
| Authorization         | 仪式性：`createAuthenticate` 失败回落本地 owner；`ensureProjectMember` 自动 owner；world 组无门禁                |

### 9.2 能否支撑快速加功能

- **加一种实体**要改：Prisma → domain zod → `world.ts` 4 个路由 → `proposal-applier` create+update → `world-context.ts` → `prompt.ts` 提案说明 → `conflict-detector` → `guidance` → web `types.ts` → `inspector-panel` 视图+编辑器+`persistSelection` → `entity-explorer` → `world-line.ts` → `studio-entity-create.ts`。约 12 处，其中 5 处是重复的字段守卫。
- 这不阻塞，但每次加东西都会把 `world.ts` 与 `inspector-panel.tsx` 再撑大。
- `resources.ts` 与 `world.ts` 的边界是「历史」而非「职责」：角色创建在 resources，角色提案在 world，角色历史在 history，角色记忆在 memory。

### 9.3 Ports / Adapters

- `ports/llm.ts` 干净，`resolveRuntimeLlm` 每轮重建（模型热切换生效）。
- `server.ts` 里 `memoryService` 的 LLM 在启动时闭包（L31–41）——切换模型后记忆精炼仍用旧 provider。
- `contexts/{memory,generation}/queue-runtime.ts`、`voice/service.ts` 直接 import adapters。

---

## 10. Database Audit

### 10.1 结构

- 46 张表 / 枚举；命名统一 snake_case；主键 uuid；`createdAt / updatedAt / deletedAt` 一致。
- 索引合理：`projectId + deletedAt` 组合普遍存在；`EntityRevision @@unique([entityType, entityId, revision])`；`ChangeEvent @@unique([projectId, sequence])`。
- 14 个迁移，线性，无回滚脚本（Prisma 常态）。

### 10.2 一致性

| 问题                                                                                                                                 | 位置                                                                         | 影响                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| 多态引用无 FK：`Relationship`、`TimelineItem`、`MemoryAtom.entityId`、`RoleplayThread.characterAssetId`、`WorldEvent.characterIds[]` | schema L648–672, L712–731, L766–789, L893–907, L636                          | 软删除后幽灵 id；无级联                                 |
| 软删除 + `onDelete: Cascade` 混用                                                                                                    | `AssetAppearanceVariant`、`WorldEvent`、`Relationship` 对 Project 有 Cascade | Cascade 只在硬删触发；应用层从不硬删 → Cascade 是死配置 |
| `WorldEvent.presentationOrder` 无唯一约束、nullable                                                                                  | L634                                                                         | 拖拽重排可重复；扮演锚点依赖它                          |
| `MemoryCore.topic` 用角色名                                                                                                          | L797                                                                         | 改名脱节                                                |
| `Asset.data` 无 schema，PATCH 把 body 全塞进去                                                                                       | resources.ts L1264                                                           | 字段重复、无法约束                                      |
| `ProviderCredential` 表存在，代码零引用                                                                                              | L510–520                                                                     | 死表；正是 API Key 持久化的落点                         |
| `Project.ownerId` 必填 FK                                                                                                            | L127                                                                         | 强制 `local@zivith.local` 哨兵用户                      |
| `ProjectSequence` 用 `$queryRaw` 分配序号                                                                                            | project-sequence.ts                                                          | 参数化正确                                              |

### 10.3 JSON 字段

`worldview`、`settings`、`defaults`、`appearance`、`data`、`worldTimeEnvelope`、`validFrom/Until`、`temporalDimensions`、`worldTimeBindings`、`metadata`、`proposal`、`snapshot`。其中 `worldview`、`worldTimeEnvelope`、`temporalDimensions`、`snapshot` 有 zod；`data`、`settings`、`metadata`、`proposal.payload` 没有。

### 10.4 判定

数据库设计**适合长期发展**，不需要加表。需要的是：(a) 应用层引用清理或读取时过滤；(b) `Asset.data` 一份 schema；(c) 用起来 `ProviderCredential`；(d) 决定 TimelineItem 三表的命运（冻结）。不要为「企业级」加 FK 表——ADR-0012 的多态引用是有意的。

---

## 11. Security Audit

### 当前必须

| 项           | 事实                                                                                                         | 建议                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 监听地址     | `HOST ?? '0.0.0.0'`（`server.ts` L22）                                                                       | 默认 `127.0.0.1`；Electron 与 Web 都走回环                                                                |
| 鉴权         | JWT 失败回落本地 owner；world / memory / roleplay / novel 无门禁；`ensureProjectMember` 任意 upsert 为 owner | 本机单用户下可接受，**前提是**只监听回环。否则局域网任意设备可读写全部世界                                |
| API Key 存储 | 进程内存；UI 配置重启即丢；`.env` 明文                                                                       | 落 `ProviderCredential`（已有 `encryptedSecret Bytes` 字段），本机密钥可用 OS keychain 或固定本地密钥加密 |
| CORS         | 默认 `http://localhost:3000`，Web 在 3100；`.env.example` 也不一致                                           | 统一为 `127.0.0.1:3100`；开发 / 桌面同源                                                                  |
| 上传         | 图片有 mime + 魔数 + 10MB；novel 20MB 无 mime 白名单                                                         | novel 加 `text/*` 白名单与编码检测已有                                                                    |

### 近期应该

| 项               | 事实                                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt Injection | 实体名 / 描述 / 记忆原样拼进 system prompt（`world-context.ts`、`prompt.ts`、`roleplay-agent.ts` L251–278）；无分隔栅栏。用户自己的数据注入自己的 AI，风险低；但 novel-import 导入的第三方文本进入角色描述后会进 prompt |
| Tool 越权        | AI 只能提案，无删除 kind；`update_entity` 可改任意同项目实体；`data` 整体替换是最接近「越权改写」的点                                                                                                                   |
| 路径             | `normalizeWorkspacePath` 要求绝对路径 + realpath（`workspace.ts` L23–46），无根目录 jail。本机单用户下等价于「用户自己选的文件夹」；但 API 可被同机任意进程调用                                                         |
| SSRF             | `persistRemoteImage` 对任意 `http(s)` fetch；自定义 provider `base_url` 任意。本机模式下影响是「让本机去请求内网地址」                                                                                                  |
| LLM 错误透出     | provider 响应 body 前 500 字符原样返回用户                                                                                                                                                                              |
| 幻觉污染         | 见 §5.4                                                                                                                                                                                                                 |

### 以后考虑

- 多用户 / 云模式下的真实授权（ADR-0013 明确不做）。
- 导出 / 导入的签名与版本校验。
- XSS：React 默认转义；markdown 渲染若引入需审。
- SQL 注入：Prisma + 参数化 `$queryRaw`，当前无风险。
- 命令注入：`launcher.cjs` 用 `spawn` 带参数数组，无 shell 拼接。

---

## 12. Technical Debt

### P0 — 阻塞

| #    | 问题                                         | 位置                                                   |
| ---- | -------------------------------------------- | ------------------------------------------------------ |
| P0-1 | 提供商 / 密钥 / 模型选择进程内存态，重启丢失 | `providers/custom-providers.ts`、`routes/providers.ts` |
| P0-2 | 默认 `0.0.0.0` 监听 + 无鉴权                 | `server.ts` L22                                        |
| P0-3 | `update_entity` 对 Asset `data` 整体替换     | `proposal-applier.ts` L406–408                         |
| P0-4 | 规则回退生成自指关系 / 未命名实体提案        | `world-builder-agent.ts` L540–549、L647–654            |

### P1 — 当前应该解决

| #     | 问题                                                                         | 位置                                                                  |
| ----- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| P1-1  | 提案确认卡看不到字段 diff                                                    | `proposal-card.tsx`                                                   |
| P1-2  | 删除实体不清理引用（关系 / 事件参与者 / 记忆 / 扮演线程）                    | `resources.ts` L1281、`world.ts` L462、L546                           |
| P1-3  | 三条写路径各写一遍字段守卫；事件 / 关系 PATCH 不记历史                       | `resources.ts`、`world.ts`、`proposal-applier.ts`                     |
| P1-4  | 事件 / 关系 PATCH / DELETE 不校验项目归属；关系 REST 创建不校验引用          | `world.ts` L433–476、L515–552                                         |
| P1-5  | 提案 apply 后 Studio 资源不刷新                                              | `chat-panel.tsx` L912–915                                             |
| P1-6  | 影视流水线与世界层无边界（菜单可达、共享 resources.ts、`package.json` 描述） | 全局                                                                  |
| P1-7  | web 从 `experiments/` import 生产代码；`@zivith/space` 双源别名              | `next.config.mjs`、`tsconfig.json`、`components/cosmos/*`             |
| P1-8  | 删除记忆 / 关系无确认                                                        | `character-archive.tsx` L177、L251                                    |
| P1-9  | `Asset.data` 无 schema，PATCH 把整个 body 塞入                               | `resources.ts` L1264                                                  |
| P1-10 | LLM provider 错误原文透给用户；无 fetch 超时                                 | `deepseek-llm.ts`、`world-builder-agent.ts` `worldBuilderPublicError` |
| P1-11 | 桌面壳依赖 Node / pnpm / Docker，Journey A 前三步只对开发者成立              | `apps/desktop`、README                                                |
| P1-12 | `memoryService` LLM 启动时闭包，不跟随模型切换                               | `server.ts` L31–41                                                    |

### P2 — 可以后续解决

| #     | 问题                                                                  |
| ----- | --------------------------------------------------------------------- |
| P2-1  | `chat-panel` 与 `studio-agent-panel` 双实现                           |
| P2-2  | `inspector-panel` per-kind 拆分；`EntityDraft` 扁平字符串模型         |
| P2-3  | web 手写 DTO 与 `@zivith/domain` 零共享；响应形状三种（`unwrapList`） |
| P2-4  | TimelineTrack / TimelineItem 三表冻结并文档化                         |
| P2-5  | 世界上下文无 token 预算；事件不带世界时间                             |
| P2-6  | 伪流式；Stop 不中断计费                                               |
| P2-7  | Asset PATCH + history、archive、novel-import、memory 多写无事务       |
| P2-8  | `presentationOrder` 无唯一约束                                        |
| P2-9  | `MemoryCore.topic` 用角色名；改名脱节                                 |
| P2-10 | Mock embedding 永久化；文档宣称 SiliconFlow embedding / FTS5 未实现   |
| P2-11 | 无 request id；9 处 `console.*`；Prisma 错误落 500                    |
| P2-12 | `api()` / `request()` 重复；CORS 默认端口错                           |
| P2-13 | 扮演不更新滚动摘要；无地点状态注入                                    |
| P2-14 | 组件零测试（29 个 lib 测试全是纯函数）                                |
| P2-15 | JWT / argon2 / refresh token / ProjectMember 在单用户模式下是死重量   |

### P3 — 暂时不要做

| 项                                       | 为什么不做                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| 微服务 / MQ 集群 / K8s                   | 单机单用户；BullMQ 已可选，够用                                              |
| 完整 Repository 层 + DI 容器             | Prisma 已是仓储；加一层只会让 12 处改动变 15 处。先合并写路径，再谈抽象      |
| Event Sourcing / 用 ChangeEvent 重放状态 | 架构宪章 P8 明说「不可变历史不等于 Event Sourcing」；EntityRevision 快照已够 |
| 真正的 Agent Loop + tool calling         | Phase 3；现在没有一个 Journey 被单次调用阻塞                                 |
| 多用户权限系统                           | ADR-0013 已裁定不做；`ProjectMember` 钩子留着即可                            |
| 复杂缓存 / SWR / React Query             | 单用户全量 refetch 无性能问题                                                |
| 通用「实体编辑器」元框架                 | 6 种实体手写 6 个 editor 比元框架便宜且可读                                  |
| 插件市场 / `.ziv` 格式发布               | 架构宪章 D1 / D2 已延期                                                      |
| 删除影视流水线代码                       | 7.7k 行 + 291 个测试里有一半是它；删了没有用户价值，只划线                   |
| 给多态引用加 FK 表                       | ADR-0012 有意为之；用应用层清理 + 读取过滤                                   |

---

## 13. 最小修改路线

### Phase 0 — 修复阻塞（只碰 P0）

| 改动                                                                                                                                                                                               | 文件                                             | 复杂度 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| 密钥 / 选择持久化到 `ProviderCredential` + 一张小的 `provider_settings`（或复用 `Project.settings` / 新 JSON 列——需 ADR 决定；建议复用已有 `ProviderCredential` 并把 selection 放同表 `metadata`） | `providers/*`、`routes/providers.ts`、启动时加载 | 中     |
| `HOST` 默认 `127.0.0.1`；README / `.env.example` 同步                                                                                                                                              | `server.ts`、docs                                | 低     |
| `applyUpdateEntity` 对 `fields.data` 浅合并                                                                                                                                                        | `proposal-applier.ts` L406                       | 低     |
| 规则回退：关系提案需两个不同角色，否则不出提案；名字抽不到则只提问不出提案                                                                                                                         | `world-builder-agent.ts` mock 分支               | 低     |

验收：配置 API → 重启 → 仍可对话；局域网另一台机器访问 4000 端口被拒；「把艾琳年龄改成 24」确认后 personality 仍在。

### Phase 1 — 稳定核心闭环

```text
创建项目 → 创建世界 → 创建角色 → AI 对话 → AI 提议 → 确认 → 写入 → Studio 查看 → 人工编辑 → 继续对话
```

| 改动                                                                                                                                                                                           | 说明                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 提案卡显示 `fields` key → 当前值 → 新值                                                                                                                                                        | 前端 `proposal-card.tsx`；`update_entity` 需要当前实体，从 `resources` 取                                   |
| apply 成功后刷新 Studio                                                                                                                                                                        | `chat-panel` / `studio-agent-panel` 调 `StudioSelectionProvider.reload` 或跨 tab 广播（`BroadcastChannel`） |
| 把 `proposal-applier` 的 `updateAsset / updateWorldEvent / updateRelationship / createRelationship` 抽成 `contexts/world/commands.ts`，`resources.ts` 与 `world.ts` 的 PATCH / POST 改为调用它 | 不新建层，只让三条路径进同一批函数；历史记录随之统一                                                        |
| 事件 / 关系 PATCH / DELETE 加 `projectId` 归属检查；关系 REST 创建校验引用                                                                                                                     | `world.ts`                                                                                                  |
| 删除角色 / 地点 / 事件时：同事务软删指向它的 Relationship，从 `WorldEvent.characterIds` 移除，MemoryAtom 标 `status='orphaned'`，RoleplayThread 关闭                                           | 或最小版：读取时过滤幽灵 id（`resources` 路由与 `buildWorldContext`）                                       |
| 删除记忆 / 关系加确认                                                                                                                                                                          | `character-archive.tsx`                                                                                     |
| 影视流水线划线：菜单默认隐藏「故事 / 制作」（设置项可开）；`package.json` 描述改为 IP 系统；文档标「归档面」                                                                                   | 不删代码                                                                                                    |
| `experiments/cosmos` 要么搬进 `packages/cosmos`，要么从 web 移除 import；别名单源                                                                                                              | 未提交 WIP，先决定                                                                                          |

验收：陌生用户走完上面十步；每步都有 Empty / Loading / Error / Retry；任一步失败可重试且无脏数据。

### Phase 2 — 提升产品成熟度

- `Asset.data` zod schema（personality / default_outfit / time_period / stage_label…）；`PATCH /assets` 不再把 body 塞进 `data`。
- LLM 调用加超时与 AbortSignal；provider 错误映射为中文可操作文案（「密钥无效 → 去设置」）。
- 事务：Asset PATCH + baseline + history 同事务；`archiveWorldWorkspace` 同事务。
- `presentationOrder` 重排时服务端重新编号；加 `@@unique([projectId, presentationOrder])` 需 ADR。
- 请求 id（Fastify `genReqId`）+ 错误响应带 `request_id`；`console.*` 收敛到 logger。
- 世界线 / Explorer / Memory 面补齐独立 Error / Retry。
- `inspector-panel` 按实体拆 editor；合并两个 Chat 为一个组件 + 两个布局。
- web 引入 `@zivith/domain` 的 DTO 类型（至少 WorldEvent / Relationship / Proposal），删 `types.ts` 对应手写。
- 桌面分发：至少一条「不需要 Docker」的路径（例如 pglite / 内嵌 Postgres）——这是 Journey A 前三步的前提，需单独立项。

### Phase 3 — AI Agent 能力

- 把 `buildWorldContext` 拆成只读工具（`list_characters`、`get_entity`、`events_involving`、`world_time_now`），Effort 的 `max_tool_calls` 开始生效。
- 提案 kind 各自 zod payload schema 进 `@zivith/domain`；applier 不再手写 `typeof`。
- 扮演产出「潜在事件 / 关系变化」提案，走同一 apply 围栏（宪法 Journey E 缺口）。
- 世界上下文 token 预算 + 相关性筛选；事件带世界时间信封。
- 真流式（provider streaming → SSE）+ 服务端 abort。
- 记忆：真 embedding 适配器（按能力边界，不绑厂商）；`MemoryCore` 按 `entityId` 关联。
- `full` / `semi` 写模式与产品宪法「未经确认不得写入」的张力由产品所有者裁定；技术上建议 `semi` 保留、`full` 移除或改为「自动确认但可 30 秒撤销」。

### Phase 4 — 为未来扩展留接口（不实现）

- `Story → Scene → Shot → Output` 保持为 Project 的表达层；不删、不扩。
- `TimelineItem` 三表冻结；若日后需要多轨编排，从 WorldEvent 派生迁移。
- `ProjectMember` / `AuditLog` 留作云模式钩子。
- `ports/*` 保持按能力寻址；视频 / 3D / 语音走 adapter，不进 domain。
- 导出：世界层实体（Project / Asset / WorldEvent / Relationship / MemoryAtom / EntityRevision）一份 JSON 导出是架构宪章 §4 的立即承诺，目前未见实现——Phase 2/3 之间补一个只读导出端点即可。

---

## 14. 汇总表

| 优先级 | 问题                                            | 文件/模块                                              | 原因                                | 推荐方案                                          | 预计复杂度 | 是否现在做         |
| ------ | ----------------------------------------------- | ------------------------------------------------------ | ----------------------------------- | ------------------------------------------------- | ---------- | ------------------ |
| P0     | 密钥 / 模型选择进程内存，重启丢失               | `providers/custom-providers.ts`、`routes/providers.ts` | Journey A 第 4 步、Journey F 不成立 | 落 `ProviderCredential`（已有表）+ 启动加载       | 中         | 是                 |
| P0     | 默认 `0.0.0.0` + 无鉴权                         | `server.ts`                                            | 局域网任意设备可写全部世界          | 默认回环；文档明确本机假设                        | 低         | 是                 |
| P0     | `update_entity` 对 Asset `data` 整体替换        | `proposal-applier.ts` L406                             | AI 修改抹掉其他字段                 | 浅合并                                            | 低         | 是                 |
| P0     | 规则回退产出自指关系 / 未命名实体               | `world-builder-agent.ts` mock                          | 用户盲确认即脏数据                  | 无法确定两端 / 名字时只提问不出提案               | 低         | 是                 |
| P1     | 提案卡无字段 diff                               | `proposal-card.tsx`                                    | 「确认」不是真确认                  | 展示 before / after                               | 低         | 是                 |
| P1     | 删除不清理引用                                  | `resources.ts`、`world.ts` DELETE                      | 幽灵 id 进时间线 / 扮演 / 记忆      | 同事务清理或读取过滤                              | 中         | 是                 |
| P1     | 三条写路径重复校验、历史不一致                  | `resources.ts`、`world.ts`、`proposal-applier.ts`      | 每加实体改 12 处；事件 / 关系无历史 | 抽 `contexts/world/commands.ts`，三处调用         | 中         | 是                 |
| P1     | 事件 / 关系 PATCH 不查归属、REST 关系不校验引用 | `world.ts`                                             | 跨项目误改；悬挂关系                | 加 `projectId` 检查、复用 `assertEntityRefExists` | 低         | 是                 |
| P1     | apply 后 Studio 不刷新                          | `chat-panel.tsx`                                       | 「AI 改了，UI 没变」                | 调 provider reload / BroadcastChannel             | 低         | 是                 |
| P1     | 影视流水线无边界                                | 菜单、`resources.ts`、`package.json`                   | 用户走进与产品无关的编辑器          | 菜单隐藏 + 描述改名 + 文档标归档                  | 低         | 是                 |
| P1     | web import `experiments/`；别名双源             | `next.config.mjs`、`tsconfig.json`                     | 生产依赖实验目录                    | 搬包或移除                                        | 低         | 是（WIP 决定）     |
| P1     | 删记忆 / 关系无确认                             | `character-archive.tsx`                                | 宪法 §7 高风险须确认                | `confirm` 或撤销条                                | 低         | 是                 |
| P1     | `Asset.data` 无 schema                          | `resources.ts` L1264                                   | 字段无约束、重复                    | zod schema + 白名单                               | 中         | 是                 |
| P1     | LLM 错误原文透出、无超时                        | `deepseek-llm.ts`、agent                               | 用户看到 provider JSON              | 映射 + AbortSignal + 超时                         | 低         | 是                 |
| P1     | 桌面依赖 Node / pnpm / Docker                   | `apps/desktop`                                         | Journey A 前三步只对开发者成立      | 单独立项：免 Docker 路径                          | 高         | 立项，不在本轮实现 |
| P1     | memory LLM 启动闭包                             | `server.ts`                                            | 切模型后记忆精炼用旧 provider       | 改为 `resolveRuntimeLlm` 按需                     | 低         | 是                 |
| P2     | 双 Chat 实现                                    | `chat-panel.tsx`、`studio-agent-panel.tsx`             | 同一业务两套 bug                    | 合并组件 + 两布局                                 | 中         | 后                 |
| P2     | `inspector-panel` 巨型 switch                   | `inspector-panel.tsx`                                  | 每实体 +200 行                      | per-kind editor                                   | 中         | 后                 |
| P2     | web 手写 DTO 零共享                             | `lib/types.ts`                                         | 漂移靠运行时发现                    | 引入 `@zivith/domain` 类型                        | 中         | 后                 |
| P2     | TimelineItem 三表双轨                           | schema、`world.ts` L559–772、`world-line.ts`           | 文档与实现相反                      | 冻结 + 文档                                       | 低         | 后                 |
| P2     | 世界上下文无预算、无世界时间                    | `world-context.ts`                                     | 大世界 prompt 失控；AI 看不到时间   | 预算 + 相关性 + 信封                              | 中         | 后                 |
| P2     | 伪流式                                          | `world-builder-agent.ts`、`world.ts`                   | Stop 不中断计费                     | provider streaming                                | 中         | 后                 |
| P2     | 多写无事务                                      | Asset PATCH、archive、novel、memory                    | 半成功                              | `$transaction`                                    | 低         | 后                 |
| P2     | `presentationOrder` 无唯一                      | schema                                                 | 重排可重复、锚点错位                | 服务端重编号                                      | 低         | 后                 |
| P2     | `MemoryCore.topic` 用角色名                     | memory、roleplay                                       | 改名脱节                            | 用 `entityId`                                     | 低         | 后                 |
| P2     | Mock embedding 永久化                           | `server.ts`                                            | 文档超前实现                        | 能力边界适配器                                    | 中         | 后                 |
| P2     | 无 request id、`console.*` 散落                 | `errors.ts`、9 处                                      | 排障困难                            | `genReqId` + logger                               | 低         | 后                 |
| P2     | JWT / argon2 / refresh 死重量                   | `routes/auth.ts`、web login                            | 单用户下是仪式                      | 保留钩子，隐藏 UI                                 | 低         | 后                 |
| P2     | 组件零测试                                      | `apps/web`                                             | 交互回归无保护                      | 关键流（提案确认、编辑保存）组件测试              | 中         | 后                 |
| P3     | 微服务 / K8s / MQ 集群                          | —                                                      | 单机单用户                          | 不做                                              | —          | 否                 |
| P3     | Repository + DI                                 | —                                                      | 先合并写路径                        | 不做                                              | —          | 否                 |
| P3     | Event Sourcing                                  | —                                                      | 宪章 P8 否定                        | 不做                                              | —          | 否                 |
| P3     | Agent Loop + tool calling                       | —                                                      | Phase 3                             | 不做                                              | —          | 否                 |
| P3     | 多用户权限                                      | —                                                      | ADR-0013                            | 不做                                              | —          | 否                 |
| P3     | 删除影视代码                                    | —                                                      | 无用户价值                          | 只划线                                            | —          | 否                 |
| P3     | 多态引用加 FK                                   | —                                                      | ADR-0012 有意                       | 不做                                              | —          | 否                 |

---

## 15. 为什么「功能不少，却不像成熟产品」

**UX**

- 第一步就断：普通用户装不起来（Docker / Node / pnpm），装起来后配的 API Key 重启就丢。
- 「确认」是盲的：提案卡只有一行标题，用户不知道自己确认了什么。
- 改了不同步：Chat 里确认写入，Studio 不刷新；删了角色，时间线还有它。
- 菜单里有「故事 / 制作 / 镜头」，点进去是另一个产品。
- 删除记忆不问一声。

**Product**

- 核心价值集中在「世界 + 角色 + 对话 + 提案」，这部分是对的；但影视流水线、Cosmos 空间视图、语音、小说导入、外观变体、生成队列同时存在，每个都是 Level 1–2，稀释了注意力。
- Journey E（扮演 → 事件 → 世界变化）没有实现：角色「活起来」的闭环缺最后一步，世界不会因为对话而改变。
- Event 不产生状态变化，Timeline 只是有序记录。

**Engineering**

- 三条写路径、两套身份、两套时间线、两套类型、两个 Chat。每处都能跑，合在一起就是「每加一个功能要改 12 处、每处逻辑略有不同」。
- 未提交的 64 文件 WIP 把 `experiments/` 接进生产。

**AI**

- AI 真的读了世界，也真的只能提案——这是 Zivith 比「聊天 + 调 API」多出来的部分，值得保留。
- 但 AI 看不到世界时间、看不到角色状态、看不到自己上次改了什么；提案是一次性 JSON 而非多步推理；规则回退会替 AI 编提案。用户感受到的是「它知道我的角色叫什么，但不理解我的世界」。

---

## 16. 哪些地方已经做得足够，不应该折腾

- **提案围栏与事务 apply**（`world.ts` L1608–1720 + `proposal-applier.ts`）：原子 claim、幂等、全 draft。只修 `data` 合并，不重写。
- **扮演的角色状态构建**（`roleplay-agent.ts`）：卡片 + 记忆 + 锚点前事件 + 关系 + 修订快照 + 防剧透。这是整个系统里最像「AI 理解世界」的代码，扩展而非重构。
- **Prisma schema 与迁移纪律**：不加表。
- **`packages/domain` 的 zod 契约**（`world.ts`、`history/*`）：内容正确，问题只是 web 没用它。
- **`lib/api.ts`**：单客户端、中文兜底、SSE 解析。合并 `api` / `request` 即可。
- **`StudioSelectionProvider`**：一个 context、全量 refetch，对单用户本机是正确的简单。
- **Electron 安全配置**、**zod 全覆盖校验**、**zero `request.body as`**。
- **测试基线**：520 个单测 16 秒全绿。Phase 1 每一步都应保持这个数字只增不减。
- **文档体系**：产品宪法 / 架构宪章 / ADR 的分工清晰；问题是代码没跟上，不是文档写错。
