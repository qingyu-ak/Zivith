# 记忆系统、小说导入与角色扮演 Agent 设计

> 分层长期记忆 · 动态上下文管理 · 小说批量摄取 · 时间锚定角色扮演
>
> Version: 1.0
>
> Status: Proposed — 设计已与创作者逐项确认（2026-08-23），待实现规划。**产品目标以 [产品宪法](../product/Product-Constitution.md) 为准（2026-09-16）。**
>
> Related: [Product Constitution](../product/Product-Constitution.md), [ADR-0007](../architecture/adr/0007-preserve-current-state-with-immutable-creative-history.md), [ADR-0008](../architecture/adr/0008-zivith-is-an-ai-understandable-ip-creation-system.md), [ADR-0010](../architecture/adr/0010-creator-chat-is-the-world-first-continuous-conversation-surface.md), [ADR-0011](../architecture/adr/0011-world-event-is-a-domain-creative-entity.md), [ADR-0012](../architecture/adr/0012-relationship-is-an-independent-queryable-entity.md), [ADR-0013](../architecture/adr/0013-local-single-user-mode-no-login.md), [Implementation-Plan.md](Implementation-Plan.md)

---

# 1. 背景与目标

## 1.1 问题

Creator Chat 当前是无长期记忆的：每轮对话只携带近期消息 + 世界状态快照。这导致：

1. **跨会话遗忘** — 用户上次会话说过的设定，这次 AI 不知道，除非已通过提案写入世界层；
2. **上下文溢出** — 对话变长后上下文窗口耗尽，只能截断旧消息，丢失叙事连贯性；
3. **创作资产浪费** — 用户在对话中随口说出的丰富细节（角色习惯、场景氛围、伏笔意图）大量流失，只有走提案确认的部分才沉淀下来。

## 1.2 目标

- **G1 长期记忆**：对话内容多层沉淀（原文 → 中间 → 核心），跨会话可用，数据全部本地存储；
- **G2 动态上下文**：单个聊天框内自动压缩管理上下文，缓存溢出时无损压缩（事实层不丢、叙事层够用）；
- **G3 智能归档**：用户的回答自动解析归档为角色/事件/场景并建立关系，重复自动清洗合并，冲突上报确认；
- **G4 小说导入**：导入一本小说（如《龙族》），自动提炼为项目中的角色、场景、事件、关系——对齐世界层模型，而非仅产角色卡；
- **G5 角色扮演**：新 Agent 读取小说世界设定与角色卡，模仿角色与用户交流，支持锚定到小说时间线任意时刻。

## 1.3 设计依据

对照 2025–2026 成熟记忆框架（Mem0 / Letta-MemGPT / Zep-Graphiti / 腾讯 AgentMemory）后吸收四项机制：

| 来源 | 机制 | 落地 |
|---|---|---|
| 腾讯 AgentMemory | L0–L3 记忆金字塔、异步蒸馏管线 | 三层记忆 + 同步/异步双路径 |
| Mem0 (ECAI 2025) | 记忆操作分类 ADD/UPDATE/DELETE/NOOP | 每次提炼显式产出可审计操作 |
| Zep / Graphiti | 双时态事实（生效/失效时间） | `validFrom/validTo` 时间效度 |
| SSGM (arXiv 2026) | 冲突门控防记忆漂移 | 矛盾强度超阈值拦截上报 |
| 混合检索研究 | 向量+图+BM25 比纯向量高 15–23%（多跳） | 三路混合召回 |
| CharacterGPT (arXiv 2405.19778) | 8 要素结构化角色卡、剧情时刻角色状态 | 角色卡模板 + 时间锚定扮演 |

---

# 2. 已确认的决策记录

以下决策均经创作者逐项确认（2026-08-23）：

