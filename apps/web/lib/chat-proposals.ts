import type { ProposalKind } from './types';

/**
 * 提案消息解析（Creator Chat 与 Studio Agent 面板共用）。
 * assistant 消息的 proposal 字段可能是单对象或多对象数组；只接受已知 kind。
 */

export const PROPOSAL_KINDS: ProposalKind[] = [
  'create_project',
  'create_world_event',
  'create_character',
  'create_location',
  'create_scene',
  'create_relationship',
  'update_entity',
];

export interface ChatProposal {
  kind: ProposalKind;
  payload: Record<string, unknown>;
}

export interface ParsedProposals {
  proposals: ChatProposal[];
  applied: boolean;
  rejected: boolean;
}

export function parseProposals(message: {
  proposal?: unknown;
  proposal_state?: unknown;
}): ParsedProposals {
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
  return {
    proposals,
    applied: message.proposal_state === 'applied',
    rejected: message.proposal_state === 'rejected',
  };
}

const PROPOSAL_KIND_LABEL: Record<ProposalKind, string> = {
  create_project: '项目',
  create_world_event: '事件',
  create_character: '角色',
  create_location: '地点',
  create_scene: '场景',
  create_relationship: '关系',
  update_entity: '更新',
};

const UPDATE_TYPE_LABEL: Record<string, string> = {
  project: '项目',
  world_event: '事件',
  character: '角色',
  location: '地点',
  scene: '场景',
  story: '故事',
  relationship: '关系',
};

const FIELD_LABEL: Record<string, string> = {
  name: '名称',
  title: '标题',
  description: '描述',
  aliases: '别名',
  tags: '标签',
  label: '关系',
  kind: '类型',
  direction: '方向',
  worldview: '世界观',
  world_time_envelope: '世界时间',
  character_ids: '参与角色',
  scene_ids: '关联场景',
  presentation_order: '顺序',
  data: '设定',
  personality: '性格',
  default_outfit: '常服',
  stage_label: '阶段',
  logline: '一句话梗概',
  synopsis: '概要',
  genre: '题材',
  theme: '主题',
  tone: '基调',
  time: '时间',
  weather: '天气',
  mood: '氛围',
};

function pickString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** 提案条目名：实体名 / 标题 / 关系标签 / fields 里的名字。 */
export function proposalEntityName(payload: Record<string, unknown>): string {
  const fields = payload.fields;
  const fromFields =
    typeof fields === 'object' && fields !== null
      ? (pickString(fields as Record<string, unknown>, 'name') ??
        pickString(fields as Record<string, unknown>, 'title'))
      : null;
  return (
    pickString(payload, 'name') ??
    pickString(payload, 'title') ??
    pickString(payload, 'label') ??
    fromFields ??
    '未命名'
  );
}

export type EntityNameLookup = Pick<Map<string, string>, 'get'>;

function nameOf(id: unknown, names?: EntityNameLookup): string {
  if (typeof id !== 'string' || !id) return '（未指定）';
  return names?.get(id) ?? id;
}

function refName(ref: unknown, names?: EntityNameLookup): string {
  if (typeof ref !== 'object' || ref === null) return '（未指定）';
  return nameOf((ref as { id?: unknown }).id, names);
}

function formatFieldValue(value: unknown, names?: EntityNameLookup): string {
  if (value === null || value === undefined) return '（清空）';
  if (typeof value === 'string') return value.trim() || '（清空）';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '（清空）';
    return value
      .map((item) => (typeof item === 'string' ? nameOf(item, names) : String(item)))
      .join('、');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '（空）';
    return entries
      .map(([key, item]) => `${FIELD_LABEL[key] ?? key}：${formatFieldValue(item, names)}`)
      .join('；');
  }
  // bigint / symbol / function：提案 payload 来自 JSON，正常不会走到这里。
  return typeof value === 'bigint' ? value.toString() : '（无法显示）';
}

export interface ProposalDescription {
  /** 一行标题：「事件「灯塔失火」」。 */
  headline: string;
  /** 展开后逐行列出的内容（确认前必须能看到改了什么，task-s25 修订 10）。 */
  details: string[];
}

