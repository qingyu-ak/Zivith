'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Spinner } from '@zivith/ui';
import {
  api,
  createRoleplayThread,
  errorMessage,
  listRoleplayThreads,
  sendCreatorChatTurn,
  sendRoleplayTurn,
  unwrapList,
  type RoleplayThreadDTO,
} from '@/lib/api';
import { ChatComposer } from '@/components/creator-chat/chat-composer';
import { PENDING_CHAT_TURN_KEY, threadDisplayTitle } from '@/lib/chat-history';
import {
  readStoredEffort,
  writeStoredEffort,
  isLlmDegraded,
  type ChatEffort,
} from '@/lib/chat-composer';
import {
  CHAT_FOCUS_LABEL,
  clearPendingFocus,
  studioFocusHandoffMessage,
  mergeChatFocus,
  normalizeThread,
  parseFocusFromSearch,
  readPendingFocus,
  type ChatFocus,
} from '@/lib/creator-chat-nav';
import { useCollapsedSidebar } from '@/lib/sidebar-state';
import type {
  AssetDTO,
  CreatorChatMessageDTO,
  CreatorChatThreadDTO,
  ProjectDTO,
  ProposalKind,
  ProviderCatalogDTO,
  WorldEventDTO,
} from '@/lib/types';
import { isDesktopApp, pickWorkspaceDirectory, asWorkspacePath } from '@/lib/desktop';
import { IconExternal, IconSearch, IconSidebar } from '@/components/nav-icons';
import { ChatSidebar, ChatSidebarRail } from './chat-sidebar';
import { ProposalCard, type ChatProposal } from './proposal-card';
import { RoleplayLaunchButton } from './roleplay-launch';

const PROPOSAL_KINDS: ProposalKind[] = [
  'create_project',
  'create_world_event',
  'create_character',
  'create_location',
  'create_scene',
  'create_relationship',
  'update_entity',
];

const STARTERS = ['我想创造一个东方玄幻世界', '先介绍一下主角', '帮我检查设定冲突'];
const NEW_SELF = '__new_self__';