| # | 决策点 | 结论 |
|---|---|---|
| D1 | 世界模型写入边界 | **混合制**：补充性信息（已有实体的新细节）自动沉淀记忆层；新实体、新关系、与既有设定冲突的改动仍走 ADR-0010 提案确认 |
| D2 | 记忆存储检索 | **独立本地向量库**（sqlite 文件）+ PostgreSQL 存结构化元数据；PG 为唯一事实源，向量库为可重建的派生索引 |
| D3 | 提炼与检索运行方式 | **双轨制**：有密钥时 LLM 提炼 + 向量检索；无密钥时规则提炼 + 关键词(BM25)检索——维持 mock-first 全链路可用 |
| D4 | 重复与冲突清洗 | **自动合并 + 冲突上报**：重复自动合并（保留最新最详细，关联原文）；矛盾不自动改，生成冲突清单在对话中确认 |
| D5 | UI 可见性 | **最小可见性**：对话流内嵌记忆状态反馈（归档/合并/冲突提示）+ 世界工作区记忆面板（查看/删除） |
| D6 | 管线集成方式 | **混合管线**：同步规则快速路径（抽取→去重→冲突→归档，当轮反馈）+ 异步 LLM 深加工路径（L1 精炼→L2 聚合→向量化，后台队列） |
| D7 | 小说导入流程与规模 | **全量提取+事后审阅（A 流程）+ 重点提取（C 规模）**：主要角色全量建卡，次要角色降级轻量条目；完成后生成导入报告 |
| D8 | 角色扮演模式 | **多角色可选 + 时间锚定**：任选已导入角色开启对话，可锚定小说时间线任意时刻（角色只知道该时刻之前亲历的事）。**产品宪法（后于本表）：** 扮演可以产生需确认的世界变化；不得静默写库 |

---

# 3. Part A — 分层记忆系统（地基）

## 3.1 三层结构

```
L0 原文层   CreatorChatMessage（现有）+ MemoryPipelineState（新增管线状态标记）
             完整对话记录，永不删改——所有上层记忆的溯源终点
                ↓ 提炼（同步规则 + 异步 LLM）
L1 中间层   MemoryAtom 原子记忆
             最小事实单元，链接到实体（角色/地点/事件/场景），带去重指纹与时间效度
                ↓ 聚合（异步 LLM）
L2 核心层   MemoryCore 核心记忆
             分主题凝练知识块：人物核心档案(8要素)、世界规则、事件链
```

**职责边界**：L0 负责「说过什么」，L1 负责「知道什么」（可逐条审计、可失效），L2 负责「理解什么」（喂给 LLM 的高浓度上下文）。

## 3.2 数据模型

```prisma
// L1 原子记忆 —— 从对话提炼的最小事实单元
model MemoryAtom {
  id              String    @id @default(uuid())
  projectId       String
  threadId        String?              // 来源线程
  sourceMessageId String?              // 来源消息（L0 回溯链）
  entityType      String?              // character|location|world_event|scene|story|project
  entityId        String?              // 链接到的实体（null = 未归档原始事实）
  factType        String               // trait|desire|event|relation|rule|preference|constraint
  content         String               // 原子事实文本（中文）
  confidence      Float     @default(0.7)
  dedupHash       String               // 规范化指纹（entityType+entityId+factType+归一化内容）
  memoryOp        String    @default("ADD")   // ADD|UPDATE|NOOP|CONFLICT —— Mem0 式可审计操作
  status          String    @default("active") // active|merged|superseded|invalidated
  supersededById  String?              // 被合并/取代到的原子
  validFrom       DateTime  @default(now())   // Zep 双时态：事实生效时间
  validTo         DateTime?            // 失效时间（null = 当前为真）
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([projectId, entityType, entityId])
  @@index([projectId, status, validTo])
  @@index([dedupHash])
}

// L2 核心记忆 —— 分主题凝练知识块
model MemoryCore {
  id            String   @id @default(uuid())
  projectId     String
  kind          String               // persona|scenario|world_rule|event_chain
  topic         String               // 如「主角林澈」「力量体系」
  content       String               // 凝练文本（persona 为 8 要素结构化）
  version       Int      @default(1) // 每次重凝练递增，可回滚
  sourceAtomIds String[] @default([]) // 支撑原子（溯源链）
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([projectId, kind, topic])
}

// L0 管线状态 —— 每条消息的记忆处理进度
model MemoryPipelineState {
  messageId       String   @id
  level1At        DateTime?           // L1 提炼完成时间
  extractionMode  String   @default("rule")  // rule|llm
  status          String   @default("pending") // pending|processing|done|failed|skipped
  attempts        Int      @default(0)
  lastError       String?
  updatedAt       DateTime @updatedAt
}
```

