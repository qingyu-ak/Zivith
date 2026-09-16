// 扮演对话的世界变化起草（docs/planning/task-s25-roleplay-world-change.md）
//
// 起草器只**提议**，绝不写库：产物是 Proposal[]，落在 assistant 消息上等用户确认，
// 确认后经既有 proposals/:id/apply → proposal-applier 写入 draft 实体（ADR-0010 围栏）。
//
// v1 只起草 create_world_event / create_relationship（修订 9）。
// 分级（修订 12）：无密钥 / fast → 规则；balanced / deep → 对白结束后再调一次结构化 LLM，失败回落规则。
import { z } from 'zod';
import type { Proposal } from '@zivith/domain';
import type { LLMAdapter } from '../../ports/llm.js';
import type { EffectiveAgentEffort } from '../agent-effort.js';
import type { WorldContext } from '../world-builder/world-context.js';
import {
  eventTitleFromText,
  hasEventSignal,
  inferRelationshipKind,
  isQuestionOrSmallTalk,
  mentionedCharacters,
  mentionsRelationship,
} from '../world-builder/text-extract.js';

export interface RoleplayDraftInput {
  /** 用户这一轮说的话（世界变化的主要来源）。 */
  text: string;
  /** 角色这一轮的回复（LLM 起草时作为佐证；规则起草不用）。 */
  reply: string;
  world: WorldContext;
  /** 正在扮演的 AI 角色。 */
  character: { id: string; name: string };
  /** 用户扮演的角色卡；null = 读者。 */
  userCharacter: { id: string; name: string } | null;
  effort: EffectiveAgentEffort;
}

export interface RoleplayDraftResult {
  proposals: Proposal[];
  mode: 'none' | 'rule' | 'llm';
}

const RELATIONSHIP_DIRECTIONS = ['directed', 'undirected'] as const;

/** LLM 起草的结构化输出：只允许两种 kind，id 稍后再对照世界校验。 */
export const roleplayWorldChangeSchema = z
  .object({
    changes: z
      .array(
        z.discriminatedUnion('kind', [
          z
            .object({
              kind: z.literal('create_world_event'),
              title: z.string().trim().min(1).max(200),
              description: z.string().trim().max(2_000).optional(),
              character_ids: z.array(z.string().min(1).max(128)).max(16).default([]),
            })
            .strict(),
          z
            .object({
              kind: z.literal('create_relationship'),
              source_id: z.string().min(1).max(128),
              target_id: z.string().min(1).max(128),
              relation: z.string().trim().min(1).max(60),
              description: z.string().trim().max(1_000).optional(),
              direction: z.enum(RELATIONSHIP_DIRECTIONS).default('undirected'),
            })
            .strict(),
        ]),
      )
      .max(6)
      .default([]),
  })
  .strict();

export type RoleplayWorldChangeOutput = z.infer<typeof roleplayWorldChangeSchema>;

function characterSet(world: WorldContext): Map<string, { id: string; name: string }> {
  return new Map(world.characters.map((character) => [character.id, character]));
}

function relationshipExists(
  world: WorldContext,
  sourceId: string,
  targetId: string,
  kind: string,
): boolean {
  return world.relationships.some(
    (relationship) =>
      relationship.kind === kind &&
      ((relationship.sourceId === sourceId && relationship.targetId === targetId) ||
        (relationship.sourceId === targetId && relationship.targetId === sourceId)),
  );
}

/** 规则起草：用户明确说出一件事 → 事件；提到另一位角色 + 关系词 → 关系。 */
export function draftWorldChangesByRule(input: RoleplayDraftInput): Proposal[] {
  const text = input.text.trim();
  if (isQuestionOrSmallTalk(text)) return [];
  const projectId = input.world.projectId;
  const proposals: Proposal[] = [];

  const others = mentionedCharacters(text, input.world.characters).filter(
    (character) => character.id !== input.character.id,
  );
  const participantIds = [
    input.character.id,
    ...(input.userCharacter && /我|咱|自己/.test(text) ? [input.userCharacter.id] : []),
    ...others.map((character) => character.id),
  ];

  if (hasEventSignal(text)) {
    const title = eventTitleFromText(text, {
      you: input.character.name,
      me: input.userCharacter?.name ?? null,
    });
    if (title) {
      proposals.push({
        kind: 'create_world_event',
        project_id: projectId,
        payload: {
          title,
          description: `${text.slice(0, 500)}（来自与「${input.character.name}」的对话）`,
          character_ids: [...new Set(participantIds)],
        },
      });
    }
  }

  if (mentionsRelationship(text)) {
    const counterpart = others[0];
    if (counterpart) {
      const relation = inferRelationshipKind(text);
      if (!relationshipExists(input.world, input.character.id, counterpart.id, relation.kind)) {
        proposals.push({
          kind: 'create_relationship',
          project_id: projectId,
          payload: {
            kind: relation.kind,
            source: { type: 'asset', id: input.character.id },
            target: { type: 'asset', id: counterpart.id },
            direction: relation.direction,
            label: relation.label,
            description: text.slice(0, 500),
          },
        });
      }
    }
  }

  return proposals;
}

