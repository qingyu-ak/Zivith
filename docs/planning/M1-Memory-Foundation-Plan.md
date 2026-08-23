# M1 记忆地基 + 上下文管理器 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Creator Chat 落地分层长期记忆（L0 原文 / L1 原子 / L2 核心）与动态上下文窗口管理（滚动摘要 + 预算分配），全链路 mock-first 可跑。

**Architecture:** PostgreSQL 为唯一事实源（4 张新表），本地 sqlite 文件为可重建的向量派生索引；同步规则快速路径（抽取→清洗→归档→SSE 反馈）+ 队列驱动的异步深加工（LLM 精炼→L2 聚合→向量化）；三路混合召回（实体链接 + 向量 + 关键词 bigram）注入 Agent prompt；ThreadContextState 按预算压缩历史。

**Tech Stack:** Prisma + PostgreSQL、better-sqlite3（本地向量库）、zod、BullMQ/InMemoryQueue（复用 QueuePort）、vitest。

**设计依据:** [Memory-Novel-Roleplay-Design.md](Memory-Novel-Roleplay-Design.md) §3（Part A）、§4（Part D）、§9–10。

**范围边界（M1 不做）:** 小说导入（M2）、角色扮演（M3）、SiliconFlow 真实 embedding 适配器（M2；M1 用 bigram 哈希 Mock 向量，词法检索仍有效）、冲突清单持久化（M1 仅 SSE 反馈）、实体别名消歧（M1 只匹配主名）。

**关键实现取舍（对设计文档的细化）:**
- 向量库为每项目一个 sqlite 文件（`data/memory-vectors/<projectId>.sqlite`），连接按项目缓存；
- 关键词召回用「中文字符 bigram + Jaccard」在 JS 内计算（不依赖 FTS5 中文分词）；
- Mock embedding = bigram 哈希 128 维归一化向量（确定性、可测试、词法语义）；
- 无 project 的线程跳过记忆（M1 简化：记忆挂在项目世界下）；
- 规则冲突（反义词对命中）不写入 L1，仅在当轮 ingest 返回值上报；
- L2 聚合按 `(entityType, entityId)` 分组，kind 映射：character→persona、project→world_rule、world_event→event_chain、其余→scenario。

---

## 文件结构总览

```
packages/database/prisma/schema.prisma                        [改] 4 张新表
packages/database/prisma/migrations/<ts>_memory_foundation_m1 [新] 迁移
packages/domain/src/memory.ts                                 [新] zod 契约 + 纯文本工具
packages/domain/src/index.ts                                  [改] 导出
apps/api/src/ports/index.ts                                   [改] EmbeddingPort + memory_refine 任务类型
apps/api/src/contexts/memory/
  fingerprint.ts        [新] dedupHash（sha256）
  extract.ts            [新] 规则抽取（切句/factType/实体链接）
  cleaning.ts           [新] 清洗决策表（NOOP/CONFLICT/UPDATE/ADD）
  store.ts              [新] MemoryStore 窄接口 + 记录类型
  prisma-store.ts       [新] Prisma 实现
  service.ts            [新] MemoryService（ingest/retrieve/processRefine/上下文管理）
  pipeline.ts           [新] LLM 精炼 prompt + schema
  retrieval.ts          [新] 三路召回 + RRF 融合 + digest 格式化
  context-window.ts     [新] token 估算/预算窗口/摘要压缩
  queue-runtime.ts      [新] createMemoryQueueRuntime（镜像 generation 模式）
apps/api/src/adapters/memory/
  mock-embedding.ts     [新] MockEmbeddingAdapter
  local-vector-store.ts [新] LocalVectorStore（better-sqlite3）
apps/api/src/routes/memory.ts                                 [新] 记忆 API
apps/api/src/routes/world.ts                                  [改] ingest 接线 + memory SSE 事件 + 预算历史
apps/api/src/contexts/world-builder/prompt.ts                 [改] 相关记忆 prompt 段
apps/api/src/contexts/world-builder/world-builder-agent.ts    [改] memoryDigest 输入
apps/api/src/app.ts                                           [改] memory 注册
apps/api/src/server.ts                                        [改] 运行时接线
apps/web/lib/api.ts                                           [改] memory 事件透传
apps/web/components/creator-chat/chat-panel.tsx               [改] 记忆状态展示
apps/web/components/world/memory-panel.tsx                    [新] 记忆面板
apps/web/components/world/world-workspace.tsx                 [改] 挂载面板
docs/architecture/adr/0014-layered-memory-system.md           [新] ADR
docs/planning/Development-Log.md                              [改] 日志
```

**测试文件**（全部无 DB，纯函数 + fake store）：`test/memory-fingerprint.test.ts`、`test/memory-extract.test.ts`、`test/memory-cleaning.test.ts`、`test/memory-mock-embedding.test.ts`、`test/memory-vector-store.test.ts`、`test/memory-service.test.ts`、`test/memory-retrieval.test.ts`、`test/memory-context-window.test.ts`

**命令约定**：API 测试 `pnpm --filter @zivith/api test test/<file>.test.ts`；类型检查 `pnpm --filter @zivith/api typecheck`；迁移 `pnpm --filter @zivith/database db:migrate -- --name memory_foundation_m1`（需本地 Postgres 在跑，未启动先 `docker compose up -d postgres`）。

---

### Task 1: Prisma 模型与迁移

**Files:**
- Modify: `packages/database/prisma/schema.prisma`（文件末尾追加）
- Create: `packages/database/prisma/migrations/<ts>_memory_foundation_m1/migration.sql`（prisma 生成）

- [ ] **Step 1: 在 schema.prisma 末尾追加 4 个模型**

```prisma
// Track M1 — 分层记忆（docs/planning/Memory-Novel-Roleplay-Design.md §3.2）
// L1 原子记忆：从对话提炼的最小事实单元，PG 为唯一事实源。
model MemoryAtom {
  id              String    @id @default(uuid())
  projectId       String    @map("project_id")
  threadId        String?   @map("thread_id")
  sourceMessageId String?   @map("source_message_id")
  entityType      String?   @map("entity_type")
  entityId        String?   @map("entity_id")
  factType        String    @map("fact_type")
  content         String
  confidence      Float     @default(0.7)
  dedupHash       String    @map("dedup_hash")
  memoryOp        String    @default("ADD") @map("memory_op")
  status          String    @default("active")
  supersededById  String?   @map("superseded_by_id")
  validFrom       DateTime  @default(now()) @map("valid_from")
  validTo         DateTime? @map("valid_to")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  @@index([projectId, entityType, entityId])
  @@index([projectId, status, validTo])
  @@index([dedupHash])
  @@map("memory_atoms")
}

// L2 核心记忆：分主题凝练知识块（persona/scenario/world_rule/event_chain）。
model MemoryCore {
  id            String   @id @default(uuid())
  projectId     String   @map("project_id")
  kind          String
  topic         String
  content       String
  version       Int      @default(1)
  sourceAtomIds String[] @default([]) @map("source_atom_ids")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@index([projectId, kind, topic])
  @@map("memory_cores")
}

// L0 管线状态：每条消息的记忆处理进度（断点续传单位）。
model MemoryPipelineState {
  messageId      String    @id @map("message_id")
  level1At       DateTime? @map("level_1_at")
  extractionMode String    @default("rule") @map("extraction_mode")
  status         String    @default("pending")
  attempts       Int       @default(0)
  lastError      String?   @map("last_error")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  @@map("memory_pipeline_states")
}

// 线程级上下文状态：滚动摘要 + 压缩进度（Creator Chat 与未来扮演线程共用）。
model ThreadContextState {
  threadId                 String   @id @map("thread_id")
  rollingSummary           String   @default("") @map("rolling_summary")
  summarizedUntilMessageId String?  @map("summarized_until_message_id")
  summaryVersion           Int      @default(1) @map("summary_version")
  tokenEstimate            Int      @default(0) @map("token_estimate")
  updatedAt                DateTime @updatedAt @map("updated_at")

  @@map("thread_context_states")
}
```

- [ ] **Step 2: 生成迁移**

Run: `pnpm --filter @zivith/database db:migrate -- --name memory_foundation_m1`
Expected: 生成 `prisma/migrations/<时间戳>_memory_foundation_m1/migration.sql`（4 张表 + 索引），`prisma generate` 自动执行。

- [ ] **Step 3: 验证类型**

Run: `pnpm --filter @zivith/api typecheck`
Expected: PASS（新表类型进入 PrismaClient）。

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma
git commit -m "feat(memory): add layered memory tables (atoms/cores/pipeline/context-state)"
```

---

### Task 2: Domain 契约与纯文本工具

**Files:**
- Create: `packages/domain/src/memory.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: 写 packages/domain/src/memory.ts**

```ts
import { z } from 'zod';

/**
 * 分层记忆契约（docs/planning/Memory-Novel-Roleplay-Design.md §3）。
 * 纯文本工具不依赖 node:crypto，可跨端复用；指纹哈希在 API 侧实现。
 */

export const memoryFactTypeSchema = z.enum([
  'trait', 'desire', 'event', 'relation', 'rule', 'preference', 'constraint', 'episodic',
]);
export type MemoryFactType = z.infer<typeof memoryFactTypeSchema>;

export const memoryOpSchema = z.enum(['ADD', 'UPDATE', 'NOOP', 'CONFLICT']);
export type MemoryOp = z.infer<typeof memoryOpSchema>;

export const memoryAtomStatusSchema = z.enum(['active', 'merged', 'superseded', 'invalidated']);
export type MemoryAtomStatus = z.infer<typeof memoryAtomStatusSchema>;

export const memoryEntityTypeSchema = z.enum([
  'character', 'location', 'world_event', 'scene', 'story', 'project', 'relationship',
]);
export type MemoryEntityType = z.infer<typeof memoryEntityTypeSchema>;

export const memoryCoreKindSchema = z.enum(['persona', 'scenario', 'world_rule', 'event_chain']);
export type MemoryCoreKind = z.infer<typeof memoryCoreKindSchema>;

export const memoryAtomSchema = z
  .object({
    id: z.string().min(1),
    project_id: z.string().min(1),
    thread_id: z.string().nullable(),
    source_message_id: z.string().nullable(),
    entity_type: memoryEntityTypeSchema.nullable(),
    entity_id: z.string().nullable(),
    fact_type: memoryFactTypeSchema,
    content: z.string().min(1).max(2_000),
    confidence: z.number().min(0).max(1),
    dedup_hash: z.string().min(8),
    memory_op: memoryOpSchema,
    status: memoryAtomStatusSchema,
    superseded_by_id: z.string().nullable(),
    valid_from: z.string(),
    valid_to: z.string().nullable(),
    created_at: z.string(),
  })
  .strict();
export type MemoryAtomDTO = z.infer<typeof memoryAtomSchema>;

export const memoryCoreSchema = z
  .object({
    id: z.string().min(1),
    project_id: z.string().min(1),
    kind: memoryCoreKindSchema,
    topic: z.string().min(1).max(200),
    content: z.string().min(1),
    version: z.number().int().min(1),
    source_atom_ids: z.array(z.string()).max(2_000),
    updated_at: z.string(),
  })
  .strict();
export type MemoryCoreDTO = z.infer<typeof memoryCoreSchema>;

export const memoryConflictSchema = z
  .object({
    content: z.string(),
    existing_content: z.string(),
    antonym: z.tuple([z.string(), z.string()]),
  })
  .strict();
export type MemoryConflict = z.infer<typeof memoryConflictSchema>;

export const memoryIngestOpsSchema = z
  .object({
    added: z.number().int(),
    updated: z.number().int(),
    noop: z.number().int(),
    conflicts: z.array(memoryConflictSchema).max(20),
  })
  .strict();
export type MemoryIngestOps = z.infer<typeof memoryIngestOpsSchema>;

export const retrievedMemorySchema = z
  .object({
    source: z.enum(['atom', 'core']),
    id: z.string(),
    content: z.string(),
    entity_type: z.string().nullable(),
    entity_id: z.string().nullable(),
    fact_type: z.string().nullable(),
  })
  .strict();
export type RetrievedMemory = z.infer<typeof retrievedMemorySchema>;

// ---------------------------------------------------------------------------
// 纯文本工具（指纹归一 / 相似度分词 / Jaccard）
// ---------------------------------------------------------------------------

/** 去空白标点 + NFKC + ASCII 小写。 */
export function normalizeForFingerprint(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\s\u3000]+/g, '')
    .replace(
      /[。，、；：？！“”‘’（）《》【】〔〕…—·,.:;?!"'`()\[\]{}<>@#$%^&*_+=/\\|~]/g,
      '',
    )
    .toLowerCase();
}

/** 中文字符 bigram + ASCII/数字词（相似度与关键词召回共用）。 */
export function tokenizeForSimilarity(text: string): string[] {
  const normalized = normalizeForFingerprint(text);
  const tokens: string[] = [];
  for (const run of normalized.match(/[\u4e00-\u9fa5]+/g) ?? []) {
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
  }
  tokens.push(...(normalized.match(/[a-z0-9]+/g) ?? []));
  return tokens;
}

