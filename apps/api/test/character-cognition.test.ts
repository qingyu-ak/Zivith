import { describe, expect, it } from 'vitest';
import {
  characterAtomVisibleAtAnchor,
  filterRetrievedChatCatalog,
  pickCharacterAtomsForAnchor,
  resolveAtomSourceKind,
} from '../src/contexts/roleplay/character-cognition.js';
import {
  buildRoleplaySystemPrompt,
  type CharacterState,
} from '../src/contexts/roleplay/roleplay-agent.js';

describe('characterAtomVisibleAtAnchor', () => {
  it('always includes manual facts', () => {
    expect(
      characterAtomVisibleAtAnchor({
        sourceKind: 'manual',
        sourceAnchorOrder: null,
        currentAnchorOrder: 3,
      }),
    ).toBe(true);
  });

  it('never includes World Builder / unknown threads in character cognition', () => {
    expect(
      characterAtomVisibleAtAnchor({
        sourceKind: 'other',
        sourceAnchorOrder: 1,
        currentAnchorOrder: 9,
      }),
    ).toBe(false);
  });

  it('hides 全书读完 roleplay facts when playing at an earlier anchor', () => {
    expect(
      characterAtomVisibleAtAnchor({
        sourceKind: 'roleplay',
        sourceAnchorOrder: null,
        currentAnchorOrder: 2,
      }),
    ).toBe(false);
  });

  it('hides later-anchor roleplay facts', () => {
    expect(
      characterAtomVisibleAtAnchor({
        sourceKind: 'roleplay',
        sourceAnchorOrder: 8,
        currentAnchorOrder: 3,
      }),
    ).toBe(false);
  });

  it('includes earlier-anchor roleplay facts', () => {
    expect(
      characterAtomVisibleAtAnchor({
        sourceKind: 'roleplay',
        sourceAnchorOrder: 2,
        currentAnchorOrder: 5,
      }),
    ).toBe(true);
  });

  it('includes every roleplay fact when the current play is 全书读完', () => {
    expect(
      characterAtomVisibleAtAnchor({
        sourceKind: 'roleplay',
        sourceAnchorOrder: 2,
        currentAnchorOrder: null,
      }),
    ).toBe(true);
    expect(
      characterAtomVisibleAtAnchor({
        sourceKind: 'roleplay',
        sourceAnchorOrder: null,
        currentAnchorOrder: null,
      }),
    ).toBe(true);
  });
});

describe('pickCharacterAtomsForAnchor', () => {
  const atoms = [
    { id: 'manual', threadId: null, content: '怕黑' },
    { id: 'early', threadId: 'rp-early', content: '入学那天见过路明非' },
    { id: 'later', threadId: 'rp-later', content: '战后已经退役' },
    { id: 'finished', threadId: 'rp-end', content: '全书读完才说的秘密' },
    { id: 'wb', threadId: 'wb-thread', content: '助手任务：补齐北境设定' },
  ];
  const roleplayByThreadId = new Map([
    ['rp-early', { anchoredWorldEventId: 'e-early' }],
    ['rp-later', { anchoredWorldEventId: 'e-later' }],
    ['rp-end', { anchoredWorldEventId: null }],
  ]);
  const eventOrderById = new Map<string, number | null>([
    ['e-early', 1],
    ['e-later', 9],
  ]);

  it('keeps manual + earlier roleplay facts at mid-story, drops future and Agent notes', () => {
    const visible = pickCharacterAtomsForAnchor(atoms, roleplayByThreadId, eventOrderById, 3);
    expect(visible.map((item) => item.id)).toEqual(['manual', 'early']);
  });

  it('keeps everything except Agent notes at 全书读完', () => {
    const visible = pickCharacterAtomsForAnchor(atoms, roleplayByThreadId, eventOrderById, null);
    expect(visible.map((item) => item.id)).toEqual(['manual', 'early', 'later', 'finished']);
  });
});

describe('filterRetrievedChatCatalog', () => {
  const roleplayByThreadId = new Map([
    ['rp-linxi-early', { anchoredWorldEventId: 'e-early', characterAssetId: 'linxi' }],
    ['rp-linxi-end', { anchoredWorldEventId: null, characterAssetId: 'linxi' }],
    ['rp-other', { anchoredWorldEventId: 'e-early', characterAssetId: 'kaisa' }],
  ]);
  const eventOrderById = new Map<string, number | null>([['e-early', 1]]);
  const items = [
    { source: 'atom', id: 'chat', entity_id: 'linxi', content: '说过怕黑' },
    { source: 'atom', id: 'future', entity_id: 'linxi', content: '战后退役' },
    { source: 'atom', id: 'wb', entity_id: 'linxi', content: '助手补北境' },
    { source: 'atom', id: 'other', entity_id: 'kaisa', content: '凯撒的秘密' },
    { source: 'core', id: 'core1', entity_id: null, content: '全书档案' },
  ];
  const atoms = [
    { id: 'chat', threadId: 'rp-linxi-early', entityType: 'character', entityId: 'linxi' },
    { id: 'future', threadId: 'rp-linxi-end', entityType: 'character', entityId: 'linxi' },
    { id: 'wb', threadId: 'wb-thread', entityType: 'character', entityId: 'linxi' },
    { id: 'other', threadId: 'rp-other', entityType: 'character', entityId: 'kaisa' },
  ];

  it('keeps this character’s extracted chat points at the current world time', () => {
    const catalog = filterRetrievedChatCatalog({
      items,
      atoms,
      characterAssetId: 'linxi',
      currentAnchorOrder: 3,
      roleplayByThreadId,
      eventOrderById,
    });
    expect(catalog.map((item) => item.id)).toEqual(['chat']);
  });
});

describe('resolveAtomSourceKind', () => {
  it('classifies missing thread as manual and unknown thread as other', () => {
    expect(resolveAtomSourceKind(null, new Set(['rp']))).toBe('manual');
    expect(resolveAtomSourceKind('rp', new Set(['rp']))).toBe('roleplay');
    expect(resolveAtomSourceKind('wb', new Set(['rp']))).toBe('other');
  });
});

describe('buildRoleplaySystemPrompt', () => {
  it('does not open a project-wide digest slot that could leak later plot', () => {
    const state: CharacterState = {
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
    const prompt = buildRoleplaySystemPrompt(state);
    expect(prompt).toContain('当前时间点');
    expect(prompt).toContain('怕黑');
    expect(prompt).toContain('入学');
    expect(prompt).not.toContain('过往交流记忆');
    expect(prompt).not.toContain('北境开战');
    expect(prompt).not.toContain('谈过的要点');
  });

  it('injects retrieved chat without treating it as the full log', () => {
    const prompt = buildRoleplaySystemPrompt(
      {
        name: '林夕',
        description: '',
        persona: '卡面：林夕',
        experiences: [],
        relations: [],
        anchorLabel: '全书读完（知晓全部亲历剧情）',
        hasAnchor: false,
        laterPlot: [],
        traits: [],
        userLabel: '读者',
        userSection: '用户是读者。',
        stageLabel: null,
        anchorOrder: null,
      },
      false,
      '目录：\n- 怕黑',
    );
    expect(prompt).toContain('检索到的交谈');
    expect(prompt).toContain('怕黑');
    expect(prompt).toContain('不是全文');
  });
});
