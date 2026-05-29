/**
 * Trace persistence — writes agent_traces rows after the orchestrator run.
 * The traces power the /debug/trace UI and the eval harness.
 */

import { prisma } from '../db/client.js';
import { childLogger } from '../lib/logger.js';

import type { AgentTraceRecord } from './state.js';

const log = childLogger('trace');

export async function persistTraces(
  sessionId: string,
  messageId: string,
  traces: AgentTraceRecord[],
): Promise<void> {
  if (traces.length === 0) return;
  try {
    await prisma.agentTrace.createMany({
      data: traces.map((t) => ({
        sessionId,
        messageId,
        agentName: t.agent,
        model: t.model,
        temperature: t.temperature,
        tokensIn: t.tokensIn,
        tokensOut: t.tokensOut,
        latencyMs: t.latencyMs,
        input: t.inputPreview as object,
        output: t.outputPreview as object,
        toolCalls: t.toolCalls as object,
        error: t.error ?? null,
        costUsd: t.costUsd,
      })),
    });
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), traceCount: traces.length },
      'failed to persist agent traces',
    );
  }
}

/**
 * Lightweight preview helper — keeps payloads bounded so the DB doesn't
 * inflate. We only store enough to reconstruct the timeline.
 */
export function previewForTrace(value: unknown, maxLen = 600): unknown {
  const json = JSON.stringify(value ?? null);
  if (json.length <= maxLen) {
    try {
      return JSON.parse(json);
    } catch {
      return value;
    }
  }
  return { _truncated: true, preview: json.slice(0, maxLen) + '…' };
}