/** Jaccard 相似度（0–1），任一侧为空返回 0。 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}
```

- [ ] **Step 2: packages/domain/src/index.ts 追加**

```ts
export * from './memory.js';
```

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @zivith/api typecheck`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src
git commit -m "feat(memory): add domain contracts and text similarity utilities"
```

---

### Task 3: 去重指纹模块

**Files:**
- Create: `apps/api/src/contexts/memory/fingerprint.ts`
- Test: `apps/api/test/memory-fingerprint.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// apps/api/test/memory-fingerprint.test.ts
import { describe, expect, it } from 'vitest';
import { computeDedupHash } from '../src/contexts/memory/fingerprint.js';
import { jaccardSimilarity, tokenizeForSimilarity } from '@zivith/domain';

describe('computeDedupHash', () => {
  it('normalizes punctuation and whitespace before hashing', () => {
    const a = computeDedupHash({ entityType: 'character', entityId: 'c1', factType: 'trait', content: '林澈，性格冷静！' });
    const b = computeDedupHash({ entityType: 'character', entityId: 'c1', factType: 'trait', content: '林澈 性格冷静' });
    expect(a).toBe(b);
  });

  it('differs by entity and fact type', () => {
    const base = { entityType: 'character', entityId: 'c1', factType: 'trait', content: '性格冷静' } as const;
    expect(computeDedupHash(base)).not.toBe(computeDedupHash({ ...base, entityId: 'c2' }));
    expect(computeDedupHash(base)).not.toBe(computeDedupHash({ ...base, factType: 'desire' as const }));
  });
});

describe('tokenizeForSimilarity + jaccard', () => {
  it('near-duplicates score high, unrelated score low', () => {
    const a = tokenizeForSimilarity('林澈是一名冷静的凡人弟子');
    const b = tokenizeForSimilarity('林澈是冷静的凡人弟子');
    const c = tokenizeForSimilarity('卡塞尔学院位于美国芝加哥');
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.8);
    expect(jaccardSimilarity(a, c)).toBeLessThan(0.2);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @zivith/api test test/memory-fingerprint.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
// apps/api/src/contexts/memory/fingerprint.ts
import { createHash } from 'node:crypto';
import { normalizeForFingerprint } from '@zivith/domain';

/** 规范化指纹：entityType|entityId|factType|归一化内容 的 sha256。 */
export function computeDedupHash(input: {
  entityType: string | null;
  entityId: string | null;
  factType: string;
  content: string;
}): string {
  const normalized = normalizeForFingerprint(input.content);
  return createHash('sha256')
    .update(`${input.entityType ?? ''}|${input.entityId ?? ''}|${input.factType}|${normalized}`)
    .digest('hex');
}
```

- [ ] **Step 4: 运行测试通过**

Run: `pnpm --filter @zivith/api test test/memory-fingerprint.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/memory/fingerprint.ts apps/api/test/memory-fingerprint.test.ts
git commit -m "feat(memory): normalized dedup fingerprint"
```

---

### Task 4: 规则原子抽取

**Files:**
- Create: `apps/api/src/contexts/memory/extract.ts`
- Test: `apps/api/test/memory-extract.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// apps/api/test/memory-extract.test.ts
import { describe, expect, it } from 'vitest';
import type { WorldContext } from '../src/contexts/world-builder/world-context.js';
import {
  detectFactType,
  extractCandidateAtoms,
  linkEntities,
  splitStatements,
} from '../src/contexts/memory/extract.js';

const world: WorldContext = {
  projectId: 'p1',
  projectName: '测试世界',
  worldview: { rules: [] },
  stories: [],
  characters: [
    { id: 'c1', name: '林澈', description: null, tags: [] },
    { id: 'c2', name: '艾拉', description: null, tags: [] },
  ],
  locations: [{ id: 'l1', name: '青云宗', description: null, tags: [] }],
  scenes: [],
  worldEvents: [{ id: 'e1', title: '开宗大典', description: null, order: 1 }],
  relationships: [],
};

describe('splitStatements', () => {
  it('splits on sentence boundaries and drops short fragments', () => {
    expect(splitStatements('林澈性格冷静。艾拉是执事！好。')).toEqual([
      '林澈性格冷静。',
      '艾拉是执事！',
    ]);
  });
});

describe('detectFactType', () => {
  it('classifies common patterns', () => {
    expect(detectFactType('林澈和艾拉是师徒关系')).toBe('relation');
    expect(detectFactType('魔法必须消耗生命值')).toBe('rule');
    expect(detectFactType('林澈渴望成为仙人')).toBe('desire');
    expect(detectFactType('青云宗发生了叛乱')).toBe('event');
    expect(detectFactType('林澈喜欢喝清茶')).toBe('preference');
    expect(detectFactType('言灵的代价是失明')).toBe('constraint');
    expect(detectFactType('林澈性格冷静，为人低调')).toBe('trait');
    expect(detectFactType('今天聊了很多')).toBe('episodic');
  });
});

describe('linkEntities', () => {
  it('links the entity with most name hits', () => {
    expect(linkEntities('林澈去了青云宗，林澈很高兴', world)).toMatchObject({
      entityId: 'c1',
      entityType: 'character',
    });
  });

  it('returns null when nothing matches', () => {
    expect(linkEntities('随便聊聊', world)).toBeNull();
  });
});

