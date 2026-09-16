// Journey D：两人开群聊 → 指定发言 → 确认事件 → 刻度回退软删本场写入；1:1 不被群聊复用。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { buildApp } from '../src/app.js';
import { createMemoryPrisma, type MemoryPrisma } from './helpers/memory-prisma.js';

describe('group chat + tick rollback (mock provider)', () => {
  let app: FastifyInstance;
  let db: MemoryPrisma;

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
  });

  afterAll(async () => app.close());

  it('opens a two-person group and does not reuse it as 1:1', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/roleplay/threads',
      payload: {
        project_id: 'p1',
        character_asset_id: 'c-ailin',
        participant_asset_ids: ['c-ailin', 'c-chenmo'],
      },
    });
    expect(created.statusCode).toBe(200);
    const group = created.json() as { id: string; thread_id: string; reused: boolean };
    expect(group.reused).toBe(false);

    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/roleplay/threads',
      payload: {
        project_id: 'p1',
        character_asset_id: 'c-ailin',
        participant_asset_ids: ['c-chenmo', 'c-ailin'],
      },
    });
    expect(again.json()).toMatchObject({ id: group.id, reused: true });

    const solo = await app.inject({
      method: 'POST',
      url: '/api/v1/roleplay/threads',
      payload: { project_id: 'p1', character_asset_id: 'c-ailin' },
    });
    expect(solo.statusCode).toBe(200);
    expect((solo.json() as { id: string }).id).not.toBe(group.id);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/roleplay/threads?project_id=p1',
    });
    const items = (listed.json() as { items: Array<{ id: string; is_group: boolean }> }).items;
    expect(items.find((item) => item.id === group.id)?.is_group).toBe(true);
  });

  it('lets a named speaker talk without a new user line', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/roleplay/threads',
      payload: {
        project_id: 'p1',
        character_asset_id: 'c-ailin',
        participant_asset_ids: ['c-ailin', 'c-chenmo'],
      },
    });
    const { id, thread_id: threadId } = created.json() as { id: string; thread_id: string };
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/roleplay/threads/${id}/messages`,
      payload: { content: '你们继续。' },
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json() as {
      assistant_message: { speaker_asset_id: string; speaker_name: string };
    };
    expect(['c-ailin', 'c-chenmo']).toContain(firstBody.assistant_message.speaker_asset_id);

    const named = await app.inject({
      method: 'POST',
      url: `/api/v1/roleplay/threads/${id}/messages`,
      payload: { content: '', speaker_asset_id: 'c-chenmo' },
    });
    expect(named.statusCode).toBe(201);
    const namedBody = named.json() as {
      user_message: unknown;
      assistant_message: { speaker_asset_id: string; speaker_name: string };
    };
    expect(namedBody.user_message).toBeNull();
    expect(namedBody.assistant_message.speaker_asset_id).toBe('c-chenmo');
    expect(namedBody.assistant_message.speaker_name).toBe('陈默');

    const thread = await app.inject({
      method: 'GET',
      url: `/api/v1/world/creator-chats/${threadId}`,
    });
    const live = (thread.json() as { thread: { is_group: boolean }; messages: Array<{ role: string }> })
      .messages;
    expect(thread.json()).toMatchObject({ thread: { is_group: true } });
    expect(live.filter((item) => item.role === 'user')).toHaveLength(1);
  });

  it('rejects putting the user card on the AI roster', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/roleplay/threads',
      payload: {
        project_id: 'p1',
        character_asset_id: 'c-ailin',
        user_character_asset_id: 'c-chenmo',
        participant_asset_ids: ['c-ailin', 'c-chenmo'],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('stamps apply ids and rollback keeps the tick while soft-deleting the event', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/roleplay/threads',
      payload: { project_id: 'p1', character_asset_id: 'c-ailin' },
    });
    const { id, thread_id: threadId } = created.json() as { id: string; thread_id: string };
    const said = await app.inject({
      method: 'POST',
      url: `/api/v1/roleplay/threads/${id}/messages`,
      payload: { content: '你在码头救下了受伤的陈默' },
    });
    expect(said.statusCode).toBe(201);
    const assistant = (said.json() as { assistant_message: { id: string; proposal_state: string } })
      .assistant_message;
    expect(assistant.proposal_state).toBe('pending');

    const applied = await app.inject({
      method: 'POST',
      url: `/api/v1/world/creator-chats/${threadId}/proposals/${assistant.id}/apply`,
      payload: {},
    });
    expect(applied.statusCode).toBe(200);
    const stored = await db.worldEvent.findFirst({
      where: { title: '艾琳在码头救下了受伤的陈默' },
    });
    expect(stored?.deletedAt).toBeNull();

    const thread = await app.inject({
      method: 'GET',
      url: `/api/v1/world/creator-chats/${threadId}`,
    });
    const user = (
      thread.json() as { messages: Array<{ id: string; role: string }> }
    ).messages.find((item) => item.role === 'user');
    expect(user).toBeDefined();

    const rolled = await app.inject({
      method: 'POST',
      url: `/api/v1/world/creator-chats/${threadId}/rollback`,
      payload: { message_id: user!.id, mode: 'keep' },
    });
    expect(rolled.statusCode).toBe(200);
    const body = rolled.json() as {
      reverted: Array<{ title: string }>;
      suppressed_ids: string[];
    };
    expect(body.reverted.map((item) => item.title)).toContain('艾琳在码头救下了受伤的陈默');
    expect(body.suppressed_ids).toContain(assistant.id);

    const after = await db.worldEvent.findFirst({
      where: { title: '艾琳在码头救下了受伤的陈默' },
    });
    expect(after?.deletedAt).toBeInstanceOf(Date);

    const live = await app.inject({
      method: 'GET',
      url: `/api/v1/world/creator-chats/${threadId}`,
    });
    const liveMessages = (live.json() as { messages: Array<{ id: string; role: string }> }).messages;
    expect(liveMessages.map((item) => item.id)).toEqual([user!.id]);
  });
});
