import type { Agent, AgentContext, AgentResult } from '@zivith/domain';

export interface AgentRuntimeOptions {
  now?: () => Date;
  monotonicNow?: () => number;
}

export class AgentRuntime {
  private readonly now: () => Date;
  private readonly monotonicNow: () => number;

  constructor(options: AgentRuntimeOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
  }

  async execute<I, O>(
    agent: Agent<I, O>,
    input: I,
    context: AgentContext,
  ): Promise<AgentResult<O>> {
    const startedAt = this.monotonicNow();
    const estimate = agent.estimate(input, context);
    const validation = agent.validate(input, context);
    if (!validation.valid) {
      return {
        status: 'failed',
        warnings: validation.issues.map((issue) => ({
          code: issue.code,
          message: issue.message,
          ...(issue.path ? { path: issue.path } : {}),
        })),
        metadata: {
          agent_id: agent.id,
          model_used: estimate.model,
          tokens_used: 0,
          duration_ms: this.monotonicNow() - startedAt,
          timestamp: this.now().toISOString(),
        },
      };
    }

    try {
      const result = await agent.execute(input, context);
      return {
        ...result,
        metadata: {
          ...result.metadata,
          agent_id: agent.id,
          duration_ms: this.monotonicNow() - startedAt,
          timestamp: this.now().toISOString(),
        },
      };
    } catch (error) {
      return {
        status: 'failed',
        warnings: [
          {
            code: 'AGENT_EXECUTION_FAILED',
            message: error instanceof Error ? error.message : 'Agent execution failed',
          },
        ],
        metadata: {
          agent_id: agent.id,
          model_used: estimate.model,
          tokens_used: 0,
          duration_ms: this.monotonicNow() - startedAt,
          timestamp: this.now().toISOString(),
        },
      };
    }
  }
}
