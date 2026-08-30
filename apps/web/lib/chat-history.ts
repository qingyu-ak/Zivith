import type { CreatorChatKind, CreatorChatThreadDTO } from './types';

export const PENDING_CHAT_TURN_KEY = 'zivith.pendingChatTurn';

export interface ThreadHistoryGroup {
  id: string;
  label: string;
  threads: CreatorChatThreadDTO[];
}

const DAY = 86_400_000;

function isThread(value: unknown): value is CreatorChatThreadDTO {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CreatorChatThreadDTO).id === 'string'
  );
}

export function threadKind(thread: Pick<CreatorChatThreadDTO, 'kind'>): CreatorChatKind {
  return thread.kind === 'roleplay' ? 'roleplay' : 'world';
}

export function partitionThreadsByKind(threads: CreatorChatThreadDTO[]): {
  world: CreatorChatThreadDTO[];
  roleplay: CreatorChatThreadDTO[];
} {
  const world: CreatorChatThreadDTO[] = [];
  const roleplay: CreatorChatThreadDTO[] = [];
  for (const thread of threads) {
    if (threadKind(thread) === 'roleplay') roleplay.push(thread);
    else world.push(thread);
  }
  return { world, roleplay };
}

export function groupThreadsByRecency(threads: unknown): ThreadHistoryGroup[] {
  if (!Array.isArray(threads)) return [];
  const now = Date.now();
  const buckets: ThreadHistoryGroup[] = [
    { id: 'today', label: '今天', threads: [] },
    { id: 'week', label: '7 天内', threads: [] },
    { id: 'month', label: '30 天内', threads: [] },
    { id: 'older', label: '更早', threads: [] },
  ];
  for (const item of threads) {
    if (!isThread(item)) continue;
    const age = now - new Date(item.updated_at).getTime();
    if (Number.isNaN(age) || age < DAY) buckets[0]?.threads.push(item);
    else if (age < 7 * DAY) buckets[1]?.threads.push(item);
    else if (age < 30 * DAY) buckets[2]?.threads.push(item);
    else buckets[3]?.threads.push(item);
  }
  return buckets.filter((group) => group.threads.length > 0);
}

export function groupRoleplayByProject(threads: CreatorChatThreadDTO[]): ThreadHistoryGroup[] {
  const groups = new Map<string, ThreadHistoryGroup>();
  const order: string[] = [];
  const sorted = [...threads].sort(
    (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  );
  for (const thread of sorted) {
    const key = thread.project_id ?? '__unbound__';
    let group = groups.get(key);
    if (!group) {
      group = {
        id: key,
        label: thread.project_name?.trim() || '未绑定世界',
        threads: [],
      };
      groups.set(key, group);
      order.push(key);
    }
    group.threads.push(thread);
  }
  return order.map((id) => groups.get(id)!);
}

export function filterThreadsByQuery(
  threads: CreatorChatThreadDTO[],
  query: string,
): CreatorChatThreadDTO[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return threads;
  return threads.filter((thread) => {
    const title = (thread.title ?? '').toLowerCase();
    const project = (thread.project_name ?? '').toLowerCase();
    const character = (thread.character_name ?? '').toLowerCase();
    return title.includes(needle) || project.includes(needle) || character.includes(needle);
  });
}

export function threadDisplayTitle(
  thread: Pick<CreatorChatThreadDTO, 'title' | 'project_name'>,
): string {
  const title = thread.title?.trim();
  if (title) return title;
  const project = thread.project_name?.trim();
  if (project) return project;
  return '未命名对话';
}

export function relativeTime(value: string): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '';
  const delta = Date.now() - time;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(value).toLocaleDateString('zh-CN');
}
