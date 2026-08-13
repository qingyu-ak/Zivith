import type { CreatorChatThreadDTO } from './types';

export const PENDING_CHAT_TURN_KEY = 'zivith.pendingChatTurn';

export interface ThreadHistoryGroup {
  id: string;
  label: string;
  threads: CreatorChatThreadDTO[];
}

const DAY = 86_400_000;

export function groupThreadsByRecency(threads: CreatorChatThreadDTO[]): ThreadHistoryGroup[] {
  const now = Date.now();
  const buckets: ThreadHistoryGroup[] = [
    { id: 'today', label: '今天', threads: [] },
    { id: 'week', label: '7 天内', threads: [] },
    { id: 'month', label: '30 天内', threads: [] },
    { id: 'older', label: '更早', threads: [] },
  ];
  for (const thread of threads) {
    const age = now - new Date(thread.updated_at).getTime();
    if (Number.isNaN(age) || age < DAY) buckets[0]?.threads.push(thread);
    else if (age < 7 * DAY) buckets[1]?.threads.push(thread);
    else if (age < 30 * DAY) buckets[2]?.threads.push(thread);
    else buckets[3]?.threads.push(thread);
  }
  return buckets.filter((group) => group.threads.length > 0);
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
