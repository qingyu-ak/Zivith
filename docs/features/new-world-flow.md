# 新建世界流程（P0-01）

> Status: **P0-01a + P0-01b Implemented** — 2026-09-16。§25 任务单见 [`task-s25-new-world-flow.md`](../planning/task-s25-new-world-flow.md)、[`task-s25-txt-new-world.md`](../planning/task-s25-txt-new-world.md)。`.zivith` **不做 zip 包**：第三张卡片打开已有 `.zivith/` 工程文件夹。
>
> 版本：V1.0
>
> 日期：2026-09-16
>
> 所属闭环：创建世界 → 创建/导入角色 → 进入世界 → …
>
> 领域映射：产品口中的 World = 既有契约 `Project`（[ADR-0008](../architecture/adr/0008-zivith-is-an-ai-understandable-ip-creation-system.md)）。本功能不新增顶层 `World` 实体。
>
> 与 [产品宪法](../product/Product-Constitution.md) 冲突处以宪法为准。

---

## 0. 与现有代码的关系（实现前必读）

本功能是**入口重组**，不是另建一套世界系统。

| 已有能力 | 位置 | 本功能如何复用 |
|----------|------|----------------|
| `createWorldProject` | `apps/api/src/contexts/world/workspace.ts` | **唯一**「从零创建」写库函数：`Project` + `ProjectTimeline` + 可选文件夹标记 |
| 文件夹打开 / 绑定 / 损坏恢复 | `workspace.ts` + `apps/web/lib/world-folder.ts` | 继续作为「打开已有世界」，**不是**三条新建路径之一 |
| Creator Chat / World Builder | ADR-0010；`world-builder-agent` | 「从零开始」创建成功后的默认落点 |
| 小说导入 | ADR-0015；`POST /novel-imports`；`novel-import-panel.tsx` | **已有世界内**导入保持原语义；「用 TXT 创建新世界」是新路径，见 §16 |
| `.zivith/workspace.json` | [world-folder-v1.md](../planning/world-folder-v1.md) | 本机世界身份。**「导入 Zivith 世界」= 打开带此结构的文件夹。** 不做 `.zip` 式单文件包 |
| `POST /projects` | `apps/api/src/routes/resources.ts` | 当前**不**建 Timeline；Chat「新建一个世界」走这条。本功能必须收口 |

**禁止：** 新增 `World` 表、第二套项目创建 API、绕过 `createWorldProject` 的平行初始化、把 TXT 解析结果在确认前写入 `Asset` / `WorldEvent`。

---

## 1. 功能目标

把「新建世界」做成整个产品的核心入口，让用户用一次明确选择进入闭环的第一步：

```text
新建世界
├── 从零开始     → 空世界 + World Builder
├── 导入 TXT 小说 → 分析预览 → 用户确认 → 新 World（P0-02）
└── 导入 Zivith 世界 → 选择已有 `.zivith/` 工程文件夹 → 打开该世界
```

完成后，新用户不再需要猜「项目 / 文件夹 / 对话 / 导入小说」哪个才是创建世界。

成功标准（本功能范围内）：

1. 三条路径都从**同一个入口**出发。
2. 任何路径在用户确认之前，都**不**把世界实体写入运行库（或确认失败可完整回滚，见 §13）。
3. 创建成功后用户进入该世界，而不是停在空白项目列表。
4. 取消、失败、损坏文件都有明确恢复，不留下半成品世界。

---

## 2. 用户场景

### 场景 A — 从零开始

林想做一个原创都市世界。她打开 Zivith，点「新建世界」，选「从零开始」，填名称「雾城」，可选绑一个本机文件夹。确认后进入 World Builder，开始说「这是一个被雾气永久笼罩的港口城市」。

### 场景 B — 用小说创建世界

陈有一本自己写的 TXT。他不想先建空世界再找「导入小说」。他在新建入口选「导入 TXT」，上传，看到角色/地点/事件预览，确认后得到一个已填充的世界，再进入该世界。

### 场景 C — 打开已有 Zivith 世界文件夹

