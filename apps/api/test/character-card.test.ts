import { describe, expect, it } from 'vitest';
import {
  assembleWorldContext,
  worldContextToPrompt,
} from '../src/contexts/world-builder/world-context.js';
import {
  composeCharacterPersona,
  formatCharacterCard,
  personalityFromAssetData,
} from '../src/contexts/world/character-card.js';

describe('formatCharacterCard', () => {
  it('puts Studio fields in a stable card the roleplay prompt can prepend', () => {
    expect(
      formatCharacterCard({
        name: '路明非',
        description: '卡塞尔学院S级混血种',
        personality: '表面废柴，关键时刻清醒',
        aliases: ['师弟', '  '],
      }),
    ).toBe(
      [
        '姓名：路明非',
        '又称：师弟',
        '简介：卡塞尔学院S级混血种',
        '个性：表面废柴，关键时刻清醒',
      ].join('\n'),
    );
  });
});

describe('composeCharacterPersona', () => {
  it('lets an edited card override an older import archive', () => {
    const card = formatCharacterCard({
      name: '路明非',
      description: '用户改过的简介',
      personality: '更懒了',
    });
    const composed = composeCharacterPersona(card, '姓名：路明非\n出场：12 章');
    expect(composed.startsWith(card)).toBe(true);
    expect(composed).toContain('出场：12 章');
    expect(composed).toContain('与上文冲突时以角色卡为准');
  });

  it('does not duplicate when the archive already contains the card', () => {
    const card = formatCharacterCard({ name: '楚子航', description: '狮心会会长' });
    expect(composeCharacterPersona(card, `${card}\n背景1：师兄`)).toBe(`${card}\n背景1：师兄`);
  });
});

describe('personalityFromAssetData', () => {
  it('reads personality from Asset.data envelope', () => {
    expect(personalityFromAssetData({ personality: '冷静' })).toBe('冷静');
    expect(personalityFromAssetData({})).toBeNull();
  });
});

describe('worldContextToPrompt', () => {
  it('injects the Studio card into world-builder context', () => {
    const context = assembleWorldContext({
      projectId: 'p',
      projectName: '龙族',
      worldview: {},
      stories: [],
      characters: [
        {
          id: 'c1',
          name: '路明非',
          description: 'S级混血种',
          personality: '表面废柴',
          aliases: ['师弟'],
          tags: [],
        },
      ],
      locations: [],
      scenes: [],
      worldEvents: [],
      relationships: [],
    });
    const prompt = worldContextToPrompt(context);
    expect(prompt).toContain('个性：表面废柴');
    expect(prompt).toContain('又称：师弟');
  });
});
