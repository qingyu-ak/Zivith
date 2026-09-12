/**
 * verify-proposal-flow.ts — 端到端验证 Creator Chat 提案管线（mock 模式）。
 *
 * 做什么：
 *   1. 在当前进程内用 mock LLM（规则引擎，零外部调用）构建一个临时 API 实例，
 *      监听随机端口，走真实 HTTP 路由层（含错误映射 / snake_case 序列化）。
 *   2. 模拟一段多实体创建对话流：建项目 → 角色 → 地点 → 事件 → 增量角色 → 关系，
 *      每轮断言提案 kind、apply 结果，并直接查库验证字段级落库完整性
 *      （project/asset/world_event/relationship 的关键字段 + 归属 + 状态）。
 *   3. 覆盖错误路径：无提案 apply(400)、重复 apply(409)、已有项目再建项目(400)。
 *   4. 结束后清理测试数据并关闭实例。
 *
 * 运行（在项目根目录）：
 *   node ".\node_modules\tsx\dist\cli.mjs" ".\apps\api\scripts\verify-proposal-flow.ts"
 *
 * 退出码：全部通过 0；任一失败 1。设置 KEEP=1 可保留测试数据。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Must be set BEFORE the app module loads — the world route bundle reads it at startup.
process.env.LLM_PROVIDER = 'mock';

// The running API loads .env via server.ts (dotenv). This script must do the
// same BEFORE importing @zivith/database, because PrismaClient resolves
// DATABASE_URL from process.env at instantiation time.
const envPath = resolve(import.meta.dirname, '../../../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (key && rawValue !== undefined && process.env[key] === undefined) {
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  }
}

type Json = Record<string, unknown>;

interface HttpResponse {
  status: number;
  json: Json | null;
}

async function request(
  base: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<HttpResponse> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: Json | null = null;
  try {
    json = text ? (JSON.parse(text) as Json) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

interface CheckResult {
  label: string;
  ok: boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function check(label: string, ok: boolean, detail?: string): void {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}

/** 安全转字符串：未知类型（含对象）避免隐式 '[object Object]'。 */
function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value) ?? '';
}

function kindsOf(response: HttpResponse): string[] {
  const assistant = response.json?.assistant_message as Json | undefined;
  const proposal = assistant?.proposal;
  const list = Array.isArray(proposal) ? proposal : proposal ? [proposal] : [];
  return list
    .map((item) => (typeof item === 'object' && item !== null ? (item as Json).kind : undefined))
    .filter((value): value is string => typeof value === 'string');
}

async function expectKinds(
  base: string,
  threadId: string,
  content: string,
  expected: string[],
  label: string,
): Promise<string | null> {
  const response = await request(base, 'POST', `/world/creator-chats/${threadId}/messages`, {
    role: 'user',
    content,
  });
  const actual = kindsOf(response);
  const ok = response.status === 201 && JSON.stringify(actual) === JSON.stringify(expected);
  check(label, ok, `${actual.join(',') || '(none)'}`);
  if (!ok) {
    console.log('      body:', JSON.stringify(response.json)?.slice(0, 300));
    return null;
  }
  return (response.json?.assistant_message as Json | undefined)?.id as string | null;
}

async function expectApply(
  base: string,
  threadId: string,
  messageId: string,
  expectedStatus: number,
  expectedCode: string | null,
  label: string,
): Promise<HttpResponse | null> {
  const response = await request(
    base,
    'POST',
    `/world/creator-chats/${threadId}/proposals/${messageId}/apply`,
    {},
  );
  const code = (response.json?.error as Json | undefined)?.code as string | undefined;
  check(
    label,
    response.status === expectedStatus && (expectedCode === null || code === expectedCode),
    `status=${response.status} code=${code ?? '—'}`,
  );
  return response.status === expectedStatus ? response : null;
}

