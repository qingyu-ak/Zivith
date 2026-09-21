import { describe, expect, it } from 'vitest';
import {
  appliedEntitiesFromProposal,
  canRollbackToMessage,
  rollbackCut,
  stampAppliedEntityIds,
  wasStudioEdited,
} from '../src/contexts/chat/conversation-rollback.js';

describe('conversation rollback', () => {
  it('withdraws the user tick and everything after it', () => {
    expect(
      rollbackCut({
        messages: [
          { id: 'u1', role: 'user' },
          { id: 'a1', role: 'assistant' },
          { id: 'u2', role: 'user' },
          { id: 'a2', role: 'assistant' },
        ],
        targetMessageId: 'u2',
        mode: 'withdraw',
      }),
    ).toEqual({ headMessageId: 'a1', suppressIds: ['u2', 'a2'] });
  });

  it('keeps the user tick and drops later turns', () => {
    expect(
      rollbackCut({
        messages: [
          { id: 'u1', role: 'user' },
          { id: 'a1', role: 'assistant' },
          { id: 'u2', role: 'user' },
        ],
        targetMessageId: 'u1',
        mode: 'keep',
      }),
    ).toEqual({ headMessageId: 'u1', suppressIds: ['a1', 'u2'] });
  });

  it('keeps a character line and drops later turns', () => {
    expect(
      rollbackCut({
        messages: [
          { id: 'u1', role: 'user' },
          { id: 'a1', role: 'assistant' },
          { id: 'u2', role: 'user' },
          { id: 'a2', role: 'assistant' },
        ],
        targetMessageId: 'a1',
        mode: 'keep',
      }),
    ).toEqual({ headMessageId: 'a1', suppressIds: ['u2', 'a2'] });
  });

  it('allows assistant cuts only on roleplay threads', () => {
    expect(canRollbackToMessage({ role: 'user', isRoleplay: false })).toBe(true);
    expect(canRollbackToMessage({ role: 'assistant', isRoleplay: false })).toBe(false);
    expect(canRollbackToMessage({ role: 'assistant', isRoleplay: true })).toBe(true);
    expect(canRollbackToMessage({ role: 'system', isRoleplay: true })).toBe(false);
  });

  it('stamps created entity ids onto matching proposals', () => {
    const stamped = stampAppliedEntityIds(
      [{ kind: 'create_world_event', payload: { title: '北境集结' } }],
      [{ kind: 'create_world_event', entity_id: 'e1', entity_type: 'world_event' }],
    );
    expect(appliedEntitiesFromProposal(stamped)).toEqual([
      { kind: 'create_world_event', entityId: 'e1', entityType: 'world_event', title: '北境集结' },
    ]);
  });

  it('treats a later studio save as a hand edit', () => {
    const created = new Date('2026-09-16T11:00:00Z');
    const updated = new Date('2026-09-16T11:00:05Z');
    expect(wasStudioEdited(created, updated)).toBe(true);
    expect(wasStudioEdited(created, created)).toBe(false);
  });
});
