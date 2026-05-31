/**
 * Latest assistant messages for a session, optionally since a timestamp.
 *
 * Used by the chat store as a polling fallback for upsells. Sockets are
 * the primary delivery mechanism (`ai:message` on `table:{tableId}`), but
 * if the socket is still connecting when the upsell fires, the broadcast
 * is missed. The poll path catches those misses within a few seconds.
 *
 * Query params:
 *   - since (ISO timestamp, optional): only return messages created after this
 *   - limit (default 10, max 50)
 */

import { z } from 'zod';

import { prisma } from '@smart-dining/core';

import { jsonOk, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });
const QuerySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const GET = withErrors<{ id: string }>(async (req, { params }) => {
  const { id: sessionId } = ParamsSchema.parse(params);
  const url = req.nextUrl;
  const parsed = QuerySchema.parse({
    since: url.searchParams.get('since') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });

  const where: { sessionId: string; sender: 'assistant'; createdAt?: { gt: Date } } = {
    sessionId,
    sender: 'assistant',
  };
  if (parsed.since) where.createdAt = { gt: new Date(parsed.since) };

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: parsed.limit,
  });

  return jsonOk({
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      text: m.text,
      intent: m.intent,
      metadata: m.metadata,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});