function main(): Promise<number> {
  return (async () => {
    // Dynamic imports so PrismaClient instantiates AFTER .env is loaded.
    const [{ buildApp }, { prisma }] = await Promise.all([
      import('../src/app.ts'),
      import('@zivith/database'),
    ]);

    console.log('== 0. 构建临时 API（mock LLM，随机端口）==');
    let app: Awaited<ReturnType<typeof buildApp>>;
    try {
      app = await buildApp({
        logger: false,
        jwtSecret: 'verify-proposal-flow-local-secret-000',
      });
    } catch (error) {
      console.error('构建 API 失败（确认 docker compose up -d 已启动 postgres/redis）:', error);
      return 1;
    }
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const base = `http://127.0.0.1:${port}/api/v1`;
    console.log(`临时 API 已就绪: ${base}`);

    let threadId: string | null = null;
    let projectId: string | null = null;
    let appliedMessageId: string | null = null;
    let cleanupOk = true;

    // —— 数据库落库完整性断言 helper：直接查库验证字段级持久化 ——
    // 注：期望值来自 mock 规则引擎（world-builder-agent.ts）的确定性输出，
    // 若 mock 规则调整，需同步更新此处期望。
    const expectAssetRow = async (
      entityId: string | undefined,
      expected: {
        label: string;
        name: string;
        type: 'character' | 'location';
        description: string;
      },
    ) => {
      const row = entityId ? await prisma.asset.findUnique({ where: { id: entityId } }) : null;
      check(
        `DB: ${expected.label} 基础字段（name/type/state/project）`,
        Boolean(
          row &&
          row.name === expected.name &&
          row.type === expected.type &&
          row.state === 'draft' &&
          row.deletedAt === null &&
          row.projectId === projectId,
        ),
        row ? `${row.name}/${row.type}/${row.state}` : '—',
      );
      check(
        `DB: ${expected.label} description 已持久化`,
        row?.description === expected.description,
        row?.description ?? '—',
      );
      return row;
    };

    const expectWorldEventRow = async (entityId: string | undefined, titleSubstr: string) => {
      const row = entityId ? await prisma.worldEvent.findUnique({ where: { id: entityId } }) : null;
      check(
        'DB: 事件 title/description/state 持久化',
        Boolean(
          row &&
          typeof row.title === 'string' &&
          row.title.includes(titleSubstr) &&
          row.description === '由对话引导创建的世界事件' &&
          row.state === 'draft' &&
          row.deletedAt === null &&
          row.projectId === projectId,
        ),
        row ? `${row.title} / ${row.state}` : '—',
      );
      check(
        'DB: 事件 world_time_envelope 持久化',
        Boolean(row && (row.worldTimeEnvelope as Json | null)?.order === 1),
        JSON.stringify(row?.worldTimeEnvelope ?? null),
      );
      check(
        'DB: 事件 presentation_order=1（项目内首个事件）',
        row?.presentationOrder === 1,
        String(row?.presentationOrder ?? '—'),
      );
      return row;
    };

    const expectRelationshipRow = async (entityId: string | undefined) => {
      const row = entityId
        ? await prisma.relationship.findUnique({ where: { id: entityId } })
        : null;
      check(
        'DB: 关系 kind/sourceType/targetType 持久化',
        Boolean(
          row &&
          row.kind === 'bond' &&
          row.sourceType === 'asset' &&
          row.targetType === 'asset' &&
          row.projectId === projectId,
        ),
        row ? `${row.kind}/${row.sourceType}/${row.targetType}` : '—',
      );
      check(
        'DB: 关系 direction/label/description/state 持久化',
        Boolean(
          row &&
          row.direction === 'undirected' &&
          row.label === '同伴' &&
          row.description === '由对话引导创建的角色关系' &&
          row.state === 'draft',
        ),
        row ? `${row.direction}/${row.label ?? '—'}/${row.state}` : '—',
      );
      if (row?.sourceId && row?.targetId) {
        const [src, tgt] = await Promise.all([
          prisma.asset.findFirst({
            where: { id: row.sourceId, projectId: projectId ?? undefined },
          }),
          prisma.asset.findFirst({
            where: { id: row.targetId, projectId: projectId ?? undefined },
          }),
        ]);
        check(
          'DB: 关系两端引用项目内真实角色',
          Boolean(src) && Boolean(tgt),
          `${row.sourceId} / ${row.targetId}`,
        );
      }
      return row;
    };

    try {
      console.log('\n== 1. 创建会话 + 首条世界观消息 ==');
      const thread = await request(base, 'POST', '/world/creator-chats', { title: '验证对话流' });
      threadId = thread.json?.id as string | null;
      const seededProjectId = asString(thread.json?.project_id);
      check('创建会话返回 201 且含 id', thread.status === 201 && Boolean(threadId));
      check('创建会话即打开世界项目（空工作区）', Boolean(seededProjectId), seededProjectId);
      if (!threadId) return 1;

      const m1 = await expectKinds(
        base,
        threadId,
        '我想做一个玄幻世界，主角叫韩立，一个资质平庸的凡人修士',
        ['create_project'],
        '消息1：空工作区仍产出 create_project（改名而不是再建项目）',
      );
      if (!m1) return cleanupOk ? 1 : 1;

      console.log('\n== 2. 确认首条提案（创建项目）==');
      const apply1 = await expectApply(base, threadId, m1, 200, null, 'apply 项目提案返回 200');
      const applied1 = (apply1?.json?.applied as Json[] | undefined) ?? [];
      check(
        '应用结果包含 project 实体',
        applied1.some((item) => item.entity_type === 'project'),
        applied1.map((item) => `${asString(item.entity_type)}:${asString(item.title)}`).join(', '),
      );
      projectId = applied1[0]?.project_id as string | null;
      appliedMessageId = m1;
      if (!projectId) return 1;
      check(
        '确认提案改名同一工作区，不另建项目',
        Boolean(seededProjectId) && projectId === seededProjectId,
        `${seededProjectId} → ${projectId}`,
      );

      // DB 层：项目字段完整性（apply 直接查库验证）
      const dbProject = projectId
        ? await prisma.project.findUnique({ where: { id: projectId } })
        : null;
      check(
        'DB: project.name/description 持久化',
        dbProject?.name === '新 IP 世界' &&
          dbProject?.description === '由 Creator Chat 引导创建的世界',
        dbProject ? `${dbProject.name} / ${dbProject.description ?? '—'}` : '—',
      );
      check(
        'DB: project.ownerId 已关联本地用户',
        Boolean(dbProject?.ownerId),
        dbProject?.ownerId ?? '—',
      );
      check(
        'DB: project.defaults/settings 持久化',
        JSON.stringify(dbProject?.defaults ?? {}) === JSON.stringify({ language: 'zh-CN' }) &&
          JSON.stringify(dbProject?.settings ?? {}) === JSON.stringify({ creator_layer: true }),
        JSON.stringify(dbProject?.defaults) + ' / ' + JSON.stringify(dbProject?.settings),
      );
      const dbTimeline = projectId
        ? await prisma.projectTimeline.findFirst({ where: { projectId, deletedAt: null } })
        : null;
      check(
        'DB: 建项目自动创建 World Line timeline',
        dbTimeline?.name === 'World Line',
        dbTimeline?.name ?? '—',
      );
      const dbThread = threadId
        ? await prisma.creatorChatThread.findUnique({ where: { id: threadId } })
        : null;
      check(
        'DB: thread.project_id 已持久化',
        dbThread?.projectId === projectId,
        dbThread?.projectId ?? '—',
      );

      const after = await request(base, 'GET', `/world/creator-chats/${threadId}`);
      check(
        '会话已关联项目（关联修复点）',
        (after.json?.thread as Json | undefined)?.project_id === projectId,
        `project_id=${asString((after.json?.thread as Json | undefined)?.project_id)}`,
      );

      console.log('\n== 3. 角色消息 ==');
      const m2 = await expectKinds(
        base,
        threadId,
        '主角叫韩立，一个资质平庸的凡人修士',
        ['create_character'],
        '消息2：主角 → create_character',
      );
      if (!m2) return 1;
      const apply2 = await expectApply(base, threadId, m2, 200, null, 'apply 角色提案返回 200');
      appliedMessageId = m2;
      const charTitle = ((apply2?.json?.applied as Json[] | undefined) ?? [])[0]?.title;
      check('角色「韩立」已入库', charTitle === '韩立', asString(charTitle));
      const hanId = ((apply2?.json?.applied as Json[] | undefined) ?? [])[0]?.entity_id as
        string | undefined;
      await expectAssetRow(hanId, {
        label: '韩立',
        name: '韩立',
        type: 'character',
        description: '由对话引导创建的角色',
      });

      console.log('\n== 4. 地点消息 ==');
      const m3 = await expectKinds(
        base,
        threadId,
        '记录一个地点：天南大陆，修仙者以宗门划分势力',
        ['create_location'],
        '消息3：地点 → create_location',
      );
      if (!m3) return 1;
      const apply3 = await expectApply(base, threadId, m3, 200, null, 'apply 地点提案返回 200');
      const locTitle = ((apply3?.json?.applied as Json[] | undefined) ?? [])[0]?.title;
      check('地点「天南大陆」已入库', locTitle === '天南大陆', asString(locTitle));
      const locId = ((apply3?.json?.applied as Json[] | undefined) ?? [])[0]?.entity_id as
        string | undefined;
      await expectAssetRow(locId, {
        label: '天南大陆',
        name: '天南大陆',
        type: 'location',
        description: '由对话引导创建的核心地点',
      });

      console.log('\n== 5. 事件消息 ==');
      const m4 = await expectKinds(
        base,
        threadId,
        '记录一个事件：三百年后天南大陆灵气枯竭，修仙界大乱',
        ['create_world_event'],
        '消息4：事件 → create_world_event',
      );
      if (!m4) return 1;
      const apply4 = await expectApply(base, threadId, m4, 200, null, 'apply 事件提案返回 200');
      const eventTitle = ((apply4?.json?.applied as Json[] | undefined) ?? [])[0]?.title;
      check(
        '事件已入库',
        typeof eventTitle === 'string' && eventTitle.includes('灵气枯竭'),
        asString(eventTitle),
      );
      const eventId = ((apply4?.json?.applied as Json[] | undefined) ?? [])[0]?.entity_id as
        string | undefined;
      await expectWorldEventRow(eventId, '灵气枯竭');

      console.log('\n== 6. 增量角色消息（已有角色再添角色）==');
      const m5 = await expectKinds(
        base,
        threadId,
        '记录一个角色：南宫婉，韩立的道侣',
        ['create_character'],
        '消息5：增量角色 → create_character',
      );
      if (!m5) return 1;
      const apply5 = await expectApply(base, threadId, m5, 200, null, 'apply 增量角色返回 200');
      const wanTitle = ((apply5?.json?.applied as Json[] | undefined) ?? [])[0]?.title;
      check('角色「南宫婉」已入库', wanTitle === '南宫婉', asString(wanTitle));
      const wanId = ((apply5?.json?.applied as Json[] | undefined) ?? [])[0]?.entity_id as
        string | undefined;
      await expectAssetRow(wanId, {
        label: '南宫婉',
        name: '南宫婉',
        type: 'character',
        description: '由对话引导创建的角色',
      });

      console.log('\n== 7. 关系消息 ==');
      const m6 = await expectKinds(
        base,
        threadId,
        '韩立和南宫婉是道侣关系',
        ['create_relationship'],
        '消息6：关系 → create_relationship',
      );
      if (!m6) return 1;
      const apply6 = await expectApply(base, threadId, m6, 200, null, 'apply 关系提案返回 200');
      const relTitle = ((apply6?.json?.applied as Json[] | undefined) ?? [])[0]?.title;
      check('关系已入库', Boolean(relTitle), asString(relTitle));
      const relId = ((apply6?.json?.applied as Json[] | undefined) ?? [])[0]?.entity_id as
        string | undefined;
      await expectRelationshipRow(relId);

      console.log('\n== 8. 提问消息（不应误触发提案）==');
      const m7 = await expectKinds(
        base,
        threadId,
        '主角还有什么秘密？天空之城在哪里？',
        [],
        '消息7：纯提问 → 无提案',
      );
      if (!m7) return 1;

      console.log('\n== 9. 错误路径 ==');
      await expectApply(
        base,
        threadId,
        m7,
        400,
        'NO_PROPOSAL',
        '对无提案消息 apply → 400 NO_PROPOSAL',
      );
      await expectApply(
        base,
        threadId,
        appliedMessageId,
        409,
        'PROPOSAL_ALREADY_HANDLED',
        '重复 apply 已应用提案 → 409 PROPOSAL_ALREADY_HANDLED',
      );

      // Simulate an LLM that wrongly proposes create_project after project exists.
      const rogue = await prisma.creatorChatMessage.create({
        data: {
          threadId: threadId,
          role: 'assistant',
          content: '（构造：错误的重复建项目提案）',
          proposal: [
            {
              kind: 'create_project',
              project_id: null,
              payload: { name: '重复项目' },
            },
          ],
          proposalKey: `rogue-${Date.now()}`,
          proposalState: 'pending',
        },
      });
      await expectApply(
        base,
        threadId,
        rogue.id,
        400,
        'PROJECT_ALREADY_EXISTS',
        '已有项目时再建项目 → 400 PROJECT_ALREADY_EXISTS',
      );

      console.log('\n== 10. 汇总落库（GET resources）==');
      const resources = await request(base, 'GET', `/world/projects/${projectId}/resources`);
      const entities = (resources.json?.entities as Json | undefined) ?? {};
      const characters = ((entities.characters as Json[] | undefined) ?? []).map((c) => c.name);
      const locations = ((entities.locations as Json[] | undefined) ?? []).map((l) => l.name);
      const worldEvents = (entities.world_events as Json[] | undefined) ?? [];
      const relationships = (entities.relationships as Json[] | undefined) ?? [];
      check(
        'resources: 2 角色',
        characters.includes('韩立') && characters.includes('南宫婉'),
        characters.map(asString).join(', '),
      );
      check(
        'resources: 1 地点',
        locations.includes('天南大陆'),
        locations.map(asString).join(', '),
      );
      check('resources: 1 事件', worldEvents.length >= 1, String(worldEvents.length));
      check('resources: 1 关系', relationships.length >= 1, String(relationships.length));

      console.log('\n== 11. DB 汇总计数（防多余/缺失实体）==');
      const dbCounts = await Promise.all([
        prisma.asset.count({ where: { projectId: projectId, deletedAt: null } }),
        prisma.worldEvent.count({ where: { projectId: projectId, deletedAt: null } }),
        prisma.relationship.count({ where: { projectId: projectId, deletedAt: null } }),
      ]);
      check(
        'DB: 项目内 3 个 asset（韩立/南宫婉/天南大陆）',
        dbCounts[0] === 3,
        String(dbCounts[0]),
      );
      check('DB: 项目内 1 个 world_event', dbCounts[1] === 1, String(dbCounts[1]));
      check('DB: 项目内 1 个 relationship', dbCounts[2] === 1, String(dbCounts[2]));

      // 混合批次回归：LLM 误产出 create_project 与真实实体提案混在同一消息，
      // 已有项目时应跳过 create_project（不阻断），实体照常应用。
      console.log('\n== 12. 混合批次（误报 create_project + 真实实体）==');
      const mixed = await prisma.creatorChatMessage.create({
        data: {
          threadId: threadId,
          role: 'assistant',
          content: '（构造：混合批次——误报 create_project + 新增角色）',
          proposal: [
            {
              kind: 'create_project',
              project_id: null,
              payload: { name: '重复项目' },
            },
            {
              kind: 'create_character',
              project_id: projectId,
              payload: {
                name: '测试混合角色',
                description: '由混合批次创建（create_project 应被跳过）',
              },
            },
          ],
          proposalKey: `mixed-${Date.now()}`,
          proposalState: 'pending',
        },
      });
      const mixedRes = await request(
        base,
        'POST',
        `/world/creator-chats/${threadId}/proposals/${mixed.id}/apply`,
        {},
      );
      check(
        '混合批次 apply → 200（不被 PROJECT_ALREADY_EXISTS 阻断）',
        mixedRes.status === 200,
        `status=${mixedRes.status}`,
      );
      const mixedJson = mixedRes.json as Json | undefined;
      const mixedApplied = ((mixedJson?.applied as Json[] | undefined) ?? []).map(
        (item) => item as Json,
      );
      const mixedSkipped = ((mixedJson?.skipped as Json[] | undefined) ?? []).map(
        (item) => item as Json,
      );
      check(
        '混合批次：create_project 被跳过（skipped 1 项）',
        mixedSkipped.length === 1 &&
          (mixedSkipped[0] as Record<string, unknown>).kind === 'create_project',
        JSON.stringify(mixedSkipped),
      );
      check(
        '混合批次：create_character 已应用（applied 1 项）',
        mixedApplied.length === 1 &&
          (mixedApplied[0] as Record<string, unknown>).entity_type === 'asset',
        JSON.stringify(mixedApplied),
      );
      const mixedAsset = await prisma.asset.findFirst({
        where: { projectId: projectId, name: '测试混合角色', deletedAt: null },
      });
      check('混合批次：角色已落库（draft）', Boolean(mixedAsset && mixedAsset.state === 'draft'));
      const mixedMsg = await prisma.creatorChatMessage.findUnique({ where: { id: mixed.id } });
      check(
        '混合批次：消息已标记 applied',
        mixedMsg?.proposalState === 'applied',
        String(mixedMsg?.proposalState),
      );
    } catch (error) {
      console.error('验证流程异常:', error);
    } finally {
      if (projectId || threadId) {
        if (process.env.KEEP === '1') {
          console.log(`\nKEEP=1：保留测试数据 thread=${threadId} project=${projectId}`);
        } else {
          try {
            // 按条件组装清理事务：thread 相关表挂在 threadId 下，项目相关表挂在 projectId 下。
            // 注意：projectId 相关模型的 projectId 为必填字段，传 null 会触发 Prisma 校验错误。
            const cleanupOps: Array<ReturnType<typeof prisma.relationship.deleteMany>> = [];
            if (threadId) {
              cleanupOps.push(prisma.creatorChatMessage.deleteMany({ where: { threadId } }));
              cleanupOps.push(prisma.creatorChatThread.deleteMany({ where: { id: threadId } }));
            }
            if (projectId) {
              cleanupOps.push(prisma.relationship.deleteMany({ where: { projectId } }));
              cleanupOps.push(prisma.worldEvent.deleteMany({ where: { projectId } }));
              cleanupOps.push(prisma.asset.deleteMany({ where: { projectId } }));
              cleanupOps.push(prisma.projectTimeline.deleteMany({ where: { projectId } }));
              cleanupOps.push(prisma.project.deleteMany({ where: { id: projectId } }));
            }
            if (cleanupOps.length > 0) await prisma.$transaction(cleanupOps);
            console.log('\n测试数据已清理');
          } catch (error) {
            cleanupOk = false;
            console.error('清理失败:', error);
          }
        }
      }
      await app.close();
      console.log('临时 API 已关闭');
    }

    const failed = results.filter((result) => !result.ok);
    console.log(`\n===== 结果: ${results.length - failed.length}/${results.length} 通过 =====`);
    if (failed.length > 0) {
      console.log('失败项:');
      for (const result of failed) console.log(`  - ${result.label}`);
      return 1;
    }
    return cleanupOk ? 0 : 1;
  })();
}

void main().then((code) => {
  process.exit(code);
});
