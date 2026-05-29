/**
 * Agent contract.
 *
 * Every agent in `packages/core/src/agents/<name>/` implements this interface.
 * The shape is intentionally narrow: input → output, with metadata.
 *
 * Why an interface, not a base class: it forces each agent to think about
 * its schemas and persona explicitly rather than inheriting defaults that
 * silently apply.
 */

import type { ZodSchema, ZodTypeDef, z } from 'zod';

import type { AgentName } from '@smart-dining/shared';

import type { AgentContext } from '../../tools/context.js';

/**
 * Schema type that allows different input vs. output shapes — required so
 * agents using `.default()` in their input schemas typecheck cleanly.
 */
export type AgentSchema<T> = z.ZodType<T, ZodTypeDef, unknown>;

export interface AgentMetadata {
  name: AgentName;
  /** One-line "role" — surfaces in trace UI. */
  description: string;
  model: 'gpt-4o' | 'gpt-4o-mini' | 'deterministic';
  temperature: number;
  maxTokens: number;
}

export interface AgentInvokeResult<O> {
  output: O;
  /** Aggregated metrics from this invocation (and any retries). */
  metrics: {
    latencyMs: number;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    retries: number;
  };
}

export interface Agent<I, O> {
  metadata: AgentMetadata;
  inputSchema: AgentSchema<I>;
  outputSchema: ZodSchema<O>;
  invoke(input: I, ctx: AgentContext): Promise<AgentInvokeResult<O>>;
}

/**
 * Golden test case — consumed by `pnpm eval`.
 * Each agent ships an array under `golden.ts`.
 */
export interface GoldenCase<I, O> {
  /** Short label visible in the eval output. */
  name: string;
  input: I;
  /** Predicate over the produced output; allows fuzzy / structural assertions. */
  expect: (output: O) => boolean | { ok: boolean; reason?: string };
  /** Optional explicit context overrides (preferences, language). */
  ctxPatches?: Partial<{ preferences: Record<string, unknown>; language: string }>;
}
