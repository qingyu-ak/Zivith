import { api, unwrapList } from './api';
import type { CreatorChatThreadDTO, WorldResourcesDTO, WorldSelection } from './types';

export const PENDING_CHAT_FOCUS_KEY = 'zivith.pendingChatFocus';

export const CHAT_FOCUS_KINDS = [
  'character',
  'location',
  'scene',
  'world_event',
  'story',
  'relationship',
  'project',
] as const;

export type ChatFocusKind = (typeof CHAT_FOCUS_KINDS)[number];

export interface ChatFocus {
  kind: ChatFocusKind;
  id: string;
  name: string;
}

export interface PendingChatFocus extends ChatFocus {
  thread_id: string;
  project_id: string;
  /** 进入对话后立刻发一轮，让世界构建者接着聊该实体 */
  auto_send?: boolean;
}

export const CHAT_FOCUS_LABEL: Record<ChatFocusKind, string> = {
  character: '角色',
  location: '地点',
  scene: '场景',
  world_event: '事件',
  story: '故事',
  relationship: '关系',
  project: '项目',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asPendingCount(record: Record<string, unknown>): number {
  const raw = record.pending_proposal_count ?? record.pendingProposalCount;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
}

export function isChatFocusKind(value: unknown): value is ChatFocusKind {
  return typeof value === 'string' && (CHAT_FOCUS_KINDS as readonly string[]).includes(value);
}

function asChatKind(value: unknown): CreatorChatThreadDTO['kind'] {
  return value === 'roleplay' ? 'roleplay' : 'world';
}

export function normalizeThread(value: unknown): CreatorChatThreadDTO | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string') return null;
  return {
    id: record.id,
    project_id: asString(record.project_id) ?? asString(record.projectId),
    project_name: asString(record.project_name) ?? asString(record.projectName),
    workspace_path: asString(record.workspace_path) ?? asString(record.workspacePath),
    title: asString(record.title),
    state: asString(record.state) ?? 'active',
    kind: asChatKind(record.kind),
    character_name: asString(record.character_name) ?? asString(record.characterName),
    user_character_name: asString(record.user_character_name) ?? asString(record.userCharacterName),
    is_group: record.is_group === true || record.isGroup === true,
    participant_names: Array.isArray(record.participant_names)
      ? record.participant_names.filter((item): item is string => typeof item === 'string')
      : Array.isArray(record.participantNames)
        ? record.participantNames.filter((item): item is string => typeof item === 'string')
        : [],
    active_head_message_id:
      asString(record.active_head_message_id) ?? asString(record.activeHeadMessageId),
    created_at: asString(record.created_at) ?? asString(record.createdAt) ?? '',
    updated_at: asString(record.updated_at) ?? asString(record.updatedAt) ?? '',
    pending_proposal_count: asPendingCount(record),
  };
}

export function parseFocusFromSearch(search: URLSearchParams): ChatFocus | null {
  const kind = search.get('focus_kind');
  const id = search.get('focus_id');
  const name = search.get('focus_name')?.trim();
  if (!isChatFocusKind(kind) || !id) return null;
  return { kind, id, name: name || '' };
}

export function readPendingFocus(): PendingChatFocus | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_CHAT_FOCUS_KEY);
    if (!raw) return null;
    const record = asRecord(JSON.parse(raw) as unknown);
    if (!record || !isChatFocusKind(record.kind)) return null;
    const id = asString(record.id);
    const name = asString(record.name);
    const threadId = asString(record.thread_id);
    const projectId = asString(record.project_id);
    if (!id || !name || !threadId || !projectId) return null;
    return {
      kind: record.kind,
      id,
      name,
      thread_id: threadId,
      project_id: projectId,
      auto_send: record.auto_send === true,
    };
  } catch {
    return null;
  }
}

export function writePendingFocus(focus: PendingChatFocus): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(PENDING_CHAT_FOCUS_KEY, JSON.stringify(focus));
}

export function clearPendingFocus(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(PENDING_CHAT_FOCUS_KEY);
}

export function mergeChatFocus(
  fromUrl: ChatFocus | null,
  pending: PendingChatFocus | null,
  threadId?: string,
): ChatFocus | null {
  if (fromUrl) {
    if (pending && pending.kind === fromUrl.kind && pending.id === fromUrl.id) {
      if (!threadId || pending.thread_id === threadId) return pending;
    }
    if (fromUrl.name.trim()) return fromUrl;
    return null;
  }
  if (pending && (!threadId || pending.thread_id === threadId)) return pending;
  return null;
}

/** 系统设置挂在项目路由下。没有当前项目时用列表里已有项目，避免掉进创作中心。 */
export function settingsHrefFor(
  projectId: string | null | undefined,
  fallbackProjectIds: Array<string | null | undefined> = [],
  section?: string,
): string {
  const id = [projectId, ...fallbackProjectIds].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  if (!id) return '/projects';
  const path = `/projects/${id}/settings`;
  return section ? `${path}?section=${section}` : path;
}