## 3.3 去重指纹与清洗规则

**指纹计算**（规范化，容忍表述差异）：

```
dedupHash = sha256(entityType + "|" + entityId + "|" + factType + "|" + normalize(content))
normalize = 去标点 + 全半角归一 + 去空白 + 小写（英文）+ 简繁归一
```

**清洗决策表**：

| 情形 | 判定 | 动作 |
|---|---|---|
| `dedupHash` 完全一致 | 重复 | 静默跳过，新条目标 `skipped`，计数入记忆状态反馈 |
| 同实体同 factType、向量/编辑相似度 > 0.85 | 语义重复 | 自动合并：新原子保留，旧原子置 `superseded` + `supersededById` 指向新原子 + `validTo` 戳记 |
| 同实体同 factType、语义冲突（如「性格开朗」vs「性格阴郁」）且矛盾强度 > 0.7 | 冲突 | **不自动写入**——产出 `CONFLICT` 操作，进冲突清单，走 D4 确认流程（复用 H9 冲突检测 UI） |
| 同实体不同 factType | 补充 | 直接 ADD（混合制 D1：补充性信息自动沉淀） |
| 新实体（entityId 为 null 且检测到新角色/地点/事件名） | 新实体 | 不自动建——生成提案走 ADR-0010 确认（D1） |

## 3.4 双路径管线（D6）

```
用户消息落库（L0）
   │
   ├─ 同步快速路径（每轮必跑，规则驱动，<50ms）
   │    ① 实体名抽取（复用 world-builder 现有规则提取 extractEntityName）
   │    ② 原子事实切分（句级规则：含"是/有/喜欢/在/属于"等谓词的陈述句）
   │    ③ 指纹去重 + 清洗决策表
   │    ④ 产出 memory_ops（ADD/UPDATE/NOOP/CONFLICT）写入 L1
   │    ⑤ 结果随当轮 SSE 反馈（D5 记忆状态提示）
   │
   └─ 异步深加工路径（队列驱动，复用 QueuePort 双实现）
        ⑥ LLM 精炼 L1（修正规则误切分、补 factType、实体消歧）
        ⑦ L2 聚合（按实体分主题凝练 MemoryCore，persona 用 8 要素模板）
        ⑧ 向量化入库（有密钥时 embedding 写本地向量库）
        ⑨ 更新 MemoryPipelineState（断点续传单位）
```

无密钥降级：⑥⑦ 跳过（规则产出即终稿），⑧ 跳过，检索走 BM25。

## 3.5 三路混合检索

```
召回请求（用户消息 / 检索 query）
   ├─ ① 实体链接：消息中实体名 → Asset/Relationship 图遍历（一跳邻域）+ 时间线邻域事件
   ├─ ② 向量检索：本地向量库 top-k（有密钥时）
   └─ ③ 关键词检索：BM25 倒排（无密钥降级路径）
        ↓
   融合排序（RRF 倒数排名融合 + L2 核心记忆加权）
        ↓
   动态上下文注入（受 Part D 预算控制）
```

## 3.6 存储布局与数据安全

```
PostgreSQL（唯一事实源）          本地向量库（派生索引）
  MemoryAtom / MemoryCore          data/memory-vectors/<projectId>.sqlite
  CreatorChatMessage               embedding(Float32 blob) + atomId + 元数据
                                    + BM25 倒排表（FTS5）
```

- 向量库文件损坏/丢失 → 从 `MemoryAtom` 全量重建（重建命令 + API）；
- 全部数据留在本机 PostgreSQL 与本地文件（ADR-0013 本地单用户），不上云；
- LLM 调用仅在配了密钥时发生，且只发送提炼所需的最小文本片段。

## 3.7 新增 Port 与文件布局

```ts
// apps/api/src/ports/memory.ts（新）
export interface MemoryPort {
  ingest(params: IngestParams): Promise<IngestResult>            // 同步快速路径
  refineAtom(atomId: string): Promise<void>                       // 异步 L1 精炼（队列 worker 调用）
  aggregateCore(projectId: string): Promise<void>                 // 异步 L2 聚合
  retrieve(params: RetrieveParams): Promise<RetrievedMemory[]>    // 三路混合召回
  rebuildVectors(projectId: string): Promise<void>                // 向量库重建
}
// 适配器：apps/api/src/adapters/memory/（sqlite 向量实现 + mock/规则实现）
```

