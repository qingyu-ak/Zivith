// 最小内存版 Prisma：足够跑通「扮演 → 提案 → 确认 → 资源可见」的路由级测试。
// 只实现 where 的等值 / in / lte / gt / OR / 关系过滤（thread.projectId），orderBy 按单键排序。
import { randomUUID } from 'node:crypto';

type Row = Record<string, unknown>;

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected === null || expected === undefined) return actual === null || actual === undefined;
  if (expected instanceof Date)
    return actual instanceof Date && actual.getTime() === expected.getTime();
  if (typeof expected === 'object') {
    const filter = expected as Record<string, unknown>;
    if ('in' in filter) return Array.isArray(filter.in) && filter.in.includes(actual);
    if ('notIn' in filter) return Array.isArray(filter.notIn) && !filter.notIn.includes(actual);
    if ('not' in filter) return !matchesValue(actual, filter.not);
    if ('lte' in filter) return typeof actual === 'number' && actual <= (filter.lte as number);
    if ('gt' in filter) return typeof actual === 'number' && actual > (filter.gt as number);
    if ('gte' in filter) return typeof actual === 'number' && actual >= (filter.gte as number);
    if ('lt' in filter) return typeof actual === 'number' && actual < (filter.lt as number);
    if ('contains' in filter)
      return typeof actual === 'string' && actual.includes(String(filter.contains));
    // 关系过滤（thread: { projectId }）—— 交给 matchesWhere 的调用方通过 relations 处理。
    return matchesWhere(actual as Row, filter);
  }
  return actual === expected;
}

export function matchesWhere(row: Row | undefined, where: Row | undefined): boolean {
  if (!where) return true;
  if (!row) return false;
  for (const [key, expected] of Object.entries(where)) {
    if (key === 'OR') {
      if (!Array.isArray(expected) || !expected.some((clause) => matchesWhere(row, clause as Row)))
        return false;
      continue;
    }
    if (key === 'AND') {
      if (!Array.isArray(expected) || !expected.every((clause) => matchesWhere(row, clause as Row)))
        return false;
      continue;
    }
    if (key === 'NOT') {
      if (matchesWhere(row, expected as Row)) return false;
      continue;
    }
    if (!matchesValue(row[key], expected)) return false;
  }
  return true;
}

function orderRows(rows: Row[], orderBy: unknown): Row[] {
  const clauses = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  const sorted = [...rows];
  for (const clause of clauses.reverse()) {
    const [key, spec] = Object.entries(clause as Row)[0] ?? [];
    if (!key) continue;
    const direction =
      typeof spec === 'string' ? spec : ((spec as { sort?: string })?.sort ?? 'asc');
    sorted.sort((left, right) => {
      const a = left[key];
      const b = right[key];
      if (a === b) return 0;
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      const cmp =
        a instanceof Date && b instanceof Date ? a.getTime() - b.getTime() : a < b ? -1 : 1;
      return direction === 'desc' ? -cmp : cmp;
    });
  }
  return sorted;
}

export class MemoryTable {
  rows: Row[] = [];
  private seq = 0;

  constructor(
    private readonly name: string,
    private readonly relations: Record<string, (row: Row) => Row | undefined> = {},
    /** schema.prisma 里的列默认值（真 Prisma 会自动补，这里手动列出用到的）。 */
    private readonly defaults: Row = {},
  ) {}

  private resolveRelations(row: Row, where: Row | undefined): Row {
    if (!where) return row;
    const view: Row = { ...row };
    for (const key of Object.keys(where)) {
      if (key in this.relations && !(key in row)) {
        view[key] = this.relations[key]?.(row);
      }
    }
    return view;
  }

  private filter(where: Row | undefined): Row[] {
    return this.rows.filter((row) => matchesWhere(this.resolveRelations(row, where), where));
  }

  private withInclude(row: Row, include: Row | undefined): Row {
    if (!include) return row;
    const view: Row = { ...row };
    for (const key of Object.keys(include)) {
      view[key] = this.relations[key]?.(row) ?? null;
    }
    return view;
  }

  findFirst = (args: { where?: Row; orderBy?: unknown; include?: Row } = {}) => {
    const first = orderRows(this.filter(args.where), args.orderBy)[0];
    return Promise.resolve(first ? this.withInclude(first, args.include) : null);
  };

  findUnique = async (args: { where: Row; include?: Row }) => this.findFirst(args);

  findUniqueOrThrow = async (args: { where: Row }) => {
    const row = await this.findFirst(args);
    if (!row) throw new Error(`${this.name}: not found`);
    return row;
  };

