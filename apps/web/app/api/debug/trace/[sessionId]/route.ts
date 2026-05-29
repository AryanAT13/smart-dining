/**
 * Trace dump — returns the agent_traces for a session, newest first.
 * Gated by NEXT_PUBLIC_DEMO_MODE; returns 404 in production.
 */

import { z } from 'zod';

import { isDemoMode, prisma } from '@smart-dining/core';

import { jsonError, jsonOk, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ sessionId: z.string().uuid() });

export const GET = withErrors<{ sessionId: string }>(async (_req, { params }) => {
  if (!isDemoMode) return jsonError('NOT_FOUND', 'Not found', 404);
  const { sessionId } = ParamsSchema.parse(params);

  const traces = await prisma.agentTrace.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return jsonOk({
    traces: traces.map((t) => ({
      id: t.id,
      messageId: t.messageId,
      agent: t.agentName,
      model: t.model,
      temperature: t.temperature,
      latencyMs: t.latencyMs,
      tokensIn: t.tokensIn,
      tokensOut: t.tokensOut,
      costUsd: t.costUsd?.toNumber() ?? 0,
      input: t.input,
      output: t.output,
      toolCalls: t.toolCalls,
      error: t.error,
      createdAt: t.createdAt.toISOString(),
    })),
  });
});