上下文目录：`apps/api/src/contexts/memory/`（管线编排、清洗决策、检索融合），路由挂 `apps/api/src/routes/memory.ts`（世界路由同款免登录前缀 `/api/v1`）。

---

# 4. Part D — 动态上下文窗口管理（与 A 同里程碑）

## 4.1 核心原则

**压缩有损于措辞，无损于事实**：被压缩的历史，其事实层早已由 Part A 管线提取进 L1/L2（可随时检索回来），叙事层由滚动摘要保留连贯性。删除只作用于 prompt，不作用于数据。

## 4.2 上下文预算分配

```
┌────────────────────────────────────────────┐
│ ① 系统提示（Agent 人设/角色卡/世界观）        │ 固定，永不压缩
│ ② 世界状态 + 记忆召回（三路 top-k）          │ 每轮按需检索，天然受控
│ ③ 滚动摘要（被压缩历史）                    │ 上限 ~1K tokens
│ ④ 最近 K 轮原文（verbatim）                │ 默认 K=8 轮
│ ⑤ 当前用户消息                              │
└────────────────────────────────────────────┘
```

## 4.3 压缩触发与流程

```
每轮 LLM 调用前：
  tokenEstimate = ①实测长度 + ②召回长度 + ③摘要长度 + ④原文长度 + ⑤
  （估算启发式：中文 ≈ 1.5 字/token，无分词器依赖）
    ↓ 超过模型预算的 80%？
  是 → 淘汰最旧若干轮原文（超出量 + 余量）
       增量摘要：new_summary = LLM(旧摘要 + 被淘汰轮次)   // 有密钥
       降级：规则式关键句抽取（含实体名/谓词的句子）拼接    // 无密钥
       被淘汰消息 ID 记入 summarizedUntilMessageId
```

**召回兜底**：压缩后用户若提及久远细节（「还记得我之前说的那个地名吗」），三路召回从 L1/L2 重新检索注入——这是纯摘要方案做不到的，也是 A 与 D 必须同期落地的原因。

## 4.4 数据模型

```prisma
// 线程级上下文状态 —— Creator Chat 与角色扮演线程共用
model ThreadContextState {
  threadId                 String    @id
  rollingSummary           String    @default("")
  summarizedUntilMessageId String?             // 摘要覆盖到哪条消息
  summaryVersion           Int       @default(0)
  tokenEstimate            Int       @default(0)
  updatedAt                DateTime  @updatedAt
}
```

---

# 5. Part B — 小说导入（记忆管线批量模式）

## 5.1 定位

小说导入不是新管线，而是 Part A 提炼管线的**批量摄取模式**：输入从「用户消息」换成「章节文本」，产出同一套 MemoryAtom/MemoryCore，并归档写入世界层。

## 5.2 数据流

```
上传 txt/epub（multipart，复用现有上传基础设施）
  → 章节切分（中文「第X章/卷」正则，保留开篇、允许空格与【】；无标题时兜底按字数分块）
  → NovelImport 落库（总章数、状态机 pending→processing→done/failed；原文写入 config.sourceText，GET/list 不回传）
  → 建齐 NovelImportChapter（pending）；逐章 processing→done / failed（attempts 上限 3）
      每章：同步规则抽取（实体名/事件句）→ 有密钥时 LLM 结构化提取
        → 产出：角色卡素材 / 场景 / 事件 / 关系 / 世界观要点（皆带章号溯源）
  → 全部章 done 后再跨章消歧合并（「路明非」=「路明飞」=「师弟」→ 同一 Asset）
  → 重要性分层（D7 规模控制）
  → 归档写入世界层（见 5.3 边界）
  → 生成导入报告 → 世界工作区展示；失败可 POST /novel-imports/:id/retry 从首个未完成章继续
```

## 5.3 产物对齐世界层（G4 核心）

导入产物不只是角色卡——对齐 Zivith 世界层完整模型，用户才能讨论小说中的事件与地点：

