import { describe, expect, it } from 'vitest';
import { archiveRoleplayChatsForCharacter } from '../src/contexts/world/workspace.js';
import { createMemoryPrisma } from './helpers/memory-prisma.js';
import type { PrismaClient } from '@zivith/database';

describe('archiveRoleplayChatsForCharacter', () => {
  it('archives 1:1 and group chats with the character, not world-builder or other 1:1', async () => {
    const db = createMemoryPrisma();
    await db.creatorChatThread.create({
      data: { id: 't-lin', projectId: 'p1', state: 'active' },
    });
    await db.creatorChatThread.create({
      data: { id: 't-group', projectId: 'p1', state: 'active' },
    });
    await db.creatorChatThread.create({
      data: { id: 't-messenger', projectId: 'p1', state: 'active' },
    });
    await db.creatorChatThread.create({
      data: { id: 't-world', projectId: 'p1', state: 'active' },
    });
    await db.roleplayThread.create({
      data: {
        id: 'r-lin',
        projectId: 'p1',
        characterAssetId: 'c-lin',
        threadId: 't-lin',
        participantAssetIds: [],
        status: 'active',
      },
    });
    await db.roleplayThread.create({
      data: {
        id: 'r-group',
        projectId: 'p1',
        characterAssetId: 'c-lin',
        threadId: 't-group',
        participantAssetIds: ['c-lin', 'c-chen'],
        status: 'active',
      },
    });
    await db.roleplayThread.create({
      data: {
        id: 'r-messenger',
        projectId: 'p1',
        characterAssetId: 'c-messenger',
        threadId: 't-messenger',
        participantAssetIds: [],
        status: 'active',
      },
    });

    const closed = await archiveRoleplayChatsForCharacter(
      db as unknown as PrismaClient,
      'p1',
      'c-lin',
    );
    expect(closed.sort()).toEqual(['t-group', 't-lin']);

    expect((await db.creatorChatThread.findFirst({ where: { id: 't-lin' } }))?.state).toBe(
      'archived',
    );
    expect((await db.creatorChatThread.findFirst({ where: { id: 't-group' } }))?.state).toBe(
      'archived',
    );
    expect((await db.creatorChatThread.findFirst({ where: { id: 't-messenger' } }))?.state).toBe(
      'active',
    );
    expect((await db.creatorChatThread.findFirst({ where: { id: 't-world' } }))?.state).toBe(
      'active',
    );
    expect((await db.roleplayThread.findFirst({ where: { id: 'r-lin' } }))?.status).toBe('closed');
    expect((await db.roleplayThread.findFirst({ where: { id: 'r-messenger' } }))?.status).toBe(
      'active',
    );
  });

  it('does not close a chat where the deleted person is only the user speaker', async () => {
    const db = createMemoryPrisma();
    await db.creatorChatThread.create({
      data: { id: 't-you', projectId: 'p1', state: 'active' },
    });
    await db.roleplayThread.create({
      data: {
        id: 'r-you',
        projectId: 'p1',
        characterAssetId: 'c-messenger',
        userCharacterAssetId: 'c-lin',
        threadId: 't-you',
        participantAssetIds: [],
        status: 'active',
      },
    });
    const closed = await archiveRoleplayChatsForCharacter(
      db as unknown as PrismaClient,
      'p1',
      'c-lin',
    );
    expect(closed).toEqual([]);
    expect((await db.creatorChatThread.findFirst({ where: { id: 't-you' } }))?.state).toBe(
      'active',
    );
  });
});