/** 把 LLM 输出对照世界校验：未知 id 丢弃、自指丢弃、已有关系丢弃。 */
export function sanitizeLlmChanges(
  output: RoleplayWorldChangeOutput,
  input: RoleplayDraftInput,
): Proposal[] {
  const known = characterSet(input.world);
  const projectId = input.world.projectId;
  const proposals: Proposal[] = [];
  for (const change of output.changes) {
    if (change.kind === 'create_world_event') {
      const ids = [...new Set([input.character.id, ...change.character_ids])].filter((id) =>
        known.has(id),
      );
      proposals.push({
        kind: 'create_world_event',
        project_id: projectId,
        payload: {
          title: change.title,
          ...(change.description ? { description: change.description } : {}),
          character_ids: ids,
        },
      });
      continue;
    }
    if (change.source_id === change.target_id) continue;
    if (!known.has(change.source_id) || !known.has(change.target_id)) continue;
    const kind = inferRelationshipKind(change.relation).kind;
    if (relationshipExists(input.world, change.source_id, change.target_id, kind)) continue;
    proposals.push({
      kind: 'create_relationship',
      project_id: projectId,
      payload: {
        kind,
        source: { type: 'asset', id: change.source_id },
        target: { type: 'asset', id: change.target_id },
        direction: change.direction,
        label: change.relation,
        ...(change.description ? { description: change.description } : {}),
      },
    });
  }
  return proposals;
}

export function buildRoleplayWorldChangePrompt(input: RoleplayDraftInput): string {
  const roster = input.world.characters
    .map((character) => `- [${character.id}] ${character.name}`)
    .join('\n');
  const relations = input.world.relationships
    .slice(0, 40)
    .map(
      (relationship) =>
        `- ${relationship.sourceId} —${relationship.label ?? relationship.kind}→ ${relationship.targetId}`,
    )
    .join('\n');
  return `你是「世界记录员」。一位用户正在与角色「${input.character.name}」（id ${input.character.id}）扮演对话；用户身份：${
    input.userCharacter
      ? `角色「${input.userCharacter.name}」（id ${input.userCharacter.id}）`
      : '读者'
  }。

任务：判断这一轮对话里，是否有**已经发生**在这个世界里的事，或**已经确立**的角色关系变化。有则整理成 changes，无则返回 {"changes": []}。

规则：
1. 只记录用户或角色明确陈述为已发生的事；疑问、假设、闲聊、情绪表达不算。
2. 每条事件一句中文标题（不超过 40 字，脱离对话也能读懂）+ 一两句描述；character_ids 只能用下方名单里的 id。
3. 关系只在两位**不同**角色之间；relation 用中文（如 师徒 / 恋人 / 对手 / 盟友 / 伙伴 / 家人）。已存在同类关系不要重复。
4. 不新建角色、不新建地点、不改角色设定。不确定就不写。
5. 最多 ${input.effort.schedule.max_proposals} 条。

## 角色名单
${roster || '（无）'}

## 已有关系
${relations || '（无）'}

## 本轮对话
用户：${input.text}
${input.character.name}：${input.reply}`;
}

export async function draftRoleplayWorldChanges(
  llm: LLMAdapter,
  model: string,
  input: RoleplayDraftInput,
  options: { onLlmError?: (error: unknown) => void } = {},
): Promise<RoleplayDraftResult> {
  const cap = Math.max(0, input.effort.schedule.max_proposals);
  if (cap === 0) return { proposals: [], mode: 'none' };

  const useLlm = llm.provider !== 'mock' && input.effort.effective_level !== 'fast';
  if (useLlm) {
    try {
      const completion = await llm.completeStructured(
        {
          request_id: `roleplay-world-change:${Date.now()}`,
          model,
          system_prompt: buildRoleplayWorldChangePrompt(input),
          user_prompt: JSON.stringify({
            required_schema: {
              changes: [
                {
                  kind: 'create_world_event',
                  title: '事件标题',
                  description: '一两句描述',
                  character_ids: ['角色 id'],
                },
                {
                  kind: 'create_relationship',
                  source_id: '角色 id',
                  target_id: '另一位角色 id',
                  relation: '关系（中文）',
                  description: '可选',
                  direction: 'undirected',
                },
              ],
            },
          }),
          temperature: 0.2,
          max_tokens: 800,
        },
        roleplayWorldChangeSchema,
      );
      // 重新 parse 让 default（character_ids / direction / changes）落实。
      const parsed = roleplayWorldChangeSchema.parse(completion.data);
      const proposals = sanitizeLlmChanges(parsed, input).slice(0, cap);
      return { proposals, mode: 'llm' };
    } catch (error) {
      options.onLlmError?.(error);
      // 回落规则：起草失败不影响对白。
    }
  }
  const proposals = draftWorldChangesByRule(input).slice(0, cap);
  return { proposals, mode: proposals.length > 0 ? 'rule' : 'none' };
}
