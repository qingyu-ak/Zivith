import { describe, expect, it } from 'vitest';
import type { WorldContext } from '../src/contexts/world-builder/world-context.js';
import {
  detectFactType,
  extractCandidateAtoms,
  extractRoleplayImportantAtoms,
  linkEntities,
  splitStatements,
} from '../src/contexts/memory/extract.js';

const world: WorldContext = {
  projectId: 'p1',
  projectName: '测试世界',
  worldview: { rules: [] },
  stories: [],
  characters: [
    { id: 'c1', name: '林澈', description: null, tags: [] },
    { id: 'c2', name: '艾拉', description: null, tags: [] },
  ],
  locations: [{ id: 'l1', name: '青云宗', description: null, tags: [] }],
  scenes: [],
  worldEvents: [{ id: 'e1', title: '开宗大典', description: null, order: 1 }],
  relationships: [],
};

describe('splitStatements', () => {
  it('splits on sentence boundaries and drops short fragments', () => {
    expect(splitStatements('林澈性格冷静。艾拉是执事！好。')).toEqual([
      '林澈性格冷静。',
      '艾拉是执事！',
    ]);
  });
});

describe('detectFactType', () => {
  it('classifies common patterns', () => {
    expect(detectFactType('林澈和艾拉是师徒关系')).toBe('relation');
    expect(detectFactType('魔法必须消耗生命值')).toBe('rule');
    expect(detectFactType('林澈渴望成为仙人')).toBe('desire');
    expect(detectFactType('青云宗发生了叛乱')).toBe('event');
    expect(detectFactType('林澈喜欢喝清茶')).toBe('preference');
    expect(detectFactType('言灵的代价是失明')).toBe('constraint');
    expect(detectFactType('林澈性格冷静，为人低调')).toBe('trait');
    expect(detectFactType('今天聊了很多')).toBe('episodic');
  });
});

describe('linkEntities', () => {
  it('links the entity with most name hits', () => {
    expect(linkEntities('林澈去了青云宗，林澈很高兴', world)).toMatchObject({
      entityId: 'c1',
      entityType: 'character',
    });
  });

  it('returns null when nothing matches', () => {
    expect(linkEntities('随便聊聊', world)).toBeNull();
  });
});

describe('extractCandidateAtoms', () => {
  it('extracts, classifies and links atoms; drops predicate-less chit-chat', () => {
    const atoms = extractCandidateAtoms('林澈性格冷静。他渴望成为仙人。嗯嗯。', world);
    expect(atoms).toHaveLength(2);
    expect(atoms[0]).toMatchObject({ factType: 'trait', linked: { entityId: 'c1' } });
    expect(atoms[1]).toMatchObject({ factType: 'desire' });
  });
});

describe('extractRoleplayImportantAtoms', () => {
  it('keeps important character facts and drops filler / unlinked chatter', () => {
    const atoms = extractRoleplayImportantAtoms(
      '好的。然后呢。林澈性格冷静。今天随便聊聊天气。',
      world,
    );
    expect(atoms).toHaveLength(1);
    expect(atoms[0]).toMatchObject({ factType: 'trait', linked: { entityId: 'c1' } });
    expect(atoms[0]?.content.length).toBeLessThanOrEqual(80);
  });
});