describe('extractCandidateAtoms', () => {
  it('extracts, classifies and links atoms; drops predicate-less chit-chat', () => {
    const atoms = extractCandidateAtoms('林澈性格冷静。他渴望成为仙人。嗯嗯。', world);
    expect(atoms).toHaveLength(2);
    expect(atoms[0]).toMatchObject({ factType: 'trait', linked: { entityId: 'c1' } });
    expect(atoms[1]).toMatchObject({ factType: 'desire' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @zivith/api test test/memory-extract.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 src/contexts/memory/extract.ts**

```ts
import type { MemoryEntityType, MemoryFactType } from '@zivith/domain';
import type { WorldContext } from '../world-builder/world-context.js';
import { normalizeEntityName } from '../world-builder/conflict-detector.js';

/** 按中英文句读切句，过滤过短片段，上限 40 句。 */
export function splitStatements(text: string): string[] {
  return text
    .split(/(?<=[。！？!?；;\n])/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && part.length <= 500)
    .slice(0, 40);
}

const FACT_TYPE_RULES: Array<{ type: MemoryFactType; pattern: RegExp }> = [
  { type: 'relation', pattern: /(师徒|恋人|情侣|宿敌|敌人|挚友|同伴|兄弟|姐妹|父子|母女|夫妇|夫妻|师兄弟|结拜|关系)/ },
  { type: 'rule', pattern: /(规则|力量体系|世界法则|设定上|必须|禁止|修炼需要|魔法需要)/ },
  { type: 'desire', pattern: /(目标|想要|渴望|希望|梦想|立志|目的是|为了成为)/ },
  { type: 'event', pattern: /(发生了|爆发|战争|大战|事件|事故|去世|死了|诞生|成立|毁灭|背叛|叛乱|大典)/ },
  { type: 'preference', pattern: /(喜欢|讨厌|偏爱|最爱|不爱|忌口|习惯于)/ },
  { type: 'constraint', pattern: /(限制|上限|代价|副作用|弱点|克星|禁忌)/ },
  { type: 'trait', pattern: /(性格|脾气|外貌|长相|身份|职业|身高|年龄|冷静|热血|善良|邪恶|开朗|阴郁|沉默|幽默|认真|是一名|是个)/ },
];

/** 规则事实分类（M1 规则路径；异步 LLM 深加工会修正）。 */
export function detectFactType(statement: string): MemoryFactType {
  for (const rule of FACT_TYPE_RULES) {
    if (rule.pattern.test(statement)) return rule.type;
  }
  return 'episodic';
}

export interface LinkedEntity {
  entityType: MemoryEntityType;
  entityId: string;
  name: string;
  hits: number;
}

function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

/** 实体链接：命中名字次数最多者为该原子主实体（平局取名字更长者）。 */
export function linkEntities(text: string, world: WorldContext | null): LinkedEntity | null {
  if (!world) return null;
  const candidates: LinkedEntity[] = [];
  const consider = (entityType: MemoryEntityType, entityId: string, name: string) => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    const hits = countOccurrences(text, trimmed);
    if (hits > 0) candidates.push({ entityType, entityId, name: trimmed, hits });
  };
  for (const character of world.characters) consider('character', character.id, character.name);
  for (const location of world.locations) consider('location', location.id, location.name);
  for (const event of world.worldEvents) consider('world_event', event.id, event.title);
  for (const story of world.stories) consider('story', story.id, story.title);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.hits - a.hits || b.name.length - a.name.length);
  return candidates[0] ?? null;
}

const STATEMENT_PREDICATE = /(是|有|叫|为|会|能|属于|发生|位于|喜欢|想要|成为|在)/;

export interface CandidateAtom {
  content: string;
  factType: MemoryFactType;
  linked: LinkedEntity | null;
}

/** 同步快速路径的规则抽取：切句 → 分类 → 实体链接。 */
export function extractCandidateAtoms(
  text: string,
  world: WorldContext | null,
): CandidateAtom[] {
  const atoms: CandidateAtom[] = [];
  for (const statement of splitStatements(text)) {
    const linked = linkEntities(statement, world);
    if (!linked && !STATEMENT_PREDICATE.test(statement)) continue;
    atoms.push({ content: statement, factType: detectFactType(statement), linked });
  }
  return atoms;
}

/** 实体名 → id 解析（LLM 精炼回填实体链接用）。 */
export function resolveEntityByName(
  name: string,
  world: WorldContext | null,
): LinkedEntity | null {
  if (!world) return null;
  const target = normalizeEntityName(name);
  if (!target) return null;
  const pools: Array<{ items: Array<{ id: string; name: string }>; type: MemoryEntityType }> = [
    { items: world.characters, type: 'character' },
    { items: world.locations, type: 'location' },
    { items: world.worldEvents.map((event) => ({ id: event.id, name: event.title })), type: 'world_event' },
  ];
  for (const pool of pools) {
    for (const item of pool.items) {
      if (normalizeEntityName(item.name) === target) {
        return { entityType: pool.type, entityId: item.id, name: item.name, hits: 1 };
      }
    }
  }
  return null;
}
```

注：`normalizeEntityName` 已从 [conflict-detector.ts](../../apps/api/src/contexts/world-builder/conflict-detector.ts) 导出（world-builder-agent.ts 同款用法）；若签名不同以现有代码为准。

- [ ] **Step 4: 运行测试通过**

Run: `pnpm --filter @zivith/api test test/memory-extract.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/memory/extract.ts apps/api/test/memory-extract.test.ts
git commit -m "feat(memory): rule-based atom extraction with entity linking"
```

---

### Task 5: 清洗决策表

**Files:**
- Create: `apps/api/src/contexts/memory/cleaning.ts`
- Test: `apps/api/test/memory-cleaning.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// apps/api/test/memory-cleaning.test.ts
import { describe, expect, it } from 'vitest';
import { decideAtomAction } from '../src/contexts/memory/cleaning.js';

const incoming = { dedupHash: 'h-new', content: '林澈性格冷静', factType: 'trait' };

describe('decideAtomAction', () => {
  it('NOOP on exact fingerprint duplicate', () => {
    expect(
      decideAtomAction({
        incoming: { ...incoming, dedupHash: 'h-1' },
        candidates: [{ atom: { id: 'a1', content: '林澈性格冷静。', dedupHash: 'h-1' }, similarity: 0.5 }],
      }),
    ).toEqual({ op: 'NOOP', reason: 'duplicate' });
  });

  it('CONFLICT on antonym clash', () => {
    expect(
      decideAtomAction({
        incoming,
        candidates: [{ atom: { id: 'a1', content: '林澈性格阴郁', dedupHash: 'h-1' }, similarity: 0.3 }],
      }),
    ).toMatchObject({ op: 'CONFLICT', conflictAtomId: 'a1' });
  });

  it('UPDATE merges near-duplicate (similarity >= 0.85)', () => {
    expect(
      decideAtomAction({
        incoming: { ...incoming, content: '林澈性格冷静，为人低调' },
        candidates: [{ atom: { id: 'a1', content: '林澈性格冷静', dedupHash: 'h-1' }, similarity: 0.9 }],
      }),
    ).toEqual({ op: 'UPDATE', supersedeAtomId: 'a1' });
  });

  it('ADD when nothing matches; conflict wins over merge', () => {
    expect(decideAtomAction({ incoming, candidates: [] })).toEqual({ op: 'ADD' });
    expect(
      decideAtomAction({
        incoming,
        candidates: [{ atom: { id: 'a1', content: '林澈性格阴郁', dedupHash: 'h-1' }, similarity: 0.86 }],
      }),
    ).toMatchObject({ op: 'CONFLICT' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @zivith/api test test/memory-cleaning.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 src/contexts/memory/cleaning.ts**

```ts
/**
 * 清洗决策表（设计文档 §3.3）：
 * 指纹一致 → NOOP；反义词冲突 → CONFLICT（不写入，上报）；
 * 语义近似（≥0.85）→ UPDATE（旧原子 superseded）；否则 ADD。
 * 入参 candidates 必须已按同 (entityType, entityId, factType) 过滤。
 */

export const SIMILARITY_MERGE_THRESHOLD = 0.85;

/** 规则模式的「矛盾强度 1.0」信号：同域反义词对。 */
export const ANTONYM_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['开朗', '阴郁'], ['善良', '邪恶'], ['冷静', '暴躁'], ['活泼', '沉默'],
  ['友好', '敌对'], ['乐观', '悲观'], ['温柔', '粗暴'], ['忠诚', '背叛'],
  ['生', '死'], ['爱', '恨'], ['强大', '弱小'], ['富有', '贫穷'],
];

export interface CleaningCandidate {
  atom: { id: string; content: string; dedupHash: string };
  similarity: number;
}

export type CleaningDecision =
  | { op: 'NOOP'; reason: 'duplicate' }
  | { op: 'CONFLICT'; conflictAtomId: string; antonym: readonly [string, string] }
  | { op: 'UPDATE'; supersedeAtomId: string }
  | { op: 'ADD' };

function findAntonymClash(a: string, b: string): readonly [string, string] | null {
  for (const pair of ANTONYM_PAIRS) {
    const [x, y] = pair;
    if ((a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x))) return pair;
  }
  return null;
}

export function decideAtomAction(input: {
  incoming: { dedupHash: string; content: string; factType: string };
  candidates: CleaningCandidate[];
}): CleaningDecision {
  for (const candidate of input.candidates) {
    if (candidate.atom.dedupHash === input.incoming.dedupHash) {
      return { op: 'NOOP', reason: 'duplicate' };
    }
  }
  for (const candidate of input.candidates) {
    const antonym = findAntonymClash(input.incoming.content, candidate.atom.content);
    if (antonym) return { op: 'CONFLICT', conflictAtomId: candidate.atom.id, antonym };
  }
  for (const candidate of input.candidates) {
    if (candidate.similarity >= SIMILARITY_MERGE_THRESHOLD) {
      return { op: 'UPDATE', supersedeAtomId: candidate.atom.id };
    }
  }
  return { op: 'ADD' };
}
```

- [ ] **Step 4: 运行测试通过**

Run: `pnpm --filter @zivith/api test test/memory-cleaning.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/memory/cleaning.ts apps/api/test/memory-cleaning.test.ts
git commit -m "feat(memory): cleaning decision table (noop/conflict/merge/add)"
```

---

### Task 6: EmbeddingPort 与 Mock 适配器

**Files:**
- Modify: `apps/api/src/ports/index.ts`
- Create: `apps/api/src/adapters/memory/mock-embedding.ts`
- Test: `apps/api/test/memory-mock-embedding.test.ts`

- [ ] **Step 1: ports/index.ts 两处修改**

`QueueJobType` 联合类型追加成员（保持既有顺序，加在最后）：

```ts
export type QueueJobType =
  | 'prompt_construct'
  | 'image_generate'
  | 'video_generate'
  | 'workflow_step'
  | 'review_analysis'
  | 'thumbnail_generate'
  | 'media_process'
  | 'memory_refine';
```

文件末尾追加 EmbeddingPort（与 StoragePort 并列）：

```ts
export interface EmbeddingRequest {
  request_id: string;
  model: string;
  inputs: string[];
}

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  dimensions: number;
}

export interface EmbeddingAdapter {
  readonly provider: string;
  readonly dimensions: number;
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
}
```

- [ ] **Step 2: 写失败测试**

```ts
// apps/api/test/memory-mock-embedding.test.ts
import { describe, expect, it } from 'vitest';
import { MockEmbeddingAdapter } from '../src/adapters/memory/mock-embedding.js';

describe('MockEmbeddingAdapter', () => {
  it('is deterministic and normalized', async () => {
    const adapter = new MockEmbeddingAdapter();
    const { vectors, dimensions } = await adapter.embed({
      request_id: 'r1',
      model: 'm',
      inputs: ['林澈性格冷静', '林澈性格冷静'],
    });
    expect(dimensions).toBe(128);
    expect(vectors[0]).toEqual(vectors[1]);
    const norm = Math.sqrt(vectors[0]!.reduce((sum, x) => sum + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('similar texts score higher than unrelated', async () => {
    const adapter = new MockEmbeddingAdapter();
    const { vectors } = await adapter.embed({
      request_id: 'r2',
      model: 'm',
      inputs: ['林澈是一名冷静的凡人弟子', '林澈是冷静的凡人弟子', '卡塞尔学院位于美国芝加哥'],
    });
    const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i]!, 0);
    expect(dot(vectors[0]!, vectors[1]!)).toBeGreaterThan(dot(vectors[0]!, vectors[2]!));
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm --filter @zivith/api test test/memory-mock-embedding.test.ts`
Expected: FAIL。

- [ ] **Step 4: 实现 src/adapters/memory/mock-embedding.ts**

```ts
import { tokenizeForSimilarity } from '@zivith/domain';
import type { EmbeddingAdapter, EmbeddingRequest, EmbeddingResult } from '../../ports/index.js';

const DIMENSIONS = 128;

/** FNV-1a 32 位哈希（确定性桶分配）。 */
function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Mock embedding：bigram 词频哈希向量（M1 双轨制降级轨）。
 * 无密钥环境下的确定性词法语义向量；真实语义向量由 M2 的 SiliconFlow 适配器提供。
 */
export class MockEmbeddingAdapter implements EmbeddingAdapter {
  readonly provider = 'mock';
  readonly dimensions = DIMENSIONS;

  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    const vectors = request.inputs.map((text) => this.vectorFor(text));
    return { vectors, model: request.model, dimensions: DIMENSIONS };
  }

  private vectorFor(text: string): number[] {
    const vector = new Array<number>(DIMENSIONS).fill(0);
    for (const token of tokenizeForSimilarity(text)) {
      vector[hashToken(token) % DIMENSIONS]! += 1;
    }
    const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0)) || 1;
    return vector.map((x) => x / norm);
  }
}
```

- [ ] **Step 5: 测试 + 类型检查**

Run: `pnpm --filter @zivith/api test test/memory-mock-embedding.test.ts && pnpm --filter @zivith/api typecheck`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/ports/index.ts apps/api/src/adapters/memory apps/api/test/memory-mock-embedding.test.ts
git commit -m "feat(memory): embedding port with deterministic mock adapter"
```

---

### Task 7: 本地向量库（better-sqlite3）

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/adapters/memory/local-vector-store.ts`
- Test: `apps/api/test/memory-vector-store.test.ts`

- [ ] **Step 1: 安装依赖**

Run: `pnpm --filter @zivith/api add better-sqlite3 && pnpm --filter @zivith/api add -D @types/better-sqlite3`
Expected: 安装成功（win32-x64 + Node 22 有预编译二进制）。

- [ ] **Step 2: 写失败测试**

```ts
// apps/api/test/memory-vector-store.test.ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LocalVectorStore } from '../src/adapters/memory/local-vector-store.js';

const dir = mkdtempSync(join(tmpdir(), 'zivith-memory-'));
const store = new LocalVectorStore(dir);

afterAll(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const unit = (n: number): number[] => Array.from({ length: 4 }, (_, i) => (i === n ? 1 : 0));

describe('LocalVectorStore', () => {
  it('upserts and searches by cosine similarity', () => {
    store.upsert('p1', [
      { id: 'a', vector: unit(0) },
      { id: 'b', vector: unit(1) },
      { id: 'c', vector: unit(1) },
    ]);
    const hits = store.search('p1', unit(1), 2);
    expect(hits.map((hit) => hit.id).sort()).toEqual(['b', 'c']);
    expect(hits[0]!.score).toBeCloseTo(1, 5);
  });

  it('isolates projects', () => {
    store.upsert('p2', [{ id: 'x', vector: unit(1) }]);
    expect(store.search('p1', unit(1), 10).map((hit) => hit.id)).not.toContain('x');
  });

  it('removes entries and rebuilds per project', () => {
    store.remove('p1', 'a');
    expect(store.count('p1')).toBe(2);
    store.removeByProject('p1');
    expect(store.count('p1')).toBe(0);
    expect(store.count('p2')).toBe(1);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm --filter @zivith/api test test/memory-vector-store.test.ts`
Expected: FAIL。

- [ ] **Step 4: 实现 src/adapters/memory/local-vector-store.ts**

```ts
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

export interface VectorEntry {
  id: string;
  vector: number[];
}

function float32ToBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

function bufferToFloat32(buffer: Buffer): Float32Array {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 本地向量库：每项目一个 sqlite 文件（data/memory-vectors/<projectId>.sqlite）。
 * 派生索引 — 唯一事实源是 PG 的 memory_atoms，可随时全量重建。
 */
export class LocalVectorStore {
  private readonly connections = new Map<string, Database.Database>();

  constructor(private readonly baseDir: string) {}

  private db(projectId: string): Database.Database {
    let db = this.connections.get(projectId);
    if (!db) {
      mkdirSync(this.baseDir, { recursive: true });
      db = new Database(join(this.baseDir, `${projectId}.sqlite`));
      db.exec(
        'CREATE TABLE IF NOT EXISTS vectors (id TEXT PRIMARY KEY, vector BLOB NOT NULL, updated_at INTEGER NOT NULL)',
      );
      this.connections.set(projectId, db);
    }
    return db;
  }

  upsert(projectId: string, entries: VectorEntry[]): void {
    if (entries.length === 0) return;
    const db = this.db(projectId);
    const stmt = db.prepare(
      'INSERT INTO vectors (id, vector, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET vector = excluded.vector, updated_at = excluded.updated_at',
    );
    const now = Date.now();
    db.transaction(() => {
      for (const entry of entries) {
        stmt.run(entry.id, float32ToBuffer(entry.vector), now);
      }
    })();
  }

  search(projectId: string, query: number[], topK: number): Array<{ id: string; score: number }> {
    const rows = this.db(projectId)
      .prepare('SELECT id, vector FROM vectors')
      .all() as Array<{ id: string; vector: Buffer }>;
    const queryVector = new Float32Array(query);
    return rows
      .map((row) => ({ id: row.id, score: cosine(queryVector, bufferToFloat32(row.vector)) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, topK));
  }

  remove(projectId: string, id: string): void {
    this.db(projectId).prepare('DELETE FROM vectors WHERE id = ?').run(id);
  }

  count(projectId: string): number {
    const row = this.db(projectId).prepare('SELECT COUNT(*) AS n FROM vectors').get() as { n: number };
    return row.n;
  }

  /** 重建入口：清空项目向量（连接保持，文件复用）。 */
  removeByProject(projectId: string): void {
    this.db(projectId).prepare('DELETE FROM vectors').run();
  }

  close(): void {
    for (const db of this.connections.values()) db.close();
    this.connections.clear();
  }
}
```

- [ ] **Step 5: 运行测试通过**

Run: `pnpm --filter @zivith/api test test/memory-vector-store.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/adapters/memory/local-vector-store.ts apps/api/test/memory-vector-store.test.ts
git commit -m "feat(memory): local per-project sqlite vector store"
```

---

### Task 8: MemoryStore + MemoryService.ingest（同步快速路径）

**Files:**
- Create: `apps/api/src/contexts/memory/store.ts`
- Create: `apps/api/src/contexts/memory/prisma-store.ts`
- Create: `apps/api/src/contexts/memory/service.ts`（本 Task 先实现 `ingest`/`attachQueue`/`listAtoms`/`listCores`/`invalidateAtom`/`rebuildVectors`；`retrieve`/`processRefine`/上下文方法在 Task 9/10/11 补齐——先以占位方法签名存在避免类型错误）
- Test: `apps/api/test/memory-service.test.ts`

- [ ] **Step 1: 写 store.ts（窄接口 + 记录类型）**

```ts
// apps/api/src/contexts/memory/store.ts
import type { WorldContext } from '../world-builder/world-context.js';

/** L1/L2/管线/上下文状态的持久化窄接口（单元测试用内存 fake 替代）。 */
export interface MemoryAtomRecord {
  id: string;
  projectId: string;
  threadId: string | null;
  sourceMessageId: string | null;
  entityType: string | null;
  entityId: string | null;
  factType: string;
  content: string;
  confidence: number;
  dedupHash: string;
  memoryOp: string;
  status: string;
  supersededById: string | null;
  validFrom: Date;
  validTo: Date | null;
  createdAt: Date;
}

export interface MemoryCoreRecord {
  id: string;
  projectId: string;
  kind: string;
  topic: string;
  content: string;
  version: number;
  sourceAtomIds: string[];
  updatedAt: Date;
}

export interface MemoryPipelineStateRecord {
  messageId: string;
  level1At: Date | null;
  extractionMode: string;
  status: string;
  attempts: number;
  lastError: string | null;
}

export interface ThreadContextStateRecord {
  threadId: string;
  rollingSummary: string;
  summarizedUntilMessageId: string | null;
  summaryVersion: number;
  tokenEstimate: number;
}

export interface CreateAtomInput {
  projectId: string;
  threadId: string | null;
  sourceMessageId: string | null;
  entityType: string | null;
  entityId: string | null;
  factType: string;
  content: string;
  confidence: number;
  dedupHash: string;
  memoryOp: string;
}

export interface UpsertCoreInput {
  projectId: string;
  kind: string;
  topic: string;
  content: string;
  sourceAtomIds: string[];
}

export interface MemoryStore {
  findActiveAtoms(
    projectId: string,
    filter?: { entityType?: string | null; entityId?: string | null; factType?: string },
    take?: number,
  ): Promise<MemoryAtomRecord[]>;
  findAtomsByMessage(messageId: string): Promise<MemoryAtomRecord[]>;
  createAtom(input: CreateAtomInput): Promise<MemoryAtomRecord>;
  updateAtom(
    id: string,
    patch: Partial<Pick<MemoryAtomRecord, 'status' | 'supersededById' | 'validTo' | 'memoryOp' | 'content' | 'factType' | 'entityType' | 'entityId' | 'confidence' | 'dedupHash'>>,
  ): Promise<void>;
  invalidateAtom(id: string): Promise<boolean>;
  listAtoms(
    projectId: string,
    options: { entityType?: string; entityId?: string; page: number; pageSize: number },
  ): Promise<{ items: MemoryAtomRecord[]; total: number }>;
  upsertPipelineState(
    messageId: string,
    patch: Partial<Pick<MemoryPipelineStateRecord, 'status' | 'extractionMode' | 'level1At'>>,
  ): Promise<void>;
  markPipelineFailure(messageId: string, error: string): Promise<void>;
  getPipelineState(messageId: string): Promise<MemoryPipelineStateRecord | null>;
  getMessageWithProject(
    messageId: string,
  ): Promise<{ id: string; content: string; projectId: string | null } | null>;
  upsertCore(input: UpsertCoreInput): Promise<void>;
  listCores(projectId: string): Promise<MemoryCoreRecord[]>;
  buildWorldContext(projectId: string): Promise<WorldContext | null>;
  findContextState(threadId: string): Promise<ThreadContextStateRecord | null>;
  upsertContextState(
    threadId: string,
    patch: Partial<Pick<ThreadContextStateRecord, 'rollingSummary' | 'summarizedUntilMessageId' | 'summaryVersion' | 'tokenEstimate'>>,
  ): Promise<void>;
}
```

- [ ] **Step 2: 写 prisma-store.ts（Prisma 实现）**

```ts
// apps/api/src/contexts/memory/prisma-store.ts
import type { PrismaClient } from '@zivith/database';
import { buildWorldContext } from '../world-builder/world-context.js';
import type {
  CreateAtomInput,
  MemoryAtomRecord,
  MemoryCoreRecord,
  MemoryPipelineStateRecord,
  MemoryStore,
  MemoryPipelineStateRecord as PipelineRecord,
  ThreadContextStateRecord,
  UpsertCoreInput,
} from './store.js';

export class PrismaMemoryStore implements MemoryStore {
  constructor(private readonly db: PrismaClient) {}

  async findActiveAtoms(
    projectId: string,
    filter?: { entityType?: string | null; entityId?: string | null; factType?: string },
    take = 500,
  ): Promise<MemoryAtomRecord[]> {
    const rows = await this.db.memoryAtom.findMany({
      where: {
        projectId,
        status: 'active',
        ...(filter?.entityType !== undefined ? { entityType: filter.entityType } : {}),
        ...(filter?.entityId !== undefined ? { entityId: filter.entityId } : {}),
        ...(filter?.factType ? { factType: filter.factType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows;
  }

  async findAtomsByMessage(messageId: string): Promise<MemoryAtomRecord[]> {
    return this.db.memoryAtom.findMany({
      where: { sourceMessageId: messageId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createAtom(input: CreateAtomInput): Promise<MemoryAtomRecord> {
    return this.db.memoryAtom.create({ data: input });
  }

  async updateAtom(
    id: string,
    patch: Partial<Pick<MemoryAtomRecord, 'status' | 'supersededById' | 'validTo' | 'memoryOp' | 'content' | 'factType' | 'entityType' | 'entityId' | 'confidence' | 'dedupHash'>>,
  ): Promise<void> {
    await this.db.memoryAtom.update({ where: { id }, data: patch });
  }

  async invalidateAtom(id: string): Promise<boolean> {
    const updated = await this.db.memoryAtom.updateMany({
      where: { id, status: 'active' },
      data: { status: 'invalidated', validTo: new Date() },
    });
    return updated.count > 0;
  }

  async listAtoms(
    projectId: string,
    options: { entityType?: string; entityId?: string; page: number; pageSize: number },
  ): Promise<{ items: MemoryAtomRecord[]; total: number }> {
    const where = {
      projectId,
      status: 'active',
      ...(options.entityType ? { entityType: options.entityType } : {}),
      ...(options.entityId ? { entityId: options.entityId } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.memoryAtom.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      }),
      this.db.memoryAtom.count({ where }),
    ]);
    return { items, total };
  }

  async upsertPipelineState(
    messageId: string,
    patch: Partial<Pick<PipelineRecord, 'status' | 'extractionMode' | 'level1At'>>,
  ): Promise<void> {
    await this.db.memoryPipelineState.upsert({
      where: { messageId },
      create: { messageId, ...patch },
      update: patch,
    });
  }

  async markPipelineFailure(messageId: string, error: string): Promise<void> {
    const existing = await this.db.memoryPipelineState.findUnique({ where: { messageId } });
    const attempts = (existing?.attempts ?? 0) + 1;
    await this.db.memoryPipelineState.upsert({
      where: { messageId },
      create: { messageId, status: 'failed', attempts: 1, lastError: error.slice(0, 500) },
      update: {
        status: attempts >= 3 ? 'failed' : 'pending',
        attempts,
        lastError: error.slice(0, 500),
      },
    });
  }

  async getPipelineState(messageId: string): Promise<MemoryPipelineStateRecord | null> {
    return this.db.memoryPipelineState.findUnique({ where: { messageId } });
  }

  async getMessageWithProject(
    messageId: string,
  ): Promise<{ id: string; content: string; projectId: string | null } | null> {
    const message = await this.db.creatorChatMessage.findFirst({
      where: { id: messageId },
      include: { thread: { select: { projectId: true } } },
    });
    if (!message) return null;
    return { id: message.id, content: message.content, projectId: message.thread.projectId };
  }

  async upsertCore(input: UpsertCoreInput): Promise<void> {
    const existing = await this.db.memoryCore.findFirst({
      where: { projectId: input.projectId, kind: input.kind, topic: input.topic },
      select: { id: true, version: true },
    });
    if (existing) {
      await this.db.memoryCore.update({
        where: { id: existing.id },
        data: {
          content: input.content,
          sourceAtomIds: input.sourceAtomIds,
          version: existing.version + 1,
        },
      });
      return;
    }
    await this.db.memoryCore.create({ data: input });
  }

  async listCores(projectId: string): Promise<MemoryCoreRecord[]> {
    return this.db.memoryCore.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } });
  }

  async buildWorldContext(projectId: string) {
    return buildWorldContext(this.db, projectId);
  }

  async findContextState(threadId: string): Promise<ThreadContextStateRecord | null> {
    return this.db.threadContextState.findUnique({ where: { threadId } });
  }

  async upsertContextState(
    threadId: string,
    patch: Partial<Pick<ThreadContextStateRecord, 'rollingSummary' | 'summarizedUntilMessageId' | 'summaryVersion' | 'tokenEstimate'>>,
  ): Promise<void> {
    await this.db.threadContextState.upsert({
      where: { threadId },
      create: { threadId, ...patch },
      update: patch,
    });
  }
}
```

- [ ] **Step 3: 写失败测试 test/memory-service.test.ts（fake store + fake queue）**

```ts
// apps/api/test/memory-service.test.ts
import { describe, expect, it } from 'vitest';
import type { MemoryIngestOps } from '@zivith/domain';
import { MemoryService } from '../src/contexts/memory/service.js';
import type {
  CreateAtomInput,
  MemoryAtomRecord,
  MemoryCoreRecord,
  MemoryStore,
  ThreadContextStateRecord,
} from '../src/contexts/memory/store.js';

class FakeStore implements MemoryStore {
  atoms: MemoryAtomRecord[] = [];
  cores: MemoryCoreRecord[] = [];
  pipelineStates = new Map<string, { status: string; attempts: number }>();
  contextStates = new Map<string, ThreadContextStateRecord>();

  async findActiveAtoms(
    projectId: string,
    filter?: { entityType?: string | null; entityId?: string | null; factType?: string },
  ) {
    return this.atoms.filter(
      (atom) =>
        atom.projectId === projectId &&
        atom.status === 'active' &&
        (filter?.entityType === undefined || atom.entityType === filter.entityType) &&
        (filter?.entityId === undefined || atom.entityId === filter.entityId) &&
        (!filter?.factType || atom.factType === filter.factType),
    );
  }
  async findAtomsByMessage(messageId: string) {
    return this.atoms.filter((atom) => atom.sourceMessageId === messageId);
  }
  async createAtom(input: CreateAtomInput) {
    const atom: MemoryAtomRecord = {
      ...input,
      id: `atom-${this.atoms.length + 1}`,
      status: 'active',
      supersededById: null,
      validFrom: new Date(),
      validTo: null,
      createdAt: new Date(),
    };
    this.atoms.push(atom);
    return atom;
  }
  async updateAtom(id: string, patch: Partial<MemoryAtomRecord>) {
    const atom = this.atoms.find((item) => item.id === id);
    if (atom) Object.assign(atom, patch);
  }
  async invalidateAtom(id: string) {
    const atom = this.atoms.find((item) => item.id === id);
    if (atom && atom.status === 'active') {
      atom.status = 'invalidated';
      atom.validTo = new Date();
      return true;
    }
    return false;
  }
  async listAtoms(projectId: string, options: { page: number; pageSize: number }) {
    const items = this.atoms.filter((a) => a.projectId === projectId && a.status === 'active');
    return {
      items: items.slice((options.page - 1) * options.pageSize, options.page * options.pageSize),
      total: items.length,
    };
  }
  async upsertPipelineState(messageId: string, patch: { status?: string }) {
    const current = this.pipelineStates.get(messageId) ?? { status: 'pending', attempts: 0 };
    this.pipelineStates.set(messageId, { ...current, ...patch });
  }
  async markPipelineFailure(messageId: string, error: string) {
    const current = this.pipelineStates.get(messageId) ?? { status: 'pending', attempts: 0 };
    this.pipelineStates.set(messageId, {
      status: current.attempts + 1 >= 3 ? 'failed' : 'pending',
      attempts: current.attempts + 1,
    });
    void error;
  }
  async getPipelineState(messageId: string) {
    const state = this.pipelineStates.get(messageId);
    return state
      ? { messageId, level1At: null, extractionMode: 'rule', status: state.status, attempts: state.attempts, lastError: null }
      : null;
  }
  async getMessageWithProject(messageId: string) {
    return { id: messageId, content: '林澈性格冷静。', projectId: 'p1' };
  }
  async upsertCore(input: { kind: string; topic: string; content: string; sourceAtomIds: string[] }) {
    const existing = this.cores.find((core) => core.kind === input.kind && core.topic === input.topic);
    if (existing) {
      existing.content = input.content;
      existing.sourceAtomIds = input.sourceAtomIds;
      existing.version += 1;
      return;
    }
    this.cores.push({
      id: `core-${this.cores.length + 1}`,
      projectId: 'p1',
      kind: input.kind,
      topic: input.topic,
      content: input.content,
      version: 1,
      sourceAtomIds: input.sourceAtomIds,
      updatedAt: new Date(),
    });
  }
  async listCores(projectId: string) {
    return this.cores.filter((core) => core.projectId === projectId);
  }
  async buildWorldContext(projectId: string) {
    void projectId;
    return world;
  }
  async findContextState(threadId: string) {
    return this.contextStates.get(threadId) ?? null;
  }
  async upsertContextState(threadId: string, patch: Partial<ThreadContextStateRecord>) {
    const current = this.contextStates.get(threadId) ?? {
      threadId,
      rollingSummary: '',
      summarizedUntilMessageId: null,
      summaryVersion: 0,
      tokenEstimate: 0,
    };
    this.contextStates.set(threadId, { ...current, ...patch });
  }
}

const world = {
  projectId: 'p1',
  projectName: '测试世界',
  worldview: { rules: [] },
  stories: [],
  characters: [{ id: 'c1', name: '林澈', description: null, tags: [] }],
  locations: [],
  scenes: [],
  worldEvents: [],
  relationships: [],
} as NonNullable<Parameters<MemoryService['ingest']>[0]['world']>;

function makeService(store: FakeStore) {
  const enqueued: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const service = new MemoryService({
    store,
    queue: {
      enqueue: async (job) => {
        enqueued.push({ type: job.type, payload: job.payload as Record<string, unknown> });
        return { job_id: job.idempotency_key };
      },
      cancel: async () => {},
    },
  });
  return { service, enqueued };
}

describe('MemoryService.ingest（同步快速路径）', () => {
  it('archives linked atoms and enqueues refine job', async () => {
    const store = new FakeStore();
    const { service, enqueued } = makeService(store);
    const ops: MemoryIngestOps = await service.ingest({
      messageId: 'm1',
      threadId: 't1',
      projectId: 'p1',
      content: '林澈性格冷静。他渴望成为仙人。',
      world,
    });
    expect(ops.added).toBe(2);
    expect(store.atoms).toHaveLength(2);
    expect(store.atoms[0]).toMatchObject({ entityType: 'character', entityId: 'c1' });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({ type: 'memory_refine', payload: { message_id: 'm1' } });
  });

  it('second identical ingest is NOOP (no new atoms, no enqueue)', async () => {
    const store = new FakeStore();
    const { service, enqueued } = makeService(store);
    await service.ingest({ messageId: 'm1', threadId: 't1', projectId: 'p1', content: '林澈性格冷静。', world });
    await service.ingest({ messageId: 'm2', threadId: 't1', projectId: 'p1', content: '林澈性格冷静！', world });
    expect(store.atoms).toHaveLength(1);
    expect(enqueued).toHaveLength(1);
  });

  it('antonym conflict is reported, not written', async () => {
    const store = new FakeStore();
    const { service } = makeService(store);
    await service.ingest({ messageId: 'm1', threadId: 't1', projectId: 'p1', content: '林澈性格阴郁。', world });
    const ops = await service.ingest({ messageId: 'm2', threadId: 't1', projectId: 'p1', content: '林澈性格开朗。', world });
    expect(ops.conflicts).toHaveLength(1);
    expect(store.atoms).toHaveLength(1);
  });
});
```

- [ ] **Step 4: 运行确认失败**

Run: `pnpm --filter @zivith/api test test/memory-service.test.ts`
Expected: FAIL（service 模块不存在）。

- [ ] **Step 5: 实现 service.ts（ingest 部分 + 其余方法占位签名）**

```ts
// apps/api/src/contexts/memory/service.ts
import {
  jaccardSimilarity,
  tokenizeForSimilarity,
  type MemoryIngestOps,
  type RetrievedMemory,
} from '@zivith/domain';
import type { EmbeddingAdapter, QueuePort } from '../../ports/index.js';
import type { LLMAdapter } from '../../ports/llm.js';
import type { LocalVectorStore } from '../../adapters/memory/local-vector-store.js';
import type { WorldContext } from '../world-builder/world-context.js';
import { computeDedupHash } from './fingerprint.js';
import { extractCandidateAtoms } from './extract.js';
import { decideAtomAction } from './cleaning.js';
import type { MemoryStore, MemoryAtomRecord } from './store.js';

export interface MemoryServiceDeps {
  store: MemoryStore;
  vectorStore?: LocalVectorStore | null;
  embedding?: EmbeddingAdapter | null;
  llm?: LLMAdapter | null;
  llmModel?: string;
  queue?: QueuePort | null;
}

/**
 * 分层记忆服务（M1）：
 * - ingest：同步规则快速路径（抽取→链接→清洗→归档→入队深加工）
 * - processRefine：异步深加工（Task 9 实现：LLM 精炼 → L2 聚合 → 向量化）
 * - retrieve：三路混合召回（Task 10 实现）
 * - getContextWindow / updateThreadSummary：上下文窗口管理（Task 11 实现）
 */
export class MemoryService {
  private queue: QueuePort | null;

  constructor(private readonly deps: MemoryServiceDeps) {
    this.queue = deps.queue ?? null;
  }

  /** 运行时注入队列（server.ts 创建 queue runtime 后调用，镜像 GenerationService.attachQueue）。 */
  attachQueue(queue: QueuePort): void {
    this.queue = queue;
  }

  async ingest(params: {
    messageId: string;
    threadId: string;
    projectId: string;
    content: string;
    world: WorldContext | null;
  }): Promise<MemoryIngestOps> {
    const ops: MemoryIngestOps = { added: 0, updated: 0, noop: 0, conflicts: [] };
    const candidates = extractCandidateAtoms(params.content, params.world);
    for (const candidate of candidates) {
      const entityType = candidate.linked?.entityType ?? null;
      const entityId = candidate.linked?.entityId ?? null;
      const dedupHash = computeDedupHash({
        entityType,
        entityId,
        factType: candidate.factType,
        content: candidate.content,
      });
      const existing = await this.deps.store.findActiveAtoms(params.projectId, {
        entityType,
        entityId,
        factType: candidate.factType,
      });
      const scored = existing.map((atom) => ({
        atom: { id: atom.id, content: atom.content, dedupHash: atom.dedupHash },
        similarity: jaccardSimilarity(
          tokenizeForSimilarity(candidate.content),
          tokenizeForSimilarity(atom.content),
        ),
      }));
      const decision = decideAtomAction({
        incoming: { dedupHash, content: candidate.content, factType: candidate.factType },
        candidates: scored,
      });
      if (decision.op === 'NOOP') {
        ops.noop++;
        continue;
      }
      if (decision.op === 'CONFLICT') {
        const conflictAtom = existing.find((atom) => atom.id === decision.conflictAtomId);
        ops.conflicts.push({
          content: candidate.content,
          existing_content: conflictAtom?.content ?? '',
          antonym: [decision.antonym[0], decision.antonym[1]],
        });
        continue;
      }
      if (decision.op === 'UPDATE') {
        await this.deps.store.updateAtom(decision.supersedeAtomId, {
          status: 'superseded',
          supersededById: null, // 创建新原子后回填
          validTo: new Date(),
          memoryOp: 'UPDATE',
        });
        const created = await this.deps.store.createAtom({
          projectId: params.projectId,
          threadId: params.threadId,
          sourceMessageId: params.messageId,
          entityType,
          entityId,
          factType: candidate.factType,
          content: candidate.content,
          confidence: 0.75,
          dedupHash,
          memoryOp: 'ADD',
        });
        await this.deps.store.updateAtom(decision.supersedeAtomId, {
          supersededById: created.id,
        });
        ops.updated++;
        continue;
      }
      await this.deps.store.createAtom({
        projectId: params.projectId,
        threadId: params.threadId,
        sourceMessageId: params.messageId,
        entityType,
        entityId,
        factType: candidate.factType,
        content: candidate.content,
        confidence: 0.7,
        dedupHash,
        memoryOp: 'ADD',
      });
      ops.added++;
    }
    await this.deps.store.upsertPipelineState(params.messageId, {
      status: 'pending',
      extractionMode: 'rule',
    });
    if (this.queue && ops.added + ops.updated > 0) {
      await this.queue.enqueue({
        id: `memory_refine:${params.messageId}`,
        type: 'memory_refine',
        payload: { message_id: params.messageId },
        idempotency_key: `memory_refine:${params.messageId}`,
      });
    }
    return ops;
  }

  // ---- 以下方法在后续 Task 中实现（先占位避免类型断链）----

  async processRefine(_messageId: string): Promise<void> {
    void _messageId;
  }

  async retrieve(_params: {
    projectId: string;
    text: string;
    world: WorldContext | null;
    topK?: number;
  }): Promise<RetrievedMemory[]> {
    return [];
  }

  async rebuildVectors(_projectId: string): Promise<{ rebuilt: number }> {
    return { rebuilt: 0 };
  }

  async listAtoms(
    projectId: string,
    options: { entityType?: string; entityId?: string; page: number; pageSize: number },
  ) {
    return this.deps.store.listAtoms(projectId, options);
  }

  async listCores(projectId: string) {
    return this.deps.store.listCores(projectId);
  }

  async invalidateAtom(atomId: string): Promise<boolean> {
    return this.deps.store.invalidateAtom(atomId);
  }

  /** 供路由层引用的原子类型（DTO 映射用）。 */
  static readonly atomRecordType: typeof MemoryAtomRecord = null as unknown as typeof MemoryAtomRecord;
}
```

注：最后一行 `atomRecordType` 仅为类型引用的临时方案可删——实现时直接在路由 import `MemoryAtomRecord` 类型即可，**实现时删除该静态属性**。

- [ ] **Step 6: 运行测试通过**

Run: `pnpm --filter @zivith/api test test/memory-service.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/contexts/memory apps/api/test/memory-service.test.ts
git commit -m "feat(memory): sync fast-path ingest with cleaning and queue hook"
```

---

### Task 9: 深加工管线（LLM 精炼 + L2 聚合 + 向量化）

**Files:**
- Create: `apps/api/src/contexts/memory/pipeline.ts`
- Modify: `apps/api/src/contexts/memory/service.ts`（实现 `processRefine` 与 `rebuildVectors`）
- Test: `apps/api/test/memory-service.test.ts`（追加 describe）

- [ ] **Step 1: 写 pipeline.ts（LLM 契约）**

```ts
// apps/api/src/contexts/memory/pipeline.ts
import { z } from 'zod';

export const memoryRefineSchema = z
  .object({
    atoms: z
      .array(
        z
          .object({
            index: z.number().int().min(0),
            content: z.string().trim().min(1).max(500),
            fact_type: z.enum([
              'trait', 'desire', 'event', 'relation', 'rule', 'preference', 'constraint', 'episodic',
            ]),
            entity_name: z.string().trim().max(200).nullable(),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();

export type MemoryRefineResult = z.infer<typeof memoryRefineSchema>;

export const MEMORY_REFINE_SYSTEM_PROMPT = `你是记忆精炼器。输入是从创作者对话中切分出的事实片段与已知实体清单。
请修正切分错误、补全主语、判断事实类型，并把每个片段链接到已知实体。
只输出 JSON：{ "atoms": [{ "index": number, "content": string, "fact_type": "trait|desire|event|relation|rule|preference|constraint|episodic", "entity_name": string|null }] }
要求：content 为 ≤200 字的中文陈述句；entity_name 只能取自输入实体清单（找不到填 null）；不臆造新事实；不改变原意。`;

export const MEMORY_SUMMARY_SYSTEM_PROMPT = `你是创作对话压缩器。把「已有摘要 + 新淘汰的对话轮次」合并为一段 ≤400 字的中文摘要。
要求：保留全部事实（人名、地名、事件、关系、决定）；按发生顺序；不评论、不扩写。只输出 JSON：{ "summary": string }`;

export const memorySummarySchema = z
  .object({ summary: z.string().trim().min(1).max(2_000) })
  .strict();

export type MemorySummaryResult = z.infer<typeof memorySummarySchema>;

/** L2 聚合的 kind 映射（设计文档 §5.3 同款）。 */
export function coreKindForEntityType(entityType: string | null): string {
  switch (entityType) {
    case 'character':
      return 'persona';
    case 'project':
      return 'world_rule';
    case 'world_event':
      return 'event_chain';
    default:
      return 'scenario';
  }
}
```

- [ ] **Step 2: 追加失败测试（test/memory-service.test.ts 末尾）**

```ts
import { MEMORY_REFINE_SYSTEM_PROMPT } from '../src/contexts/memory/pipeline.js';

function makeLlmRefining() {
  return {
    provider: 'deepseek',
    supportedModels: [],
    complete: async () => ({ text: '', model: 'm', input_tokens: 0, output_tokens: 0, metadata: {} }),
    completeStructured: async (
      request: { system_prompt: string; user_prompt: string },
      schema: { parse: (value: unknown) => unknown },
    ) => {
      if (request.system_prompt === MEMORY_REFINE_SYSTEM_PROMPT) {
        return {
          data: schema.parse({
            atoms: [
              { index: 0, content: '林澈性格冷静', fact_type: 'trait', entity_name: '林澈' },
            ],
          }),
          text: '', model: 'm', input_tokens: 0, output_tokens: 0, metadata: {},
        };
      }
      return {
        data: schema.parse({ summary: '林澈冷静，渴望成仙。' }),
        text: '', model: 'm', input_tokens: 0, output_tokens: 0, metadata: {},
      };
    },
  };
}

describe('MemoryService.processRefine（深加工）', () => {
  it('refines atoms via LLM, aggregates L2 cores and marks done (mock rule path)', async () => {
    const store = new FakeStore();
    const { service } = makeService(store);
    await service.ingest({ messageId: 'm1', threadId: 't1', projectId: 'p1', content: '林澈性格冷静。他渴望成为仙人。', world });
    await service.processRefine('m1');
    // 规则模式：无 LLM → 原子保持原文，L2 按 (character,c1) 聚合为 persona
    expect(store.cores).toHaveLength(1);
    expect(store.cores[0]).toMatchObject({ kind: 'persona', topic: '林澈' });
    expect(store.cores[0]!.content).toContain('冷静');
    expect(store.pipelineStates.get('m1')?.status).toBe('done');
  });

  it('is idempotent (second run is a no-op)', async () => {
    const store = new FakeStore();
    const { service } = makeService(store);
    await service.ingest({ messageId: 'm1', threadId: 't1', projectId: 'p1', content: '林澈性格冷静。', world });
    await service.processRefine('m1');
    await service.processRefine('m1');
    expect(store.cores).toHaveLength(1);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm --filter @zivith/api test test/memory-service.test.ts`
Expected: 新增 describe FAIL（processRefine 是空实现）。

- [ ] **Step 4: 在 service.ts 实现 processRefine 与 rebuildVectors（替换占位）**

```ts
  async processRefine(messageId: string): Promise<void> {
    const state = await this.deps.store.getPipelineState(messageId);
    if (state?.status === 'done') return;
    try {
      const message = await this.deps.store.getMessageWithProject(messageId);
      if (!message || !message.projectId) {
        await this.deps.store.upsertPipelineState(messageId, { status: 'done' });
        return;
      }
      const projectId = message.projectId;
      const world = await this.deps.store.buildWorldContext(projectId);
      const useLlm = Boolean(this.deps.llm && this.deps.llm.provider !== 'mock');
      let atoms = await this.deps.store.findAtomsByMessage(messageId);

      // ① LLM 精炼（有密钥轨）：修正内容/类型/实体链接
      if (useLlm && this.deps.llm && atoms.length > 0) {
        const result = await this.deps.llm.completeStructured(
          {
            request_id: `memory-refine:${messageId}`,
            model: this.deps.llmModel ?? 'deepseek-chat',
            system_prompt: MEMORY_REFINE_SYSTEM_PROMPT,
            user_prompt: JSON.stringify({
              statements: atoms.map((atom, index) => ({ index, content: atom.content })),
              entities: world
                ? [
                    ...world.characters.map((c) => c.name),
                    ...world.locations.map((l) => l.name),
                    ...world.worldEvents.map((e) => e.title),
                  ]
                : [],
            }),
            temperature: 0.2,
            max_tokens: 1_500,
          },
          memoryRefineSchema,
        );
        for (const refined of result.data.atoms) {
          const atom = atoms[refined.index];
          if (!atom) continue;
          const linked = refined.entity_name ? resolveEntityByName(refined.entity_name, world) : null;
          await this.deps.store.updateAtom(atom.id, {
            content: refined.content,
            factType: refined.fact_type,
            ...(linked ? { entityType: linked.entityType, entityId: linked.entityId } : {}),
          });
        }
        atoms = await this.deps.store.findAtomsByMessage(messageId);
      }

      // ② L2 聚合：按 (entityType, entityId) 分组 upsert MemoryCore
      const groups = new Map<string, typeof atoms>();
      for (const atom of atoms.filter((a) => a.status === 'active')) {
        const key = `${atom.entityType ?? ''}:${atom.entityId ?? ''}`;
        const group = groups.get(key) ?? [];
        group.push(atom);
        groups.set(key, group);
      }
      for (const [key, group] of groups) {
        const [entityType, entityId] = key.split(':');
        const topic =
          (await this.entityName(world, entityType || null, entityId || null)) ?? '未归档事实';
        const contents: string[] = [];
        for (const atom of [...group].reverse()) {
          if (!contents.includes(atom.content)) contents.push(atom.content);
        }
        await this.deps.store.upsertCore({
          projectId,
          kind: coreKindForEntityType(entityType || null),
          topic,
          content: contents.join('\n').slice(0, 2_000),
          sourceAtomIds: group.map((atom) => atom.id),
        });
      }

      // ③ 向量化（embedding 可用时；mock 向量亦有效，词法语义）
      if (this.deps.vectorStore && this.deps.embedding && atoms.length > 0) {
        const { vectors } = await this.deps.embedding.embed({
          request_id: `memory-vectorize:${messageId}`,
          model: 'memory-atoms',
          inputs: atoms.map((atom) => atom.content),
        });
        this.deps.vectorStore.upsert(
          projectId,
          atoms.map((atom, index) => ({ id: atom.id, vector: vectors[index]! })),
        );
      }

      await this.deps.store.upsertPipelineState(messageId, {
        status: 'done',
        level1At: new Date(),
        extractionMode: useLlm ? 'llm' : 'rule',
      });
    } catch (error) {
      await this.deps.store.markPipelineFailure(messageId, String(error));
      throw error;
    }
  }

  /** 实体名解析（L2 topic 用；从 world 上下文查名字）。 */
  private async entityName(
    world: WorldContext | null,
    entityType: string | null,
    entityId: string | null,
  ): Promise<string | null> {
    if (!world || !entityType || !entityId) return null;
    if (entityType === 'character') {
      return world.characters.find((c) => c.id === entityId)?.name ?? null;
    }
    if (entityType === 'location') {
      return world.locations.find((l) => l.id === entityId)?.name ?? null;
    }
    if (entityType === 'world_event') {
      return world.worldEvents.find((e) => e.id === entityId)?.title ?? null;
    }
    if (entityType === 'story') {
      return world.stories.find((s) => s.id === entityId)?.title ?? null;
    }
    if (entityType === 'project') return world.projectName;
    return null;
  }

  /** 向量库全量重建（PG 为事实源）。 */
  async rebuildVectors(projectId: string): Promise<{ rebuilt: number }> {
    if (!this.deps.vectorStore || !this.deps.embedding) return { rebuilt: 0 };
    const atoms = await this.deps.store.findActiveAtoms(projectId);
    this.deps.vectorStore.removeByProject(projectId);
    if (atoms.length === 0) return { rebuilt: 0 };
    const { vectors } = await this.deps.embedding.embed({
      request_id: `memory-rebuild:${projectId}:${Date.now()}`,
      model: 'memory-atoms',
      inputs: atoms.map((atom) => atom.content),
    });
    this.deps.vectorStore.upsert(
      projectId,
      atoms.map((atom, index) => ({ id: atom.id, vector: vectors[index]! })),
    );
    return { rebuilt: atoms.length };
  }
```

同时在 service.ts 顶部补充 import：

```ts
import {
  coreKindForEntityType,
  MEMORY_REFINE_SYSTEM_PROMPT,
  memoryRefineSchema,
} from './pipeline.js';
import { resolveEntityByName } from './extract.js';
```

- [ ] **Step 5: 运行测试通过**

Run: `pnpm --filter @zivith/api test test/memory-service.test.ts`
Expected: PASS（5 个用例）。

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contexts/memory apps/api/test/memory-service.test.ts
git commit -m "feat(memory): async refine pipeline (llm refine + l2 aggregate + vectorize)"
```

---

### Task 10: 三路混合检索

**Files:**
- Create: `apps/api/src/contexts/memory/retrieval.ts`
- Modify: `apps/api/src/contexts/memory/service.ts`（实现 `retrieve`）
- Test: `apps/api/test/memory-retrieval.test.ts`

- [ ] **Step 1: 写 retrieval.ts（纯函数 + 格式化）**

```ts
// apps/api/src/contexts/memory/retrieval.ts
import { jaccardSimilarity, tokenizeForSimilarity, type RetrievedMemory } from '@zivith/domain';

/** RRF 倒数排名融合：score = Σ weight / (60 + rank)。 */
export function rrfFuse(
  rankings: Array<{ list: string[]; weight?: number }>,
  topK: number,
): string[] {
  const scores = new Map<string, number>();
  for (const { list, weight = 1 } of rankings) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + weight / (60 + rank + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, topK))
    .map(([id]) => id);
}

export function keywordRank(
  queryTokens: string[],
  contents: Array<{ id: string; content: string }>,
  topK: number,
): string[] {
  return contents
    .map((item) => ({
      id: item.id,
      score: jaccardSimilarity(queryTokens, tokenizeForSimilarity(item.content)),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => item.id);
}

/** 去重（按归一化内容），保持顺序。 */
export function dedupeRetrieved(items: RetrievedMemory[]): RetrievedMemory[] {
  const seen = new Set<string>();
  const result: RetrievedMemory[] = [];
  for (const item of items) {
    const key = `${item.source}|${item.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/** 注入 Agent system prompt 的记忆段（无头标题，由 prompt.ts 组装）。 */
export function formatMemoryDigest(items: RetrievedMemory[]): string {
  if (items.length === 0) return '';
  return items
    .slice(0, 12)
    .map((item) => `- ${item.content}`)
    .join('\n');
}
```

- [ ] **Step 2: 写失败测试 test/memory-retrieval.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { keywordRank, rrfFuse, formatMemoryDigest } from '../src/contexts/memory/retrieval.js';
import { tokenizeForSimilarity } from '@zivith/domain';

describe('rrfFuse', () => {
  it('fuses and ranks by reciprocal rank', () => {
    const fused = rrfFuse(
      [
        { list: ['a', 'b'] },
        { list: ['b', 'c'] },
      ],
      3,
    );
    expect(fused[0]).toBe('b'); // 两路都命中
    expect(new Set(fused)).toEqual(new Set(['a', 'b', 'c']));
  });
});

describe('keywordRank', () => {
  it('ranks bigram-overlapping contents', () => {
    const ranked = keywordRank(tokenizeForSimilarity('林澈性格冷静'), [
      { id: 'a', content: '林澈性格冷静。' },
      { id: 'b', content: '卡塞尔学院位于芝加哥。' },
    ], 2);
    expect(ranked).toEqual(['a']);
  });
});

describe('formatMemoryDigest', () => {
  it('renders bullet lines without header', () => {
    expect(formatMemoryDigest([])).toBe('');
    expect(
      formatMemoryDigest([
        { source: 'atom', id: '1', content: '林澈性格冷静', entity_type: 'character', entity_id: 'c1', fact_type: 'trait' },
      ]),
    ).toBe('- 林澈性格冷静');
  });
});
```

- [ ] **Step 3: 运行确认失败 → 实现 → 通过（retrieval.ts 已给出完整实现，直接落地）**

Run: `pnpm --filter @zivith/api test test/memory-retrieval.test.ts`
Expected: FAIL（模块不存在）→ 实现后 PASS。

- [ ] **Step 4: service.ts 实现 retrieve（替换占位）**

```ts
  async retrieve(params: {
    projectId: string;
    text: string;
    world: WorldContext | null;
    topK?: number;
  }): Promise<RetrievedMemory[]> {
    const topK = params.topK ?? 8;
    const active = await this.deps.store.findActiveAtoms(params.projectId);
    if (active.length === 0) return [];

    // ① 实体链接（决定 core 加权范围）
    const linked = linkEntities(params.text, params.world);
    const linkedEntityIds = new Set<string>();
    if (linked) linkedEntityIds.add(`${linked.entityType}:${linked.entityId}`);

    // ② 向量召回
    let vectorIds: string[] = [];
    if (this.deps.vectorStore && this.deps.embedding) {
      const { vectors } = await this.deps.embedding.embed({
        request_id: `memory-retrieve:${Date.now()}`,
        model: 'memory-retrieval',
        inputs: [params.text],
      });
      vectorIds = this.deps.vectorStore
        .search(params.projectId, vectors[0]!, 10)
        .map((hit) => hit.id);
    }

    // ③ 关键词召回（bigram Jaccard）
    const keywordIds = keywordRank(
      tokenizeForSimilarity(params.text),
      active.map((atom) => ({ id: atom.id, content: atom.content })),
      10,
    );

    // RRF 融合（向量路权重略高）
    const fused = rrfFuse(
      [
        { list: keywordIds, weight: 1 },
        { list: vectorIds, weight: 1.2 },
      ],
      topK,
    );
    const byId = new Map(active.map((atom) => [atom.id, atom]));
    const results: RetrievedMemory[] = [];
    for (const id of fused) {
      const atom = byId.get(id);
      if (!atom) continue;
      if (atom.entityType && atom.entityId) linkedEntityIds.add(`${atom.entityType}:${atom.entityId}`);
      results.push({
        source: 'atom',
        id: atom.id,
        content: atom.content,
        entity_type: atom.entityType,
        entity_id: atom.entityId,
        fact_type: atom.factType,
      });
    }

    // L2 核心加权：命中实体的 core 内容追加（溯源 sourceAtomIds）
    const cores = await this.deps.store.listCores(params.projectId);
    const linkedAtomIds = new Set(
      active
        .filter((atom) => atom.entityType && atom.entityId && linkedEntityIds.has(`${atom.entityType}:${atom.entityId}`))
        .map((atom) => atom.id),
    );
    for (const core of cores) {
      const linkedCore =
        core.sourceAtomIds.some((id) => linkedAtomIds.has(id)) ||
        (linked && core.topic === linked.name);
      if (!linkedCore) continue;
      results.push({
        source: 'core',
        id: core.id,
        content: core.content,
        entity_type: null,
        entity_id: null,
        fact_type: null,
      });
    }
    return dedupeRetrieved(results).slice(0, topK + 4);
  }
```

service.ts 顶部追加 import：

```ts
import { linkEntities } from './extract.js';
import { dedupeRetrieved, keywordRank, rrfFuse } from './retrieval.js';
```

- [ ] **Step 5: 测试 + 类型检查**

Run: `pnpm --filter @zivith/api test test/memory-retrieval.test.ts test/memory-service.test.ts && pnpm --filter @zivith/api typecheck`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contexts/memory apps/api/test/memory-retrieval.test.ts
git commit -m "feat(memory): three-way hybrid retrieval with rrf fusion"
```

---

### Task 11: 上下文窗口管理

**Files:**
- Create: `apps/api/src/contexts/memory/context-window.ts`
- Modify: `apps/api/src/contexts/memory/service.ts`（实现 `getContextWindow` / `updateThreadSummary`）
- Test: `apps/api/test/memory-context-window.test.ts`

- [ ] **Step 1: 写 context-window.ts**

```ts
// apps/api/src/contexts/memory/context-window.ts
import { z } from 'zod';
import { normalizeForFingerprint } from '@zivith/domain';
import type { LLMAdapter } from '../../ports/llm.js';
import { splitStatements } from './extract.js';
import { MEMORY_SUMMARY_SYSTEM_PROMPT, memorySummarySchema } from './pipeline.js';

export interface ContextMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** 中文 ≈1.5 字/token、其他 ≈4 字符/token 的启发式估算（无分词器依赖）。 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const rest = text.length - cjk;
  return Math.ceil(cjk / 1.5) + Math.ceil(rest / 4);
}

export function estimateMessagesTokens(messages: ContextMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
}

export interface ContextWindowInput {
  history: ContextMessage[];
  previousSummary: string;
  /** 分配给「摘要 + 最近原文」的 token 预算。 */
  tokenBudget: number;
  /** 保留最近 N 条原文（默认 8）。 */
  keepRecentMessages: number;
}

export interface ContextWindowResult {
  window: ContextMessage[];
  /** 本轮被淘汰进摘要的消息（older 全量 + recent 溢出部分）。 */
  evicted: ContextMessage[];
  tokenEstimate: number;
}

/** 预算分配：③滚动摘要 + ④最近K条原文；older 一律淘汰。 */
export function buildBudgetedHistory(input: ContextWindowInput): ContextWindowResult {
  const keep = Math.max(2, input.keepRecentMessages);
  const older = input.history.slice(0, Math.max(0, input.history.length - keep));
  const recent = input.history.slice(-keep);
  const summaryTokens = estimateTokens(input.previousSummary);
  let used = summaryTokens + estimateMessagesTokens(recent);
  const evicted: ContextMessage[] = [...older];
  const window = [...recent];
  while (used > input.tokenBudget && window.length > 2) {
    const removed = window.shift();
    if (!removed) break;
    evicted.push(removed);
    used = summaryTokens + estimateMessagesTokens(window);
  }
  return { window, evicted, tokenEstimate: used };
}

const KEY_SENTENCE_PREDICATE = /(是|有|叫|为|会|能|属于|发生|位于|喜欢|想要|成为|创建|记录|确认|在)/;

/** 规则降级摘要：关键句抽取 + 与已有摘要行去重合并（≤12 行）。 */
export function ruleSummarize(evicted: ContextMessage[], previousSummary: string): string {
  const existingLines = previousSummary
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set(existingLines.map((line) => normalizeForFingerprint(line)));
  const lines = [...existingLines];
  for (const message of evicted) {
    for (const statement of splitStatements(message.content)) {
      if (!KEY_SENTENCE_PREDICATE.test(statement)) continue;
      const key = normalizeForFingerprint(statement);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      lines.push(statement.slice(0, 200));
      if (lines.length >= 12) return lines.join('\n');
    }
  }
  return lines.join('\n');
}

/** 摘要压缩：有密钥走 LLM 合并，否则规则降级。 */
export async function compressHistory(options: {
  llm?: LLMAdapter | null;
  llmModel?: string;
  evicted: ContextMessage[];
  previousSummary: string;
}): Promise<string> {
  if (options.evicted.length === 0) return options.previousSummary;
  if (options.llm && options.llm.provider !== 'mock') {
    const result = await options.llm.completeStructured(
      {
        request_id: `memory-summary:${Date.now()}`,
        model: options.llmModel ?? 'deepseek-chat',
        system_prompt: MEMORY_SUMMARY_SYSTEM_PROMPT,
        user_prompt: JSON.stringify({
          previous_summary: options.previousSummary,
          evicted: options.evicted.map((message) => ({ role: message.role, content: message.content })),
        }),
        temperature: 0.2,
        max_tokens: 800,
      },
      memorySummarySchema,
    );
    return result.data.summary;
  }
  return ruleSummarize(options.evicted, options.previousSummary);
}

export const CONTEXT_TOKEN_BUDGET_DEFAULT = 24_000;

export function contextTokenBudget(): number {
  const value = Number(process.env.MEMORY_CONTEXT_TOKEN_BUDGET ?? CONTEXT_TOKEN_BUDGET_DEFAULT);
  return Number.isFinite(value) && value > 1_000 ? value : CONTEXT_TOKEN_BUDGET_DEFAULT;
}
```

- [ ] **Step 2: 写失败测试 test/memory-context-window.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildBudgetedHistory,
  estimateTokens,
  ruleSummarize,
} from '../src/contexts/memory/context-window.js';

const msg = (id: string, content: string) => ({ id, role: 'user' as const, content });

describe('estimateTokens', () => {
  it('CJK ~1.5 chars per token', () => {
    expect(estimateTokens('六个汉字')).toBe(4);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });
});

describe('buildBudgetedHistory', () => {
  it('keeps recent messages within budget and evicts the rest', () => {
    const history = Array.from({ length: 12 }, (_, i) => msg(`m${i}`, `第${i}条消息，内容一致。`));
    const result = buildBudgetedHistory({
      history,
      previousSummary: '',
      tokenBudget: estimateTokens('第0条消息，内容一致。') * 4,
      keepRecentMessages: 8,
    });
    expect(result.window.length).toBeLessThan(8);
    expect(result.window.length).toBeGreaterThanOrEqual(2);
    expect(result.evicted.length).toBe(12 - result.window.length);
    expect(result.evicted[0]?.id).toBe('m0');
    expect(result.window[result.window.length - 1]?.id).toBe('m11');
  });

  it('everything fits when budget is large', () => {
    const history = [msg('m0', '第一句。'), msg('m1', '第二句。')];
    const result = buildBudgetedHistory({
      history,
      previousSummary: '',
      tokenBudget: 10_000,
      keepRecentMessages: 8,
    });
    expect(result.window).toHaveLength(2);
    expect(result.evicted).toHaveLength(0);
  });
});

describe('ruleSummarize', () => {
  it('keeps key sentences, drops chit-chat, dedupes against previous summary', () => {
    const summary = ruleSummarize(
      [msg('m0', '林澈性格冷静。好的。'), msg('m1', '林澈性格冷静。他渴望成仙。')],
      '艾拉是执事。',
    );
    expect(summary).toContain('艾拉是执事。');
    expect(summary).toContain('林澈性格冷静。');
    expect(summary).toContain('他渴望成仙。');
    expect(summary.match(/林澈性格冷静。/g)).toHaveLength(1);
    expect(summary).not.toContain('好的。');
  });
});
```

- [ ] **Step 3: 运行确认失败 → 落地实现 → PASS**

Run: `pnpm --filter @zivith/api test test/memory-context-window.test.ts`
Expected: FAIL → 实现后 PASS。

- [ ] **Step 4: service.ts 追加上下文管理方法**

```ts
  /** 预算窗口：滚动摘要(system) + 最近原文；返回 evicted 供落摘要。 */
  async getContextWindow(
    threadId: string,
    history: Array<{ id: string; role: string; content: string }>,
  ): Promise<{ window: ContextMessage[]; evicted: ContextMessage[] }> {
    const state = await this.deps.store.findContextState(threadId);
    const summary = state?.rollingSummary ?? '';
    const messages: ContextMessage[] = history.map((message) => ({
      id: message.id,
      role: message.role === 'user' || message.role === 'assistant' ? message.role : 'system',
      content: message.content,
    }));
    const built = buildBudgetedHistory({
      history: messages,
      previousSummary: summary,
      tokenBudget: contextTokenBudget(),
      keepRecentMessages: 8,
    });
    const window = summary
      ? [{ id: 'summary', role: 'system' as const, content: `## 此前对话摘要\n${summary}` }, ...built.window]
      : built.window;
    return { window, evicted: built.evicted };
  }

  /** 回合结束后压缩淘汰消息并持久化滚动摘要。 */
  async updateThreadSummary(
    threadId: string,
    evicted: Array<{ id: string; role: string; content: string }>,
  ): Promise<void> {
    if (evicted.length === 0) return;
    const state = await this.deps.store.findContextState(threadId);
    const summary = await compressHistory({
      llm: this.deps.llm,
      llmModel: this.deps.llmModel,
      evicted: evicted.map((message) => ({
        id: message.id,
        role: message.role === 'user' || message.role === 'assistant' ? message.role : 'system',
        content: message.content,
      })),
      previousSummary: state?.rollingSummary ?? '',
    });
    await this.deps.store.upsertContextState(threadId, {
      rollingSummary: summary,
      summarizedUntilMessageId: evicted[evicted.length - 1]?.id ?? null,
      summaryVersion: (state?.summaryVersion ?? 0) + 1,
      tokenEstimate: estimateTokens(summary),
    });
  }
```

service.ts 顶部追加 import：

```ts
import {
  buildBudgetedHistory,
  compressHistory,
  contextTokenBudget,
  estimateTokens,
  type ContextMessage,
} from './context-window.js';
```

- [ ] **Step 5: 测试 + 类型检查**

Run: `pnpm --filter @zivith/api test test/memory-context-window.test.ts && pnpm --filter @zivith/api typecheck`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contexts/memory apps/api/test/memory-context-window.test.ts
git commit -m "feat(memory): budgeted context window with rolling summary compression"
```

---

### Task 12: 记忆队列运行时

**Files:**
- Create: `apps/api/src/contexts/memory/queue-runtime.ts`

- [ ] **Step 1: 实现（镜像 [generation/queue-runtime.ts](../../apps/api/src/contexts/generation/queue-runtime.ts) 模式）**

```ts
// apps/api/src/contexts/memory/queue-runtime.ts
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { BullMqQueueAdapter } from '../../adapters/bullmq.js';
import { InMemoryQueueAdapter } from '../../adapters/memory-queue.js';
import type { QueuePort } from '../../ports/index.js';
import type { MemoryService } from './service.js';

export interface MemoryQueueRuntime {
  queue: QueuePort;
  mode: 'bullmq' | 'memory';
  close: () => Promise<void>;
}

function redisConnection(): ConnectionOptions | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
      maxRetriesPerRequest: null,
    };
  } catch {
    return null;
  }
}

export function createMemoryQueueRuntime(memory: MemoryService): MemoryQueueRuntime {
  const connection = redisConnection();
  if (!connection) {
    const memoryQueue = new InMemoryQueueAdapter();
    memoryQueue.registerProcessor('memory_refine', (job) =>
      memory.processRefine((job.payload as { message_id?: string }).message_id ?? ''),
    );
    memory.attachQueue(memoryQueue);
    return { queue: memoryQueue, mode: 'memory', close: () => Promise.resolve() };
  }

  const queueName = process.env.MEMORY_QUEUE_NAME ?? 'zivith-memory';
  const bullQueue = new Queue(queueName, { connection });
  const adapter = new BullMqQueueAdapter(bullQueue);
  const worker = new Worker(
    queueName,
    async (bullJob) => {
      if (bullJob.name !== 'memory_refine') return;
      const data = (bullJob.data ?? {}) as { message_id?: string };
      if (typeof data.message_id === 'string') {
        await memory.processRefine(data.message_id);
      }
    },
    { connection, concurrency: 2 },
  );
  worker.on('failed', (job, error) => {
    console.error('[memory-worker] failed', job?.id, error.message);
  });
  memory.attachQueue(adapter);
  return {
    queue: adapter,
    mode: 'bullmq',
    close: async () => {
      await worker.close();
      await bullQueue.close();
    },
  };
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm --filter @zivith/api typecheck`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/memory/queue-runtime.ts
git commit -m "feat(memory): memory queue runtime (bullmq or in-memory)"
```

---

### Task 13: Creator Chat 集成（ingest + SSE memory 事件 + 预算历史 + 记忆注入）

**Files:**
- Modify: `apps/api/src/contexts/world-builder/world-builder-agent.ts`（`WorldBuilderInput` 增 `memoryDigest`）
- Modify: `apps/api/src/contexts/world-builder/prompt.ts`（prompt 增记忆段）
- Modify: `apps/api/src/routes/world.ts`（`createAssistantReply` 重构 + 两条路由接线）

- [ ] **Step 1: world-builder-agent.ts — WorldBuilderInput 加字段，respond 传入 prompt**

`WorldBuilderInput` 接口追加：

```ts
  /** 长期记忆召回摘要（M1 记忆系统注入；null/空串表示无）。 */
  memoryDigest?: string | null;
```

`respond()` 内 `completeStructured` 调用中，`system_prompt` 参数改为：

```ts
system_prompt: buildWorldBuilderSystemPrompt(
  input.world,
  input.stage,
  input.focus,
  input.memoryDigest ?? null,
),
```

- [ ] **Step 2: prompt.ts — buildWorldBuilderSystemPrompt 增第四参**

签名改为：

```ts
export function buildWorldBuilderSystemPrompt(
  world: WorldContext | null,
  stage: 'bootstrap' | 'growing' | 'mature',
  focus?: WorldBuilderFocus | null,
  memoryDigest?: string | null,
): string {
```

模板字符串中，在 `${formatFocusPrompt(focus)}` 之后、`## 当前缺口` 之前插入：

```ts
${memoryDigest ? `\n## 相关记忆（历史对话的长期记忆，仅供理解，已确认事实勿重复提案）\n${memoryDigest}\n` : ''}
```

- [ ] **Step 3: world.ts — createAssistantReply 重构**

import 区追加：

```ts
import { formatMemoryDigest } from '../contexts/memory/retrieval.js';
import type { MemoryIngestOps } from '@zivith/domain';
import type { MemoryService } from '../contexts/memory/service.js';
```

`registerWorldRoutes` 与 `registerCreatorChatRoutes` 增加参数 `memory?: MemoryService | null`（`registerWorldRoutes(app, db, llm, llmModel, memory)` → `registerCreatorChatRoutes(app, db, llm, llmModel, memory)`）。

`createAssistantReply` 整体替换为：

```ts
async function createAssistantReply(
  db: PrismaClient,
  builder: WorldBuilderAgent,
  thread: { id: string; projectId: string | null },
  userMessage: { id: string; content: string },
  focus?: z.infer<typeof sendMessageBody>['focus'],
  memory?: MemoryService | null,
) {
  const rows = await db.creatorChatMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  const historyRows = rows.filter((row) => row.id !== userMessage.id);
  const world = thread.projectId ? await buildWorldContext(db, thread.projectId) : null;

  // M1 记忆：同步归档 + 三路召回注入
  let memoryOps: MemoryIngestOps | null = null;
  let memoryDigest: string | null = null;
  if (memory && thread.projectId) {
    memoryOps = await memory.ingest({
      messageId: userMessage.id,
      threadId: thread.id,
      projectId: thread.projectId,
      content: userMessage.content,
      world,
    });
    const retrieved = await memory.retrieve({
      projectId: thread.projectId,
      text: userMessage.content,
      world,
    });
    memoryDigest = formatMemoryDigest(retrieved) || null;
  }

  // M1 上下文窗口：滚动摘要 + 预算内最近原文（无 memory 时回退最近 40 条）
  let history: WorldBuilderChatMessage[];
  let evicted: Array<{ id: string; role: string; content: string }> = [];
  if (memory) {
    const window = await memory.getContextWindow(
      thread.id,
      historyRows.map((row) => ({ id: row.id, role: row.role, content: row.content })),
    );
    history = window.window.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    evicted = window.evicted;
  } else {
    history = historyRows.slice(-40).map((row) => ({
      role:
        row.role === 'user' || row.role === 'assistant' || row.role === 'system'
          ? row.role
          : 'system',
      content: row.content,
    }));
  }

  const response = await builder.respond({
    text: userMessage.content,
    history,
    world,
    stage: inferWorldStage(world),
    focus: focus ?? null,
    memoryDigest,
  });
  const proposalKey =
    response.proposals.length > 0
      ? `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      : null;
  const assistantMessage = await db.creatorChatMessage.create({
    data: {
      threadId: thread.id,
      role: 'assistant',
      content: response.reply,
      ...(response.proposals.length > 0
        ? {
            proposal: response.proposals as unknown as Prisma.InputJsonValue,
            proposalKey,
            proposalState: 'pending',
          }
        : {}),
    },
  });
  if (memory && evicted.length > 0) {
    await memory.updateThreadSummary(thread.id, evicted);
  }
  return { assistantMessage, response, memoryOps };
}
```

- [ ] **Step 4: world.ts — 两条调用点适配**

非流式路由 `POST /creator-chats/:threadId/messages` 中，原调用 `createAssistantReply(db, builder, thread, body.content, body.focus)` 改为 `createAssistantReply(db, builder, thread, { id: userMessage.id, content: body.content }, body.focus, memory)`；返回体追加 `memory_ops: memoryOps`（DTO 手写 snake_case，与既有风格一致）。

`pipeCreatorChatSse` 中：函数签名增 `memory?: MemoryService | null`；内部调用 `createAssistantReply` 改传 `{ id: userMessage.id, content: userMessage.content }` 与 `memory`；在拿到返回值后、`streamReplyChunks` 之前插入：

```ts
    if (memoryOps) {
      writeEvent('memory', { ops: memoryOps });
    }
```

（`memoryOps` 从 `createAssistantReply` 返回值解构。）

- [ ] **Step 5: 全量测试 + 类型检查**

Run: `pnpm --filter @zivith/api test && pnpm --filter @zivith/api typecheck`
Expected: 全部 PASS（既有 world-builder 测试不受影响——`memoryDigest` 可选）。

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/world.ts apps/api/src/contexts/world-builder
git commit -m "feat(memory): wire ingest, retrieval digest and budgeted history into creator chat"
```

---

### Task 14: 记忆 API 路由 + app/server 接线

**Files:**
- Create: `apps/api/src/routes/memory.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: 写 routes/memory.ts**

```ts
// apps/api/src/routes/memory.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import type { MemoryService } from '../contexts/memory/service.js';

const idSchema = z.string().min(1).max(128);

function atomDto(atom: {
  id: string;
  entityType: string | null;
  entityId: string | null;
  factType: string;
  content: string;
  status: string;
  memoryOp: string;
  sourceMessageId: string | null;
  threadId: string | null;
  confidence: number;
  createdAt: Date;
}) {
  return {
    id: atom.id,
    entity_type: atom.entityType,
    entity_id: atom.entityId,
    fact_type: atom.factType,
    content: atom.content,
    status: atom.status,
    memory_op: atom.memoryOp,
    source_message_id: atom.sourceMessageId,
    thread_id: atom.threadId,
    confidence: atom.confidence,
    created_at: atom.createdAt.toISOString(),
  };
}

function coreDto(core: {
  id: string;
  kind: string;
  topic: string;
  content: string;
  version: number;
  sourceAtomIds: string[];
  updatedAt: Date;
}) {
  return {
    id: core.id,
    kind: core.kind,
    topic: core.topic,
    content: core.content,
    version: core.version,
    source_atom_ids: core.sourceAtomIds,
    updated_at: core.updatedAt.toISOString(),
  };
}

/** 记忆面板 + 调试 API（ADR-0013 本地单用户，随 world 路由免登录）。 */
export function registerMemoryRoutes(app: FastifyInstance, memory: MemoryService) {
  app.get('/projects/:projectId/atoms', async (request) => {
    const { projectId } = z
      .object({ projectId: idSchema })
      .strict()
      .parse(request.params);
    const query = z
      .object({
        entity_type: z.string().max(64).optional(),
        entity_id: z.string().max(128).optional(),
        page: z.coerce.number().int().min(1).default(1),
        page_size: z.coerce.number().int().min(1).max(50).default(20),
      })
      .strict()
      .parse(request.query ?? {});
    const result = await memory.listAtoms(projectId, {
      entityType: query.entity_type,
      entityId: query.entity_id,
      page: query.page,
      pageSize: query.page_size,
    });
    return { items: result.items.map(atomDto), total: result.total, page: query.page };
  });

  app.get('/projects/:projectId/cores', async (request) => {
    const { projectId } = z
      .object({ projectId: idSchema })
      .strict()
      .parse(request.params);
    const cores = await memory.listCores(projectId);
    return { items: cores.map(coreDto) };
  });

  app.delete('/atoms/:atomId', async (request) => {
    const { atomId } = z.object({ atomId: idSchema }).strict().parse(request.params);
    const ok = await memory.invalidateAtom(atomId);
    if (!ok) throw new ApiError(404, 'ATOM_NOT_FOUND', '记忆原子不存在或已失效');
    return { ok: true };
  });

  app.post('/rebuild', async (request) => {
    const body = z
      .object({ project_id: idSchema })
      .strict()
      .parse(request.body ?? {});
    return memory.rebuildVectors(body.project_id);
  });

  app.post('/search', async (request) => {
    const body = z
      .object({ project_id: idSchema, query: z.string().trim().min(1).max(2_000), top_k: z.coerce.number().int().min(1).max(24).default(8) })
      .strict()
      .parse(request.body ?? {});
    const world = await memory.projectWorld(body.project_id);
    const items = await memory.retrieve({
      projectId: body.project_id,
      text: body.query,
      world,
      topK: body.top_k,
    });
    return { items };
  });
}
```

service.ts 追加透传方法：

```ts
  async projectWorld(projectId: string): Promise<WorldContext | null> {
    return this.deps.store.buildWorldContext(projectId);
  }
```

- [ ] **Step 2: app.ts 接线**

`BuildAppOptions` 增字段：

```ts
  memory?: MemoryService;
```

import 增：

```ts
import type { MemoryService } from './contexts/memory/service.js';
import { registerMemoryRoutes } from './routes/memory.js';
```

world 路由注册处传入（`registerWorldRoutes(worldApi, db, worldProviders.llm, worldProviders.llmModel, options.memory)`），并在其下方追加：

```ts
      if (options.memory) {
        api.register(
          (memoryApi, _memoryOptions, memoryDone) => {
            registerMemoryRoutes(memoryApi, options.memory!);
            memoryDone();
          },
          { prefix: '/memory' },
        );
      }
```

- [ ] **Step 3: server.ts 接线**

import 增：

```ts
import { LocalVectorStore } from './adapters/memory/local-vector-store.js';
import { MockEmbeddingAdapter } from './adapters/memory/mock-embedding.js';
import { MemoryService } from './contexts/memory/service.js';
import { createMemoryQueueRuntime } from './contexts/memory/queue-runtime.js';
import { instrumentProviderBundle } from './contexts/usage/instrument.js';
```

在 `const queueRuntime = ...` 之后追加：

```ts
const memoryVectorStore = new LocalVectorStore(
  process.env.MEMORY_VECTOR_DIR ?? 'data/memory-vectors',
);
const memoryProviders = instrumentProviderBundle(
  prisma,
  createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()),
);
const memoryService = new MemoryService({
  store: new PrismaMemoryStore(prisma),
  vectorStore: memoryVectorStore,
  embedding: new MockEmbeddingAdapter(),
  llm: memoryProviders.llm,
  llmModel: memoryProviders.llmModel,
});
const memoryRuntime = createMemoryQueueRuntime(memoryService);
```

（import `PrismaMemoryStore`：`import { PrismaMemoryStore } from './contexts/memory/prisma-store.js';`）

`buildApp({...})` 增 `memory: memoryService`；`shutdown` 与 listen 失败分支追加 `await memoryRuntime.close(); memoryVectorStore.close();`；启动日志追加 `memoryQueueMode: memoryRuntime.mode`。

- [ ] **Step 4: 类型检查 + 全量测试**

Run: `pnpm --filter @zivith/api typecheck && pnpm --filter @zivith/api test`
Expected: PASS。

- [ ] **Step 5: 手动冒烟（可选，需本地环境）**

Run: `pnpm --filter @zivith/api dev`，然后 `curl -X POST http://localhost:4000/api/v1/world/creator-chats -H "Content-Type: application/json" -d '{"title":"记忆测试"}'` 创建线程 → 发一条消息 → `curl http://localhost:4000/api/v1/memory/projects/<projectId>/atoms` 查看归档结果。
Expected: atoms 列表返回刚归档的事实。

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/memory.ts apps/api/src/app.ts apps/api/src/server.ts apps/api/src/contexts/memory/service.ts
git commit -m "feat(memory): memory api routes and runtime wiring"
```

---

### Task 15: 前端 — 对话流记忆反馈

**Files:**
- Modify: `apps/web/lib/api.ts`（`sendCreatorChatTurn` 透传 memory_ops）
- Modify: `apps/web/components/creator-chat/chat-panel.tsx`

- [ ] **Step 1: api.ts — 非流式分支透传**

`sendCreatorChatTurn` 的非流式 payload 处理中，`onEvent('user', ...)` 之后追加：

```ts
  if (payload.memory_ops) onEvent('memory', { ops: payload.memory_ops });
```

payload 类型断言同步扩为 `{ user_message?: unknown; assistant_message?: unknown; memory_ops?: unknown }`。

- [ ] **Step 2: chat-panel.tsx — 处理 memory 事件并展示**

组件内新增状态：

```ts
const [memoryNote, setMemoryNote] = useState('');
```

`sendContent` 的 `onEvent` 回调中，`if (event === 'delta' ...)` 分支之前追加：

```ts
            if (event === 'memory') {
              const ops = asRecord(record?.ops);
              if (ops) setMemoryNote(formatMemoryOps(ops));
              return;
            }
```

`sendContent` 开始时清空：`setMemoryNote('')`。组件内新增工具函数（文件底部）：

```ts
function formatMemoryOps(ops: Record<string, unknown>): string {
  const added = Number(ops.added ?? 0);
  const updated = Number(ops.updated ?? 0);
  const noop = Number(ops.noop ?? 0);
  const conflicts = Array.isArray(ops.conflicts) ? ops.conflicts.length : 0;
  const parts = [`归档 ${added}`];
  if (updated > 0) parts.push(`合并 ${updated}`);
  if (noop > 0) parts.push(`重复 ${noop}`);
  if (conflicts > 0) parts.push(`冲突 ${conflicts}（待确认）`);
  return `记忆：${parts.join(' · ')}`;
}
```

渲染：在发送中指示器（`sending` 相关 JSX）旁追加一行：

```tsx
{memoryNote && !sending && (
  <p className="px-1 pb-1 text-xs text-zinc-400">{memoryNote}</p>
)}
```

（放在消息列表与输入框之间、与发送状态指示同级的位置；若该处结构不同，放在 `streamText` 展示块之后即可。）

- [ ] **Step 3: 手动验证**

Run: `pnpm --filter @zivith/web dev`
Expected: 发送「林澈性格冷静」后，回复完成后显示「记忆：归档 1」；重复发送显示「记忆：重复 1」。

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/api.ts apps/web/components/creator-chat/chat-panel.tsx
git commit -m "feat(memory): show memory ops feedback in creator chat"
```

---

### Task 16: 前端 — 世界工作区记忆面板

**Files:**
- Create: `apps/web/components/world/memory-panel.tsx`
- Modify: `apps/web/components/world/world-workspace.tsx`

- [ ] **Step 1: 写 memory-panel.tsx**

```tsx
// apps/web/components/world/memory-panel.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';

interface MemoryAtomItem {
  id: string;
  entity_type: string | null;
  entity_id: string | null;
  fact_type: string;
  content: string;
  created_at: string;
}

const FACT_LABEL: Record<string, string> = {
  trait: '性格',
  desire: '目标',
  event: '事件',
  relation: '关系',
  rule: '规则',
  preference: '偏好',
  constraint: '约束',
  episodic: '事实',
};

export function MemoryPanel({ projectId }: { projectId: string }) {
  const [atoms, setAtoms] = useState<MemoryAtomItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const value = await api<{ items?: MemoryAtomItem[]; total?: number }>(
        `/memory/projects/${projectId}/atoms?page=1&page_size=20`,
      );
      setAtoms(Array.isArray(value.items) ? value.items : []);
      setTotal(Number(value.total ?? 0));
      setError('');
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (atomId: string) => {
    setBusy(true);
    try {
      await api(`/memory/atoms/${atomId}`, { method: 'DELETE' });
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const rebuild = async () => {
    setBusy(true);
    try {
      await api('/memory/rebuild', { method: 'POST', body: { project_id: projectId } });
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-line bg-white/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-700">长期记忆（L1 原子）</h3>
        <button
          type="button"
          onClick={() => void rebuild()}
          disabled={busy}
          className="rounded border border-line px-2 py-0.5 text-xs text-zinc-500 hover:border-accent/60 hover:text-accent disabled:opacity-50"
        >
          重建向量
        </button>
      </div>
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
      {atoms.length === 0 ? (
        <p className="text-xs text-zinc-400">还没有归档的记忆。在 Creator Chat 中聊设定即可沉淀。</p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto">
          {atoms.map((atom) => (
            <li key={atom.id} className="flex items-start justify-between gap-2 text-xs">
              <div className="min-w-0">
                <span className="mr-1.5 inline-flex rounded border border-line px-1 py-0.5 text-[10px] text-zinc-500">
                  {FACT_LABEL[atom.fact_type] ?? atom.fact_type}
                </span>
                <span className="break-words text-zinc-700">{atom.content}</span>
              </div>
              <button
                type="button"
                onClick={() => void remove(atom.id)}
                disabled={busy}
                className="shrink-0 text-zinc-400 hover:text-red-500 disabled:opacity-50"
                title="删除该记忆"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {total > atoms.length && (
        <p className="mt-1.5 text-[10px] text-zinc-400">共 {total} 条，仅显示最近 20 条</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: world-workspace.tsx 挂载**

打开 [world-workspace.tsx](../../apps/web/components/world/world-workspace.tsx)，在右栏组合中 `<CoPilotPanel` 组件之后（同级）插入：

```tsx
<MemoryPanel projectId={projectId} />
```

并在文件顶部 import：

```ts
import { MemoryPanel } from './memory-panel';
```

（若右栏无 CoPilotPanel 或 projectId 变量名不同，以文件实际为准：放在右栏最后一个面板之后，projectId 取该组件现有的项目 id prop。）

- [ ] **Step 3: 手动验证**

Run: `pnpm --filter @zivith/web dev`
Expected: 打开项目 `/world` 页，右栏出现「长期记忆（L1 原子）」卡片；删除单条后列表刷新；「重建向量」返回 rebuilt 数量。

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/world/memory-panel.tsx apps/web/components/world/world-workspace.tsx
git commit -m "feat(memory): world workspace memory panel"
```

---

### Task 17: ADR-0014 与文档同步

**Files:**
- Create: `docs/architecture/adr/0014-layered-memory-system.md`
- Modify: `docs/planning/Development-Log.md`

- [ ] **Step 1: 写 ADR-0014**

```markdown
# ADR-0014: 分层记忆系统

- 状态：Accepted
- 日期：2026-08-23
- 关联：ADR-0007、ADR-0008、ADR-0010、ADR-0013；[Memory-Novel-Roleplay-Design.md](../../planning/Memory-Novel-Roleplay-Design.md)

## 背景

Creator Chat 每轮只携带近期消息 + 世界状态快照：跨会话遗忘、上下文溢出只能截断、对话中的细节大量流失。业界成熟方案（Mem0 / Letta / Zep / 腾讯 AgentMemory）均收敛于「提取-分层-检索」管线。

## 决策

1. 三层记忆：L0 原文（CreatorChatMessage，永不删改）→ L1 原子（MemoryAtom，最小事实单元，带指纹与时间效度）→ L2 核心（MemoryCore，分主题凝练）。
2. PostgreSQL 为唯一事实源；本地 sqlite 向量文件是可随时重建的派生索引（`data/memory-vectors/<projectId>.sqlite`）。
3. 双路径管线：同步规则快速路径（当轮归档 + SSE 反馈）+ 队列驱动异步深加工（LLM 精炼 / L2 聚合 / 向量化），复用 QueuePort 双实现。
4. 写入边界（沿用 ADR-0010 混合制）：补充性事实自动沉淀记忆层；世界实体仍走提案确认；规则冲突（反义词对）上报不写入。
5. 记忆操作可审计：每次提炼显式产出 ADD/UPDATE/NOOP/CONFLICT（Mem0 式）。
6. 双时态：事实被取代置 superseded + validTo，不物理删除（Zep 式）。
7. 检索三路混合（实体链接 + 向量 + bigram 关键词）RRF 融合；无密钥轨全功能可用（Mock embedding = bigram 哈希向量）。
8. 上下文窗口（ThreadContextState）：滚动摘要 + 最近 K 条原文按预算分配；压缩只作用于 prompt，事实已在 L1/L2 无损保存。

## 后果

- Creator Chat 获得跨会话长期记忆与自动压缩；M2 小说导入、M3 角色扮演直接复用该管线。
- 新增本地依赖 better-sqlite3（预编译二进制）；向量文件损坏可从 PG 全量重建。
- 冲突确认流程（写库持久化）与 SiliconFlow 真实 embedding 适配器推迟到 M2。
```

- [ ] **Step 2: Development-Log.md 顶部追加一条**

```markdown
## 2026-08-23 — M1 记忆地基 + 上下文管理器落地

- 分层记忆（L0/L1/L2）+ 双路径管线 + 三路混合检索 + ThreadContextState 滚动摘要压缩（[Memory-Novel-Roleplay-Design.md](Memory-Novel-Roleplay-Design.md)，ADR-0014）
- Creator Chat SSE 新增 `memory` 事件；世界工作区右栏新增记忆面板；`/api/v1/memory/*` 免登录 API
- mock-first：无任何密钥时规则提炼 + bigram 检索全链路可用
```

（格式对齐该文件既有条目；若日志为倒序列表而非标题分节，按现有格式改写。）

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/adr/0014-layered-memory-system.md docs/planning/Development-Log.md
git commit -m "docs: adr-0014 layered memory system and development log"
```

---

## 验收清单（M1 Definition of Done）

- [ ] `pnpm --filter @zivith/api test` 全绿（8 个新测试文件 + 既有测试）
- [ ] `pnpm --filter @zivith/api typecheck` 通过
- [ ] 无密钥启动 API + Web，在 Creator Chat 中：
  - [ ] 发送「林澈性格冷静」→ 回复后显示「记忆：归档 1」
  - [ ] 再次发送同义句 → 显示「记忆：重复 1」（无新原子）
  - [ ] 发送反义设定（「林澈性格阴郁」vs「林澈性格开朗」）→ 显示「冲突 1（待确认）」
  - [ ] `/world` 右栏记忆面板可见原子，可删除
- [ ] 有 DeepSeek 密钥时：发送消息后稍候，`memory_pipeline_states.status = 'done'` 且 `extraction_mode = 'llm'`，`memory_cores` 出现 persona 条目
- [ ] 长对话（>16 条消息）后 `thread_context_states.rolling_summary` 非空，且 Agent 回答仍保持早期事实一致性（问「还记得之前说的林澈吗」能答上）
- [ ] `data/memory-vectors/<projectId>.sqlite` 生成；删除该文件后点「重建向量」恢复

## 风险与回退

- better-sqlite3 在目标环境无预编译二进制 → 回退方案：向量检索路禁用（service 构造不传 vectorStore），关键词 + 实体链接召回仍完整可用。
- BullMQ 环境下 `memory_refine` worker 异常 → pipeline 状态机 attempts ≥ 3 置 failed，可对单条消息手动重跑（POST /rebuild 或直接重新入队）；不影响同步路径。
- 上下文预算过小导致摘要膨胀 → `MEMORY_CONTEXT_TOKEN_BUDGET` 环境变量可调（默认 24000）。