| 产物 | 落点 | 《龙族》示例 |
|---|---|---|
| 主要角色 | `Asset`(character) + MemoryCore(persona 8要素) | 路明非、楚子航、恺撒、上杉绘梨衣 |
| 次要角色 | 轻量 `Asset`（名字+一句话定位，可升级） | 狮心会成员、龙套 |
| 场景 | `Asset`(location) | 卡塞尔学院、东京、三峡水下龙墓 |
| 事件 | `WorldEvent` 挂项目世界时间线 | 青龙山计划、东京事变、屠龙 |
| 关系 | `Relationship` | 路明非—绘梨衣（守护/悲剧羁绊）、路明非—恺撒（宿敌/战友） |
| 世界观 | `Project.worldview` 要点合并 | 混血种设定、龙族谱系、言灵体系 |

**写入边界（沿用 D1 混合制）**：小说导入是显式用户动作，视为批量预授权——导入产物直接写入世界层（不逐条提案），但导入报告提供整体撤销（按 importId 级联删除）与事后修正。运行中新发现的冲突仍走冲突清单。

## 5.4 规模控制（D7）

```
重要性 = 出场频次(名字出现次数) × 剧情权重(是否参与主线事件)
默认上限（可配）：
  全量角色卡 ≤ 15 个（超出降级为轻量条目）
  轻量条目提及 ≥ 5 次（避免「没人 / 明非轻声」占满 25 槽）
  场景 ≤ 30 个（超出合并为「其他地点」）
  事件仅主线（强情节动词 + 主要角色在场；每章最多 2 条；标题「谁 · 做了什么」）
```

## 5.5 数据模型

```prisma
model NovelImport {
  id                String   @id @default(uuid())
  projectId         String
  status            String   @default("pending") // pending|processing|done|failed
  sourceFilename    String
  totalChapters     Int      @default(0)
  processedChapters Int      @default(0)
  mode              String   @default("rule")    // rule|llm
  config            Json                          // 上限、正则覆盖等
  report            Json?                         // 导入报告（统计+清单+置信度）
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model NovelImportChapter {
  id                  String   @id @default(uuid())
  importId            String
  chapterIndex        Int
  title               String?
  status              String   @default("pending") // pending|processing|done|failed
  attempts            Int      @default(0)
  lastError           String?
  extractedEntityCount Int     @default(0)
  @@unique([importId, chapterIndex])
}
```

## 5.6 导入报告（D7 事后审阅）

报告内容：提取了什么（各类型计数+清单）、跳过了什么（降级/忽略项及原因）、置信度分布、消歧合并记录。世界工作区提供：升级轻量条目为全量卡（`POST /novel-imports/:id/upgrade`，写 persona 并将 Asset 置为 `active`，可超过 15 张全量上限）、整体撤销导入（报告 ID + `Asset.data.importId` 孤儿扫描）。世界层写到一半失败时报告仍保留已落库 ID，可 retry 幂等续写。单条删除走 Inspector 常规删除。

---

# 6. Part C — 角色扮演 Agent（时间锚定）

## 6.1 新上下文

```
apps/api/src/contexts/roleplay/
  roleplay-agent.ts          // 扮演 Agent（新 system prompt：语气/口癖/情感状态模仿）
  character-state-builder.ts // 时间锚定角色状态组装器
  prompts/roleplay.md        // 提示词模板（从 md 文件加载，沿用 agent/ 惯例）
```

## 6.2 时间锚定状态组装（差异化核心）

```
用户在世界工作区：选角色 + 选时间锚点（某 WorldEvent 或「全书读完」）
        ↓
CharacterStateBuilder 组装：
  ├─ 角色卡（Asset 名称/简介/个性/别名；MemoryCore persona 作补充，不覆盖）
  ├─ 用户身份（默认读者；或另一张 Asset 角色卡；或启动时新建「我自己」卡）
  ├─ 该角色在锚点时刻 T 之前的事件经历（WorldEvent 过滤：时间 < T 且角色参与）
  ├─ 时刻 T 的关系快照（Relationship + MemoryAtom validTo ≤ T）
  └─ 认知边界：提示词只含亲历事件；有锚点时若用户问句与锚点之后事件的标题/摘要重叠，此轮强制不知情。不把未来事件列表写入提示词（避免反向剧透）。禁止模型用外部作品知识补全。
        ↓
RoleplayAgent（SSE 流式，复用 Creator Chat 基础设施 + Part D 上下文管理）
        ↓
对话沉淀：用户与角色每次交互 → MemoryAtom（factType=episodic，链接角色实体）
  → 扮演越久，角色对该用户的「记忆」越丰富（三路召回自然带回）
```

