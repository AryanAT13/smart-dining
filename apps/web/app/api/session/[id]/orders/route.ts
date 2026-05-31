/**
 * Order history for a session. Returns all orders placed under this
 * session ordered newest first. The session-tracking UI consumes this.
 */

import { z } from 'zod';

import { prisma } from '@smart-dining/core';

import { jsonOk, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const GET = withErrors<{ id: string }>(async (_req, { params }) => {
  const { id: sessionId } = ParamsSchema.parse(params);
  const orders = await prisma.order.findMany({
    where: { sessionId },
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