苏把「雾城」整个文件夹拷到这台电脑。文件夹里有 `.zivith/workspace.json`。她在新建入口选「导入 Zivith 世界」，选择该文件夹，看到世界名后确认，打开这个世界。不是选一个压缩包。

### 场景 D — 菜单「打开文件夹」（必须共存）

与第三张卡片同一套检查/打开逻辑。菜单给已经会用的人当快捷方式；向导给第一次使用的人。空文件夹、普通文件夹：菜单仍可询问「作为世界打开吗」；**第三张卡片只接受已经带 `.zivith/` 的目录**，否则说明「这不是一个 Zivith 世界」，不偷偷建成新世界（那是「从零开始」）。

### 非场景

- 在已有世界里再导入一本小说（P0-02 / 现有 Dock「导入小说」）。
- 把世界同步到云、账号登录（P2）。
- 用 TXT 静默改数据库。

---

## 3. 用户流程

```text
任意入口（项目页 / 菜单「文件 → 新建世界」/ Chat「新建一个世界」）
        ↓
    /projects/new    （新建世界中心）
        ↓
   ┌────┼────┐
   │    │    │
 从零  TXT  已有 .zivith 文件夹
   │    │    │
   ▼    ▼    ▼
 表单  上传  选文件夹
   │    │    │
   │  解析中  检查中
   │    │    │
   │  预览   预览名称
   │    │    │
   │  确认   确认
   │    │    │
   └──┬─┴────┘
      ▼
  从零 / TXT：createWorldProject（+ 路径专属写入）
  已有文件夹：现有 folders/open（不新建压缩格式）
      ▼
  进入该世界（从零 → World Builder；TXT / 已有文件夹 → Studio 世界工作区）
```

### 3.1 从零开始

1. 选择「从零开始」。
2. 填写世界名称（必填）、简介（可选）。
3. 桌面：可选「选择世界文件夹」。不选则创建无文件夹世界（与今日行为一致）。
4. 点「创建世界」。
5. 成功：打开该世界的 World Builder 线程（Creator Chat），并提供「进入 Studio」既有入口。
6. 取消：回到三选一，无库记录。

### 3.2 导入 TXT

1. 选择「导入 TXT 小说」。
2. 选 `.txt` 文件（UTF-8 / GB18030，沿用现有解码）。
3. 进入「解析 / 分析」态（可取消）。
4. 展示预览：世界观要点、角色、地点、事件、关系、时间线摘要、记忆条数估计。
5. 用户可改世界名称（默认取文件名或正文标题启发式）。
6. 点「用这些内容创建世界」→ 创建 `Project` 并写入预览中的实体。
7. 成功：进入该世界 Studio `/projects/:id/world`，打开导入报告（只读，已确认过）。
8. 点「取消」或关闭：删除分析草稿，不创建 `Project`。

详细抽取规则仍复用 ADR-0015 的规则引擎。LLM 抽取见后续（`docs/features/txt-novel-import.md`，待写）。预览不落草稿表：`POST /novel-imports/preview` 只返回摘要，确认后再 `createWorldProject` + `POST /novel-imports`。

### 3.3 导入 Zivith 世界（工程文件夹，不是压缩包）

1. 选择「导入 Zivith 世界」。
2. 桌面：系统对话框选**文件夹**。网页：说明须用桌面应用，不提供假的文件选择。
3. 调用现有 `inspect`：必须已有 `.zivith/workspace.json`（`state === ok`，或损坏可走现有恢复确认）。
4. 预览：世界名称、路径。不解析角色清单，不读 zip。
5. 用户确认后走现有 `openWorldFromFolder`（含孤儿运行副本、复制冲突的既有确认）。
6. 取消：不写库、不改绑定。

禁止：`.zivith` 单文件、zip、第二套世界序列化格式。搬运方式就是拷贝整个世界文件夹。

### 3.4 入口收口

| 现入口 | 改为 |
|--------|------|
| 项目页「新建项目」 | 「新建世界」→ `/projects/new` |
| 空状态「新建项目」 | 同上 |
| 菜单「文件 → 新建项目」 | 「新建世界」 |
| Chat「新建一个世界」 | 跳转 `/projects/new`（不再直接 `POST /projects` 建「未命名世界」） |
| `?new=1` | 重定向到 `/projects/new` |
| 「打开文件夹」 | **保留**，文案不变，不并入三选一 |