/** 把提案翻成用户能读的中文：事件列标题 / 描述 / 参与者，关系列双方，更新列每个字段。 */
export function describeProposal(
  proposal: ChatProposal,
  names?: EntityNameLookup,
): ProposalDescription {
  const { kind, payload } = proposal;
  const details: string[] = [];
  if (kind === 'update_entity') {
    const type = typeof payload.type === 'string' ? payload.type : '';
    const typeLabel = UPDATE_TYPE_LABEL[type] ?? '实体';
    const target = nameOf(payload.id, names);
    const fields =
      typeof payload.fields === 'object' && payload.fields !== null
        ? (payload.fields as Record<string, unknown>)
        : {};
    for (const [key, value] of Object.entries(fields)) {
      details.push(`${FIELD_LABEL[key] ?? key} → ${formatFieldValue(value, names)}`);
    }
    if (details.length === 0) details.push('（没有具体字段）');
    return { headline: `更新${typeLabel}「${target}」`, details };
  }
  if (kind === 'create_relationship') {
    const source = refName(payload.source, names);
    const target = refName(payload.target, names);
    const label = pickString(payload, 'label') ?? pickString(payload, 'kind') ?? '关联';
    const arrow = payload.direction === 'directed' ? '→' : '↔';
    details.push(`${source} ${arrow} ${target}：${label}`);
    const description = pickString(payload, 'description');
    if (description) details.push(description);
    return { headline: `关系「${source} ${arrow} ${target} · ${label}」`, details };
  }
  if (kind === 'create_world_event') {
    const title = proposalEntityName(payload);
    const description = pickString(payload, 'description');
    if (description) details.push(description);
    const participants = Array.isArray(payload.character_ids)
      ? payload.character_ids.filter((id): id is string => typeof id === 'string')
      : [];
    if (participants.length > 0) {
      details.push(`参与角色：${participants.map((id) => nameOf(id, names)).join('、')}`);
    }
    if (details.length === 0) details.push('（没有描述）');
    return { headline: `事件「${title}」`, details };
  }
  const description = pickString(payload, 'description');
  if (description) details.push(description);
  return {
    headline: `${PROPOSAL_KIND_LABEL[kind] ?? kind}「${proposalEntityName(payload)}」`,
    details,
  };
}

/** 一轮提案收成一行时的条目标题。单项优先用实体名，多项收成「N 项变更」。 */
export function proposalBarLabel(count: number, singleLine?: string): string {
  if (count <= 0) return '';
  if (count === 1 && singleLine?.trim()) return singleLine.trim();
  return `${count} 项变更`;
}

export function isUnconfirmedProposal(message: {
  proposal?: unknown;
  proposal_state?: unknown;
}): boolean {
  const parsed = parseProposals(message);
  return parsed.proposals.length > 0 && !parsed.applied && !parsed.rejected;
}

export function unconfirmedProposalCount(
  threadId: string,
  threads: Array<{ id: string; pending_proposal_count?: number }>,
  currentThreadId: string | null,
  currentMessages: Array<{ proposal?: unknown; proposal_state?: unknown }>,
): number {
  if (threadId === currentThreadId) {
    return currentMessages.filter(isUnconfirmedProposal).length;
  }
  return threads.find((thread) => thread.id === threadId)?.pending_proposal_count ?? 0;
}

function nestedError(
  error: unknown,
): { code?: string; details?: unknown; message?: string } | null {
  if (typeof error !== 'object' || error === null) return null;
  const record = error as { details?: unknown; message?: string };
  const payload = 'details' in record ? record.details : error;
  if (typeof payload !== 'object' || payload === null) return null;
  const wrapped = payload as { error?: { code?: unknown; details?: unknown; message?: unknown } };
  if (typeof wrapped.error !== 'object' || wrapped.error === null) {
    const direct = payload as { code?: unknown; details?: unknown };
    return {
      code: typeof direct.code === 'string' ? direct.code : undefined,
      details: direct.details,
    };
  }
  return {
    code: typeof wrapped.error.code === 'string' ? wrapped.error.code : undefined,
    details: wrapped.error.details,
    message: typeof wrapped.error.message === 'string' ? wrapped.error.message : undefined,
  };
}

/** 自动写入与手点确认撞车时，409 表示对面已经处理完，应对齐卡片而不是报错。 */
export function handledProposalState(error: unknown): 'applied' | 'rejected' | null {
  const nested = nestedError(error);
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : NaN;
  const message = nested?.message ?? (error instanceof Error ? error.message : '');
  const isHandled =
    nested?.code === 'PROPOSAL_ALREADY_HANDLED' ||
    (status === 409 && message.includes('提案已处理'));
  if (!isHandled) return null;
  const details = nested?.details;
  if (typeof details === 'object' && details !== null) {
    const state = (details as { proposal_state?: unknown }).proposal_state;
    if (state === 'rejected') return 'rejected';
    if (state === 'applied') return 'applied';
  }
  return 'applied';
}
