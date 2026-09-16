/// <reference types="vitest/globals" />
import {
  appliedTitlesFromMessages,
  rollbackPreview,
  rollbackSlice,
  userTicks,
} from './conversation-ticks';

const messages = [
  { id: 'u1', role: 'user', content: '你们好', proposal_state: null },
  { id: 'a1', role: 'assistant', content: '林夕开口', proposal_state: null },
  { id: 'u2', role: 'user', content: '陈默你呢', proposal_state: null },
  {
    id: 'a2',
    role: 'assistant',
    content: '记下了',
    proposal_state: 'applied',
    proposal: [{ kind: 'create_world_event', payload: { title: '北境集结', applied_entity_id: 'e1' } }],
  },
];

describe('conversation ticks', () => {
  it('lists only user sends as ticks', () => {
    expect(userTicks(messages).map((item) => item.id)).toEqual(['u1', 'u2']);
  });

  it('keeps the tick and drops later turns', () => {
    expect(rollbackSlice(messages, 'u1', 'keep').drop.map((item) => item.id)).toEqual([
      'a1',
      'u2',
      'a2',
    ]);
  });

  it('withdraws the tick itself', () => {
    expect(rollbackSlice(messages, 'u2', 'withdraw').drop.map((item) => item.id)).toEqual([
      'u2',
      'a2',
    ]);
  });

  it('summarizes pending proposals and applied titles', () => {
    const drop = rollbackSlice(messages, 'u1', 'keep').drop;
    expect(rollbackPreview(drop)).toMatchObject({
      dialogueCount: 3,
      pendingCount: 0,
    });
    expect(appliedTitlesFromMessages(drop)).toEqual(['北境集结']);
  });
});