Chat 里用户说「帮我创建一个世界」仍可由 World Builder 走提案 `create_project`（ADR-0010）。那是对话内创建，与本向导并存；对话创建必须改为调用 `createWorldProject`，保证有 Timeline。

---

## 4. UI / UX

### 4.1 路由

升级 UI-IA 已预留的 `/projects/new`：从「降级回退」变为**新建世界中心**。

不新增大壳、不改活动栏。该页属于 Studio 项目区，浅色，与项目列表同壳。

### 4.2 新建世界中心（三选一）

页头：

- 标题：**新建世界**
- 副文案：创造你的世界，和你的主角一起遨游。
- 次要动作：打开已有世界（链到 `/projects`）；桌面另提供「打开文件夹」。

三张卡片，等权：

| 卡片 | 标题 | 说明 | 主按钮 |
|------|------|------|--------|
| 从零开始 | 从零开始 | 进入 World Builder，用对话慢慢长出世界 | 继续 |
| TXT | 导入小说 TXT | 分析文本，预览后再创建世界 | 继续 |
| Zivith | 导入 Zivith 世界 | 打开已有 `.zivith` 工程文件夹 | 继续 |

空状态：三张卡片本身就是空态，不套「还没有项目」。

### 4.3 从零表单

沿用项目页已有字段，文案改「世界」：

- 世界名称 *（placeholder：例如：雾城来信）
- 简介（可选）
- 世界文件夹（仅桌面，可选）
- 主按钮：创建世界
- 次按钮：返回

Loading：按钮「正在创建…」，表单禁用。

### 4.4 TXT 向导（四步）

```text
上传 → 解析中 → 预览 → 创建中
```

- **上传：** 拖放或选择 `.txt`；显示大小限制（20MB，与现导入一致）；不接受 epub（本阶段）。
- **解析中：** 不确定进度条 + 「正在分析世界观与角色…」+ 「取消」。
- **预览：** 左侧摘要（名称、类型计数），右侧可折叠列表（角色名、地点名、事件标题、关系一句、世界观要点）。不展示全文。可改世界名称。主按钮「确认并创建世界」。
- **创建中：** 全页忙态，不可重复提交。

错误：红条 + 「重新选择文件」。解析失败不进入预览。

### 4.5 导入 Zivith 世界（文件夹）

```text
选文件夹 → 检查中 → 预览名称 → 打开中
```

- **选文件夹：** 仅桌面。网页显示「请用 Zivith 桌面应用选择世界文件夹」。
- **检查中：** 「正在查看这个文件夹…」可取消（取消 = 不调用 open）。
- **预览：** 世界名（来自 `workspace.json`）+ 路径。没有 `.zivith/`：「这不是一个 Zivith 世界。请选择含 .zivith 文件夹的目录，或改用从零开始。」
- **打开中：** 按钮「正在打开…」，禁用。
- 损坏 / 本机无运行数据 / 复制冲突：沿用现有中文确认框，不新做一套。

### 4.6 成功落点

| 路径 | 落点 | 原因 |
|------|------|------|
| 从零 | `/creator-chats/:threadId`（该世界 World Builder 线程） | 任务书：进入 World Builder |
| TXT | `/projects/:id/world` | 世界已有实体，应先看见世界 |
| 导入 Zivith 文件夹 | `/projects/:id/world` | 已有世界，先看见世界 |

所有落点必须仍能去到对话与 Studio（ADR-0010 绊线：结构化工作区不可达即失败）。

### 4.7 文案原则

面向用户一律称「世界」，不称「项目」。内部 API / 数据库仍是 `Project`。

---

## 5. 数据模型

不新增领域实体。可新增**临时分析会话**表或本地草稿，确认后删除。

### 5.1 创建成功后的世界最小形状

由 `createWorldProject` 保证：

```text
Project
├── name / description / defaults.language=zh-CN
├── settings.creator_layer = true
├── members (local owner)
├── workspacePath? + .zivith/workspace.json?
└── ProjectTimeline "World Line"
```