  findMany = async (
    args: { where?: Row; orderBy?: unknown; take?: number; include?: Row } = {},
  ) => {
    const rows = orderRows(this.filter(args.where), args.orderBy).map((row) =>
      this.withInclude(row, args.include),
    );
    return typeof args.take === 'number' ? rows.slice(0, args.take) : rows;
  };

  count = async (args: { where?: Row } = {}) => this.filter(args.where).length;

  create = async (args: { data: Row }) => {
    const now = new Date(Date.now() + this.seq++);
    const row: Row = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...this.defaults,
      ...args.data,
    };
    this.rows.push(row);
    return row;
  };

  update = async (args: { where: Row; data: Row }) => {
    const row = this.filter(args.where)[0];
    if (!row) throw new Error(`${this.name}: update target not found`);
    Object.assign(row, args.data, { updatedAt: new Date(Date.now() + this.seq++) });
    return row;
  };

  updateMany = async (args: { where: Row; data: Row }) => {
    const rows = this.filter(args.where);
    for (const row of rows) Object.assign(row, args.data);
    return { count: rows.length };
  };

  upsert = async (args: { where: Row; create: Row; update: Row }) => {
    const existing = this.filter(flattenCompoundWhere(args.where))[0];
    if (existing) {
      Object.assign(existing, args.update);
      return existing;
    }
    return this.create({ data: args.create });
  };

  groupBy = async (args: { by: string[]; where?: Row }) => {
    const groups = new Map<string, Row & { _count: { id: number } }>();
    for (const row of this.filter(args.where)) {
      const key = args.by.map((field) => String(row[field])).join('|');
      const group =
        groups.get(key) ??
        (() => {
          const created: Row & { _count: { id: number } } = { _count: { id: 0 } };
          for (const field of args.by) created[field] = row[field];
          groups.set(key, created);
          return created;
        })();
      group._count.id += 1;
    }
    return [...groups.values()];
  };
}

/** `{ projectId_userId: { projectId, userId } }` → `{ projectId, userId }` */
function flattenCompoundWhere(where: Row): Row {
  const flat: Row = {};
  for (const [key, value] of Object.entries(where)) {
    if (key.includes('_') && typeof value === 'object' && value !== null) {
      Object.assign(flat, value);
    } else {
      flat[key] = value;
    }
  }
  return flat;
}

export function createMemoryPrisma() {
  const tables: Record<string, MemoryTable> = {};
  const table = (
    name: string,
    relations?: Record<string, (row: Row) => Row | undefined>,
    defaults?: Row,
  ) => {
    tables[name] ??= new MemoryTable(name, relations, defaults);
    return tables[name];
  };
  const creatorChatThread = table(
    'creatorChatThread',
    {},
    { projectId: null, title: null, state: 'active' },
  );
  const creatorChatMessage = table(
    'creatorChatMessage',
    { thread: (row) => creatorChatThread.rows.find((thread) => thread.id === row.threadId) },
    { proposal: null, proposalKey: null, proposalState: null },
  );
  const db = {
    user: table('user'),
    project: table(
      'project',
      {},
      { worldview: {}, defaults: {}, settings: {}, workspacePath: null },
    ),
    projectMember: table('projectMember', {}, { role: 'viewer' }),
    story: table('story', {}, { state: 'draft' }),
    scene: table('scene', {}, { state: 'draft', characterIds: [] }),
    shot: table('shot'),
    asset: table(
      'asset',
      {},
      { state: 'draft', aliases: [], tags: [], data: {}, referenceImages: [], appearance: null },
    ),
    worldEvent: table(
      'worldEvent',
      {},
      {
        state: 'draft',
        worldTimeEnvelope: {},
        presentationOrder: null,
        anchorStoryId: null,
        characterIds: [],
        sceneIds: [],
        description: null,
      },
    ),
    relationship: table(
      'relationship',
      {},
      { state: 'draft', direction: 'directed', label: null, description: null },
    ),
    projectTimeline: table('projectTimeline', {}, { name: 'World Line', temporalDimensions: [] }),
    timelineTrack: table('timelineTrack'),
    timelineItem: table('timelineItem'),
    creatorChatThread,
    creatorChatMessage,
    roleplayThread: table(
      'roleplayThread',
      {},
      { status: 'active', userCharacterAssetId: null, anchoredWorldEventId: null },
    ),
    memoryCore: table('memoryCore'),
    memoryAtom: table('memoryAtom'),
    entityRevision: table('entityRevision'),
    changeEvent: table('changeEvent'),
    projectSequence: table('projectSequence'),
    usageRecord: table('usageRecord'),
    refreshToken: table('refreshToken'),
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(db),
    $queryRaw: async () => [{ value: 1n }],
  };
  return db;
}

export type MemoryPrisma = ReturnType<typeof createMemoryPrisma>;
