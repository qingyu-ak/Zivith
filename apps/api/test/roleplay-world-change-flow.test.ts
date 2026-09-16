// task-s25 Journey E（无密钥 mock 路径）：扮演说出一件事 → 回复带提案 → 确认 → 资源里能看到；
// 闲聊不出提案；拒绝不写库；重复确认 409。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { buildApp } from '../src/app.js';
import { createMemoryPrisma, type MemoryPrisma } from './helpers/memory-prisma.js';

interface MessageDto {
  id: string;
  role: string;
  content: string;
  proposal: unknown;
  proposal_key: string | null;
  proposal_state: string | null;
}

describe('roleplay → world change proposal → confirm (mock provider)', () => {
  let app: FastifyInstance;
  let db: MemoryPrisma;
  let roleplayId: string;
  let threadId: string;

  beforeAll(async () => {
    db = createMemoryPrisma();
    await db.user.create({
      data: { id: 'u1', email: 'local@zivith.local', passwordHash: '!', displayName: 'Local' },
    });
    await db.project.create({
      data: {
        id: 'p1',
        ownerId: 'u1',
        name: '雾港遗事',
        description: null,
        worldview: {},
        defaults: {},
        settings: {},
        workspacePath: null,
      },
    });
    await db.asset.create({
      data: {
        id: 'c-ailin',
        projectId: 'p1',
        type: 'character',
        state: 'draft',
        name: '艾琳',
        description: '灯塔守',
        aliases: [],
        tags: [],
        data: { personality: '冷静' },
        referenceImages: [],
      },
    });
    await db.asset.create({
      data: {
        id: 'c-chenmo',
        projectId: 'p1',
        type: 'character',
        state: 'draft',
        name: '陈默',
        description: '走私客',
        aliases: [],
        tags: [],
        data: {},
        referenceImages: [],
      },
    });
    app = await buildApp({
      db: db as unknown as PrismaClient,
      jwtSecret: 'test-secret-that-is-at-least-32-characters',
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/roleplay/threads',
      payload: { project_id: 'p1', character_asset_id: 'c-ailin' },
    });
    expect(created.statusCode).toBe(200);
    const body = created.json() as { id: string; thread_id: string };
    roleplayId = body.id;
    threadId = body.thread_id;
  });

  afterAll(async () => app.close());

  async function say(content: string): Promise<MessageDto> {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/roleplay/threads/${roleplayId}/messages`,
      payload: { content, effort: 'balanced' },
    });
    expect(response.statusCode).toBe(201);
    return (response.json() as { assistant_message: MessageDto }).assistant_message;
  }

  async function listEvents(): Promise<Array<{ title: string; character_ids: string[] }>> {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/world/projects/p1/resources',
    });
    expect(response.statusCode).toBe(200);
    return (
      response.json() as {
        entities: { world_events: Array<{ title: string; character_ids: string[] }> };
      }
    ).entities.world_events;
  }

  it('small talk gets a reply but no proposal and no "已记录" promise', async () => {
    const message = await say('你好呀，今天灯塔那边风大吗？');
    expect(message.role).toBe('assistant');
    expect(message.content.length).toBeGreaterThan(0);
    expect(message.proposal).toBeNull();
    expect(message.proposal_state).toBeNull();
    expect(message.content).not.toMatch(/已记录|已写入/);
    expect(await listEvents()).toEqual([]);
  });

  it('an explicit happening yields a pending event proposal; nothing is written yet', async () => {
    const message = await say('你把灯塔的秘密告诉了陈默，然后决定和他一起离开雾港');
    expect(message.proposal_state).toBe('pending');
    expect(message.proposal_key).toBeTruthy();
    const proposals = message.proposal as Array<{ kind: string; payload: Record<string, unknown> }>;
    const event = proposals.find((item) => item.kind === 'create_world_event');
    expect(event).toBeDefined();
    expect(event?.payload.title).toBe('艾琳把灯塔的秘密告诉了陈默');
    expect(event?.payload.character_ids).toEqual(expect.arrayContaining(['c-ailin', 'c-chenmo']));
    // 未确认：Studio 资源里还没有这条事件。
    expect(await listEvents()).toEqual([]);

    // 消息也能从统一的线程接口读到（Chat 面板就是这样加载扮演消息的）。
    const thread = await app.inject({
      method: 'GET',
      url: `/api/v1/world/creator-chats/${threadId}`,
    });
    expect(thread.statusCode).toBe(200);
    const stored = (thread.json() as { messages: MessageDto[] }).messages.find(
      (item) => item.id === message.id,
    );
    expect(stored?.proposal_state).toBe('pending');
  });

  it('rejecting leaves the world unchanged', async () => {
    const message = await say('你决定明天一早就出发去北境');
    expect(message.proposal_state).toBe('pending');
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/world/creator-chats/${threadId}/proposals/${message.id}/reject`,
      payload: {},
    });
    expect(rejected.statusCode).toBe(200);
    expect(await listEvents()).toEqual([]);
    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/world/creator-chats/${threadId}/proposals/${message.id}/apply`,
      payload: {},
    });
    expect(again.statusCode).toBe(409);
  });

  it('confirming writes a draft event that the world resources then show; second confirm is 409', async () => {
    const message = await say('你在码头救下了受伤的陈默');
    expect(message.proposal_state).toBe('pending');
    const applied = await app.inject({
      method: 'POST',
      url: `/api/v1/world/creator-chats/${threadId}/proposals/${message.id}/apply`,
      payload: {},
    });
    expect(applied.statusCode).toBe(200);
    const result = applied.json() as { applied: Array<{ entity_type: string; title: string }> };
    expect(result.applied[0]?.entity_type).toBe('world_event');

    const events = await listEvents();
    expect(events.map((event) => event.title)).toContain('艾琳在码头救下了受伤的陈默');
    expect(events[0]?.character_ids).toEqual(expect.arrayContaining(['c-ailin', 'c-chenmo']));
    const stored = await db.worldEvent.findFirst({
      where: { title: '艾琳在码头救下了受伤的陈默' },
    });
    expect(stored?.state).toBe('draft');

    const twice = await app.inject({
      method: 'POST',
      url: `/api/v1/world/creator-chats/${threadId}/proposals/${message.id}/apply`,
      payload: {},
    });
    expect(twice.statusCode).toBe(409);
  });

  it('the next roleplay turn sees the confirmed event as lived experience', async () => {
    // 无锚点 = 全书读完：新事件进入亲历列表。mock 回复会引用亲历事件。
    const message = await say('还记得码头那天吗');
    expect(message.content).toContain('艾琳在码头救下了受伤的陈默');
  });
});