从零额外：一条 `CreatorChatThread`（World Builder）。

TXT / 已有文件夹额外数据见 P0-02 / 现有 world-folder 打开，仍挂在 `Project` 下。

### 5.2 TXT 分析草稿（本功能合同，表名可在实现时定）

建议：`WorldCreateDraft`

| 字段 | 含义 |
|------|------|
| id | 草稿 ID |
| kind | `txt`（P0-02 才用）。打开已有文件夹不走草稿表。 |
| status | `parsing` \| `ready` \| `failed` \| `consumed` \| `discarded` |
| filename | 原文件名 |
| preview | JSON 预览（不含全文） |
| sourceRef | 原文只存服务端，不回传列表 |
| createdAt / expiresAt | 超时回收（建议 24h） |

`POST` 创建草稿只写草稿，不写 `Asset`。确认接口在同一事务（或补偿事务）里：`createWorldProject` → 消费草稿 → 标记 `consumed`。

### 5.3 明确不进入本功能

- 不改 `Asset` / `WorldEvent` / `Relationship` / `Memory*` schema。
- 不把对话记录当世界导出（ADR-0010）。
- 不发明 `.zivith` zip 包，也不在工程文件夹里存放 API Key。

---

## 6. 状态机

```text
hub
  ├─ scratch_form
  │     ├─ creating ─► success ─► world_builder
  │     ├─ failed ─► scratch_form（保留已填字段）
  │     └─ cancel ─► hub
  ├─ txt_upload
  │     ├─ parsing ─► txt_preview ─► committing ─► success ─► studio
  │     ├─ parse_failed ─► txt_upload
  │     ├─ commit_failed ─► txt_preview（世界未创建或已回滚）
  │     └─ cancel ─► discard draft ─► hub
  └─ zivith_folder
        ├─ inspecting ─► folder_preview ─► opening ─► success ─► studio
        ├─ not_a_world ─► zivith_folder（说明，不创建）
        ├─ open_failed ─► folder_preview
        └─ cancel ─► hub
```

规则：

- `creating` / `committing` 禁止二次提交。
- 浏览器后退 = 取消当前步；若已 `success` 则不撤销世界。
- 草稿 `consumed` 后确认接口幂等：同一 `draft_id` 返回已创建的 `project_id`，不创建第二个世界。

---

## 7. AI 行为

### 从零

本向导**不调用模型**。创建后的 World Builder 沿用现有 agent：只出提案，用户确认后 `apply-intent`。

### TXT

分析可走规则抽取（无密钥）或 LLM（有密钥），细节 P0-02。P0-01 硬约束：

- AI **只写入草稿预览**，不写世界实体。
- 预览是提议，不是已发生的世界。
- 无密钥时必须仍能完成「规则分析 → 预览 → 创建」（对齐 M2 无密钥可跑）。

### 导入 Zivith 文件夹

无 AI。只检查现有 `.zivith/workspace.json`，再打开。不反序列化第二套格式。

---

## 8. Context 构建

本功能不组装角色扮演 Context。

从零落点进入 World Builder 时，沿用 `buildWorldContext`：新世界几乎为空，agent 应按现有缺口检测引导（世界观 / 主角 / 关系 / 地点 / 事件），「继续」只提问不建实体。

TXT 创建成功后的第一轮对话：世界上下文应已能读到导入的角色与事件（P0-02 写入完成后自然成立）。

---

## 9. Memory 处理

从零：不创建记忆。

TXT：记忆卡在**确认创建之后**由 P0-02 写入，复用 ADR-0014 管线，不在预览阶段落 `MemoryAtom`。

打开已有 `.zivith/` 文件夹：不导入记忆文件；运行数据仍在本机数据库（world-folder-v1）。确认前不改绑定。

---

## 10. Timeline 处理

所有新建路径必须创建 `ProjectTimeline`「World Line」。

这修复当前缺口：`POST /projects` 与 Chat `createBareWorld` 创建的世界没有 Timeline，Studio 世界线不完整。

