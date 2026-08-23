import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

export interface VectorEntry {
  id: string;
  vector: number[];
}

function float32ToBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

function bufferToFloat32(buffer: Buffer): Float32Array {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 本地向量库：每项目一个 sqlite 文件（data/memory-vectors/<projectId>.sqlite）。
 * 派生索引 — 唯一事实源是 PG 的 memory_atoms，可随时全量重建。
 */
export class LocalVectorStore {
  private readonly connections = new Map<string, Database.Database>();

  constructor(private readonly baseDir: string) {}

  private db(projectId: string): Database.Database {
    let db = this.connections.get(projectId);
    if (!db) {
      mkdirSync(this.baseDir, { recursive: true });
      db = new Database(join(this.baseDir, `${projectId}.sqlite`));
      db.exec(
        'CREATE TABLE IF NOT EXISTS vectors (id TEXT PRIMARY KEY, vector BLOB NOT NULL, updated_at INTEGER NOT NULL)',
      );
      this.connections.set(projectId, db);
    }
    return db;
  }

  upsert(projectId: string, entries: VectorEntry[]): void {
    if (entries.length === 0) return;
    const db = this.db(projectId);
    const stmt = db.prepare(
      'INSERT INTO vectors (id, vector, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET vector = excluded.vector, updated_at = excluded.updated_at',
    );
    const now = Date.now();
    db.transaction(() => {
      for (const entry of entries) {
        stmt.run(entry.id, float32ToBuffer(entry.vector), now);
      }
    })();
  }

  search(projectId: string, query: number[], topK: number): Array<{ id: string; score: number }> {
    const rows = this.db(projectId)
      .prepare('SELECT id, vector FROM vectors')
      .all() as Array<{ id: string; vector: Buffer }>;
    const queryVector = new Float32Array(query);
    return rows
      .map((row) => ({ id: row.id, score: cosine(queryVector, bufferToFloat32(row.vector)) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, topK));
  }

  remove(projectId: string, id: string): void {
    this.db(projectId).prepare('DELETE FROM vectors WHERE id = ?').run(id);
  }

  count(projectId: string): number {
    const row = this.db(projectId).prepare('SELECT COUNT(*) AS n FROM vectors').get() as { n: number };
    return row.n;
  }

  /** 重建入口：清空项目向量（连接保持，文件复用）。 */
  removeByProject(projectId: string): void {
    this.db(projectId).prepare('DELETE FROM vectors').run();
  }

  close(): void {
    for (const db of this.connections.values()) db.close();
    this.connections.clear();
  }
}
