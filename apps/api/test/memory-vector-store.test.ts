import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LocalVectorStore } from '../src/adapters/memory/local-vector-store.js';

const dir = mkdtempSync(join(tmpdir(), 'zivith-memory-'));
const store = new LocalVectorStore(dir);

afterAll(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const unit = (n: number): number[] => Array.from({ length: 4 }, (_, i) => (i === n ? 1 : 0));

describe('LocalVectorStore', () => {
  it('upserts and searches by cosine similarity', () => {
    store.upsert('p1', [
      { id: 'a', vector: unit(0) },
      { id: 'b', vector: unit(1) },
      { id: 'c', vector: unit(1) },
    ]);
    const hits = store.search('p1', unit(1), 2);
    expect(hits.map((hit) => hit.id).sort()).toEqual(['b', 'c']);
    expect(hits[0]!.score).toBeCloseTo(1, 5);
  });

  it('isolates projects', () => {
    store.upsert('p2', [{ id: 'x', vector: unit(1) }]);
    expect(store.search('p1', unit(1), 10).map((hit) => hit.id)).not.toContain('x');
  });

  it('removes entries and rebuilds per project', () => {
    store.remove('p1', 'a');
    expect(store.count('p1')).toBe(2);
    store.removeByProject('p1');
    expect(store.count('p1')).toBe(0);
    expect(store.count('p2')).toBe(1);
  });
});