/** Chat 顶栏「Studio」：有项目进世界工作区，没有项目才退回项目列表。 */
export function studioHrefForChat(projectId: string | null | undefined): string {
  return projectId ? `/projects/${projectId}/world` : '/projects';
}

const STUDIO_SELECT_KINDS = [
  'character',
  'location',
  'scene',
  'world_event',
  'story',
  'project',
  'dimension',
  'relationship',
] as const;

export type StudioSelectKind = (typeof STUDIO_SELECT_KINDS)[number];

function isStudioSelectKind(value: string): value is StudioSelectKind {
  return (STUDIO_SELECT_KINDS as readonly string[]).includes(value);
}

/** Chat / 树点选跳到 Studio 时带上实体，世界工作区打开 Inspector。 */
export function studioHrefForEntity(
  projectId: string,
  selection: Exclude<WorldSelection, null>,
): string {
  const params = new URLSearchParams({
    select: selection.kind,
    entity: selection.id,
  });
  return `/projects/${projectId}/world?${params.toString()}`;
}

export function parseStudioSelect(
  search: URLSearchParams,
): { kind: StudioSelectKind; id: string } | null {
  const kind = search.get('select');
  const id = search.get('entity')?.trim();
  if (!kind || !id || !isStudioSelectKind(kind)) return null;
  return { kind, id };
}

/** Studio 顶栏「Chat」：已知线程直接进线程，否则回对话首页（线程解析在点击时做）。 */
export function chatHrefForStudio(threadId: string | null | undefined): string {
  return threadId ? `/creator-chats/${threadId}` : '/creator-chats';
}

export function chatPathForThread(threadId: string, focus?: ChatFocus | null): string {
  if (!focus) return `/creator-chats/${threadId}`;
  const params = new URLSearchParams({
    focus_kind: focus.kind,
    focus_id: focus.id,
    focus_name: focus.name,
  });
  return `/creator-chats/${threadId}?${params.toString()}`;
}

export function studioFocusHandoffMessage(focus: ChatFocus): string {
  return `从 Studio 继续：${CHAT_FOCUS_LABEL[focus.kind]}「${focus.name}」`;
}

export function focusFromSelection(
  resources: WorldResourcesDTO,
  selection: Exclude<WorldSelection, null>,
): ChatFocus | null {
  if (!isChatFocusKind(selection.kind)) return null;
  const name = entityTitle(resources, selection);
  if (!name) return null;
  return { kind: selection.kind, id: selection.id, name };
}

export function entityTitle(
  resources: WorldResourcesDTO,
  selection: Exclude<WorldSelection, null>,
): string | null {
  const entities = resources.entities;
  switch (selection.kind) {
    case 'project':
      return resources.project.name || '当前项目';
    case 'dimension':
      return (
        resources.temporal_dimensions?.find((item) => item.id === selection.id)?.label ?? '时间维度'
      );
    case 'character':
      return entities.characters.find((item) => item.id === selection.id)?.name ?? null;
    case 'location':
      return entities.locations.find((item) => item.id === selection.id)?.name ?? null;
    case 'scene':
      return entities.scenes.find((item) => item.id === selection.id)?.title ?? null;
    case 'world_event':
      return entities.world_events.find((item) => item.id === selection.id)?.title ?? null;
    case 'story':
      return entities.stories.find((item) => item.id === selection.id)?.title ?? null;
    case 'relationship': {
      const relationship = entities.relationships.find((item) => item.id === selection.id);
      if (!relationship) return null;
      return relationship.label?.trim() || relationship.kind || '关系';
    }
    case 'shot':
    case 'camera':
    case 'style':
    case 'prompt':
    case 'model':
      return entities.shots?.find((item) => item.id === selection.id)?.label?.trim() || '镜头';
    default:
      return null;
  }
}

export async function resolveThreadForProject(projectId: string): Promise<string> {
  const listed = await api<unknown[] | { data?: unknown[]; items?: unknown[] }>(
    `/world/projects/${projectId}/creator-chats`,
  );
  const threads = unwrapList(listed)
    .map(normalizeThread)
    .filter((thread): thread is CreatorChatThreadDTO => Boolean(thread?.id))
    .filter((thread) => thread.kind !== 'roleplay');
  if (threads[0]?.id) return threads[0].id;
  const created = await api<unknown>('/world/creator-chats', {
    method: 'POST',
    body: { project_id: projectId, title: null },
  });
  const thread = normalizeThread(created);
  if (!thread?.id) throw new Error('无法创建创作对话');
  return thread.id;
}

export function studioAgentThreadKey(projectId: string): string {
  return `zivith.studioAgentThread.${projectId}`;
}

/** Agent 面板：记住上次打开的世界构建线程；没有记录则用最近一条。 */
export function pickStudioAgentThread(
  threads: CreatorChatThreadDTO[],
  storedId: string | null | undefined,
): string | null {
  const world = threads.filter((thread) => thread.kind !== 'roleplay');
  if (storedId && world.some((thread) => thread.id === storedId)) return storedId;
  return world[0]?.id ?? null;
}
