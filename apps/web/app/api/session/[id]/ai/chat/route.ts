/**
 * AI chat — single endpoint that POSTs a user message and immediately
 * streams back the orchestrator's response as SSE.
 *
 * Why one endpoint instead of POST-enqueue + GET-stream:
 *   - Simpler client (one fetch with stream reader)
 *   - No coordination state needed (no Redis-backed pending-job table)
 *   - SSE over POST is fine over HTTP/2 (Vercel + modern browsers handle it)
 *
 * Auth: sessionId from path, displayName from X-Display-Name header.
 * Anti-abuse: 20 requests/minute per session (handled by middleware in Phase 4;
 * the orchestrator's per-session budget cap is the immediate guardrail).
 */

import { randomUUID } from 'node:crypto';

import type { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  OrchestratorEmitter,
  prisma,
  runOrchestrator,
  persistTraces,
  sessionService,
  type OrchestratorInput,
} from '@smart-dining/core';
import { AiChatRequestSchema, type SseFrame } from '@smart-dining/shared';

import { jsonError } from '@/lib/server/route';

export const dynamic = 'force-dynamic';
// SSE responses run as long as the orchestrator. Keep the runtime patient.
export const maxDuration = 60;

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  let sessionId: string;
  let body: z.infer<typeof AiChatRequestSchema>;
  try {
    sessionId = ParamsSchema.parse(params).id;
    body = AiChatRequestSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError('VALIDATION', 'Invalid request', 400, {
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return jsonError('VALIDATION', 'Invalid request', 400);
  }

  // Resolve session up front so we fail fast on expired sessions.
  let session;
  try {
    session = await sessionService.assertActive(sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'session error';
    return jsonError('SESSION_EXPIRED', message, 410);
  }

  // Persist the user message immediately so the AI trace can FK to it.
  const userMessage = await prisma.message.create({
    data: {
      sessionId,
      sender: 'user',
      text: body.text,
    },
  });

  const input: OrchestratorInput = {
    sessionId,
    tableId: session.tableId,
    displayName: body.displayName,
    text: body.text,
    userMessageId: userMessage.id,
  };

  // ---------- SSE stream ----------
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emitter = new OrchestratorEmitter();
      let closed = false;

      const enqueue = (frame: SseFrame) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
        } catch {
          closed = true;
        }
      };

      emitter.on('frame', enqueue);
      emitter.on('error', (err) => {
        enqueue({ type: 'error', code: 'INTERNAL', message: err.message, recoverable: false });
      });

      // Heartbeat every 15s so proxies don't kill the connection.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          closed = true;
        }
      }, 15_000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });

      void (async () => {
        try {
          const state = await runOrchestrator(input, { emitter });

          // Persist the assistant message + agent traces.
          let assistantMessageId: string | null = null;
          if (state.assistantText) {
            const msg = await prisma.message.create({
              data: {
                sessionId,
                sender: 'assistant',
                text: state.assistantText,
                language: state.language,
                intent: state.intent,
                metadata: {
                  suggestions: state.suggestions,
                  cartActions: state.cartActions,
                  sentiment: state.sentiment,
                },
              },
            });
            assistantMessageId = msg.id;
          }
          await persistTraces(sessionId, assistantMessageId ?? userMessage.id, state.agentTraces);

          enqueue({
            type: 'done',
            messageId: assistantMessageId ?? userMessage.id,
            totalLatencyMs: state.totalLatencyMs,
          });
        } catch (err) {
          enqueue({
            type: 'error',
            code: 'INTERNAL',
            message: err instanceof Error ? err.message : 'orchestrator failed',
            recoverable: false,
          });
        } finally {
          closed = true;
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no', // for nginx-style proxies
      Connection: 'keep-alive',
    },
  });
}
