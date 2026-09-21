import { describe, expect, it } from 'vitest';
import {
  buildVoiceLock,
  clampStageDirections,
  collectRecentStageDirections,
  formatAvoidedDirections,
  personalityFromPersonaBlock,
} from '../src/contexts/roleplay/character-voice.js';

describe('character voice lock', () => {
  it('puts card personality ahead of a generic narrator', () => {
    const lock = buildVoiceLock({
      name: '楚子航',
      personality: '话少，不解释自己，不诉苦',
    });
    expect(lock).toContain('楚子航');
    expect(lock).toContain('话少，不解释自己，不诉苦');
    expect(lock).toContain('括号动作最多一个');
    expect(lock).toContain('不要分析剧情给别人上课');
  });

  it('falls back to the 个性 line in the persona block', () => {
    const lock = buildVoiceLock({
      name: '路明非',
      persona: '姓名：路明非\n个性：表面废柴，关键时刻清醒\n简介：学生',
    });
    expect(lock).toContain('表面废柴，关键时刻清醒');
  });

  it('still asks for a distinct voice when the card has no personality', () => {
    const lock = buildVoiceLock({ name: '诺诺' });
    expect(lock).toContain('诺诺');
    expect(lock).toContain('不要用所有角色共用的书面腔');
    expect(lock).not.toContain('按这个性说话');
  });

  it('does not throw on empty name or blank personality', () => {
    expect(() => buildVoiceLock({ name: '', personality: '  ', persona: '' })).not.toThrow();
    expect(buildVoiceLock({ name: '林夕', personality: '   ' })).toContain('「林夕」自己会说的话');
  });

  it('bans recent stage directions on the voice lock itself', () => {
    const lock = buildVoiceLock({
      name: '诺诺',
      avoidDirections: ['把手从船舷上收回来'],
    });
    expect(lock).toContain('不要再写同类动作');
    expect(lock).toContain('船舷');
  });
});

describe('collectRecentStageDirections', () => {
  it('pulls distinct parenthetical actions from recent lines', () => {
    const found = collectRecentStageDirections([
      '（手指在兜里动了动，没抽出来）师兄，你这话我不敢接。',
      '（把手从船舷上收回来）我不需要谁再站一次。',
      '（手指在兜里动了动）又来了。',
    ]);
    expect(found.some((item) => item.includes('兜里') || item.includes('手指'))).toBe(true);
    expect(found.some((item) => item.includes('船舷'))).toBe(true);
    expect(found.filter((item) => item.includes('兜') || item.includes('手指')).length).toBe(1);
  });

  it('treats 船舷 variants as the same gesture', () => {
    const found = collectRecentStageDirections([
      '（把手从船舷上收回来）我没让你跟着。',
      '（扶着船舷）海风真大。',
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('船舷');
  });

  it('returns nothing when nobody used a parenthetical', () => {
    expect(collectRecentStageDirections([])).toEqual([]);
    expect(collectRecentStageDirections(['师兄，食堂今晚吃什么？'])).toEqual([]);
  });
});

describe('clampStageDirections', () => {
  it('keeps the first parenthetical and drops the rest', () => {
    const clipped = clampStageDirections(
      '（把手肘撑在膝盖上）师姐。\n\n（没抬头，盯着甲板）算了，你当我没问。',
    );
    expect(clipped).toContain('把手肘撑在膝盖上');
    expect(clipped).not.toContain('没抬头');
    expect(clipped).toContain('算了');
  });

  it('leaves a line without stage directions alone', () => {
    expect(clampStageDirections('师姐，食堂今晚吃什么？')).toBe('师姐，食堂今晚吃什么？');
  });
});

describe('formatAvoidedDirections', () => {
  it('stays silent when there is nothing to ban', () => {
    expect(formatAvoidedDirections()).toBeNull();
    expect(formatAvoidedDirections([])).toBeNull();
    expect(formatAvoidedDirections(['  '])).toBeNull();
  });
});

describe('personalityFromPersonaBlock', () => {
  it('reads the 个性 line', () => {
    expect(personalityFromPersonaBlock('姓名：林夕\n个性：怕黑\n简介：学生')).toBe('怕黑');
    expect(personalityFromPersonaBlock('姓名：林夕')).toBeNull();
    expect(personalityFromPersonaBlock(null)).toBeNull();
    expect(personalityFromPersonaBlock('')).toBeNull();
  });
});
