/**
 * Generic agent eval runner.
 *
 * Each agent ships a `goldens: GoldenCase<I, O>[]` array. The runner:
 *   1. Builds a minimal AgentContext (the LLM agents we care about don't
 *      call tools during eval — they just produce JSON).
 *   2. Calls `agent.invoke(input, ctx)`.
 *   3. Evaluates the case's predicate against the output.
 *   4. Records latency, tokens, cost, and a free-text reason on failure.
 *
 * Agents that call tools at runtime (recommendation in production uses
 * `search_menu` via the orchestrator) supply their candidates directly in
 * the golden's `input`, so the eval can run without a live DB.
 */

import type { Agent, GoldenCase } from '../../src/agents/_base/agent.js';
import { cartService, menuService, orderService, otpService, sessionService, userService } from '../../src/services/index.js';
import type { AgentContext } from '../../src/tools/context.js';

import type { AgentEvalResult, EvalCaseResult } from './types.js';

function buildEvalContext(): AgentContext {
  // Eval inputs already carry everything the agents need (candidate sets,
  // preferences, etc.). The context is here so type signatures match; in
  // practice these agents don't touch services during eval.
  return {
    callerAgent: 'orchestrator',
    sessionId: '00000000-0000-0000-0000-000000000000',
    tableId: 'EVAL',
    addedBy: 'eval-runner',
    services: {
      menu: menuService,
      session: sessionService,
      cart: cartService,
      order: orderService,
      otp: otpService,
    },
    toolTrace: [],
  };
}

export async function runAgentEval<I, O>(
  agent: Agent<I, O>,
  goldens: GoldenCase<I, O>[],
): Promise<AgentEvalResult> {
  const cases: EvalCaseResult[] = [];
  let totalLatencyMs = 0;
  let totalCostUsd = 0;
  const ctx = buildEvalContext();

  for (const g of goldens) {
    const start = Date.now();
    let caseResult: EvalCaseResult;
    try {
      const result = await agent.invoke(g.input, ctx);
      const elapsed = Date.now() - start;
      totalLatencyMs += elapsed;
      totalCostUsd += result.metrics.costUsd;

      const verdict = g.expect(result.output);
      const passed =
        typeof verdict === 'boolean' ? verdict : verdict.ok;
      const reason =
        typeof verdict === 'boolean'
          ? passed
            ? 'matches predicate'
            : 'predicate returned false'
          : verdict.reason ?? (passed ? 'ok' : 'failed');

      caseResult = {
        name: g.name,
        passed,
        reason,
        latencyMs: elapsed,
        tokensIn: result.metrics.tokensIn,
        tokensOut: result.metrics.tokensOut,
        costUsd: result.metrics.costUsd,
      };
    } catch (err) {
      const elapsed = Date.now() - start;
      totalLatencyMs += elapsed;
      caseResult = {
        name: g.name,
        passed: false,
        latencyMs: elapsed,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
    cases.push(caseResult);
  }

  const passed = cases.filter((c) => c.passed).length;
  return {
    agent: agent.metadata.name,
    model: agent.metadata.model,
    total: cases.length,
    passed,
    failed: cases.length - passed,
    passRate: cases.length === 0 ? 1 : passed / cases.length,
    totalLatencyMs,
    totalCostUsd,
    cases,
  };
}