TXT 事件如何挂到 presentation 顺序由 P0-02 规定。打开已有文件夹不新建时间线（世界里已有则沿用）。P0-01 只保证**从零**路径轴存在。

---

## 11. World State

确认前：运行中的 World State **不变**（无新 `Project`，或仅有未消费草稿）。

确认后：

- 从零：空 World State + 一条世界线。
- TXT：新 World State = 预览已展示的实体集合（用户看见什么，入库就是什么；预览未列的不得额外写入）。
- 打开 `.zivith/` 文件夹：World State = 该 `worldId` 在本机已有的运行数据（或孤儿时按现有逻辑创建运行副本，沿用文件身份）。**不**因打开而复制出第二个世界。

AI 不得在本流程中成为世界最终裁决者。

---

## 12. 用户确认机制

| 路径 | 确认点 | 确认之后才允许 |
|------|--------|----------------|
| 从零 | 「创建世界」 | `createWorldProject` + 开线程 |
| TXT | 「确认并创建世界」 | 建 `Project` + 按预览写实体/记忆 |
| 导入 Zivith 文件夹 | 「打开这个世界」 | 现有 `folders/open`（含孤儿副本等既有确认） |

不算确认：选文件夹、开始检查、看预览名称、取消。

已有世界的 Dock「导入小说」**不**改走本向导。那是 ADR-0015 预授权批量写入，用报告 + 整体撤销。两种确认模型按入口分离，避免混用。

---

## 13. 异常情况

| 情况 | 行为 |
|------|------|
| 用户取消选文件夹 / 选 txt | 留在当前步，无草稿、无绑定变化 |
| `.zivith/` 损坏 | 现有「要尝试按文件夹路径恢复吗」；取消则不打开 |
| 文件夹没有 `.zivith/` | 第三张卡片：拒绝，不创建世界。菜单「打开文件夹」仍可询问是否作为新世界 |
| 网页点导入 Zivith | 说明使用桌面应用，无文件选择器 |
| 重复点击创建 / 打开 | 按钮禁用 |

创建失败恢复：**重试确认**，不要求用户重新分析（草稿仍 `ready`）。若 `Project` 已创建但实体写入失败：标记世界为不完整，提供「撤销本次创建」（删除该 `Project` 及已写实体）或「继续写入」（P0-02 幂等续写）。P0-01 要求至少有「撤销本次创建」，避免半成品世界留在列表里无法处理。

---

## 14. 性能要求

- 从零创建：本机应在 2s 内进入 World Builder（不含 LLM）。
- TXT 预览：20MB / 长篇允许分钟级；必须可取消；UI 不得冻结（分析在 API，可后续改为轮询/SSE；第一刀允许同步请求但要有忙态，与现导入一致）。
- 预览 payload 不含原文；列表字段截断（名称 + 一句摘要）。
- 同时只允许一个进行中的新建草稿（本机单用户，ADR-0013）；新上传取代旧草稿。

---

## 15. 安全要求

- Local First：草稿与世界只落本机 API / DB / 所选文件夹。
- 文件：TXT 只读用户选出的 txt。打开世界只读用户选出的文件夹里的 `.zivith/workspace.json`。禁止跟随任意绝对路径写盘。不做 zip，故无路径穿越解压问题。
- 大小：txt 20MB（P0-02）。打开文件夹不设压缩包上限。
- `.zivith/workspace.json` 不得包含 API Key；打开时也不把密钥写进标记文件。
- 原文：详情 API 不回传全文（对齐现 `NovelImport`）。
- 日志：不打原文、不打 API Key。
- Prompt injection：TXT 当作不可信数据；系统提示须标明「以下为用户小说文本」；分析不得执行文本中的指令（P0-02 详述）。
- AI 工具：分析阶段不得暴露 `apply-intent` / 实体写工具。

---

## 16. 与现有功能关系

