import { describe, expect, it } from 'vitest';
import {
  assembleRoleplayRecall,
  formatRoleplayRecall,
  roleplayThreadVisibleAtAnchor,
} from '../src/contexts/roleplay/chat-recall.js';
import { buildRoleplaySystemPrompt, type CharacterState } from '../src/contexts/roleplay/roleplay-agent.js';

describe('roleplayThreadVisibleAtAnchor', () => {
  const eventOrderById = new Map<string, number | null>([['e-early', 1], ['e-later', 9]]);

  it('hides a 全书读完 thread when playing at an earlier anchor', () => {
    expect(
      roleplayThreadVisibleAtAnchor({
        anchoredWorldEventId: null,
        eventOrderById,
        currentAnchorOrder: 3,
      }),
    ).toBe(false);
  });

  it('keeps an earlier-anchor thread', () => {
    expect(
      roleplayThreadVisibleAtAnchor({
        anchoredWorldEventId: 'e-early',
        eventOrderById,
        currentAnchorOrder: 3,
      }),
    ).toBe(true);
  });
});

describe('assembleRoleplayRecall', () => {
  it('builds catalog, condensed important chat, and log excerpts; skips recent turns', () => {
    const pack = assembleRoleplayRecall({
      retrieved: [
        { source: 'core', id: 'core-linxi' },
        { source: 'atom', id: 'atom-dark' },
      ],
      cores: [
        { id: 'core-linxi', topic: '林夕', sourceAtomIds: ['atom-dark'] },
        { id: 'core-wb', topic: '北境设定', sourceAtomIds: ['atom-wb'] },
      ],
      atoms: [
        {
          id: 'atom-dark',
          content: '林夕说过自己怕黑，晚上走路一定要有人陪。',
          sourceMessageId: 'm-old',
        },
      ],
      visibleAtomIds: new Set(['atom-dark']),
      characterName: '林夕',
      query: '你还记得怕黑吗',
      logs: [
        { id: 'm-old', content: '我怕黑，晚上一个人不敢走那条巷子。' },
        { id: 'm-recent', content: '我怕黑这件事你刚才也听到了。' },
        { id: 'm-other', content: '明天去码头看船。' },
      ],
      recentMessageIds: new Set(['m-recent']),
    });
    expect(pack.catalogLines).toEqual(['林夕']);
    expect(pack.importantLines[0]).toContain('怕黑');
    expect(pack.importantLines[0]!.length).toBeLessThanOrEqual(80);
    expect(pack.excerpts.some((line) => line.includes('巷子'))).toBe(true);
    expect(pack.excerpts.join('\n')).not.toContain('刚才也听到了');
  });

  it('can restore an old log by keyword when extract missed it', () => {
    const pack = assembleRoleplayRecall({
      retrieved: [],
      cores: [],
      atoms: [],
      visibleAtomIds: new Set(),
      characterName: '林夕',
      query: '还记得我们说好去旧码头吗',
      logs: [
        { id: 'm-dock', content: '说好了，下次一起去旧码头。' },
        { id: 'm-hi', content: '你好。' },
      ],
      recentMessageIds: new Set(),
    });
    expect(pack.importantLines).toEqual([]);
    expect(pack.excerpts.some((line) => line.includes('旧码头'))).toBe(true);
  });
});

describe('formatRoleplayRecall', () => {
  it('returns null when empty and labels the three layers when present', () => {
    expect(formatRoleplayRecall({ catalogLines: [], importantLines: [], excerpts: [] })).toBeNull();
    const text = formatRoleplayRecall({
      catalogLines: ['怕黑'],
      importantLines: ['林夕怕黑'],
      excerpts: ['晚上不敢走巷子。'],
    });
    expect(text).toContain('目录：');
    expect(text).toContain('重要聊天：');
    expect(text).toContain('原文摘录：');
  });
});

const promptState: CharacterState = {
  name: '林夕',
  description: '',
  persona: '卡面：林夕',
  experiences: ['· 入学'],
  relations: [],
  anchorLabel: '《入学》之后',
  hasAnchor: true,
  laterPlot: [{ title: '北境开战', description: '军队集结' }],
  traits: ['怕黑'],
  userLabel: '读者',
  userSection: '用户是读者。',
  stageLabel: null,
  anchorOrder: 1,
};

describe('buildRoleplaySystemPrompt recall', () => {
  it('asks the character to retrieve first and not invent missing chats', () => {
    const prompt = buildRoleplaySystemPrompt(
      promptState,
      false,
      '目录：\n- 怕黑\n重要聊天：\n- 说过怕黑',
    );
    expect(prompt).toContain('检索到的交谈');
    expect(prompt).toContain('先查目录');
    expect(prompt).toContain('说过怕黑');
    expect(prompt).toContain('记不清');
    expect(prompt).not.toContain('热词');
    expect(prompt).not.toContain('工作记忆');
  });
});
