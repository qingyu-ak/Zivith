import { z } from 'zod';

export const memoryRefineSchema = z
  .object({
    atoms: z
      .array(
        z
          .object({
            index: z.number().int().min(0),
            content: z.string().trim().min(1).max(500),
            fact_type: z.enum([
              'trait',
              'desire',
              'event',
              'relation',
              'rule',
              'preference',
              'constraint',
              'episodic',
            ]),
            entity_name: z.string().trim().max(200).nullable(),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();

export type MemoryRefineResult = z.infer<typeof memoryRefineSchema>;

export const MEMORY_REFINE_SYSTEM_PROMPT = `你是记忆精炼器。输入是从创作者对话中切分出的事实片段与已知实体清单。
请修正切分错误、补全主语、判断事实类型，并把每个片段链接到已知实体。
只输出 JSON：{ "atoms": [{ "index": number, "content": string, "fact_type": "trait|desire|event|relation|rule|preference|constraint|episodic", "entity_name": string|null }] }
要求：content 为 ≤200 字的中文陈述句；entity_name 只能取自输入实体清单（找不到填 null）；不臆造新事实；不改变原意。`;

export const MEMORY_SUMMARY_SYSTEM_PROMPT = `你是创作对话压缩器。把「已有摘要 + 新淘汰的对话轮次」合并为一段 ≤400 字的中文摘要。
要求：保留全部事实（人名、地名、事件、关系、决定）；按发生顺序；不评论、不扩写。只输出 JSON：{ "summary": string }`;

export const memorySummarySchema = z
  .object({ summary: z.string().trim().min(1).max(2_000) })
  .strict();

export type MemorySummaryResult = z.infer<typeof memorySummarySchema>;

/** L2 聚合的 kind 映射（设计文档 §5.3 同款）。 */
export function coreKindForEntityType(entityType: string | null): string {
  switch (entityType) {
    case 'character':
      return 'persona';
    case 'project':
      return 'world_rule';
    case 'world_event':
      return 'event_chain';
    default:
      return 'scenario';
  }
}
