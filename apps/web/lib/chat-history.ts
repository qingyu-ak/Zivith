import type { CreatorChatKind, CreatorChatThreadDTO, ProjectDTO } from './types';

export const PENDING_CHAT_TURN_KEY = 'zivith.pendingChatTurn';

export interface ThreadHistoryGroup {
  id: string;
  label: string;
  workspacePath: string | null;
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
    { id: 'today', label: '今天', workspacePath: null, threads: [] },
    { id: 'week', label: '7 天内', workspacePath: null, threads: [] },
    { id: 'month', label: '30 天内', workspacePath: null, threads: [] },
    { id: 'older', label: '更早', workspacePath: null, threads: [] },
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

export function groupThreadsByProject(threads: CreatorChatThreadDTO[]): ThreadHistoryGroup[] {
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
        workspacePath: thread.workspace_path ?? null,
        threads: [],
      };
      groups.set(key, group);
      order.push(key);
    }
    group.threads.push(thread);
  }
  return order.map((id) => groups.get(id)!);
}

export function groupRoleplayByProject(threads: CreatorChatThreadDTO[]): ThreadHistoryGroup[] {
  return groupThreadsByProject(threads);
}

export function groupProjectsWithThreads(
  projects: Pick<ProjectDTO, 'id' | 'name' | 'workspace_path'>[],
  threads: CreatorChatThreadDTO[],
): ThreadHistoryGroup[] {
  const fromThreads = groupThreadsByProject(threads);
  const threadsByProject = new Map<string, CreatorChatThreadDTO[]>();
  for (const group of fromThreads) {
    if (group.id !== '__unbound__') threadsByProject.set(group.id, group.threads);
  }

  const rows = new Map<string, { id: string; name: string; workspacePath: string | null }>();
  for (const project of projects) {
    rows.set(project.id, {
      id: project.id,
      name: project.name.trim() || '未命名项目',
      workspacePath: project.workspace_path ?? null,
    });
  }
  for (const thread of threads) {
    if (!thread.project_id || rows.has(thread.project_id)) continue;
    rows.set(thread.project_id, {
      id: thread.project_id,
      name: thread.project_name?.trim() || '未命名项目',
      workspacePath: thread.workspace_path ?? null,
    });
  }

  const latestActivity = (id: string): number => {
    const first = threadsByProject.get(id)?.[0];
    return first ? new Date(first.updated_at).getTime() : 0;
  };

  const groups = [...rows.values()]
    .sort((left, right) => {
      const delta = latestActivity(right.id) - latestActivity(left.id);
      if (delta !== 0) return delta;
      return left.name.localeCompare(right.name, 'zh');
    })
    .map((project) => ({
      id: project.id,
      label: project.name,
      workspacePath: project.workspacePath,
      threads: threadsByProject.get(project.id) ?? [],
    }));

  const unbound = fromThreads.find((group) => group.id === '__unbound__');
  if (unbound) groups.push(unbound);
  return groups;
}

export function filterProjectGroups(
  groups: ThreadHistoryGroup[],
  query: string,
): ThreadHistoryGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  return groups.flatMap((group) => {
    const nameHit = group.label.toLowerCase().includes(needle);
    const pathHit = (group.workspacePath ?? '').toLowerCase().includes(needle);
    const threads = nameHit || pathHit ? group.threads : filterThreadsByQuery(group.threads, query);
    if (!nameHit && !pathHit && threads.length === 0) return [];
    return [{ ...group, threads }];
  });
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
    const workspace = (thread.workspace_path ?? '').toLowerCase();
    const participants = (thread.participant_names ?? []).join(' ').toLowerCase();
    return (
      title.includes(needle) ||
      project.includes(needle) ||
      character.includes(needle) ||
      workspace.includes(needle) ||
      participants.includes(needle)
    );
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

export type OpeningChatKnown = Pick<
  CreatorChatThreadDTO,
  'title' | 'project_name' | 'kind' | 'character_name' | 'is_group' | 'participant_names'
>;

/** 有 threadId 时不要用「新世界对话」顶替还没拉到的标题。 */
export function openingChatTitle(input: {
  threadId?: string;
  loading: boolean;
  loadFailed: boolean;
  thread: OpeningChatKnown | null;
  listed: OpeningChatKnown | null;
}): string {
  if (!input.threadId) return '新世界对话';
  const known = input.thread ?? input.listed;
  if (known) return threadDisplayTitle(known);
  if (input.loadFailed) return '对话加载失败';
  return '正在打开对话…';
}

/**
 * 打开已有扮演时输入框不要写成「发给世界构建者」。
 * 返回 null 表示沿用面板里更细的占位。
 */
export function openingComposerPlaceholder(input: {
  threadId?: string;
  loading: boolean;
  loadFailed: boolean;
  thread: OpeningChatKnown | null;
  listed: OpeningChatKnown | null;
  activeRoleplay: boolean;
}): string | null {
  if (!input.threadId) return null;
  if (input.loadFailed && !input.thread) return null;
  const known = input.thread ?? input.listed;
  const knownRoleplay = Boolean(known && threadKind(known) === 'roleplay');
  const waitingForPlay = knownRoleplay && !input.activeRoleplay;
  if (!input.loading && !waitingForPlay) return null;
  if (knownRoleplay) {
    if (known?.is_group) {
      const names = (known.participant_names ?? []).map((name) => name.trim()).filter(Boolean);
      return names.length > 0 ? `正在打开群聊 · ${names.join('、')}…` : '正在打开对话…';
    }
    const name = known?.character_name?.trim();
    if (name) return `对「${name}」说…`;
  }
  return '正在打开对话…';
}

export function workspaceListHint(input: {
  ready: boolean;
  query: string;
  desktop: boolean;
}): string {
  if (input.query.trim()) return '没有匹配的项目或对话';
  if (!input.ready) return '正在加载工作区…';
  if (input.desktop) {
    return '点「新建世界」从零开始，或点项目旁的加号打开已有文件夹。';
  }
  return '点「新建世界」从零开始。打开已有文件夹需要桌面应用。';
}

/** 开始扮演 / 群聊弹层：失败不能装成「这个世界没人」。 */
export function roleplayPickerView(input: {
  ready: boolean;
  error: string;
  playableCount: number;
}): 'loading' | 'error' | 'empty' | 'list' {
  if (input.error.trim()) return 'error';
  if (!input.ready) return 'loading';
  if (input.playableCount <= 0) return 'empty';
  return 'list';
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

export function compactRelativeTime(value: string): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '';
  const delta = Date.now() - time;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天`;
  return new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
