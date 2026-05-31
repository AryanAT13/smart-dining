/**
 * Orders for a table across ALL sessions in the last 6 hours.
 *
 * After a checkout, the current session is marked `ordered` and the diner
 * gets a fresh session on the next interaction. The OrdersPill needs to
 * surface those past orders too, otherwise the diner loses track of what
 * they already ordered (this was the "every order vanishes on refresh"
 * complaint).
 *
 * Scope: 6-hour window keyed on the table id (normalised uppercase).
 * Plenty for a single sitting, conservative enough that yesterday's
 * orders don't bleed into today's.
 */

import { z } from 'zod';

import { prisma } from '@smart-dining/core';

import { jsonOk, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ tableId: z.string().min(1).max(20) });

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export const GET = withErrors<{ tableId: string }>(async (_req, { params }) => {
  const { tableId } = ParamsSchema.parse(params);
  const normalised = tableId.toUpperCase();
  const since = new Date(Date.now() - SIX_HOURS_MS);

  const orders = await prisma.order.findMany({
    where: {
      session: { tableId: normalised },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });

  return jsonOk({
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      subtotalAmount: o.subtotalAmount.toNumber(),
      taxAmount: o.taxAmount.toNumber(),
      totalAmount: o.totalAmount.toNumber(),
      estimatedWaitMinutes: o.estimatedWaitMinutes,
      createdAt: o.createdAt.toISOString(),
      itemCount: o.items.reduce((acc, it) => acc + it.quantity, 0),
      items: o.items.map((it) => ({
        menuItemId: it.menuItemId,
        name: it.nameSnapshot,
        price: it.priceSnapshot.toNumber(),
        quantity: it.quantity,
        specialInstructions: it.specialInstructions,
      })),
    })),
  });
});
