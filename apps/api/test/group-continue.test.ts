import { describe, expect, it } from 'vitest';
import {
  buildGhostwriteCue,
  buildGroupContinueCue,
  collapseRepeatedAssistantBeats,
  isGroupContinueBeat,
  looksStuckRepeating,
  pickContinueTopicSeed,
  resolveContinueRetrieveQuery,
} from '../src/contexts/roleplay/group-continue.js';

const bye = (round: number) => `（冲你那边摆了下手）嗯，拜拜。师姐，第${round}回了。`;

describe('group continue beat', () => {
  it('treats empty group turns as continue beats', () => {
    expect(isGroupContinueBeat({ isGroup: true, userMessageContent: null })).toBe(true);
    expect(isGroupContinueBeat({ isGroup: true, userMessageContent: '  ' })).toBe(true);
    expect(isGroupContinueBeat({ isGroup: true, userMessageContent: '我先走了' })).toBe(false);
    expect(isGroupContinueBeat({ isGroup: false, userMessageContent: null })).toBe(false);
    expect(
      isGroupContinueBeat({ isGroup: true, userMessageContent: null, lastLiveRole: 'user' }),
    ).toBe(false);
  });

  it('flags a goodbye loop as stuck repeating', () => {
    expect(looksStuckRepeating([bye(28), bye(29)])).toBe(true);
    expect(looksStuckRepeating(['师姐，食堂今晚吃什么？', '路明非你少贫。'])).toBe(false);
  });

  it('collapses a farewell streak down to the latest beat', () => {
    const collapsed = collapseRepeatedAssistantBeats([
      { role: 'user', content: '我先走了' },
      { role: 'assistant', content: bye(1) },
      { role: 'assistant', content: bye(2) },
      { role: 'assistant', content: bye(3) },
    ]);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[1]?.content).toContain('第3回');
  });

  it('picks a world seed that is not already in the loop', () => {
    const seed = pickContinueTopicSeed({
      relations: ['与「诺诺」：师姐（学生会）'],
      experiences: ['· 路明非 · 战胜我的本体：路明非在东京对上了自己的血之哀。'],
      traits: ['贫嘴'],
      companions: ['诺诺'],
      recentAssistantTexts: [bye(30), bye(31)],
      beatSalt: 2,
    });
    expect(seed).toBeTruthy();
    expect(seed).not.toMatch(/拜拜|第3/);
  });

  it('asks them to find a new beat instead of answering the reader again', () => {
    const cue = buildGroupContinueCue({
      speakerName: '路明非',
      userLabel: '读者',
      companions: ['诺诺'],
      topicSeed: '与「诺诺」：师姐（学生会）',
      stuckRepeating: true,
    });
    expect(cue).toContain('没有开口');
    expect(cue).toContain('诺诺');
    expect(cue).toContain('不要对他们道别');
    expect(cue).toContain('必须换一件');
    expect(cue).toContain('师姐');
    expect(cue).toContain('不要上课');
  });

  it('retrieves from the seed when the last lines are looping', () => {
    const query = resolveContinueRetrieveQuery({
      lastAssistantText: bye(35),
      topicSeed: '与「诺诺」：师姐（学生会）',
      stuckRepeating: true,
      fallback: '场面提示',
    });
    expect(query).toContain('学生会');
    expect(query).not.toContain('拜拜');
  });

  it('asks the handed-over character to speak as themselves', () => {
    const cue = buildGhostwriteCue({
      speakerName: '路明非',
      companions: ['诺诺'],
      topicSeed: '与「诺诺」：师姐（学生会）',
      stuckRepeating: false,
    });
    expect(cue).toContain('路明非');
    expect(cue).toContain('交给你接着演');
    expect(cue).toContain('诺诺');
    expect(cue).not.toContain('没有开口');
  });

  it('bans stage directions that just appeared', () => {
    const cue = buildGroupContinueCue({
      speakerName: '楚子航',
      userLabel: '读者',
      companions: ['路明非'],
      topicSeed: null,
      stuckRepeating: false,
      avoidDirections: ['手指在兜里动了动', '把手从船舷上收回来'],
    });
    expect(cue).toContain('不要再写');
    expect(cue).toContain('手指在兜里动了动');
    expect(cue).toContain('船舷');
  });

  it('prefers a short trait over a long plot lecture', () => {
    const seed = pickContinueTopicSeed({
      relations: ['与「诺诺」：师姐（学生会）'],
      experiences: [
        '· 路明非 · 战胜我的本体：路明非在东京对上了自己的血之哀，场面很长，足够写成一段说明书。',
      ],
      traits: ['贫嘴'],
      companions: ['诺诺'],
      recentAssistantTexts: [],
      beatSalt: 0,
    });
    expect(seed).toBe('贫嘴');
  });

  it('falls back to a companion when the card has no traits or plot', () => {
    const seed = pickContinueTopicSeed({
      relations: [],
      experiences: [],
      traits: [],
      companions: ['诺诺'],
      recentAssistantTexts: [],
      beatSalt: 0,
    });
    expect(seed).toContain('诺诺');
  });

  it('returns null when there is nobody and nothing to talk about', () => {
    expect(
      pickContinueTopicSeed({
        relations: [],
        experiences: [],
        traits: [],
        companions: [],
        recentAssistantTexts: [],
        beatSalt: 0,
      }),
    ).toBeNull();
  });
});