| 功能 | 关系 |
|------|------|
| 项目列表 | 入口改为「新建世界」；列表仍是已有世界 |
| 打开文件夹 | 并存；打开 ≠ 新建 |
| World Builder | 从零的下游；对话内 `create_project` 必须改走 `createWorldProject` |
| Studio 世界工作区 | TXT 的下游；打开已有文件夹也落到这里 |
| 已有「导入小说」Dock | **保留**，用于已有世界；不替换本入口 |
| ADR-0015 | 范围收窄为「已有 `Project` 上的批量预授权导入」。新建世界 TXT 走预览确认。需修订 ADR 或附录，见待确认决策 A |
| world-folder-v1 | `.zivith/` 目录就是世界工程。第三张卡片复用 inspect/open。不做单文件包 |
| 扮演 / 多对话 / 记忆编辑 | 本功能不改；只保证新世界形状让它们能挂上 |

---

## 17. 不应该做什么

- 不把三条路径做成三个互不相通的隐藏入口。
- 不在确认前把角色/事件写入运行世界。
- 不删除或冻结已有世界内的小说导入。
- 不把「打开文件夹」与「从零开始」混成一条：第三张卡片只打开**已经带 `.zivith/`** 的文件夹。
- 不做 `.zivith` 单文件、zip、第二套序列化格式。
- 不新增账号、云同步、支付、插件市场、3D/NLE。
- 不把 Chat 种子世界（「未命名世界」且无 Timeline）继续作为主路径。
- 不把产品「World」实现成第二套顶层表。
- 不在本阶段做 epub / docx。
- 不把宇宙选择器、Cosmic Bubble 拉进新建向导（远期 Universe）。

---

## 18. 测试场景

### 18.1 从零

1. `/projects/new` 三卡片可见。
2. 填名称创建 → 有 `ProjectTimeline` → 进入 World Builder。
3. 桌面选文件夹创建 → 有 `workspace.json` 且 `worldId` 一致。
4. 取消表单 → 无新项目。
5. 创建中断网 → 错误保留表单，无半成品或可撤销。
6. Chat「新建一个世界」进入本页，不再直接建「未命名世界」。
7. 对话提案创建世界同样有 Timeline。

### 18.2 TXT（可在 P0-02 落地后跑满；P0-01 先测合同）

1. 上传 → 预览有角色且库中尚无该 `Project`。
2. 取消 → 无 `Project`、草稿 discarded。
3. 确认 → 世界存在且预览中的主角可在 Studio 看到。
4. 重复确认同一草稿 → 仍是同一个 `project_id`。
5. 过短文本 / 非 txt → 中文错误。
6. 已有世界 Dock 导入行为回归（仍直写 + 可撤销）。

### 18.3 导入 Zivith 世界文件夹

1. 选带 `.zivith/workspace.json` 的文件夹 → 预览名称 → 确认后 Studio 可打开。
2. 取消选文件夹 / 取消确认 → 无新绑定、无新世界。
3. 选普通文件夹（无 `.zivith/`）→ 中文错误，不创建世界。
4. 损坏标记 / 孤儿 / 复制冲突 → 现有确认框，取消则不写。
5. 菜单「打开文件夹」仍可用（可对普通文件夹询问导入）。
6. 网页点第三张卡片 → 说明用桌面应用，不出现假的 zip 上传。

### 18.4 回归

- 项目列表打开已有世界。
- 文件夹 missing/corrupt/orphan 确认流。
- 帮助页「快速上手」与真实入口一致。

---

## 19. 验收标准

- [ ] 用户能从项目页、文件菜单、Chat 空态到达**同一个**新建世界中心。
- [ ] 三选一文案为：从零开始 / 导入 TXT / 导入 Zivith 世界。
- [ ] 从零：创建后进入 World Builder；世界有 World Line；空实体列表可接受。
- [ ] TXT：确认前 Studio/API 看不到新世界实体；确认后可以。
- [ ] 「导入 Zivith 世界」：桌面选已有 `.zivith/` 文件夹，确认后可打开；无该结构则拒绝且不建世界。
- [ ] 取消任意未确认步骤不留半成品世界（从零不建；导入文件夹不改绑定）。
- [ ] 创建失败可重试或撤销，列表不出现无法打开的死世界。
- [ ] 网页能从零；TXT 仍为说明；导入 Zivith 在网页说明须用桌面。
- [ ] 打开文件夹与新建入口同时存在且语义不混（菜单可导入普通文件夹，第三张卡片不行）。
- [ ] `POST /projects` 与对话建世界均产生 Timeline（或废弃该 POST，统一走 `createWorldProject`）。
- [ ] 无密钥可完成从零；TXT 无密钥可预览（规则路径）。
- [ ] 帮助「快速上手」改为先「新建世界」。

