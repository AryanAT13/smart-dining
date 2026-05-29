import { z } from 'zod';

import { sessionService } from '@smart-dining/core/services';

import { jsonOk, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ tableId: z.string().min(1).max(20) });

export const GET = withErrors<{ tableId: string }>(async (_req, { params }) => {
  const { tableId } = ParamsSchema.parse(params);
  const session = await sessionService.getOrCreateForTable(tableId);
  return jsonOk({
    session: {
      id: session.id,
      tableId: session.tableId,
      status: session.status,
      preferences: session.preferences,
      language: session.language,
      expiresAt: session.expiresAt.toISOString(),
    },
  });
});

// POST has the same semantics — some clients prefer non-idempotent verbs
// for "create" operations. We treat it as a synonym.
export const POST = GET;
