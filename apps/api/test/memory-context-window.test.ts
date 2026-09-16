import { describe, expect, it } from 'vitest';
import {
  buildBudgetedHistory,
  clipRollingSummary,
  estimateTokens,
  ruleSummarize,
} from '../src/contexts/memory/context-window.js';

const msg = (id: string, content: string) => ({ id, role: 'user' as const, content });

describe('estimateTokens', () => {
  it('CJK ~1.5 chars per token', () => {
    expect(estimateTokens('一共六个汉字')).toBe(4);
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

  it('does not re-evict messages already folded into the rolling summary', () => {
    const history = Array.from({ length: 12 }, (_, i) => msg(`m${i}`, `第${i}条。`));
    const result = buildBudgetedHistory({
      history,
      previousSummary: '此前说过怕黑。',
      tokenBudget: 10_000,
      keepRecentMessages: 4,
      summarizedUntilMessageId: 'm7',
    });
    expect(result.window.map((item) => item.id)).toEqual(['m8', 'm9', 'm10', 'm11']);
    expect(result.evicted).toHaveLength(0);
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

describe('clipRollingSummary', () => {
  it('keeps a short summary intact and trims an oversized one', () => {
    expect(clipRollingSummary('此前说过怕黑。')).toBe('此前说过怕黑。');
    const bulky = Array.from({ length: 80 }, (_, index) => `第${index}行很长的摘要内容。`).join('\n');
    const clipped = clipRollingSummary(bulky, 40);
    expect(estimateTokens(clipped)).toBeLessThanOrEqual(40);
    expect(clipped.length).toBeLessThan(bulky.length);
  });
});
