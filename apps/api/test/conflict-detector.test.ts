import { describe, expect, it } from 'vitest';
import {
  conflictSummaries,
  detectWorldConflicts,
  formatConflictCheckReply,
  mergeConflictSummaries,
  wantsConflictCheck,
} from '../src/contexts/world-builder/conflict-detector.js';
import type { WorldContext } from '../src/contexts/world-builder/world-context.js';

function world(overrides?: Partial<WorldContext>): WorldContext {
  return {
    projectId: 'p1',
    projectName: '测试世界',
    worldview: { rules: [] },
    stories: [],
    characters: [],
    locations: [],
    scenes: [],
    worldEvents: [],
    relationships: [],
    ...overrides,
  };
}

describe('detectWorldConflicts', () => {
  it('returns nothing for an empty or missing world', () => {
    expect(detectWorldConflicts(null)).toEqual([]);
    expect(detectWorldConflicts(world())).toEqual([]);
  });

  it('flags duplicate character names', () => {
    const findings = detectWorldConflicts(
      world({
        characters: [
          { id: 'c1', name: '艾拉', description: '弓手', tags: [] },
          { id: 'c2', name: '艾 拉', description: '另一人', tags: [] },
        ],
      }),
    );
    expect(findings.map((item) => item.kind)).toContain('duplicate_name');
    expect(findings[0]?.entity_refs.map((ref) => ref.id)).toEqual(['c1', 'c2']);
  });

  it('flags a name shared by a character and a location', () => {
    const findings = detectWorldConflicts(
      world({
        characters: [{ id: 'c1', name: '雾都', description: null, tags: [] }],
        locations: [{ id: 'l1', name: '雾都', description: null, tags: [] }],
      }),
    );
    expect(findings.some((item) => item.kind === 'name_type_clash')).toBe(true);
  });

  it('flags self-relationships and duplicate undirected bonds', () => {
    const findings = detectWorldConflicts(
      world({
        characters: [
          { id: 'c1', name: '林澈', description: null, tags: [] },
          { id: 'c2', name: '艾拉', description: null, tags: [] },
        ],
        relationships: [
          {
            id: 'r1',
            kind: 'bond',
            label: '同伴',
            direction: 'undirected',
            sourceType: 'asset',
            sourceId: 'c1',
            targetType: 'asset',
            targetId: 'c1',
          },
          {
            id: 'r2',
            kind: 'bond',
            label: '同伴',
            direction: 'undirected',
            sourceType: 'asset',
            sourceId: 'c1',
            targetType: 'asset',
            targetId: 'c2',
          },
          {
            id: 'r3',
            kind: 'bond',
            label: '同伴',
            direction: 'undirected',
            sourceType: 'asset',
            sourceId: 'c2',
            targetType: 'asset',
            targetId: 'c1',
          },
        ],
      }),
    );
    expect(findings.some((item) => item.kind === 'self_relationship')).toBe(true);
    expect(findings.some((item) => item.kind === 'duplicate_relationship')).toBe(true);
  });

  it('flags two-way mentor relationships without repairing them', () => {
    const findings = detectWorldConflicts(
      world({
        characters: [
          { id: 'c1', name: '师父', description: null, tags: [] },
          { id: 'c2', name: '徒弟', description: null, tags: [] },
        ],
        relationships: [
          {
            id: 'r1',
            kind: 'mentor',
            label: '师徒',
            direction: 'directed',
            sourceType: 'asset',
            sourceId: 'c1',
            targetType: 'asset',
            targetId: 'c2',
          },
          {
            id: 'r2',
            kind: 'mentor',
            label: '师徒',
            direction: 'directed',
            sourceType: 'asset',
            sourceId: 'c2',
            targetType: 'asset',
            targetId: 'c1',
          },
        ],
      }),
    );
    expect(findings.map((item) => item.kind)).toEqual(['asymmetric_cycle']);
  });

  it('flags colliding event order and duplicate titles', () => {
    const findings = detectWorldConflicts(
      world({
        worldEvents: [
          { id: 'e1', title: '开国大典', description: null, order: 1 },
          { id: 'e2', title: '第一次北伐', description: null, order: 1 },
          { id: 'e3', title: '开国大典', description: null, order: 2 },
        ],
      }),
    );
    expect(findings.some((item) => item.kind === 'event_order_collision')).toBe(true);
    expect(findings.some((item) => item.kind === 'event_title_duplicate')).toBe(true);
  });

  it('flags a story genre that diverges from the worldview', () => {
    const findings = detectWorldConflicts(
      world({
        worldview: { genre: '东方玄幻', rules: [] },
        stories: [{ id: 's1', title: '钢与尘', genre: '赛博朋克', logline: null }],
      }),
    );
    expect(findings.map((item) => item.kind)).toEqual(['genre_mismatch']);
  });

  it('does not flag overlapping genres like 玄幻 vs 东方玄幻', () => {
    expect(
      detectWorldConflicts(
        world({
          worldview: { genre: '东方玄幻', rules: [] },
          stories: [{ id: 's1', title: '山门', genre: '玄幻', logline: null }],
        }),
      ),
    ).toEqual([]);
  });

  it('flags a character description that asserts both poles of a fact', () => {
    const findings = detectWorldConflicts(
      world({
        characters: [{ id: 'c1', name: '艾拉', description: '她已死，但其实还活着', tags: [] }],
      }),
    );
    expect(findings.map((item) => item.kind)).toEqual(['internal_fact_clash']);
    expect(findings[0]?.evidence).toEqual(['已死', '活着']);
    expect(findings[0]?.summary).toContain('「已死」和「活着」');
  });

  it('flags incoming text that contradicts an existing character fact', () => {
    const findings = detectWorldConflicts(
      world({
        characters: [{ id: 'c1', name: '艾拉', description: '弓手，仍然活着', tags: [] }],
      }),
      { text: '艾拉已经身亡，埋在雾都外' },
    );
    expect(findings.some((item) => item.kind === 'incoming_fact_clash')).toBe(true);
  });

  it('flags creating a character that collides with a location name', () => {
    const findings = detectWorldConflicts(
      world({
        locations: [{ id: 'l1', name: '雾都', description: null, tags: [] }],
      }),
      { text: '记录角色：雾都' },
    );
    expect(findings.map((item) => item.kind)).toEqual(['incoming_name_clash']);
  });
});

describe('conflict check helpers', () => {
  it('recognizes explicit check requests', () => {
    expect(wantsConflictCheck('帮我检查一下设定冲突')).toBe(true);
    expect(wantsConflictCheck('世界自洽吗')).toBe(true);
    expect(wantsConflictCheck('增加一个角色：艾拉')).toBe(false);
  });

  it('keeps detected summaries first and caps the list', () => {
    const detected = detectWorldConflicts(
      world({
        characters: [
          { id: 'c1', name: '艾拉', description: null, tags: [] },
          { id: 'c2', name: '艾拉', description: null, tags: [] },
        ],
      }),
    );
    const merged = mergeConflictSummaries(['模型补充的冲突', detected[0]?.summary ?? ''], detected);
    expect(merged[0]).toBe(conflictSummaries(detected)[0]);
    expect(merged).toHaveLength(2);
  });

  it('explains an empty check without proposing a write', () => {
    expect(formatConflictCheckReply([])).toContain('没有发现');
    expect(formatConflictCheckReply([])).toContain('不会自动改');
  });
});