未完成定义：只改了按钮文案但仍直接 `POST /projects`；TXT 仍先建空世界再静默导入。

---

## 20. 完成定义

对照任务书 DoD，本功能完成须同时满足：

```text
□ 产品需求明确（本文 + 待确认决策已拍板）
□ 详细设计完成（本文 Accepted）
□ P0-02 设计已覆盖 TXT 分析（否则 TXT 路径不得标完成）
□ UI 完成（中心 + 从零 + 打开 `.zivith/` 文件夹；TXT 可为说明）
□ 核心逻辑完成（统一 createWorldProject + 复用 folders inspect/open）
□ 数据模型正确（无新顶层 World；有 Timeline）
□ AI 行为正确（分析不写世界）
□ 错误 / Loading / Empty / 取消完成
□ 数据持久化完成
□ 安全检查完成（文件、密钥、injection 边界）
□ 单功能测试 + 与打开文件夹 / 已有导入 / Chat 提案的集成测试
□ E2E：新建从零 → 进入 World Builder
□ 人工体验：按场景 A/B/C 各走一遍
□ 无「无 Timeline 世界」回归
```

---

## 21. 建议实施切片（批准设计之后）

不要一次做完三路径的分析引擎。

| 切片 | 内容 | 依赖 |
|------|------|------|
| P0-01a | `/projects/new` + 从零闭环 + 打开已有 `.zivith/` 文件夹 + 收口 `createWorldProject` + 入口跳转 | 本文批准 |
| P0-01b | TXT 向导（上传/忙/预览/确认）+ 无表预览 API | P0-01a；复用既有抽取，不新建草稿表 |

P0-01a 可人工体验场景 A（从零）与场景 C（打开已有工程文件夹）。P0-01b 可体验场景 B（TXT 预览后创建）。不做 zip 包切片。

---

## 22. 待确认决策（阻塞编码）

P0-01a 任务单已按下列建议锁定。若要改，先改任务单再写代码。

### A. TXT 新建 vs ADR-0015

建议：**并存，按入口分模型。**

- 新建世界 ← TXT：预览 → 确认 → 创建（本文）。
- 已有世界 Dock 导入：仍预授权直写 + 报告 + 撤销（ADR-0015）。

需给 ADR-0015 加一段「不适用于创建新 Project 的 TXT 向导」。

备选：所有 TXT 都改成预览确认（含已有世界）。工作量大，且与「上传即授权本批」的已上线行为不一致。

### B. `.zivith` 是文件夹，不是压缩包

已拍板：

- **目录** `.zivith/workspace.json` = 世界工程标记（world-folder-v1，不变）。
- 「导入 Zivith 世界」= 选择已有该结构的**文件夹**，复用 inspect / open。
- **不做** `某世界.zivith` 单文件、zip、独特序列化。拷贝文件夹就是搬运。

### C. 从零落点

建议：World Builder（Creator Chat）。Studio 作为显式第二步。

备选：创建后进 Studio 空态，再点对话。更接近「进入世界」，但空世界 Studio 比对话更冷。

### D. TXT / 已有文件夹落点

- TXT（P0-02）：Studio 世界工作区。
- 导入 Zivith 文件夹：Studio `/projects/:id/world`（已有世界）。

### E. TXT 卡片在 P0-01a 是否可点

建议：可点，进入说明页，不调用写库 API。Zivith 卡片在桌面可走真实打开。

---

## 23. 下一步

1. 确认 P0-01a 任务单（含：第三张卡片 = 打开 `.zivith/` 文件夹，不做 zip）。
2. 实现 P0-01a。
3. 撰写 `docs/features/txt-novel-import.md`（P0-02）。
4. **不**撰写 zip 包格式文档。
