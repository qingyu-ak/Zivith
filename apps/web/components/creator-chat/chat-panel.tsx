'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Spinner } from '@zivith/ui';
import {
  api,
  createRoleplayThread,
  errorMessage,
  listMemoryConflicts,
  listRoleplayThreads,
  resolveMemoryConflict,
  rollbackCreatorChat,
  sendCreatorChatTurn,
  sendRoleplayTurn,
  unwrapList,
  type RoleplayThreadDTO,
} from '@/lib/api';
import {
  extractPendingConflicts,
  mergeConflictCards,
  removeConflictCard,
  type MemoryConflictCard,
  type MemoryConflictDecision,
} from '@/lib/memory-conflicts';
import { formatMemoryOps } from '@/lib/memory-ops';
import { FolderFlowCancelled, openWorldFromFolder } from '@/lib/world-folder';
import { NEW_WORLD_HREF } from '@/lib/create-scratch-world';
import { importWorldCharacter, playableCharacters } from '@/lib/create-world-character';
import { ThoughtSummary } from '@/components/creator-chat/thought-summary';
import { ChatComposer } from '@/components/creator-chat/chat-composer';
import { CreateCharacterForm } from '@/components/create-character-form';
import { ImportCharacterDialog } from '@/components/world/import-character-dialog';
import {
  openingChatTitle,
  openingComposerPlaceholder,
  PENDING_CHAT_TURN_KEY,
  roleplayPickerView,
} from '@/lib/chat-history';
import { chatWorldResourcesView } from '@/lib/chat-world-resources';
import {
  readStoredEffort,
  writeStoredEffort,
  isLlmDegraded,
  type ChatEffort,
} from '@/lib/chat-composer';
import {
  decideWriteAction,
  readStoredWriteMode,
  writeStoredWriteMode,
  type AgentWriteMode,
} from '@/lib/agent-write-mode';
import {
  CHAT_FOCUS_LABEL,
  clearPendingFocus,
  studioFocusHandoffMessage,
  mergeChatFocus,
  normalizeThread,
  parseFocusFromSearch,
  readPendingFocus,
  settingsHrefFor,
  studioHrefForChat,
  studioHrefForEntity,
  type ChatFocus,
} from '@/lib/creator-chat-nav';
import { useCollapsedSidebar } from '@/lib/sidebar-state';
import type {
  AssetDTO,
  CreatorChatMessageDTO,
  CreatorChatThreadDTO,
  ProjectDTO,
  ProviderCatalogDTO,
  WorldEventDTO,
  WorldResourcesDTO,
} from '@/lib/types';
import {
  isDesktopApp,
  pickWorkspaceDirectory,
  asWorkspacePath,
  useIsDesktopApp,
  WEB_CHAT_NEEDS_WORLD,
  WEB_CHAT_NEEDS_WORLD_EMPTY,
  WEB_FOLDER_HINT,
} from '@/lib/desktop';
import { IconSidebar } from '@/components/nav-icons';
import { TopBar } from '@/components/top-bar';
import { ChatSidebar, ChatSidebarRail } from './chat-sidebar';
import { ChatErrorBanner } from './chat-error-banner';
import { MessageActions } from './message-actions';
import { ProposalCard } from './proposal-card';
import { CharacterArchive } from '@/components/world/character-archive';
import { worldEventOrder } from '@/lib/character-memory-view';
import {
  appendUniqueById,
  errorRetryContent,
  lastUserContent,
  retryTargetForMessage,
} from '@/lib/message-actions';
import { ChatChoiceMenu, CharacterCardPeek } from './chat-choice-menu';
import { RoleplayLaunchButton } from './roleplay-launch';
import { GroupChatLaunch } from './group-chat-launch';
import { ConversationTicksRail } from './conversation-ticks-rail';
import { dialogueTicks, rollbackPreview, rollbackSlice, userTicks } from '@/lib/conversation-ticks';
import {
  GROUP_BEAT_MS,
  KEEP_TALKING_CAP,
  canTakeNaturalBeat,
  naturalBeatCap,
  pickNaturalFollowSpeaker,
  takeoverSpeakerIds,
  lastSpokenSpeakerId,
} from '@/lib/group-chat-rhythm';
import { characterCardPreview } from '@/lib/character-card-preview';
import { handledProposalState, parseProposals } from '@/lib/chat-proposals';

