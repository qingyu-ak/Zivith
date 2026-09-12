import { describe, expect, it } from 'vitest';
import {
  parseProposals,
  proposalBarLabel,
  unconfirmedProposalCount,
  handledProposalState,
} from './chat-proposals';

describe('parseProposals', () => {
  it('解析单对象与数组提案，过滤未知 kind', () => {
    const single = parseProposals({
      proposal: { kind: 'create_character', payload: { name: '诺诺' } },
      proposal_state: 'pending',
    });
    expect(single.proposals).toEqual([{ kind: 'create_character', payload: { name: '诺诺' } }]);
    expect(single.applied).toBe(false);

    const list = parseProposals({
      proposal: [
        { kind: 'create_location', payload: { name: '雾城' } },
        { kind: 'destroy_world', payload: {} },
        '垃圾数据',
        null,
      ],
    });
    expect(list.proposals).toEqual([{ kind: 'create_location', payload: { name: '雾城' } }]);
  });

  it('标记 applied / rejected 状态', () => {
    const applied = parseProposals({
      proposal: { kind: 'update_entity', payload: { id: 'e1' } },
      proposal_state: 'applied',
    });
    expect(applied.applied).toBe(true);
    expect(applied.rejected).toBe(false);

    const rejected = parseProposals({
      proposal: { kind: 'update_entity', payload: { id: 'e1' } },
      proposal_state: 'rejected',
    });
    expect(rejected.rejected).toBe(true);

    const none = parseProposals({});
    expect(none.proposals).toEqual([]);
    expect(none.applied).toBe(false);
  });
});

describe('proposalBarLabel', () => {
  it('把一轮提案收成 Cursor 式条目标题', () => {
    expect(proposalBarLabel(0)).toBe('');
    expect(proposalBarLabel(1)).toBe('1 项变更');
    expect(proposalBarLabel(1, '角色「诺诺」')).toBe('角色「诺诺」');
    expect(proposalBarLabel(2)).toBe('2 项变更');
    expect(proposalBarLabel(2, '角色「诺诺」')).toBe('2 项变更');
  });
});

describe('unconfirmedProposalCount', () => {
  it('uses live messages for the open thread and DTO counts for others', () => {
    const open = {
      proposal: { kind: 'create_character', payload: { name: '诺诺' } },
      proposal_state: 'pending',
    };
    const applied = {
      proposal: { kind: 'create_location', payload: { name: '雾城' } },
      proposal_state: 'applied',
    };
    expect(
      unconfirmedProposalCount(
        't1',
        [
          { id: 't1', pending_proposal_count: 9 },
          { id: 't2', pending_proposal_count: 3 },
        ],
        't1',
        [open, applied],
      ),
    ).toBe(1);
    expect(
      unconfirmedProposalCount('t2', [{ id: 't2', pending_proposal_count: 3 }], 't1', [open]),
    ).toBe(3);
  });
});

describe('handledProposalState', () => {
  it('reads 409 already-handled as applied or rejected', () => {
    const applied = {
      status: 409,
      details: {
        error: {
          code: 'PROPOSAL_ALREADY_HANDLED',
          message: '提案已处理，不能重复确认',
          details: { proposal_state: 'applied' },
        },
      },
    };
    const rejected = {
      status: 409,
      details: {
        error: {
          code: 'PROPOSAL_ALREADY_HANDLED',
          message: '提案已处理，不能再拒绝',
          details: { proposal_state: 'rejected' },
        },
      },
    };
    expect(handledProposalState(applied)).toBe('applied');
    expect(handledProposalState(rejected)).toBe('rejected');
    expect(handledProposalState(new Error('网络中断'))).toBeNull();
  });
});