时间锚定的依据：CharacterGPT 验证「在剧情特定时刻与角色对话」可显著提升角色一致性，且 Zivith 现有 WorldEvent/时间线架构天然支持时刻过滤。锚点为 null 时角色处于「全书读完」全知状态。有锚点且用户问句命中尚未发生的事件时，此轮不调用生成模型，直接以角色口吻表示不知情（避免预训练知识剧透）。

**硬约束：** 扮演只沉淀 episodic 记忆，不创建或修改世界层实体。反写须走 World Builder 提案（ADR-0010 / ADR-0015）。

## 6.3 数据模型

```prisma
model RoleplayThread {
  id                  String   @id @default(uuid())
  projectId           String
  characterAssetId    String                 // 扮演的角色的 Asset
  userCharacterAssetId String?               // 用户扮演谁；null = 读者
  threadId            String                 // 复用对话线程（SSE/上下文管理共用）
  anchoredWorldEventId String?               // 时间锚点（null = 全书读完状态）
  status              String   @default("active")
  createdAt           DateTime @default(now())
  @@index([projectId, characterAssetId])
}
```

## 6.4 Mock 降级

无密钥时：模板化应答器——引用角色卡要点 + 锚点事件做结构化拼接回复（保证全链路可跑通），UI 标注「降级模式」。有密钥时完整扮演。

---

# 7. API 概要

沿用世界路由免登录前缀（ADR-0013）+ snake_case 序列化钩子：

```
POST   /api/v1/memory/search              # 三路混合检索（调试/面板用）
GET    /api/v1/memory/projects/:id/atoms  # 记忆面板：分页浏览 L1
GET    /api/v1/memory/projects/:id/cores  # 记忆面板：浏览 L2
DELETE /api/v1/memory/atoms/:id           # 记忆面板：删除（软删→invalidated）
POST   /api/v1/memory/rebuild             # 向量库重建

POST   /api/v1/novel-imports              # 上传并启动导入（multipart）
GET    /api/v1/novel-imports/:id          # 报告 + 章摘要（不含原文）
POST   /api/v1/novel-imports/:id/retry    # 失败章节重试
DELETE /api/v1/novel-imports/:id          # 整体撤销导入
POST   /api/v1/novel-imports/:id/upgrade  # 轻量条目升级为全量卡

POST   /api/v1/roleplay/threads           # 开启扮演对话（角色+锚点）
GET    /api/v1/roleplay/threads/:id/messages/stream   # SSE（复用现有流式协议）
```

## 8. UI 范围（D5 最小可见性）

1. **对话流内嵌记忆状态**：当轮 SSE 追加 `memory_ops` 摘要（「已归档 3 条事实 · 合并 1 条重复 · 发现 1 个冲突」），冲突项内联确认卡片（复用 H9 冲突 UI 样式）；
2. **世界工作区记忆面板**：右侧 Inspector 区新增「记忆」标签页——L1 原子列表（按实体过滤）+ L2 核心块（可展开溯源到 sourceAtomIds），支持删除；
3. **小说导入入口**：世界工作区「导入小说」按钮 → 上传 → 报告页；失败时显示失败章与「重试失败章节」（`POST /novel-imports/:id/retry`，从首个未完成章继续，同章最多 3 次）。本轮仍为同步抽取，不做进度轮询。文本解码优先 UTF-8，非法 UTF-8 回退 GB18030（Windows 记事本 ANSI/GBK）；规则抽取对人名/地点停用词过滤（避免「没有 / 忽然 / 一个 / 没人 / 你这」误判为角色）、剥「说/问」粘连、语气尾巴（轻声/忽然）与「路明非心」类碎片别名；虚词拼词不进卡；头衔（舰长/神官）与「某某先生」残片（尔特先生）不进卡；地点规范化后出现 ≥3 次才入库；轻量卡提及 ≥5 次；事件标题为「谁 · 做了什么」，每章最多 2 条。切章保留开篇、允许数字两侧空格与【】包裹。源文件若从第 2 章起则没有第 1 章，不是切章器吞章；原文存在 `config.sourceText`，接口不回传。此次导入之前的记录若没有原文则无法 retry，需重新上传。时间轴按章序，早章回叙提及仍会靠前。
4. **扮演入口**：实体浏览器中角色卡片「与此角色对话」+ 时间锚点选择器 + **用户身份**（默认读者 / 选已有角色卡 / 新建一张当自己）。对话顶栏在扮演线程里同样可切换「你是谁」（与「扮演：对面是谁」分开）。扮演线程复用 Creator Chat 消息层，侧栏单独「角色」Tab 列出（按所属世界分组），不与世界构建历史混排。新建「我自己」走 Asset 创建（`tags: ['user_self']`，显式用户动作），不是扮演 Agent 写世界层。复用线程时匹配 AI 角色 + 用户身份 + 锚点。