const STARTERS = ['我想创造一个东方玄幻世界', '先介绍一下主角', '帮我检查设定冲突'];
const NEW_SELF = '__new_self__';

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
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [projects, setProjects] = useState<Pick<ProjectDTO, 'id' | 'name' | 'workspace_path'>[]>(
    [],
  );
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const desktop = useIsDesktopApp();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(Boolean(threadId));
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [memoryNote, setMemoryNote] = useState('');
  const [memoryConflicts, setMemoryConflicts] = useState<MemoryConflictCard[]>([]);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setErrorState] = useState('');
  const [errorCanRetry, setErrorCanRetry] = useState(false);
  const setError = (text: string, retryable = false) => {
    setErrorState(text);
    setErrorCanRetry(Boolean(text) && retryable);
  };
  const [focus, setFocus] = useState<ChatFocus | null>(null);
  const [roleplayThreads, setRoleplayThreads] = useState<RoleplayThreadDTO[]>([]);
  const [characters, setCharacters] = useState<Array<{ id: string; name: string; tags: string[] }>>(
    [],
  );
  const [worldResources, setWorldResources] = useState<WorldResourcesDTO | null>(null);
  const [worldContextError, setWorldContextError] = useState('');
  const [worldContextReload, setWorldContextReload] = useState(0);
  const [characterAssets, setCharacterAssets] = useState<AssetDTO[]>([]);
  const [worldEvents, setWorldEvents] = useState<WorldEventDTO[]>([]);
  const [catalog, setCatalog] = useState<ProviderCatalogDTO | null>(null);
  const [roleplayPicker, setRoleplayPicker] = useState<string | null>(null);
  const [groupPicker, setGroupPicker] = useState<string | null>(null);
  const [pickerAssets, setPickerAssets] = useState<AssetDTO[]>([]);
  const [pickerEvents, setPickerEvents] = useState<WorldEventDTO[]>([]);
  const [pickerReady, setPickerReady] = useState(false);
  const [pickerLoadError, setPickerLoadError] = useState('');
  const [pickerReload, setPickerReload] = useState(0);
  const [pickerImportOpen, setPickerImportOpen] = useState(false);
  const [pickerImportBusy, setPickerImportBusy] = useState(false);
  const [pickerImportError, setPickerImportError] = useState('');
  const [stopped, setStopped] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [creatingSelf, setCreatingSelf] = useState(false);
  const [selfName, setSelfName] = useState('');
  const [selfPersonality, setSelfPersonality] = useState('');
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [effort, setEffort] = useState<ChatEffort>('balanced');
  const [writeMode, setWriteMode] = useState<AgentWriteMode>('confirm');
  // 扮演回合：对白已到、服务端正在整理世界变化提案。
  const [draftingWorldChange, setDraftingWorldChange] = useState(false);
  const [streamingSpeaker, setStreamingSpeaker] = useState('');
  const [mutedIds, setMutedIds] = useState<string[]>([]);
  const [talkPaused, setTalkPaused] = useState(false);
  const [keepTalking, setKeepTalking] = useState(false);
  const [aiTakeover, setAiTakeover] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<{
    messageId: string;
    mode: 'keep' | 'withdraw';
  } | null>(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const [rollbackNote, setRollbackNote] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const lastSentRef = useRef('');
  const generationIdRef = useRef(0);
  const speakRoundRef = useRef(0);
  const pendingConsumed = useRef(false);
  const focusHandoff = useRef<ChatFocus | null>(null);
  const focusRef = useRef<ChatFocus | null>(null);
  focusRef.current = focus;
  const effortRef = useRef<ChatEffort>(effort);
  effortRef.current = effort;
  const writeModeRef = useRef<AgentWriteMode>(writeMode);
  writeModeRef.current = writeMode;
  const mutedIdsRef = useRef<string[]>([]);
  mutedIdsRef.current = mutedIds;
  const talkPausedRef = useRef(false);
  talkPausedRef.current = talkPaused;
  const keepTalkingRunRef = useRef(0);
  const takeoverRunRef = useRef(0);
  const inputRef = useRef('');
  inputRef.current = input;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const autoApplyRef = useRef(new Set<string>());
  const [applyingProposalIds, setApplyingProposalIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = readStoredEffort();
    setEffort(stored);
    setWriteMode(readStoredWriteMode());
    void api<ProviderCatalogDTO>('/providers')
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, []);

  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const load = useCallback(async () => {
    const id = threadIdRef.current;
    if (!id) {
      setThread(null);
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const value = await api<{
        thread: CreatorChatThreadDTO;
        messages: CreatorChatMessageDTO[];
      }>(`/world/creator-chats/${id}`);
      if (threadIdRef.current !== id) return;
      setThread(normalizeThread(value.thread));
      setMessages(Array.isArray(value.messages) ? value.messages : []);
      setError('');
    } catch (reason) {
      if (threadIdRef.current !== id) return;
      setThread(null);
      setMessages([]);
      setError(errorMessage(reason));
    } finally {
      if (threadIdRef.current === id) setLoading(false);
    }
  }, []);

  const loadThreads = useCallback(() => {
    let remaining = 2;
    const markReady = () => {
      remaining -= 1;
      if (remaining <= 0) setWorkspaceReady(true);
    };
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
      .catch(() => setThreads([]))
      .finally(markReady);
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
      .catch(() => setProjects([]))
      .finally(markReady);
  }, []);

  useEffect(() => {
    void load();
  }, [load, threadId]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads, threadId]);

  useEffect(() => {
    setTalkPaused(false);
    talkPausedRef.current = false;
    setKeepTalking(false);
    keepTalkingRunRef.current += 1;
  }, [threadId]);

  const hydrateWorldResources = useCallback((resources: WorldResourcesDTO) => {
    setWorldResources(resources);
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
  }, []);

  const reloadWorldResources = useCallback(async () => {
    const projectId = thread?.project_id;
    if (!projectId) return;
    const resources = await api<WorldResourcesDTO>(`/world/projects/${projectId}/resources`);
    hydrateWorldResources(resources);
  }, [hydrateWorldResources, thread?.project_id]);

  // Agent 切换数据：项目角色列表 + 已有扮演线程（线程加载后按 project_id 拉取）。
  useEffect(() => {
    const projectId = thread?.project_id;
    if (!projectId) {
      setRoleplayThreads([]);
      setCharacters([]);
      setCharacterAssets([]);
      setWorldEvents([]);
      setWorldResources(null);
      setWorldContextError('');
      return;
    }
    let cancelled = false;
    void (async () => {
      const roleplay = await listRoleplayThreads(projectId).catch(() => []);
      if (cancelled) return;
      setRoleplayThreads(roleplay);
      try {
        const resources = await api<WorldResourcesDTO>(`/world/projects/${projectId}/resources`);
        if (cancelled) return;
        hydrateWorldResources(resources);
        setWorldContextError('');
      } catch (reason: unknown) {
        if (cancelled) return;
        setWorldResources(null);
        setCharacterAssets([]);
        setWorldEvents([]);
        setCharacters([]);
        setWorldContextError(errorMessage(reason) || '无法加载这个世界的角色与记忆');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateWorldResources, thread?.project_id, worldContextReload]);

  useEffect(() => {
    const pickerId = roleplayPicker ?? groupPicker;
    if (!pickerId) {
      setPickerAssets([]);
      setPickerEvents([]);
      setPickerReady(false);
      setPickerLoadError('');
      setPickerImportOpen(false);
      setPickerImportError('');
      setPickerImportBusy(false);
      return;
    }
    let cancelled = false;
    setPickerReady(false);
    setPickerLoadError('');
    void api<{
      entities?: { characters?: AssetDTO[]; world_events?: WorldEventDTO[] };
    }>(`/world/projects/${pickerId}/resources`)
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
        setPickerLoadError('');
        setPickerReady(true);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setPickerAssets([]);
          setPickerEvents([]);
          setPickerLoadError(errorMessage(reason) || '无法加载角色列表');
          setPickerReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roleplayPicker, groupPicker, pickerReload]);

  async function importIntoRoleplayPicker(sourceProjectId: string, sourceCharacterId: string) {
    if (!roleplayPicker || pickerImportBusy) return false;
    setPickerImportBusy(true);
    setPickerImportError('');
    try {
      const created = await importWorldCharacter({
        targetProjectId: roleplayPicker,
        sourceProjectId,
        sourceCharacterId,
        existingNames: pickerAssets.map((item) => item.name),
      });
      setPickerAssets((current) =>
        current.some((item) => item.id === created.id) ? current : [created, ...current],
      );
      if (thread?.project_id === roleplayPicker) void reloadWorldResources();
      return true;
    } catch (reason: unknown) {
      setPickerImportError(errorMessage(reason) || '没能导入角色');
      return false;
    } finally {
      setPickerImportBusy(false);
    }
  }

  useEffect(() => {
    pendingConsumed.current = false;
    focusHandoff.current = null;
    abortRef.current?.abort();
    sendingRef.current = false;
    lastSentRef.current = '';
    generationIdRef.current += 1;
    setSending(false);
    setStopped(false);
    setStreamText('');
    setStreamingSpeaker('');
    setMutedIds([]);
    setRollbackTarget(null);
    setRollbackNote('');
    setMemoryNote('');
    setError('');
    setThread(null);
    setMessages([]);
    setLoading(Boolean(threadId));
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

  // 切线程时清空旧冲突卡；线程挂上项目后补拉该线程未裁决的冲突（刷新后 SSE 已不可见）。
  useEffect(() => {
    setMemoryConflicts([]);
  }, [threadId]);

  useEffect(() => {
    const projectId = thread?.project_id;
    if (!projectId || !threadId) return;
    let cancelled = false;
    listMemoryConflicts(projectId, { status: 'pending', threadId })
      .then((items) => {
        if (cancelled) return;
        const cards = extractPendingConflicts({ conflicts: items });
        if (cards.length > 0) {
          setMemoryConflicts((current) => mergeConflictCards(current, cards));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [thread?.project_id, threadId]);

  const resolveConflict = useCallback(async (id: string, decision: MemoryConflictDecision) => {
    setResolvingConflictId(id);
    try {
      await resolveMemoryConflict(id, decision);
      setMemoryConflicts((current) => removeConflictCard(current, id));
      setError('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setResolvingConflictId(null);
    }
  }, []);

  const activeRoleplay = roleplayThreads.find((item) => item.thread_id === threadId) ?? null;
  const activeRoleplayRef = useRef<RoleplayThreadDTO | null>(null);
  activeRoleplayRef.current = activeRoleplay;

  const autoApplyIfAllowed = useCallback(
    async (message: CreatorChatMessageDTO) => {
      if (autoApplyRef.current.has(message.id)) return;
      const parsed = parseProposals(message);
      if (parsed.applied || parsed.rejected || parsed.proposals.length === 0) return;
      const action = decideWriteAction(
        writeModeRef.current,
        parsed.proposals.map((item) => item.kind),
        { roleplay: Boolean(activeRoleplayRef.current) },
      );
      if (action !== 'auto') return;
      const targetThread = message.thread_id;
      if (!targetThread) return;
      autoApplyRef.current.add(message.id);
      setApplyingProposalIds((current) =>
        current.includes(message.id) ? current : [...current, message.id],
      );
      try {
        await api(`/world/creator-chats/${targetThread}/proposals/${message.id}/apply`, {
          method: 'POST',
          body: {},
        });
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id ? { ...item, proposal_state: 'applied' } : item,
          ),
        );
        void load();
        loadThreads();
      } catch (reason) {
        const handled = handledProposalState(reason);
        if (handled === 'applied') {
          setMessages((current) =>
            current.map((item) =>
              item.id === message.id ? { ...item, proposal_state: 'applied' } : item,
            ),
          );
          void load();
          loadThreads();
          return;
        }
        if (handled === 'rejected') {
          setMessages((current) =>
            current.map((item) =>
              item.id === message.id ? { ...item, proposal_state: 'rejected' } : item,
            ),
          );
          return;
        }
        autoApplyRef.current.delete(message.id);
        setError('自动写入失败，请手动确认提案');
      } finally {
        setApplyingProposalIds((current) => current.filter((id) => id !== message.id));
      }
    },
    [load, loadThreads],
  );

  const sendContent = useCallback(
    async (
      content: string,
      options?: { retry?: boolean; speakerAssetId?: string; ghostwrite?: boolean },
    ): Promise<{
      ok: boolean;
      aborted: boolean;
      speakerAssetId: string | null;
      pendingProposal: boolean;
    }> => {
      const empty = { ok: false, aborted: false, speakerAssetId: null, pendingProposal: false };
      const trimmed = content.trim();
      if (!threadId) return empty;
      if (!trimmed && !options?.speakerAssetId && !options?.ghostwrite) return empty;
      if (trimmed) {
        takeoverRunRef.current += 1;
        setAiTakeover(false);
      }
      abortRef.current?.abort();
      sendingRef.current = true;
      if (trimmed) lastSentRef.current = trimmed;
      const generation = ++generationIdRef.current;
      setError('');
      setSending(true);
      setStopped(false);
      setStreamText('');
      setStreamingSpeaker('');
      setMemoryNote('');
      const controller = new AbortController();
      abortRef.current = controller;
      const stillCurrent = () => generation === generationIdRef.current;
      let acceptedUser = false;
      let sawDone = false;
      let aborted = false;
      let speakerAssetId: string | null = options?.speakerAssetId ?? null;
      let pendingProposal = false;
      try {
        let sawError = '';
        const onEvent = (event: string, data: unknown) => {
          if (!stillCurrent()) return;
          const record = asRecord(data);
          if (event === 'user') {
            const userMessage = asChatMessage(record?.user_message);
            if (userMessage) {
              acceptedUser = true;
              speakerAssetId = userMessage.speaker_asset_id ?? speakerAssetId;
              setMessages((current) => appendUniqueById(current, userMessage));
            }
            return;
          }
          if (event === 'memory') {
            const ops = asRecord(record?.ops);
            if (ops) {
              setMemoryNote(formatMemoryOps(ops));
              const cards = extractPendingConflicts(ops);
              if (cards.length > 0) {
                setMemoryConflicts((current) => mergeConflictCards(current, cards));
              }
            }
            return;
          }
          if (event === 'delta' && typeof record?.text === 'string') {
            const chunk = record.text;
            setStreamText((current) => current + chunk);
            return;
          }
          if (event === 'status') {
            // 扮演：对白说完后服务端再整理世界变化，这一步要有可见反馈（task-s25）。
            setDraftingWorldChange(record?.phase === 'drafting_world_change');
            if (typeof record?.speaker_name === 'string' && record.speaker_name.trim()) {
              setStreamingSpeaker(record.speaker_name.trim());
            }
            return;
          }
          if (event === 'done') {
            sawDone = true;
            setDraftingWorldChange(false);
            const assistantMessage = asChatMessage(record?.assistant_message);
            if (assistantMessage) {
              speakerAssetId = assistantMessage.speaker_asset_id ?? speakerAssetId;
              pendingProposal = assistantMessage.proposal_state === 'pending';
              setMessages((current) => appendUniqueById(current, assistantMessage));
              void autoApplyIfAllowed(assistantMessage);
            }
            setStreamText('');
            return;
          }
          if (event === 'error') {
            setDraftingWorldChange(false);
            sawError =
              typeof record?.message === 'string'
                ? record.message
                : activeRoleplayRef.current
                  ? '角色回复失败'
                  : '世界构建者回复失败';
          }
        };
        const roleplay = activeRoleplayRef.current;
        const retryOpts = options?.retry ? { retry: true } : undefined;
        if (roleplay) {
          await sendRoleplayTurn(
            roleplay.id,
            trimmed,
            onEvent,
            effortRef.current,
            controller.signal,
            {
              ...(retryOpts ?? {}),
              speakerAssetId: options?.speakerAssetId,
              mutedAssetIds: mutedIdsRef.current,
              ...(options?.ghostwrite ? { ghostwrite: true } : {}),
            },
          );
        } else {
          await sendCreatorChatTurn(
            threadId,
            trimmed,
            onEvent,
            focusRef.current,
            effortRef.current,
            controller.signal,
            retryOpts,
          );
        }
        if (sawError) throw new Error(sawError);
        if (!stillCurrent()) return { ok: false, aborted: true, speakerAssetId, pendingProposal };
        setThreads((current) => {
          const target = current.find((item) => item.id === threadId);
          if (!target) return current;
          return [
            { ...target, updated_at: new Date().toISOString() },
            ...current.filter((item) => item.id !== threadId),
          ];
        });
      } catch (reason) {
        if (!stillCurrent()) return { ok: false, aborted: true, speakerAssetId, pendingProposal };
        setDraftingWorldChange(false);
        aborted =
          (reason instanceof DOMException && reason.name === 'AbortError') ||
          (reason instanceof Error && reason.name === 'AbortError');
        if (aborted) {
          setStopped(true);
        } else {
          setError(errorMessage(reason), true);
          if (!acceptedUser) {
            setInput((current) => (current.trim() ? current : trimmed));
          }
          setStreamText('');
        }
      }
      if (!stillCurrent()) return { ok: false, aborted: true, speakerAssetId, pendingProposal };
      if (abortRef.current === controller) abortRef.current = null;
      sendingRef.current = false;
      setSending(false);
      // 暂停思考：不要把服务端刚写上、客户端已丢掉的那句再拉回来。
      if (!sawDone && !aborted) void load();
      return { ok: sawDone && !aborted, aborted, speakerAssetId, pendingProposal };
    },
    [threadId, autoApplyIfAllowed, load],
  );

  function stopGeneration() {
    speakRoundRef.current += 1;
    abortRef.current?.abort();
  }

  function waitGroupBeat(round: number): Promise<boolean> {
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (speakRoundRef.current !== round || talkPausedRef.current || inputRef.current.trim()) {
          window.clearInterval(timer);
          resolve(false);
          return;
        }
        if (Date.now() - started >= GROUP_BEAT_MS) {
          window.clearInterval(timer);
          resolve(true);
        }
      }, 80);
    });
  }

  async function maybeContinueGroup(
    result: {
      ok: boolean;
      aborted: boolean;
      speakerAssetId: string | null;
      pendingProposal: boolean;
    },
    opts: { fromUser: boolean; round: number },
  ) {
    const roleplay = activeRoleplayRef.current;
    if (!result.ok || result.aborted) return;
    if (
      !canTakeNaturalBeat({
        talkPaused: talkPausedRef.current,
        pendingProposal: result.pendingProposal,
      })
    ) {
      return;
    }
    if (!roleplay?.is_group) return;
    if (speakRoundRef.current !== opts.round) return;
    const participants = roleplay.participant_asset_ids ?? [];
    if (participants.length < 2) return;
    const unmutedCount = participants.filter((id) => !mutedIdsRef.current.includes(id)).length;
    const cap = naturalBeatCap(unmutedCount, opts.fromUser);
    let beats = 1;
    let lastId = result.speakerAssetId;
    while (beats < cap) {
      const proceeded = await waitGroupBeat(opts.round);
      if (!proceeded) return;
      if (!canTakeNaturalBeat({ talkPaused: talkPausedRef.current })) return;
      const latest = messagesRef.current.at(-1);
      if (latest?.proposal_state === 'pending') return;
      const next = pickNaturalFollowSpeaker({
        participantIds: participants,
        lastSpeakerId: lastId,
        mutedIds: mutedIdsRef.current,
      });
      if (!next) return;
      const follow = await sendContent('', { speakerAssetId: next });
      if (!follow.ok || follow.aborted || follow.pendingProposal) return;
      if (speakRoundRef.current !== opts.round) return;
      beats += 1;
      lastId = follow.speakerAssetId ?? next;
    }
  }

  function pauseGroupTalk() {
    talkPausedRef.current = true;
    setTalkPaused(true);
    setKeepTalking(false);
    setAiTakeover(false);
    keepTalkingRunRef.current += 1;
    takeoverRunRef.current += 1;
    speakRoundRef.current += 1;
  }

  function stopKeepTalking() {
    setKeepTalking(false);
    setAiTakeover(false);
    keepTalkingRunRef.current += 1;
    takeoverRunRef.current += 1;
    speakRoundRef.current += 1;
  }

  function stopTakeover() {
    setAiTakeover(false);
    takeoverRunRef.current += 1;
    speakRoundRef.current += 1;
    abortRef.current?.abort();
  }

  async function startTakeoverTalk() {
    const roleplay = activeRoleplayRef.current;
    const userId = roleplay?.user_character_asset_id ?? null;
    if (!roleplay || !userId) return;
    talkPausedRef.current = false;
    setTalkPaused(false);
    setKeepTalking(false);
    keepTalkingRunRef.current += 1;
    const round = ++speakRoundRef.current;
    const run = ++takeoverRunRef.current;
    setAiTakeover(true);
    const participants = roleplay.participant_asset_ids?.length
      ? roleplay.participant_asset_ids
      : [roleplay.character_asset_id];
    const roster = takeoverSpeakerIds({
      userCharacterAssetId: userId,
      participantIds: participants,
    });
    let lastId = lastSpokenSpeakerId(messagesRef.current);
    let beats = 0;
    try {
      while (beats < KEEP_TALKING_CAP) {
        if (takeoverRunRef.current !== run || speakRoundRef.current !== round) break;
        if (talkPausedRef.current) break;
        if (beats > 0) {
          const proceeded = await waitGroupBeat(round);
          if (!proceeded) break;
        }
        if (takeoverRunRef.current !== run || talkPausedRef.current) break;
        const latest = messagesRef.current.at(-1);
        if (latest?.proposal_state === 'pending') {
          setRollbackNote('有待确认的世界变化，接管先停在这里。');
          break;
        }
        const next =
          beats === 0
            ? userId
            : pickNaturalFollowSpeaker({
                participantIds: roster,
                lastSpeakerId: lastId,
                mutedIds: mutedIdsRef.current,
              });
        if (!next) break;
        const follow =
          next === userId
            ? await sendContent('', { ghostwrite: true })
            : await sendContent('', { speakerAssetId: next });
        if (!follow.ok || follow.aborted) break;
        if (takeoverRunRef.current !== run || speakRoundRef.current !== round) break;
        beats += 1;
        lastId = next === userId ? userId : (follow.speakerAssetId ?? next);
        if (follow.pendingProposal) {
          setRollbackNote('有待确认的世界变化，接管先停在这里。');
          break;
        }
      }
      if (takeoverRunRef.current === run && beats >= KEEP_TALKING_CAP) {
        setRollbackNote(`已经替你演了 ${KEEP_TALKING_CAP} 句。要再继续，再点一次「AI 接管」。`);
      }
    } finally {
      if (takeoverRunRef.current === run) setAiTakeover(false);
    }
  }

  async function keepGroupTalking() {
    const roleplay = activeRoleplayRef.current;
    if (!roleplay?.is_group) return;
    talkPausedRef.current = false;
    setTalkPaused(false);
    const round = ++speakRoundRef.current;
    const run = ++keepTalkingRunRef.current;
    takeoverRunRef.current += 1;
    setAiTakeover(false);
    setKeepTalking(true);
    const participants = roleplay.participant_asset_ids ?? [];
    let lastId =
      [...messagesRef.current].reverse().find((item) => item.role === 'assistant')
        ?.speaker_asset_id ?? null;
    let beats = 0;
    try {
      while (beats < KEEP_TALKING_CAP) {
        if (keepTalkingRunRef.current !== run || speakRoundRef.current !== round) break;
        if (talkPausedRef.current) break;
        if (beats > 0) {
          const proceeded = await waitGroupBeat(round);
          if (!proceeded) break;
        }
        if (keepTalkingRunRef.current !== run || talkPausedRef.current) break;
        const latest = messagesRef.current.at(-1);
        if (latest?.proposal_state === 'pending') {
          setRollbackNote('有待确认的世界变化，互聊先停在这里。');
          break;
        }
        const next = pickNaturalFollowSpeaker({
          participantIds: participants,
          lastSpeakerId: lastId,
          mutedIds: mutedIdsRef.current,
        });
        if (!next) break;
        const follow = await sendContent('', { speakerAssetId: next });
        if (!follow.ok || follow.aborted) break;
        if (keepTalkingRunRef.current !== run || speakRoundRef.current !== round) break;
        beats += 1;
        lastId = follow.speakerAssetId ?? next;
        if (follow.pendingProposal) {
          setRollbackNote('有待确认的世界变化，互聊先停在这里。');
          break;
        }
      }
      if (keepTalkingRunRef.current === run && beats >= KEEP_TALKING_CAP) {
        setRollbackNote(`已经互聊 ${KEEP_TALKING_CAP} 句。要再继续，再点一次「让他们一直说」。`);
      }
    } finally {
      if (keepTalkingRunRef.current === run) setKeepTalking(false);
    }
  }

  async function resumeGroupTalk() {
    talkPausedRef.current = false;
    setTalkPaused(false);
    const roleplay = activeRoleplayRef.current;
    if (!roleplay?.is_group || sendingRef.current) return;
    const round = ++speakRoundRef.current;
    const last = messagesRef.current.at(-1);
    if (!last || last.proposal_state === 'pending') return;
    const participants = roleplay.participant_asset_ids ?? [];
    if (last.role === 'assistant') {
      await maybeContinueGroup(
        {
          ok: true,
          aborted: false,
          speakerAssetId: last.speaker_asset_id ?? null,
          pendingProposal: false,
        },
        { fromUser: false, round },
      );
      return;
    }
    const next = pickNaturalFollowSpeaker({
      participantIds: participants,
      lastSpeakerId: null,
      mutedIds: mutedIdsRef.current,
    });
    if (!next) return;
    const result = await sendContent('', { speakerAssetId: next });
    await maybeContinueGroup(result, { fromUser: true, round });
  }

  async function speakOne(speakerAssetId: string) {
    stopTakeover();
    const round = ++speakRoundRef.current;
    const result = await sendContent('', { speakerAssetId });
    if (!talkPausedRef.current) await maybeContinueGroup(result, { fromUser: false, round });
  }

  async function changeAnchor(eventId: string) {
    const projectId = thread?.project_id;
    if (!projectId || !activeRoleplay || switching) return;
    await openRoleplay(
      projectId,
      activeRoleplay.character_asset_id,
      activeRoleplay.user_character_asset_id ?? null,
      eventId === '' ? null : eventId,
      false,
      activeRoleplay.is_group ? (activeRoleplay.participant_asset_ids ?? []) : undefined,
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
    participantAssetIds?: string[],
  ) {
    if (switching && !alreadySwitching) return;
    if (!alreadySwitching) setSwitching(true);
    setError('');
    try {
      const group = (participantAssetIds ?? []).length >= 2;
      const liveChatIds = new Set(threads.map((item) => item.id));
      const existing = roleplayThreads.find((item) => {
        if (!item.thread_id || !liveChatIds.has(item.thread_id)) return false;
        const sameUser = (item.user_character_asset_id ?? null) === (userCharacterAssetId ?? null);
        const sameAnchor =
          (item.anchored_world_event_id ?? null) === (anchoredWorldEventId ?? null);
        if (!sameUser || !sameAnchor) return false;
        if (group) {
          const ids = item.participant_asset_ids ?? [];
          return (
            Boolean(item.is_group) &&
            ids.length === participantAssetIds!.length &&
            participantAssetIds!.every((id) => ids.includes(id))
          );
        }
        return !item.is_group && item.character_asset_id === characterAssetId;
      });
      const created = existing
        ? { thread_id: existing.thread_id }
        : await createRoleplayThread(
            projectId,
            characterAssetId,
            anchoredWorldEventId,
            userCharacterAssetId,
            group ? participantAssetIds : undefined,
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
    if (
      value &&
      (activeRoleplay.participant_asset_ids ?? [activeRoleplay.character_asset_id]).includes(value)
    ) {
      setError('你是谁不能和正在开口的角色重复');
      return;
    }
    stopTakeover();
    await openRoleplay(
      projectId,
      activeRoleplay.character_asset_id,
      value,
      activeRoleplay.anchored_world_event_id,
      false,
      activeRoleplay.is_group ? (activeRoleplay.participant_asset_ids ?? []) : undefined,
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
        activeRoleplay.is_group ? (activeRoleplay.participant_asset_ids ?? []) : undefined,
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
    void (async () => {
      const round = ++speakRoundRef.current;
      const result = await sendContent(pending);
      if (!talkPausedRef.current) await maybeContinueGroup(result, { fromUser: true, round });
    })();
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
    if (!content || busy) return;
    if (!threadId) {
      await startThread(content);
      return;
    }
    speakRoundRef.current += 1;
    setInput('');
    const round = speakRoundRef.current;
    const result = await sendContent(content);
    if (!talkPausedRef.current) await maybeContinueGroup(result, { fromUser: true, round });
  }

  async function startThread(firstMessage?: string, projectId?: string) {
    const targetProjectId = projectId?.trim() || thread?.project_id || undefined;
    if (!targetProjectId) {
      setFolderPickerOpen(true);
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (firstMessage) {
        sessionStorage.setItem(PENDING_CHAT_TURN_KEY, firstMessage);
        setInput('');
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
      // §8/§18：先检查 .zivith/workspace.json，再按异常状态引导用户选择。
      const created = await openWorldFromFolder(folderPath);
      const createdThread = normalizeThread(created);
      if (!createdThread?.id) throw new Error('无法打开文件夹');
      setFolderPickerOpen(false);
      loadThreads();
      router.push(`/creator-chats/${createdThread.id}`);
    } catch (reason) {
      if (reason instanceof FolderFlowCancelled) return;
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function pickFolder() {
    if (!isDesktopApp()) {
      setFolderPickerOpen(true);
      return;
    }
    try {
      const folderPath = await pickWorkspaceDirectory();
      if (!folderPath) return;
      await openWorkspacePath(folderPath);
    } catch (reason) {
      setFolderPickerOpen(true);
      setError(errorMessage(reason));
    }
  }

  function goToNewWorld() {
    router.push(NEW_WORLD_HREF);
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
    // 扮演里确认的事件 / 关系要立刻反映到锚点列表与角色档案（task-s25 跨模块同步）。
    if (activeRoleplayRef.current) void reloadWorldResources().catch(() => undefined);
  }

  /** 提案卡把 id 翻成人名 / 地名 / 事件名，用户确认的是「谁和谁」，不是 uuid。 */
  const proposalEntityNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const character of characterAssets) names.set(character.id, character.name);
    for (const location of worldResources?.entities?.locations ?? []) {
      if (typeof location.id === 'string' && typeof location.name === 'string') {
        names.set(location.id, location.name);
      }
    }
    for (const event of worldEvents) names.set(event.id, event.title);
    return names;
  }, [characterAssets, worldResources, worldEvents]);

  const playAsOfPresentationOrder = useMemo(() => {
    const id = activeRoleplay?.anchored_world_event_id;
    if (!id) return undefined;
    const event =
      worldEvents.find((item) => item.id === id) ??
      worldResources?.entities.world_events.find((item) => item.id === id);
    return event ? worldEventOrder(event) : Number.NEGATIVE_INFINITY;
  }, [activeRoleplay?.anchored_world_event_id, worldEvents, worldResources]);

  const playWorldTimeLabel = activeRoleplay
    ? activeRoleplay.anchor_title?.trim() || '全书读完'
    : undefined;

  /** 扮演线程带时间锚点时，新确认的事件排在时间线末尾，当前锚点下的角色还「没经历」。 */
  const roleplayAppliedHint = activeRoleplay?.anchored_world_event_id
    ? `当前时间锚点在《${activeRoleplay.anchor_title ?? '所选事件'}》之后；切换锚点到更晚的位置，角色才会经历这件事。`
    : null;

  function dismissFocus() {
    setFocus(null);
    clearPendingFocus();
    if (threadId) router.replace(`/creator-chats/${threadId}`);
  }

  const studioHref =
    activeRoleplay && thread?.project_id
      ? studioHrefForEntity(thread.project_id, {
          kind: 'character',
          id: activeRoleplay.character_asset_id,
        })
      : studioHrefForChat(thread?.project_id);
  const settingsProjectId =
    thread?.project_id ?? threads.find((item) => item.project_id)?.project_id ?? projects[0]?.id;
  const settingsHref = settingsHrefFor(settingsProjectId);
  const listedThread = threads.find((item) => item.id === threadId) ?? null;
  const loadFailed = Boolean(threadId && !thread && !loading && error);
  const headerTitle = openingChatTitle({
    threadId,
    loading,
    loadFailed,
    thread,
    listed: listedThread,
  });
  const openingPlaceholder = openingComposerPlaceholder({
    threadId,
    loading,
    loadFailed,
    thread,
    listed: listedThread,
    activeRoleplay: Boolean(activeRoleplay),
  });
  const openingThread = Boolean(openingPlaceholder);
  const empty = (!threadId || messages.length === 0) && !sending && !streamText && !loading;
  const worldBound = Boolean(threadId);
  const canSend = worldBound && input.trim().length > 0 && !busy;
  const groupIds = activeRoleplay?.participant_asset_ids?.length
    ? activeRoleplay.participant_asset_ids
    : activeRoleplay
      ? [activeRoleplay.character_asset_id]
      : [];
  const isGroup = Boolean(activeRoleplay?.is_group);
  const groupNames = activeRoleplay?.participant_names?.length
    ? activeRoleplay.participant_names
    : groupIds.map((id) => characterAssets.find((item) => item.id === id)?.name ?? id);
  const ticks = activeRoleplay ? dialogueTicks(messages) : userTicks(messages);
  const rollbackDrop = rollbackTarget
    ? rollbackSlice(messages, rollbackTarget.messageId, rollbackTarget.mode).drop
    : [];
  const rollbackSummary = rollbackTarget ? rollbackPreview(rollbackDrop) : null;
  const speakerOptions = characters
    .filter((item) => !groupIds.includes(item.id))
    .slice()
    .sort((a, b) => {
      const aSelf = a.tags.includes('user_self') ? 1 : 0;
      const bSelf = b.tags.includes('user_self') ? 1 : 0;
      if (aSelf !== bSelf) return aSelf - bSelf;
      return a.name.localeCompare(b.name, 'zh');
    });
  const assetById = new Map(characterAssets.map((item) => [item.id, item]));
  const playableAssets = characterAssets.filter((item) => !item.tags?.includes('user_self'));
  const pickerView = roleplayPickerView({
    ready: pickerReady,
    error: pickerLoadError,
    playableCount: playableCharacters(pickerAssets).length,
  });
  const worldResourcesView = chatWorldResourcesView({
    error: worldContextError,
    hasResources: Boolean(worldResources),
  });
  const playingCharacter = activeRoleplay
    ? assetById.get(activeRoleplay.character_asset_id)
    : undefined;
  const userSpeakerValue = creatingSelf
    ? NEW_SELF
    : (activeRoleplay?.user_character_asset_id ?? '');
  const playingAsName = activeRoleplay?.user_character_name?.trim() || '';
  const canTakeover = Boolean(activeRoleplay?.user_character_asset_id);

  async function confirmRollback() {
    if (!threadId || !rollbackTarget || rollbackBusy) return;
    setRollbackBusy(true);
    setError('');
    try {
      const result = await rollbackCreatorChat(
        threadId,
        rollbackTarget.messageId,
        rollbackTarget.mode,
      );
      setRollbackTarget(null);
      const skipped = result.skipped.map((item) => `${item.title}（${item.reason}）`).join('、');
      setRollbackNote(
        skipped
          ? `已回退。有些没能撤回：${skipped}`
          : result.reverted.length > 0
            ? `已回退，本场因此写入的 ${result.reverted.length} 条已从世界拿掉。`
            : '已回退。',
      );
      await load();
      loadThreads();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setRollbackBusy(false);
    }
  }

  async function speakAll() {
    if (!isGroup) return;
    stopTakeover();
    const round = ++speakRoundRef.current;
    const ids = groupIds.filter((id) => !mutedIdsRef.current.includes(id));
    for (const [index, id] of ids.entries()) {
      if (speakRoundRef.current !== round) break;
      if (index > 0) {
        const proceeded = await waitGroupBeat(round);
        if (!proceeded) break;
      }
      await sendContent('', { speakerAssetId: id });
    }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white text-zinc-900">
      <TopBar
        surface="chat"
        onToggleSidebar={toggleCollapsed}
        right={
          <Link
            href={studioHref}
            title={activeRoleplay ? '在 Studio 打开这张角色卡' : '打开 Studio 世界工作区'}
            className="rounded-lg px-2 py-1 text-xs text-zinc-600 transition hover:bg-zinc-200/80 hover:text-zinc-900"
          >
            Studio
          </Link>
        }
      />
      <div className="flex min-h-0 flex-1">
        {collapsed ? (
          <ChatSidebarRail onToggle={toggleCollapsed} onCreateWorld={goToNewWorld} />
        ) : (
          <ChatSidebar
            threads={threads}
            projects={projects}
            threadId={threadId}
            busy={busy}
            workspaceReady={workspaceReady}
            pickerOpen={folderPickerOpen}
            settingsHref={settingsHref}
            onToggle={toggleCollapsed}
            onPickerOpenChange={setFolderPickerOpen}
            onSelectProject={selectProject}
            onOpenFolder={() => void pickFolder()}
            onCreateWorld={goToNewWorld}
            onNewInProject={(projectId) => void startThread(undefined, projectId)}
            onNewRoleplay={(projectId) => {
              setGroupPicker(null);
              setRoleplayPicker(projectId);
            }}
            onNewGroupChat={(projectId) => {
              setRoleplayPicker(null);
              setGroupPicker(projectId);
            }}
            onRenameProject={(projectId, name) => void renameProject(projectId, name)}
            onRenameThread={(id, name) => void renameThread(id, name)}
            onDeleteThread={(id, name) => void deleteThread(id, name)}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 px-4 py-2 lg:px-6">
            {collapsed && (
              <button
                type="button"
                className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"
                aria-label="展开侧栏"
                onClick={toggleCollapsed}
              >
                <IconSidebar className="size-4" />
              </button>
            )}
            {threadId ? (
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h1 className="min-w-0 truncate text-[15px] font-medium text-zinc-800">
                    {activeRoleplay
                      ? isGroup
                        ? `群聊 · ${groupNames.join('、')}`
                        : `与「${activeRoleplay.character_name}」对话`
                      : headerTitle}
                  </h1>
                  {thread?.project_id && playableAssets.length > 0 && (
                    <ChatChoiceMenu
                      label="切换对话对象"
                      value={activeRoleplay ? activeRoleplay.character_asset_id : 'world'}
                      disabled={switching || sending}
                      onChange={(next) => void switchAgent(next)}
                      options={[
                        {
                          value: 'world',
                          label: '世界构建者',
                          description: '一起改设定、写实体',
                        },
                        ...playableAssets.map((character) => ({
                          value: character.id,
                          label: `扮演：${character.name}`,
                          description: characterCardPreview(character) || undefined,
                          href: studioHrefForEntity(thread.project_id!, {
                            kind: 'character',
                            id: character.id,
                          }),
                          hrefLabel: '改卡',
                        })),
                      ]}
                    />
                  )}
                  {activeRoleplay && thread?.project_id && (
                    <ChatChoiceMenu
                      label={isGroup ? '你扮演' : '你是谁'}
                      value={userSpeakerValue}
                      disabled={switching || sending}
                      onChange={(next) => {
                        if (next === NEW_SELF) {
                          setCreatingSelf(true);
                          return;
                        }
                        setCreatingSelf(false);
                        void switchUserSpeaker(next === '' ? null : next);
                      }}
                      options={[
                        {
                          value: '',
                          label: isGroup ? '你扮演：读者' : '你是：读者',
                          description: isGroup
                            ? '旁观提问。也可以选一个书中角色来接话'
                            : '旁观提问，不代入某个角色',
                        },
                        ...speakerOptions.map((character) => ({
                          value: character.id,
                          label: isGroup ? `你扮演：${character.name}` : `你是：${character.name}`,
                          description:
                            characterCardPreview(assetById.get(character.id)) || undefined,
                          href: studioHrefForEntity(thread.project_id!, {
                            kind: 'character',
                            id: character.id,
                          }),
                          hrefLabel: '改卡',
                        })),
                        { value: NEW_SELF, label: '新建我自己…' },
                      ]}
                    />
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
                {activeRoleplay && thread?.project_id ? (
                  <CharacterCardPeek
                    projectId={thread.project_id}
                    characterId={activeRoleplay.character_asset_id}
                    name={activeRoleplay.character_name}
                    preview={characterCardPreview(playingCharacter)}
                    extra={
                      worldResourcesView === 'error' ? (
                        <button
                          type="button"
                          className="shrink-0 text-red-600 hover:underline"
                          onClick={() => setWorldContextReload((current) => current + 1)}
                        >
                          重试加载记忆
                        </button>
                      ) : worldResources ? (
                        <button
                          type="button"
                          className="shrink-0 text-[#4d6bfe] hover:underline"
                          onClick={() => setMemoryOpen(true)}
                        >
                          调整记忆
                        </button>
                      ) : null
                    }
                  />
                ) : null}
              </div>
            ) : (
              <span className="flex-1" />
            )}
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
              <div className="relative min-h-0 flex-1">
                <div
                  className={`min-h-0 h-full overflow-y-auto px-4 lg:px-6 ${empty ? 'flex items-center' : 'py-6'}`}
                >
                  <div className="mx-auto flex min-w-0 w-full max-w-2xl flex-col gap-6">
                    {activeRoleplay && (
                      <div className="mx-auto flex flex-wrap items-center justify-center gap-2">
                        <label className="inline-flex items-center gap-1 rounded-full bg-[#eef2ff] px-3 py-1 text-xs text-[#1e3a8a]">
                          正在扮演「
                          {isGroup ? groupNames.join('、') : activeRoleplay.character_name}」·
                          时间锚点
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
                    {activeRoleplay && thread?.project_id && worldResourcesView === 'error' ? (
                      <div className="mx-auto w-full max-w-2xl space-y-2 text-center">
                        <p className="text-xs text-red-600" role="alert">
                          {worldContextError || '无法加载这个世界的角色与记忆'}
                        </p>
                        <button
                          type="button"
                          className="rounded-md border border-line px-2 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100"
                          onClick={() => setWorldContextReload((current) => current + 1)}
                        >
                          重试
                        </button>
                      </div>
                    ) : activeRoleplay && thread?.project_id && worldResources ? (
                      <div className="mx-auto w-full max-w-2xl">
                        <div className="flex justify-center">
                          <button
                            type="button"
                            className="rounded-full bg-[#eef2ff] px-3 py-1 text-xs text-[#1e3a8a] hover:bg-[#dbe4ff]"
                            onClick={() => setMemoryOpen((value) => !value)}
                          >
                            {memoryOpen ? '收起记忆' : '调整记忆'}
                          </button>
                        </div>
                        {memoryOpen ? (
                          <div className="mt-2 max-h-[min(28rem,50vh)] overflow-y-auto rounded-2xl border border-zinc-200 bg-white">
                            <CharacterArchive
                              compact
                              projectId={thread.project_id}
                              characterId={activeRoleplay.character_asset_id}
                              characterName={activeRoleplay.character_name}
                              resources={worldResources}
                              asOfPresentationOrder={playAsOfPresentationOrder}
                              worldTimeLabel={playWorldTimeLabel}
                              reloadToken={messages.at(-1)?.id}
                              onUpdated={() => void reloadWorldResources()}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {loading && (
                      <div className="grid min-h-[40vh] place-items-center">
                        <Spinner label="正在加载对话…" />
                      </div>
                    )}
                    {empty && activeRoleplay && (
                      <div className="mx-auto w-full max-w-xl rounded-2xl bg-[#f3f4f6] px-8 py-10 text-center">
                        <p className="text-lg font-medium text-zinc-900">
                          {isGroup
                            ? `群聊 · ${groupNames.join('、')}`
                            : `与「${activeRoleplay.character_name}」开启对话`}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                          {isGroup
                            ? `他们都在。你现在是${activeRoleplay.user_character_name?.trim() || '读者'}。你先开口，他们会自己接着说。点「暂停交流」他们就会等你；顶栏「你扮演」可以换成书中角色。每人只用自己记得的事来答。`
                            : `你现在是${activeRoleplay.user_character_name?.trim() || '读者'}。TA 只记得时间锚点「${activeRoleplay.anchor_title ?? '全书读完'}」之前亲历的事。聊天全文会留在这次对话里；重要的会收成精简记录。问还记得时，TA 会先查目录再答。点「调整记忆」看这个时间点记得什么。世界事件仍要确认才进时间线。`}
                        </p>
                      </div>
                    )}
                    {empty && !activeRoleplay && (
                      <div className="mx-auto w-full max-w-xl rounded-2xl bg-[#f3f4f6] px-8 py-10 text-center">
                        <div className="mx-auto mb-4 grid size-10 place-items-center rounded-full bg-white text-sm font-bold text-[#4d6bfe] shadow-sm">
                          Z
                        </div>
                        {thread?.project_id ? (
                          <>
                            <p className="text-lg font-medium text-zinc-900">开始构建你的世界</p>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                              这个对话属于当前工作区。确认后的设定会写成草稿，可在 Studio 里改 IP
                              Core 和实体。
                            </p>
                            <div className="mt-6 flex flex-wrap justify-center gap-2">
                              {STARTERS.map((starter) => (
                                <button
                                  key={starter}
                                  type="button"
                                  disabled={sending || busy}
                                  className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition hover:border-[#4d6bfe]/40 hover:text-zinc-900 disabled:opacity-40"
                                  onClick={() => void sendContent(starter)}
                                >
                                  {starter}
                                </button>
                              ))}
                            </div>
                            {worldResources && playableCharacters(characterAssets).length === 0 ? (
                              <div className="mt-8 text-left">
                                <CreateCharacterForm
                                  projectId={thread.project_id}
                                  existingNames={characterAssets.map((item) => item.name)}
                                  onCreated={() => {
                                    void reloadWorldResources();
                                  }}
                                  onOpenTalk={(talkId) => {
                                    router.push(`/creator-chats/${talkId}`);
                                  }}
                                />
                              </div>
                            ) : null}
                          </>
                        ) : projects.length > 0 ? (
                          <>
                            <p className="text-lg font-medium text-zinc-900">从左侧选择一个项目</p>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                              已有世界列在侧栏。点选后即可对话；新文件夹请用桌面应用打开。
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-lg font-medium text-zinc-900">先打开一个世界</p>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                              {desktop
                                ? '点「新建世界」从零开始，或在侧栏项目旁的加号打开已有文件夹。'
                                : WEB_FOLDER_HINT}
                            </p>
                            <div className="mt-6 flex flex-wrap justify-center gap-2">
                              <button
                                type="button"
                                className="inline-flex rounded-full bg-[#4d6bfe] px-4 py-2 text-sm font-medium text-white"
                                onClick={goToNewWorld}
                              >
                                新建世界
                              </button>
                            </div>
                          </>
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
                      const retry = retryTargetForMessage(messages, message.id);
                      if (message.role === 'user') {
                        return (
                          <div key={message.id} className="group flex justify-end">
                            <div className="max-w-[80%]">
                              {activeRoleplay && (
                                <p className="mb-1 text-right text-xs font-medium text-zinc-400">
                                  {message.speaker_name?.trim() ||
                                    activeRoleplay.user_character_name?.trim() ||
                                    '读者'}
                                </p>
                              )}
                              <div className="rounded-2xl bg-[var(--z-bubble)] px-4 py-2.5 text-sm leading-6 text-[var(--z-bubble-fg)]">
                                <p className="whitespace-pre-wrap">{message.content}</p>
                              </div>
                              <MessageActions
                                copyText={message.content}
                                align="end"
                                busy={sending}
                                retry={() => {
                                  if (retry?.ok) void sendContent(retry.content, { retry: true });
                                }}
                                retryBlocked={
                                  retry && !retry.ok ? retry.blocked : retry ? null : 'empty'
                                }
                                onWithdraw={() =>
                                  setRollbackTarget({ messageId: message.id, mode: 'withdraw' })
                                }
                              />
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={message.id} className="group min-w-0">
                          {activeRoleplay && (
                            <p className="mb-1 text-xs font-medium text-[#4d6bfe]">
                              {message.speaker_name?.trim() || activeRoleplay.character_name}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap text-[15px] leading-7 text-ink">
                            {message.content}
                          </p>
                          {proposals.length > 0 && (
                            <ProposalCard
                              threadId={threadId ?? message.thread_id}
                              messageId={message.id}
                              proposals={proposals}
                              applied={applied}
                              rejected={rejected}
                              applying={applyingProposalIds.includes(message.id)}
                              plan={
                                decideWriteAction(
                                  writeMode,
                                  proposals.map((item) => item.kind),
                                  {
                                    roleplay: Boolean(activeRoleplay),
                                  },
                                ) === 'plan'
                              }
                              executeLabel={
                                decideWriteAction(
                                  writeMode,
                                  proposals.map((item) => item.kind),
                                  {
                                    roleplay: Boolean(activeRoleplay),
                                  },
                                ) === 'plan'
                                  ? '按此计划写入'
                                  : undefined
                              }
                              pendingHint={
                                activeRoleplay
                                  ? '这一轮对话可能让世界发生变化。每步确认：确认后才写入世界，拒绝则世界不变。'
                                  : undefined
                              }
                              doneHint={
                                activeRoleplay ? (roleplayAppliedHint ?? undefined) : undefined
                              }
                              entityNames={proposalEntityNames}
                              onApplied={handleApplied}
                              onRejected={handleApplied}
                            />
                          )}
                          <MessageActions
                            copyText={message.content}
                            busy={sending}
                            retry={() => {
                              if (retry?.ok) void sendContent(retry.content, { retry: true });
                            }}
                            retryBlocked={
                              retry && !retry.ok ? retry.blocked : retry ? null : 'empty'
                            }
                          />
                        </div>
                      );
                    })}
                    {(sending || stopped) && streamText && (
                      <div className="group">
                        {streamingSpeaker ? (
                          <p className="mb-1 text-xs font-medium text-[#4d6bfe]">
                            {streamingSpeaker}
                          </p>
                        ) : null}
                        <p className="whitespace-pre-wrap text-[15px] leading-7 text-ink">
                          {streamText}
                        </p>
                        {stopped ? <p className="mt-1 text-xs text-zinc-400">已暂停思考</p> : null}
                        {sending && draftingWorldChange ? (
                          <p className="mt-1 text-xs text-zinc-400" role="status">
                            正在整理这一轮对世界的影响…（没有变化就不会出提案）
                          </p>
                        ) : null}
                        <MessageActions
                          copyText={streamText}
                          busy={sending}
                          retry={() => {
                            const content = lastUserContent(messages) ?? lastSentRef.current;
                            if (content.trim()) void sendContent(content, { retry: true });
                          }}
                          retryBlocked={
                            lastUserContent(messages) || lastSentRef.current.trim() ? null : 'empty'
                          }
                        />
                      </div>
                    )}
                    {memoryNote && !sending ? <ThoughtSummary note={memoryNote} /> : null}
                    {!sending && memoryConflicts.length > 0 && (
                      <ul className="space-y-2 pb-1">
                        {memoryConflicts.map((card) => (
                          <li key={card.id}>
                            <MemoryConflictNotice
                              card={card}
                              busy={resolvingConflictId === card.id}
                              onResolve={(decision) => void resolveConflict(card.id, decision)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                    <div ref={endRef} />
                  </div>
                </div>
                {!empty && ticks.length > 0 ? (
                  <div className="pointer-events-none absolute inset-y-0 right-1 z-10 flex items-start pt-6 lg:right-3">
                    <div className="pointer-events-auto max-h-full">
                      <ConversationTicksRail
                        ticks={ticks}
                        userLabel={activeRoleplay?.user_character_name?.trim() || '读者'}
                        assistantLabel={
                          isGroup ? '角色' : (activeRoleplay?.character_name ?? '角色')
                        }
                        onPick={(messageId) => setRollbackTarget({ messageId, mode: 'keep' })}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="px-4 pb-3 pt-1 lg:px-6">
                {error ? (
                  <div className="mx-auto mb-2 max-w-2xl">
                    <ChatErrorBanner
                      message={error}
                      busy={sending}
                      onRetry={
                        errorCanRetry
                          ? () => {
                              const content = errorRetryContent(lastSentRef.current, messages);
                              if (content) void sendContent(content, { retry: true });
                            }
                          : undefined
                      }
                      onDismiss={() => setError('')}
                    />
                  </div>
                ) : null}
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
                {rollbackNote ? (
                  <p className="mx-auto mb-2 max-w-2xl text-center text-[11px] text-zinc-500">
                    {rollbackNote}
                  </p>
                ) : null}
                {aiTakeover ? (
                  <p className="mx-auto mb-2 max-w-2xl text-center text-[11px] text-[#1e3a8a]">
                    正在替你演「{playingAsName || '这个角色'}」。打字或点「我来演」就会接回来。
                  </p>
                ) : null}
                {isGroup && keepTalking ? (
                  <p className="mx-auto mb-2 max-w-2xl text-center text-[11px] text-[#1e3a8a]">
                    他们正在自己聊。暂停交流或插话就会停；发送键上的停止才是取消这一句思考。
                  </p>
                ) : null}
                {isGroup && talkPaused ? (
                  <p className="mx-auto mb-2 max-w-2xl text-center text-[11px] text-amber-700">
                    交流已暂停，他们不会自己接着说。输入框发送即可接话；这不是取消思考。
                  </p>
                ) : null}
                {isGroup || canTakeover ? (
                  <div className="mx-auto mb-2 flex max-w-2xl flex-wrap items-center gap-1">
                    {canTakeover ? (
                      <button
                        type="button"
                        disabled={sending && !aiTakeover}
                        aria-label={aiTakeover ? '我来演' : `AI接管${playingAsName}`}
                        title={
                          aiTakeover
                            ? '接回来自己说。已经替你说的还在。'
                            : `让 AI 替你演「${playingAsName || '这个角色'}」。你打字就会接回来。`
                        }
                        className={`rounded-full px-2 py-0.5 text-[11px] disabled:opacity-40 ${
                          aiTakeover
                            ? 'bg-[#eef2ff] text-[#1e3a8a]'
                            : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                        }`}
                        onClick={() => {
                          if (aiTakeover) stopTakeover();
                          else void startTakeoverTalk();
                        }}
                      >
                        {aiTakeover ? '我来演' : 'AI 接管'}
                      </button>
                    ) : null}
                    {isGroup ? (
                      <>
                        <button
                          type="button"
                          title={
                            talkPaused
                              ? '让他们继续自己聊。不会取消正在生成的那一句。'
                              : '暂停他们互聊，方便你接话或想一想。不会取消正在生成的那一句。'
                          }
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            talkPaused
                              ? 'bg-amber-100 text-amber-800'
                              : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                          }`}
                          onClick={() => {
                            if (talkPaused) void resumeGroupTalk();
                            else pauseGroupTalk();
                          }}
                        >
                          {talkPaused ? '继续交流' : '暂停交流'}
                        </button>
                        <button
                          type="button"
                          aria-label={keepTalking ? '停下来' : '让他们一直说'}
                          title="他们按拍一直互聊，直到你暂停交流或插话。"
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            keepTalking
                              ? 'bg-[#eef2ff] text-[#1e3a8a]'
                              : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                          }`}
                          onClick={() => {
                            if (keepTalking) stopKeepTalking();
                            else void keepGroupTalking();
                          }}
                        >
                          {keepTalking ? '停下来' : '让他们一直说'}
                        </button>
                        {groupIds.map((id, index) => {
                          const name = groupNames[index] ?? id;
                          return (
                            <button
                              key={id}
                              type="button"
                              disabled={sending}
                              className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-[11px] text-[#1e3a8a] disabled:opacity-40"
                              onClick={() => void speakOne(id)}
                            >
                              让{name}说
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          disabled={sending}
                          className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 disabled:opacity-40"
                          onClick={() => void speakAll()}
                        >
                          让他们各说一句
                        </button>
                        {groupIds.map((id, index) => {
                          const name = groupNames[index] ?? id;
                          const muted = mutedIds.includes(id);
                          return (
                            <button
                              key={`mute-${id}`}
                              type="button"
                              className={`rounded-full px-2 py-0.5 text-[11px] ${
                                muted
                                  ? 'bg-zinc-200 text-zinc-500'
                                  : 'text-zinc-400 hover:bg-zinc-100'
                              }`}
                              onClick={() =>
                                setMutedIds((current) =>
                                  current.includes(id)
                                    ? current.filter((item) => item !== id)
                                    : [...current, id],
                                )
                              }
                            >
                              {muted ? `已静音 ${name}` : `先别让${name}说`}
                            </button>
                          );
                        })}
                      </>
                    ) : null}
                  </div>
                ) : null}
                <ChatComposer
                  value={input}
                  placeholder={
                    openingPlaceholder
                      ? openingPlaceholder
                      : !threadId
                        ? projects.length > 0
                          ? WEB_CHAT_NEEDS_WORLD
                          : WEB_CHAT_NEEDS_WORLD_EMPTY
                        : focus
                          ? `继续完善「${focus.name}」…`
                          : isGroup
                            ? talkPaused
                              ? `交流已暂停。以「${activeRoleplay?.user_character_name?.trim() || '读者'}」接话…`
                              : `以「${activeRoleplay?.user_character_name?.trim() || '读者'}」说话。他们会自己聊…`
                            : activeRoleplay
                              ? `对「${activeRoleplay.character_name}」说…`
                              : worldResources
                                ? '发给世界构建者，或输入 @ 引用实体…'
                                : '发给世界构建者…'
                  }
                  sending={sending}
                  canSend={canSend && !openingThread}
                  blocked={!threadId || openingThread}
                  interruptLabel={activeRoleplay ? '插话' : '补充'}
                  projectId={thread?.project_id}
                  settingsProjectId={settingsProjectId}
                  threadId={threadId}
                  messageTexts={messages.map((item) => item.content)}
                  effort={effort}
                  onEffortChange={(next) => {
                    setEffort(next);
                    writeStoredEffort(next);
                  }}
                  streaming={Boolean(streamText)}
                  stopped={stopped}
                  failed={Boolean(error)}
                  thinkingSpeaker={streamingSpeaker}
                  writeMode={writeMode}
                  onWriteModeChange={(next) => {
                    setWriteMode(next);
                    writeStoredWriteMode(next);
                  }}
                  onChange={(next) => {
                    setInput(next);
                    if (aiTakeover && next.length > 0) stopTakeover();
                  }}
                  onSubmit={() => void send()}
                  onStop={stopGeneration}
                  onNewChat={() => {
                    if (thread?.project_id) void startThread(undefined, thread.project_id);
                    else void pickFolder();
                  }}
                  resources={worldResources}
                  mentionEnabled={!activeRoleplay && Boolean(thread?.project_id)}
                  onMentionPick={(entity) => {
                    focusRef.current = entity;
                    setFocus(entity);
                  }}
                />
                <p className="mx-auto mt-2 max-w-2xl text-center text-[11px] text-zinc-400">
                  内容由 AI 生成，请仔细甄别
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      {roleplayPicker || groupPicker ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/30 p-4"
          onClick={() => {
            setRoleplayPicker(null);
            setGroupPicker(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-zinc-800">
                {groupPicker ? '开始群聊' : '开始扮演'}
              </h2>
              <button
                type="button"
                className="text-xs text-zinc-400 hover:text-zinc-700"
                onClick={() => {
                  setRoleplayPicker(null);
                  setGroupPicker(null);
                }}
              >
                关闭
              </button>
            </div>
            {pickerView === 'error' ? (
              <div className="space-y-3">
                <p className="text-sm text-red-600" role="alert">
                  {pickerLoadError || '无法加载角色列表'}
                </p>
                <button
                  type="button"
                  className="rounded-md border border-line px-2 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100"
                  onClick={() => setPickerReload((current) => current + 1)}
                >
                  重试
                </button>
              </div>
            ) : pickerView === 'loading' ? (
              <p className="text-sm text-zinc-500">正在查看这个世界的角色…</p>
            ) : groupPicker ? (
              <GroupChatLaunch
                projectId={groupPicker}
                characters={pickerAssets}
                worldEvents={pickerEvents}
                onNeedCharacter={() => {
                  setGroupPicker(null);
                  setRoleplayPicker(groupPicker);
                }}
                onCreated={(talkId) => {
                  setGroupPicker(null);
                  router.push(`/creator-chats/${talkId}`);
                }}
              />
            ) : playableCharacters(pickerAssets).length === 0 ? (
              <div className="space-y-3">
                {pickerImportError ? (
                  <p className="text-xs text-red-600" role="alert">
                    {pickerImportError}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="text-xs text-[#4d6bfe] hover:underline"
                  onClick={() => {
                    setPickerImportError('');
                    setPickerImportOpen(true);
                  }}
                >
                  从其他世界导入
                </button>
                <CreateCharacterForm
                  projectId={roleplayPicker!}
                  existingNames={pickerAssets.map((item) => item.name)}
                  onCreated={(character) => {
                    setPickerAssets((current) =>
                      current.some((item) => item.id === character.id)
                        ? current
                        : [character, ...current],
                    );
                    if (thread?.project_id === roleplayPicker) void reloadWorldResources();
                  }}
                  onOpenTalk={(talkId) => {
                    setRoleplayPicker(null);
                    router.push(`/creator-chats/${talkId}`);
                  }}
                  onCancel={() => setRoleplayPicker(null)}
                />
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-2">
                  {pickerImportError ? (
                    <p className="text-xs text-red-600" role="alert">
                      {pickerImportError}
                    </p>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    className="shrink-0 text-xs text-[#4d6bfe] hover:underline"
                    onClick={() => {
                      setPickerImportError('');
                      setPickerImportOpen(true);
                    }}
                  >
                    从其他世界导入
                  </button>
                </div>
                <ul className="grid max-h-[60vh] gap-3 overflow-y-auto">
                  {pickerAssets
                    .filter((item) => !item.tags?.includes('user_self'))
                    .map((character) => (
                      <li key={character.id} className="rounded-xl border border-zinc-200 p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-800">{character.name}</p>
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-zinc-500">
                              {characterCardPreview(character) || '这张角色卡还没有简介。'}
                            </p>
                          </div>
                          <Link
                            href={studioHrefForEntity(roleplayPicker!, {
                              kind: 'character',
                              id: character.id,
                            })}
                            className="shrink-0 text-[11px] text-[#4d6bfe] hover:underline"
                          >
                            改卡
                          </Link>
                        </div>
                        <RoleplayLaunchButton
                          projectId={roleplayPicker!}
                          characterAssetId={character.id}
                          characterName={character.name}
                          characters={pickerAssets}
                          worldEvents={pickerEvents}
                          align="start"
                        />
                      </li>
                    ))}
                </ul>
              </>
            )}
          </div>
        </div>
      ) : null}
      {pickerImportOpen && roleplayPicker ? (
        <ImportCharacterDialog
          currentProjectId={roleplayPicker}
          busy={pickerImportBusy}
          onCancel={() => setPickerImportOpen(false)}
          onConfirm={(sourceProjectId, sourceCharacterId) => {
            void importIntoRoleplayPicker(sourceProjectId, sourceCharacterId).then((ok) => {
              if (ok !== false) setPickerImportOpen(false);
            });
          }}
        />
      ) : null}
      {rollbackTarget ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/30 p-4"
          onClick={() => !rollbackBusy && setRollbackTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-sm font-medium text-zinc-800">
              {rollbackTarget.mode === 'withdraw' ? '撤回这一句' : '回退到这里'}
            </h2>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              {rollbackTarget.mode === 'withdraw'
                ? '当作你没发过：这一句和后面的对白都会拿掉。'
                : '这一句还在，它后面的对白当作没发生过。'}
            </p>
            {rollbackSummary ? (
              <ul className="mt-3 grid gap-1 text-xs text-zinc-600">
                <li>将拿掉 {rollbackSummary.dialogueCount} 句对白</li>
                {rollbackSummary.pendingCount > 0 ? (
                  <li>丢弃 {rollbackSummary.pendingCount} 张未确认提案</li>
                ) : null}
                {rollbackSummary.appliedTitles.length > 0 ? (
                  <li>尝试撤回本场写入：{rollbackSummary.appliedTitles.join('、')}</li>
                ) : null}
              </ul>
            ) : null}
            <p className="mt-2 text-[11px] text-zinc-400">
              后来在 Studio 里手改过的，或别的扮演还锚着的，会跳过并说明。不会删掉整个世界。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={rollbackBusy}
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-500"
                onClick={() => setRollbackTarget(null)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={rollbackBusy}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                onClick={() => void confirmRollback()}
              >
                {rollbackBusy ? '回退中…' : '确认回退'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** D4 内联冲突确认卡：内容对比 + 确认（保留新卡）/ 丢弃（保留已有卡）。 */
function MemoryConflictNotice({
  card,
  busy,
  onResolve,
}: {
  card: MemoryConflictCard;
  busy: boolean;
  onResolve: (decision: MemoryConflictDecision) => void;
}) {
  const [incoming, clash] = card.antonym;
  return (
    <div className="mx-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-5">
      <p className="font-medium text-amber-800">
        记忆冲突待确认
        {incoming && clash ? `：「${incoming}」vs「${clash}」` : ''}
      </p>
      <div className="mt-1.5 grid gap-1 text-zinc-700">
        <p className="break-words">
          <span className="mr-1.5 inline-flex rounded border border-amber-500/40 px-1 py-0.5 text-[10px] text-amber-700">
            新卡
          </span>
          {card.content}
        </p>
        {card.existing_content.trim() ? (
          <p className="break-words">
            <span className="mr-1.5 inline-flex rounded border border-line px-1 py-0.5 text-[10px] text-zinc-500">
              已有卡
            </span>
            {card.existing_content}
          </p>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onResolve('keep_new')}
          className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-800 transition hover:bg-amber-500/20 disabled:opacity-50"
        >
          确认，保留新卡
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onResolve('keep_existing')}
          className="rounded border border-line px-2 py-0.5 text-zinc-600 transition hover:border-accent/60 hover:text-accent disabled:opacity-50"
        >
          丢弃，保留已有卡
        </button>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">只写记忆卡，不会自动修改世界实体。</p>
    </div>
  );
}
