/**
 * BaseAgent — common machinery for LLM-backed agents.
 *
 * Subclasses provide a system prompt (renderSystem()) and a user prompt
 * (renderUser()). BaseAgent handles:
 *   - input validation
 *   - chat-completion with schema-validated JSON output + repair retry
 *   - output validation against the agent's outputSchema
 *   - timing, cost accounting, tracing
 *
 * Deterministic agents (orderValidation, contextMemory) can skip this entirely
 * and implement `invoke` directly — see those agents for examples.
 */

import { chatJson } from '../../llm/json.js';
import { childLogger } from '../../lib/logger.js';
import type { AgentContext } from '../../tools/context.js';

import type { Agent, AgentInvokeResult, AgentMetadata, AgentSchema } from './agent.js';
import type { ZodSchema } from 'zod';

export interface BaseAgentInit<I, O> {
  metadata: AgentMetadata;
  inputSchema: AgentSchema<I>;
  outputSchema: ZodSchema<O>;
  renderSystem: (input: I, ctx: AgentContext) => string;
  renderUser: (input: I, ctx: AgentContext) => string;
  fewShot?: (input: I, ctx: AgentContext) => Array<{ user: string; assistant: string }>;
}

export class BaseAgent<I, O> implements Agent<I, O> {
  readonly metadata: AgentMetadata;
  readonly inputSchema: AgentSchema<I>;
  readonly outputSchema: ZodSchema<O>;
  private readonly init: BaseAgentInit<I, O>;
  private readonly log;

  constructor(init: BaseAgentInit<I, O>) {
    this.metadata = init.metadata;
    this.inputSchema = init.inputSchema;
    this.outputSchema = init.outputSchema;
    this.init = init;
    this.log = childLogger(`agent:${init.metadata.name}`);
  }

  async invoke(input: I, ctx: AgentContext): Promise<AgentInvokeResult<O>> {
    if (this.metadata.model === 'deterministic') {
      throw new Error(
        `Agent '${this.metadata.name}' is deterministic and must override invoke()`,
      );
    }

    // Validate input. Catching here keeps the orchestrator's error envelopes consistent.
    const parsedInput = this.inputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new Error(`Agent '${this.metadata.name}' input invalid: ${parsedInput.error.message}`);
    }
    const i = parsedInput.data;

    const t0 = Date.now();
    const systemPrompt = this.init.renderSystem(i, ctx);
    const userPrompt = this.init.renderUser(i, ctx);
    const fewShot = this.init.fewShot?.(i, ctx);

    const result = await chatJson({
      model: this.metadata.model,
      temperature: this.metadata.temperature,
      maxTokens: this.metadata.maxTokens,
      systemPrompt,
      userPrompt,
      schema: this.outputSchema,
      ...(fewShot ? { fewShot } : {}),
      repairAttempts: 1,
    });

    const latencyMs = Date.now() - t0;
    this.log.debug(
      { latencyMs, tokensIn: result.tokensIn, tokensOut: result.tokensOut, costUsd: result.costUsd },
      'agent invoked',
    );

    return {
      output: result.data,
      metrics: {
        latencyMs,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        retries: 0,
      },
    };
  }
}