不新建独立顶级页面（不做完整记忆中心——YAGNI，D5 已确认）。

---

# 9. 错误处理

| 故障 | 处理 |
|---|---|
| LLM 提炼失败（异步路径） | MemoryPipelineState.attempts++，失败 3 次标 `failed`；规则产出已存在，服务不中断 |
| 导入章节失败 | NovelImportChapter 同款重试计数（上限 3）；断点续传从首个未完成章继续；可手动 `POST /novel-imports/:id/retry`。全部章成功前不写世界层。世界层写到一半失败时报告保留已落库 ID（`failed_stage=world_write`），retry 幂等续写；撤销按报告 ID + Asset.data.importId 扫孤儿 |
| 向量库文件损坏 | 检测打开失败 → 提示重建 → 从 MemoryAtom 全量重建 |
| Embedding 密钥缺失 | 该消息向量跳过（BM25 仍可检索），密钥配置后可补齐（rebuild 覆盖） |
| SSE 中断 | 现有重连机制不变；记忆管线已落库部分不回滚 |

# 10. 测试策略

- **单元**：指纹归一化（全半角/简繁/标点）、清洗决策表全分支、章节切分正则（含兜底分块）、实体消歧合并、token 估算启发式、时间锚定过滤（T 前事件/认知边界）、BM25 检索；
- **集成**（mock 双轨端到端）：无密钥全流程（对话→归档→BM25 召回→压缩摘要）；有密钥路径用 LLM mock adapter 覆盖 schema 契约；导入→报告→撤销级联；
- **验收**：导入一段公版小说选段（《西游记》前 10 回），验证：≥8 个主要角色成卡、场景/事件/关系落库、时间线可锚定、扮演对话认知边界正确（问「未来」事件角色应不知情）。

# 11. 实施里程碑

```
M1（A+D）记忆地基 + 上下文管理器    ← 同期落地，互为依赖
   模型迁移 / MemoryPort / 同步快速路径 / 队列深加工 / 三路召回 / ThreadContextState 压缩
M2（B）小说导入
   上传切分 / 批量摄取 / 消歧分层 / 导入报告 / 撤销
M3（C）角色扮演 Agent
   RoleplayThread / CharacterStateBuilder / 扮演提示词 / 认知边界 / 情节记忆沉淀
```

每个里程碑独立可交付、可验收；M1 完成后 Creator Chat 即获得长期记忆与压缩能力。

# 12. 需要的新 ADR

- **ADR-0014 分层记忆系统**：三层记忆、PG 事实源 + 本地向量派生索引、混合制写入边界；**已接受 2026-08-23**。
- **ADR-0015 小说导入即批量记忆摄取**：导入预授权写入 + 整体撤销语义；**已接受 2026-08-30**。
- 扮演 Agent 的世界写入：**产品宪法要求**可提议事件 / 记忆 / 关系 / 世界状态，用户确认后写入。2026-08 实现默认不反写世界层，现视为 Journey E 缺口，不再是禁令。静默写库仍禁止（[ADR-0010](../architecture/adr/0010-creator-chat-is-the-world-first-continuous-conversation-surface.md)）。见 [AI-Agent-Collaboration.md](../domain/AI-Agent-Collaboration.md) §2.3。
