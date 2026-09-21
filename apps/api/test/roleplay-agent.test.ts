import { describe, expect, it } from 'vitest';
import {
  buildRoleplaySystemPrompt,
  buildRoleplayUserPrompt,
  mentionsLaterPlot,
  type CharacterState,
} from '../src/contexts/roleplay/roleplay-agent.js';

function state(partial: Partial<CharacterState> = {}): CharacterState {
  return {
    name: '路明非',
    description: '',
    persona: '卡面：路明非',
    experiences: [],
    relations: [],
    anchorLabel: '《恺撒 · 毕业于卡塞尔》之后',
    hasAnchor: true,
    laterPlot: [],
    traits: [],
    userLabel: '读者',
    userSection: '用户是读者。',
    stageLabel: null,
    anchorOrder: 2,
    companions: [],
    ...partial,
  };
}

describe('mentionsLaterPlot', () => {
  const later = [
    {
      title: '路明非、路麟城 · 抵达冰湖边缘',
      description: '路明非与路麟城抵达冰湖边缘。',
    },
    {
      title: '楚子航 · 杀死他的父亲',
      description: '奥丁在高速公路上杀死了他的父亲。',
    },
  ];

  it('flags a question that overlaps a later title', () => {
    expect(mentionsLaterPlot('你们已经抵达冰湖边缘了吗？路麟城在不在？', later)).toBe(true);
  });

  it('flags a question that overlaps a later description', () => {
    expect(mentionsLaterPlot('明非，奥丁在高速公路上杀了我父亲这件事，你知道多少？', later)).toBe(
      true,
    );
  });

  it('does not flag small talk that only shares a name', () => {
    expect(mentionsLaterPlot('师兄，今天学院食堂吃什么？', later)).toBe(false);
  });
});

describe('buildRoleplaySystemPrompt', () => {
  it('forbids external plot knowledge and empty-experience invention when anchored', () => {
    const prompt = buildRoleplaySystemPrompt(state());
    expect(prompt).toContain('禁止使用训练数据或对该作品的外部剧情知识');
    expect(prompt).toContain('不要因此编造主线');
  });

  it('adds a hard lock when the user asks about later plot', () => {
    const prompt = buildRoleplaySystemPrompt(state(), true);
    expect(prompt).toContain('此轮硬约束');
    expect(prompt).toContain('禁止确认、禁止描述任何细节');
  });

  it('names the bound stage when the card is as-of a world event', () => {
    const prompt = buildRoleplaySystemPrompt(state({ stageLabel: '普通学生' }));
    expect(prompt).toContain('普通学生');
    expect(prompt).toContain('不是最终形态');
  });

  it('tells a group speaker not to talk for companions', () => {
    const prompt = buildRoleplaySystemPrompt(state({ companions: ['陈默'] }));
    expect(prompt).toContain('群聊');
    expect(prompt).toContain('陈默');
    expect(prompt).toContain('不要替别人开口');
    expect(prompt).toContain('对着在场的人说话');
    expect(prompt).toContain('一次只说一个节拍');
  });

  it('on a silent continue beat tells them to find a new topic among themselves', () => {
    const prompt = buildRoleplaySystemPrompt(state({ companions: ['诺诺'] }), false, null, true);
    expect(prompt).toContain('没有开口');
    expect(prompt).toContain('另起话头');
    expect(prompt).not.toContain('把用户当成「读者」来应答');
  });
});

describe('buildRoleplayUserPrompt', () => {
  it('does not pretend the reader spoke again on a continue beat', () => {
    const prompt = buildRoleplayUserPrompt({
      history: [
        { role: 'user', content: '我先走了', speakerName: '读者' },
        { role: 'assistant', content: '嗯，拜拜。', speakerName: '路明非' },
      ],
      historyTurns: 16,
      text: '此刻「读者」没有开口',
      userLabel: '读者',
      speakerFallback: '路明非',
      continueBeat: true,
    });
    expect(prompt).toContain('场面提示');
    expect(prompt).not.toMatch(/读者：此刻/);
    expect(prompt).not.toMatch(/读者：我先走了\s*$/);
  });

  it('keeps the reader line when they actually spoke', () => {
    const prompt = buildRoleplayUserPrompt({
      history: [],
      historyTurns: 16,
      text: '你们继续聊',
      userLabel: '读者',
    });
    expect(prompt).toBe('读者：你们继续聊');
  });

  it('does not label a ghostwrite cue as the reader speaking', () => {
    const prompt = buildRoleplayUserPrompt({
      history: [{ role: 'assistant', content: '你倒是说话啊。', speakerName: '诺诺' }],
      historyTurns: 16,
      text: '创作者把「路明非」交给你接着演',
      userLabel: '路明非',
      speakerFallback: '路明非',
      ghostwrite: true,
    });
    expect(prompt).toContain('场面提示');
    expect(prompt).not.toMatch(/路明非：创作者/);
  });
});