function parseProposals(message: CreatorChatMessageDTO): {
  proposals: ChatProposal[];
  applied: boolean;
  rejected: boolean;
} {
  if (!message.proposal) return { proposals: [], applied: false, rejected: false };
  const rawList = Array.isArray(message.proposal) ? message.proposal : [message.proposal];
  const proposals: ChatProposal[] = [];
  for (const raw of rawList) {
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const kind = record.kind;
    const payload = record.payload;
    if (
      typeof kind !== 'string' ||
      !PROPOSAL_KINDS.includes(kind as ProposalKind) ||
      typeof payload !== 'object' ||
      payload === null
    ) {
      continue;
    }
    proposals.push({ kind: kind as ProposalKind, payload: payload as Record<string, unknown> });
  }
  return { proposals, applied: message.proposal_state === 'applied', rejected: message.proposal_state === 'rejected' };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asChatMessage(value: unknown): CreatorChatMessageDTO | null {
  const record = asRecord(value);
  if (!record) return null;
  if (
    typeof record.id !== 'string' ||
    typeof record.role !== 'string' ||
    typeof record.content !== 'string'
  ) {
    return null;
  }
  return record as unknown as CreatorChatMessageDTO;
}

export function ChatPanel() {
  const params = useParams<{ threadId?: string }>();
  const threadId = typeof params.threadId === 'string' ? params.threadId : undefined;
  const router = useRouter();
  const [collapsed, toggleCollapsed] = useCollapsedSidebar('chat');
  const [thread, setThread] = useState<CreatorChatThreadDTO | null>(null);
  const [messages, setMessages] = useState<CreatorChatMessageDTO[]>([]);
  const [threads, setThreads] = useState<CreatorChatThreadDTO[]>([]);
  const [projects, setProjects] = useState<Pick<ProjectDTO, 'id' | 'name' | 'workspace_path'>[]>([]);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(Boolean(threadId));
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [memoryNote, setMemoryNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState<ChatFocus | null>(null);
  const [roleplayThreads, setRoleplayThreads] = useState<RoleplayThreadDTO[]>([]);
  const [characters, setCharacters] = useState<Array<{ id: string; name: string; tags: string[] }>>(
    [],
  );
  const [characterAssets, setCharacterAssets] = useState<AssetDTO[]>([]);
  const [worldEvents, setWorldEvents] = useState<WorldEventDTO[]>([]);
  const [catalog, setCatalog] = useState<ProviderCatalogDTO | null>(null);
  const [roleplayPicker, setRoleplayPicker] = useState<string | null>(null);
  const [pickerAssets, setPickerAssets] = useState<AssetDTO[]>([]);
  const [pickerEvents, setPickerEvents] = useState<WorldEventDTO[]>([]);
  const [stopped, setStopped] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [creatingSelf, setCreatingSelf] = useState(false);
  const [selfName, setSelfName] = useState('');
  const [selfPersonality, setSelfPersonality] = useState('');
  const [effort, setEffort] = useState<ChatEffort>('balanced');
  const endRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingConsumed = useRef(false);
  const focusHandoff = useRef<ChatFocus | null>(null);
  const focusRef = useRef<ChatFocus | null>(null);
  focusRef.current = focus;
  const effortRef = useRef<ChatEffort>(effort);
  effortRef.current = effort;

  useEffect(() => {
    const stored = readStoredEffort();
    setEffort(stored);
    void api<ProviderCatalogDTO>('/providers')
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, []);

  const load = useCallback(async () => {
    if (!threadId) {
      setThread(null);
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      const value = await api<{
        thread: CreatorChatThreadDTO;
        messages: CreatorChatMessageDTO[];
      }>(`/world/creator-chats/${threadId}`);
      setThread(normalizeThread(value.thread));
      setMessages(Array.isArray(value.messages) ? value.messages : []);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  const loadThreads = useCallback(() => {
    api<CreatorChatThreadDTO[] | { data?: CreatorChatThreadDTO[]; items?: CreatorChatThreadDTO[] }>(
      '/world/creator-chats',
    )
      .then((value) =>
        setThreads(
          unwrapList(value)
            .map(normalizeThread)
            .filter((item): item is CreatorChatThreadDTO => Boolean(item)),
        ),
      )
      .catch(() => setThreads([]));
    api<unknown[] | { data?: unknown[]; items?: unknown[] }>('/projects')
      .then((value) => {
        setProjects(
          unwrapList(value).flatMap((item) => {
            if (typeof item !== 'object' || item === null) return [];
            const record = item as Record<string, unknown>;
            if (typeof record.id !== 'string' || typeof record.name !== 'string') return [];
            return [
              {
                id: record.id,
                name: record.name,
                workspace_path: asWorkspacePath(record),
              },
            ];
          }),
        );
      })
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads, threadId]);

  // Agent 切换数据：项目角色列表 + 已有扮演线程（线程加载后按 project_id 拉取）。
  useEffect(() => {
    const projectId = thread?.project_id;
    if (!projectId) {
      setRoleplayThreads([]);
      setCharacters([]);
      setCharacterAssets([]);
      setWorldEvents([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [roleplay, resources] = await Promise.all([
          listRoleplayThreads(projectId),
          api<{
            entities?: {
              characters?: AssetDTO[];
              world_events?: WorldEventDTO[];
            };
          }>(`/world/projects/${projectId}/resources`),
        ]);
        if (cancelled) return;
        setRoleplayThreads(roleplay);
        const assets = (resources.entities?.characters ?? []).filter(
          (character): character is AssetDTO =>
            typeof character.id === 'string' && typeof character.name === 'string',
        );
        setCharacterAssets(assets);
        setWorldEvents(
          (resources.entities?.world_events ?? []).filter(
            (event): event is WorldEventDTO =>
              typeof event.id === 'string' && typeof event.title === 'string',
          ),
        );
        setCharacters(
          assets.map((character) => ({
            id: character.id,
            name: character.name,
            tags: Array.isArray(character.tags)
              ? character.tags.filter((tag): tag is string => typeof tag === 'string')
              : [],
          })),
        );
      } catch {
        if (!cancelled) {
          setRoleplayThreads([]);
          setCharacters([]);
          setCharacterAssets([]);
          setWorldEvents([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thread?.project_id]);

  useEffect(() => {
    if (!roleplayPicker) {
      setPickerAssets([]);
      setPickerEvents([]);
      return;
    }
    let cancelled = false;
    void api<{
      entities?: { characters?: AssetDTO[]; world_events?: WorldEventDTO[] };
    }>(`/world/projects/${roleplayPicker}/resources`)
      .then((resources) => {
        if (cancelled) return;
        setPickerAssets(
          (resources.entities?.characters ?? []).filter(
            (character): character is AssetDTO =>
              typeof character.id === 'string' && typeof character.name === 'string',
          ),
        );
        setPickerEvents(
          (resources.entities?.world_events ?? []).filter(
            (event): event is WorldEventDTO =>
              typeof event.id === 'string' && typeof event.title === 'string',
          ),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setPickerAssets([]);
          setPickerEvents([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roleplayPicker]);

  useEffect(() => {
    pendingConsumed.current = false;
    focusHandoff.current = null;
  }, [threadId]);

  useEffect(() => {
    if (!threadId || typeof window === 'undefined') {
      setFocus(null);
      return;
    }
    const fromUrl = parseFocusFromSearch(new URLSearchParams(window.location.search));
    const pending = readPendingFocus();
    const merged = mergeChatFocus(fromUrl, pending, threadId);
    if (pending?.auto_send && pending.thread_id === threadId && merged) {
      focusHandoff.current = merged;
    }
    if (pending) clearPendingFocus();
    setFocus(merged);
  }, [threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamText, sending]);

  const sendingRef = useRef(false);
  const activeRoleplay = roleplayThreads.find((item) => item.thread_id === threadId) ?? null;
  const activeRoleplayRef = useRef<RoleplayThreadDTO | null>(null);
  activeRoleplayRef.current = activeRoleplay;

  const sendContent = useCallback(
    async (content: string) => {
      if (!threadId || sendingRef.current) return;
      sendingRef.current = true;
      setError('');
      setSending(true);
      setStopped(false);
      setStreamText('');
      setMemoryNote('');
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      let acceptedUser = false;
      try {
        let sawError = '';
        const onEvent = (event: string, data: unknown) => {
          const record = asRecord(data);
          if (event === 'user') {
            const userMessage = asChatMessage(record?.user_message);
            if (userMessage) {
              acceptedUser = true;
              setMessages((current) => [...current, userMessage]);
            }
            return;
          }
          if (event === 'memory') {
            const ops = asRecord(record?.ops);
            if (ops) setMemoryNote(formatMemoryOps(ops));
            return;
          }
          if (event === 'delta' && typeof record?.text === 'string') {
            const chunk = record.text;
            setStreamText((current) => current + chunk);
            return;
          }
          if (event === 'done') {
            const assistantMessage = asChatMessage(record?.assistant_message);
            if (assistantMessage) {
              setMessages((current) => [...current, assistantMessage]);
            }
            setStreamText('');
            return;
          }
          if (event === 'error') {
            sawError =
              typeof record?.message === 'string'
                ? record.message
                : activeRoleplayRef.current
                  ? '角色回复失败'
                  : '世界构建者回复失败';
          }
        };
        const roleplay = activeRoleplayRef.current;
        if (roleplay) {
          await sendRoleplayTurn(roleplay.id, content, onEvent, effortRef.current, controller.signal);
        } else {
          await sendCreatorChatTurn(
            threadId,
            content,
            onEvent,
            focusRef.current,
            effortRef.current,
            controller.signal,
          );
        }
        if (sawError) throw new Error(sawError);
        setThreads((current) => {
          const target = current.find((item) => item.id === threadId);
          if (!target) return current;
          return [
            { ...target, updated_at: new Date().toISOString() },
            ...current.filter((item) => item.id !== threadId),
          ];
        });
      } catch (reason) {
        const aborted =
          (reason instanceof DOMException && reason.name === 'AbortError') ||
          (reason instanceof Error && reason.name === 'AbortError');
        if (aborted) {
          setStopped(true);
        } else {
          setError(errorMessage(reason));
          if (!acceptedUser) setInput(content);
          setStreamText('');
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        sendingRef.current = false;
        setSending(false);
      }
    },
    [threadId],
  );

  function stopGeneration() {
    abortRef.current?.abort();
  }

  async function changeAnchor(eventId: string) {
    const projectId = thread?.project_id;
    if (!projectId || !activeRoleplay || switching) return;
    await openRoleplay(
      projectId,
      activeRoleplay.character_asset_id,
      activeRoleplay.user_character_asset_id ?? null,
      eventId === '' ? null : eventId,
    );
  }

  /** 切换对话对象：世界构建者 ↔ 任意角色（自动复用或创建扮演线程）。 */
  async function switchAgent(value: string) {
    const projectId = thread?.project_id;
    if (!projectId || switching) return;
    setCreatingSelf(false);
    if (value === 'world') {
      const existing = threads.find(
        (item) => item.project_id === projectId && item.kind !== 'roleplay',
      );
      if (existing) {
        router.push(`/creator-chats/${existing.id}`);
        return;
      }
      setSwitching(true);
      try {
        const created = await api<unknown>('/world/creator-chats', {
          method: 'POST',
          body: { project_id: projectId, title: null },
        });
        const createdThread = normalizeThread(created);
        if (!createdThread?.id) throw new Error('无法创建对话');
        router.push(`/creator-chats/${createdThread.id}`);
      } catch (reason) {
        setError(errorMessage(reason));
      } finally {
        setSwitching(false);
      }
      return;
    }
    const keepUserId =
      activeRoleplay?.user_character_asset_id && activeRoleplay.user_character_asset_id !== value
        ? activeRoleplay.user_character_asset_id
        : null;
    await openRoleplay(projectId, value, keepUserId, activeRoleplay?.anchored_world_event_id);
  }

  async function openRoleplay(
    projectId: string,
    characterAssetId: string,
    userCharacterAssetId: string | null,
    anchoredWorldEventId?: string | null,
    alreadySwitching = false,
  ) {
    if (switching && !alreadySwitching) return;
    if (!alreadySwitching) setSwitching(true);
    setError('');
    try {
      const existing = roleplayThreads.find(
        (item) =>
          item.character_asset_id === characterAssetId &&
          (item.user_character_asset_id ?? null) === (userCharacterAssetId ?? null) &&
          (item.anchored_world_event_id ?? null) === (anchoredWorldEventId ?? null),
      );
      const created = existing
        ? { thread_id: existing.thread_id }
        : await createRoleplayThread(
            projectId,
            characterAssetId,
            anchoredWorldEventId,
            userCharacterAssetId,
          );
      const next = await listRoleplayThreads(projectId);
      setRoleplayThreads(next);
      router.push(`/creator-chats/${created.thread_id}`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSwitching(false);
    }
  }

  async function switchUserSpeaker(value: string | null) {
    const projectId = thread?.project_id;
    if (!projectId || !activeRoleplay || switching) return;
    setCreatingSelf(false);
    if (value && value === activeRoleplay.character_asset_id) {
      setError('不能同时扮演对话双方');
      return;
    }
    await openRoleplay(
      projectId,
      activeRoleplay.character_asset_id,
      value,
      activeRoleplay.anchored_world_event_id,
    );
  }

  async function createSelfAndSwitch() {
    const projectId = thread?.project_id;
    const name = selfName.trim();
    if (!projectId || !activeRoleplay || !name || switching) return;
    setSwitching(true);
    setError('');
    try {
      const created = await api<{ id?: string }>(`/projects/${projectId}/assets`, {
        method: 'POST',
        body: {
          asset_type: 'character',
          name,
          description: selfPersonality.trim()
            ? `用户角色卡：${selfPersonality.trim()}`
            : '用户自己的角色卡',
          personality: selfPersonality.trim() || null,
          tags: ['user_self'],
          state: 'active',
        },
      });
      if (!created.id) throw new Error('无法创建角色卡');
      const createdId = created.id;
      setCharacters((current) => {
        if (current.some((item) => item.id === createdId)) return current;
        return [{ id: createdId, name, tags: ['user_self'] }, ...current];
      });
      setCreatingSelf(false);
      setSelfName('');
      setSelfPersonality('');
      await openRoleplay(
        projectId,
        activeRoleplay.character_asset_id,
        created.id,
        activeRoleplay.anchored_world_event_id,
        true,
      );
    } catch (reason) {
      setError(errorMessage(reason));
      setSwitching(false);
    }
  }

  useEffect(() => {
    if (!threadId || loading || pendingConsumed.current) return;
    if (typeof sessionStorage === 'undefined') return;
    const pending = sessionStorage.getItem(PENDING_CHAT_TURN_KEY);
    if (!pending) return;
    pendingConsumed.current = true;
    sessionStorage.removeItem(PENDING_CHAT_TURN_KEY);
    void sendContent(pending);
  }, [loading, sendContent, threadId]);

  useEffect(() => {
    if (!threadId || loading || sending) return;
    const handoff = focusHandoff.current;
    if (!handoff) return;
    focusHandoff.current = null;
    focusRef.current = handoff;
    setFocus(handoff);
    void sendContent(studioFocusHandoffMessage(handoff));
  }, [loading, sendContent, sending, threadId]);

  async function send() {
    const content = input.trim();
    if (!content || sending || busy) return;
    if (!threadId) {
      await startThread(content);
      return;
    }
    setInput('');
    await sendContent(content);
  }

  async function startThread(firstMessage?: string, projectId?: string) {
    const targetProjectId = projectId?.trim() || thread?.project_id || undefined;
    if (!targetProjectId) {
      setFolderPickerOpen(true);
      setError(
        isDesktopApp()
          ? '请先选择一个文件夹作为世界项目'
          : '请用桌面应用选择文件夹，或从侧栏点选已有项目',
      );
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (firstMessage) {
        sessionStorage.setItem(PENDING_CHAT_TURN_KEY, firstMessage);
      }
      const created = await api<unknown>('/world/creator-chats', {
        method: 'POST',
        body: { project_id: targetProjectId, title: null },
      });
      const createdThread = normalizeThread(created);
      if (!createdThread?.id) throw new Error('无法创建对话');
      router.push(`/creator-chats/${createdThread.id}`);
    } catch (reason) {
      setError(errorMessage(reason));
      if (firstMessage) sessionStorage.removeItem(PENDING_CHAT_TURN_KEY);
    } finally {
      setBusy(false);
    }
  }

  async function openWorkspacePath(folderPath: string) {
    setError('');
    setBusy(true);
    try {
      const created = await api<unknown>('/world/folders/open', {
        method: 'POST',
        body: { path: folderPath },
      });
      const createdThread = normalizeThread(created);
      if (!createdThread?.id) throw new Error('无法打开文件夹');
      setFolderPickerOpen(false);
      loadThreads();
      router.push(`/creator-chats/${createdThread.id}`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function pickFolder() {
    try {
      const folderPath = await pickWorkspaceDirectory();
      if (!folderPath) return;
      await openWorkspacePath(folderPath);
    } catch (reason) {
      setFolderPickerOpen(true);
      setError(errorMessage(reason));
    }
  }

  function selectProject(projectId: string) {
    const latest = threads.find((item) => item.project_id === projectId);
    if (latest) {
      router.push(`/creator-chats/${latest.id}`);
      return;
    }
    void startThread(undefined, projectId);
  }

  async function renameProject(projectId: string, name: string) {
    setError('');
    try {
      await api(`/projects/${projectId}`, { method: 'PATCH', body: { name } });
      loadThreads();
      if (thread?.project_id === projectId) void load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function renameThread(id: string, name: string) {
    setError('');
    try {
      await api(`/world/creator-chats/${id}`, { method: 'PATCH', body: { title: name } });
      loadThreads();
      if (threadId === id) void load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function deleteThread(id: string, name: string) {
    if (!window.confirm(`确定删除对话「${name}」吗？`)) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api(`/world/creator-chats/${id}`, { method: 'DELETE' });
      const leaving = threadId === id;
      loadThreads();
      if (leaving) {
        setThread(null);
        setMessages([]);
        setFocus(null);
        router.push('/creator-chats');
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function handleApplied() {
    void load();
    loadThreads();
  }

  function dismissFocus() {
    setFocus(null);
    clearPendingFocus();
    if (threadId) router.replace(`/creator-chats/${threadId}`);
  }

  const studioHref = thread?.project_id ? `/projects/${thread.project_id}/world` : '/projects';
  const empty = (!threadId || messages.length === 0) && !sending && !streamText && !loading;
  const canSend = input.trim().length > 0 && !sending && !busy;
  const speakerOptions = characters
    .filter((item) => item.id !== activeRoleplay?.character_asset_id)
    .slice()
    .sort((a, b) => {
      const aSelf = a.tags.includes('user_self') ? 0 : 1;
      const bSelf = b.tags.includes('user_self') ? 0 : 1;
      if (aSelf !== bSelf) return aSelf - bSelf;
      return a.name.localeCompare(b.name, 'zh');
    });
  const userSpeakerValue = creatingSelf
    ? NEW_SELF
    : (activeRoleplay?.user_character_asset_id ?? '');

  return (
    <div className="flex h-dvh overflow-hidden bg-white text-zinc-900 [color-scheme:light]">
      {collapsed ? (
        <ChatSidebarRail onToggle={toggleCollapsed} onOpenFolder={() => void pickFolder()} />
      ) : (
        <ChatSidebar
          threads={threads}
          projects={projects}
          threadId={threadId}
          busy={busy}
          pickerOpen={folderPickerOpen}
          settingsHref={thread?.project_id ? `/projects/${thread.project_id}/settings` : '/projects'}
          onToggle={toggleCollapsed}
          onPickerOpenChange={setFolderPickerOpen}
          onSelectProject={selectProject}
          onOpenFolder={() => void pickFolder()}
          onNewInProject={(projectId) => void startThread(undefined, projectId)}
          onNewRoleplay={(projectId) => setRoleplayPicker(projectId)}
          onRenameProject={(projectId, name) => void renameProject(projectId, name)}
          onRenameThread={(id, name) => void renameThread(id, name)}
          onDeleteThread={(id, name) => void deleteThread(id, name)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 px-4 py-2 lg:px-6">
          {collapsed && (
            <>
              <Link
                href="/creator-chats"
                className="text-[17px] font-semibold tracking-tight text-zinc-900"
              >
                ZIVITH
              </Link>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"
                aria-label="展开侧栏"
                onClick={toggleCollapsed}
              >
                <IconSidebar className="size-4" />
              </button>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"
                aria-label="搜索对话"
                onClick={toggleCollapsed}
              >
                <IconSearch className="size-4" />
              </button>
            </>
          )}
          {threadId ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-[15px] font-medium text-zinc-800">
                {activeRoleplay
                  ? `与「${activeRoleplay.character_name}」对话`
                  : thread
                    ? threadDisplayTitle(thread)
                    : '新世界对话'}
              </h1>
              {thread?.project_id && characters.length > 0 && (
                <label className="relative shrink-0">
                  <span className="sr-only">切换对话对象</span>
                  <select
                    className="appearance-none rounded-full border border-zinc-200 bg-white py-1 pl-3 pr-7 text-xs text-zinc-600 transition hover:border-[#4d6bfe]/40 hover:text-zinc-900"
                    value={activeRoleplay ? activeRoleplay.character_asset_id : 'world'}
                    disabled={switching || sending}
                    onChange={(event) => void switchAgent(event.target.value)}
                  >
                    <option value="world">世界构建者</option>
                    {characters
                      .filter((character) => !character.tags.includes('user_self'))
                      .map((character) => (
                        <option key={character.id} value={character.id}>
                          扮演：{character.name}
                        </option>
                      ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[9px] text-zinc-400">
                    ▼
                  </span>
                </label>
              )}
              {activeRoleplay && (
                <label className="relative shrink-0">
                  <span className="sr-only">你是谁</span>
                  <select
                    className="appearance-none rounded-full border border-zinc-200 bg-white py-1 pl-3 pr-7 text-xs text-zinc-600 transition hover:border-[#4d6bfe]/40 hover:text-zinc-900"
                    value={userSpeakerValue}
                    disabled={switching || sending}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (next === NEW_SELF) {
                        setCreatingSelf(true);
                        return;
                      }
                      setCreatingSelf(false);
                      void switchUserSpeaker(next === '' ? null : next);
                    }}
                  >
                    <option value="">你是：读者</option>
                    {speakerOptions.map((character) => (
                      <option key={character.id} value={character.id}>
                        你是：{character.name}
                      </option>
                    ))}
                    <option value={NEW_SELF}>新建我自己…</option>
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[9px] text-zinc-400">
                    ▼
                  </span>
                </label>
              )}
              {creatingSelf && activeRoleplay && (
                <form
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createSelfAndSwitch();
                  }}
                >
                  <input
                    value={selfName}
                    onChange={(event) => setSelfName(event.target.value)}
                    placeholder="你的名字"
                    className="w-28 rounded-md border border-zinc-200 px-2 py-1 text-xs outline-none focus:border-[#4d6bfe]"
                    autoFocus
                  />
                  <input
                    value={selfPersonality}
                    onChange={(event) => setSelfPersonality(event.target.value)}
                    placeholder="个性（可选）"
                    className="min-w-[8rem] flex-1 rounded-md border border-zinc-200 px-2 py-1 text-xs outline-none focus:border-[#4d6bfe]"
                  />
                  <button
                    type="submit"
                    disabled={switching || !selfName.trim()}
                    className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-40"
                  >
                    {switching ? '…' : '确定'}
                  </button>
                  <button
                    type="button"
                    className="px-1 text-xs text-zinc-400"
                    onClick={() => {
                      setCreatingSelf(false);
                      setSelfName('');
                      setSelfPersonality('');
                    }}
                  >
                    取消
                  </button>
                </form>
              )}
            </div>
          ) : (
            <span className="flex-1" />
          )}
          <Link
            href={studioHref}
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
          >
            Studio
            <IconExternal className="size-3.5" />
          </Link>
        </header>

        {threadId && !thread && !loading ? (
          <div className="grid flex-1 place-items-center p-8">
            <div className="max-w-sm text-center">
              <p className="text-base font-medium text-zinc-800">对话加载失败</p>
              <p className="mt-2 text-sm text-zinc-500">
                {error || '暂时无法连接到服务器，请稍后重试。'}
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  className="rounded-full bg-[#4d6bfe] px-4 py-2 text-sm font-medium text-white"
                  onClick={() => void load()}
                >
                  重试
                </button>
                <Link className="text-sm text-[#4d6bfe]" href="/creator-chats">
                  新对话
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`min-h-0 flex-1 overflow-y-auto px-4 lg:px-6 ${empty ? 'flex items-center' : 'py-6'}`}
            >
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
                {activeRoleplay && (
                  <div className="mx-auto flex flex-wrap items-center justify-center gap-2">
                    <label className="inline-flex items-center gap-1 rounded-full bg-[#eef2ff] px-3 py-1 text-xs text-[#1e3a8a]">
                      正在扮演「{activeRoleplay.character_name}」· 时间锚点
                      <select
                        className="max-w-[12rem] bg-transparent font-medium outline-none"
                        value={activeRoleplay.anchored_world_event_id ?? ''}
                        disabled={switching || sending}
                        onChange={(event) => void changeAnchor(event.target.value)}
                      >
                        <option value="">全书读完</option>
                        {worldEvents.map((event) => (
                          <option key={event.id} value={event.id}>
                            {event.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {isLlmDegraded(catalog) ? (
                      <span
                        className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800"
                        title="当前是 Mock 或未配置密钥，扮演走模板回复"
                      >
                        降级模式
                      </span>
                    ) : null}
                  </div>
                )}
                {loading && (
                  <div className="grid min-h-[40vh] place-items-center">
                    <Spinner label="正在加载对话…" />
                  </div>
                )}
                {empty && activeRoleplay && (
                  <div className="mx-auto w-full max-w-xl rounded-2xl bg-[#f3f4f6] px-8 py-10 text-center">
                    <p className="text-lg font-medium text-zinc-900">
                      与「{activeRoleplay.character_name}」开启对话
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      你现在是{activeRoleplay.user_character_name?.trim() || '读者'}。TA
                      只记得时间锚点{activeRoleplay.anchor_title ?? '全书读完'}之前亲历的事。
                    </p>
                  </div>
                )}
                {empty && !activeRoleplay && (
                  <div className="mx-auto w-full max-w-xl rounded-2xl bg-[#f3f4f6] px-8 py-10 text-center">
                    <div className="mx-auto mb-4 grid size-10 place-items-center rounded-full bg-white text-sm font-bold text-[#4d6bfe] shadow-sm">
                      Z
                    </div>
                    <p className="text-lg font-medium text-zinc-900">开始构建你的世界</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      {thread?.project_id
                        ? '这个对话属于当前工作区。确认后的设定会写成草稿，可在 Studio 里改 IP Core 和实体。'
                        : '侧栏「选择文件夹」打开一个已有目录作为世界。项目里可以新开聊天、改名、删除对话。'}
                    </p>
                    {thread?.project_id ? (
                      <div className="mt-6 flex flex-wrap justify-center gap-2">
                        {STARTERS.map((starter) => (
                          <button
                            key={starter}
                            type="button"
                            disabled={sending || busy}
                            className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition hover:border-[#4d6bfe]/40 hover:text-zinc-900 disabled:opacity-40"
                            onClick={() => {
                              if (!threadId) {
                                void startThread(starter);
                                return;
                              }
                              void sendContent(starter);
                            }}
                          >
                            {starter}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="mt-6 inline-flex rounded-full bg-[#4d6bfe] px-4 py-2 text-sm font-medium text-white"
                        onClick={() => void pickFolder()}
                      >
                        选择文件夹
                      </button>
                    )}
                  </div>
                )}
                {messages.map((message) => {
                  const { proposals, applied, rejected } = parseProposals(message);
                  if (message.role === 'system') {
                    return (
                      <p key={message.id} className="mx-auto text-center text-xs text-zinc-400">
                        {message.content}
                      </p>
                    );
                  }
                  if (message.role === 'user') {
                    return (
                      <div key={message.id} className="flex justify-end">
                        <div className="max-w-[80%]">
                          {activeRoleplay && (
                            <p className="mb-1 text-right text-xs font-medium text-zinc-400">
                              {activeRoleplay.user_character_name?.trim() || '读者'}
                            </p>
                          )}
                          <div className="rounded-2xl bg-[#eef0f4] px-4 py-2.5 text-sm leading-6 text-zinc-800">
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={message.id} className="min-w-0">
                      {activeRoleplay && (
                        <p className="mb-1 text-xs font-medium text-[#4d6bfe]">
                          {activeRoleplay.character_name}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-800">
                        {message.content}
                      </p>
                      {proposals.length > 0 && (
                        <ProposalCard
                          threadId={threadId ?? message.thread_id}
                          messageId={message.id}
                          proposals={proposals}
                          applied={applied}
                          rejected={rejected}
                          onApplied={handleApplied}
                          onRejected={handleApplied}
                        />
                      )}
                    </div>
                  );
                })}
                {(sending || stopped) && streamText && (
                  <div>
                    <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-800">
                      {streamText}
                    </p>
                    {stopped ? (
                      <p className="mt-1 text-xs text-zinc-400">已停止生成</p>
                    ) : null}
                  </div>
                )}
                {sending && !streamText && <p className="text-sm text-zinc-400">正在思考…</p>}
                {memoryNote && !sending && (
                  <p className="px-1 pb-1 text-xs text-zinc-400">{memoryNote}</p>
                )}
                <div ref={endRef} />
              </div>
            </div>

            <div className="px-4 pb-3 pt-1 lg:px-6">
              {error && (
                <p className="mx-auto mb-2 max-w-2xl px-1 text-xs text-red-500" role="alert">
                  {error}
                </p>
              )}
              {focus && (
                <div className="mx-auto mb-2 flex max-w-2xl items-center justify-between gap-2 rounded-2xl bg-[#eef2ff] px-3 py-1.5 text-xs text-[#1e3a8a]">
                  <span>
                    正在讨论{CHAT_FOCUS_LABEL[focus.kind]}「{focus.name}」
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-[11px] text-zinc-500 hover:text-zinc-800"
                    onClick={dismissFocus}
                  >
                    取消
                  </button>
                </div>
              )}
              <ChatComposer
                value={input}
                placeholder={
                  focus
                    ? `继续完善「${focus.name}」…`
                    : activeRoleplay
                      ? `对「${activeRoleplay.character_name}」说…`
                      : '发给世界构建者…'
                }
                sending={sending}
                canSend={canSend}
                projectId={thread?.project_id}
                threadId={threadId}
                messageTexts={messages.map((item) => item.content)}
                effort={effort}
                onEffortChange={(next) => {
                  setEffort(next);
                  writeStoredEffort(next);
                }}
                onChange={setInput}
                onSubmit={() => void send()}
                onStop={stopGeneration}
                onNewChat={() => {
                  if (thread?.project_id) void startThread(undefined, thread.project_id);
                  else void pickFolder();
                }}
              />
              <p className="mx-auto mt-2 max-w-2xl text-center text-[11px] text-zinc-400">
                内容由 AI 生成，请仔细甄别
              </p>
            </div>
          </>
        )}
      </div>
      {roleplayPicker ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/30 p-4"
          onClick={() => setRoleplayPicker(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-zinc-800">开始扮演</h2>
              <button
                type="button"
                className="text-xs text-zinc-400 hover:text-zinc-700"
                onClick={() => setRoleplayPicker(null)}
              >
                关闭
              </button>
            </div>
            {pickerAssets.filter((item) => !item.tags?.includes('user_self')).length === 0 ? (
              <p className="text-sm text-zinc-500">
                这个世界还没有角色。先在对话里创建，或到 Studio 实体库补一张角色卡。
              </p>
            ) : (
              <ul className="grid max-h-[60vh] gap-3 overflow-y-auto">
                {pickerAssets
                  .filter((item) => !item.tags?.includes('user_self'))
                  .map((character) => (
                    <li key={character.id} className="rounded-xl border border-zinc-200 p-3">
                      <p className="mb-2 text-sm font-medium text-zinc-800">{character.name}</p>
                      <RoleplayLaunchButton
                        projectId={roleplayPicker}
                        characterAssetId={character.id}
                        characterName={character.name}
                        characters={pickerAssets}
                        worldEvents={pickerEvents}
                        align="start"
                      />
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatMemoryOps(ops: Record<string, unknown>): string {
  const added = Number(ops.added ?? 0);
  const updated = Number(ops.updated ?? 0);
  const noop = Number(ops.noop ?? 0);
  const conflicts = Array.isArray(ops.conflicts) ? ops.conflicts.length : 0;
  const parts = [`归档 ${added}`];
  if (updated > 0) parts.push(`合并 ${updated}`);
  if (noop > 0) parts.push(`重复 ${noop}`);
  if (conflicts > 0) {
    const first = Array.isArray(ops.conflicts) ? ops.conflicts[0] : null;
    const record =
      first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
    const hint =
      (typeof record?.content === 'string' && record.content.trim()) ||
      (typeof record?.existing_content === 'string' && record.existing_content.trim()) ||
      '';
    parts.push(hint ? `冲突 ${conflicts}（待确认：${hint.slice(0, 24)}）` : `冲突 ${conflicts}（待确认）`);
  }
  return `记忆：${parts.join(' · ')}`;
}
