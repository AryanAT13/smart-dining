import { z } from 'zod';

import { cartService } from '@smart-dining/core/services';
import { triggerPostAddUpsell } from '@smart-dining/core';
import { AddCartItemRequestSchema } from '@smart-dining/shared';

import { jsonOk, parseBody, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const GET = withErrors<{ id: string }>(async (_req, { params }) => {
  const { id } = ParamsSchema.parse(params);
  const cart = await cartService.getCart(id);
  return jsonOk({ cart });
});

export const POST = withErrors<{ id: string }>(async (req, { params }) => {
  const { id } = ParamsSchema.parse(params);
  const body = await parseBody(req, AddCartItemRequestSchema);
  const { cart, addedLine } = await cartService.addItem({
    sessionId: id,
    menuItemId: body.menuItemId,
    quantity: body.quantity,
    addedBy: body.addedBy,
    ...(body.specialInstructions !== undefined
      ? { specialInstructions: body.specialInstructions }
      : {}),
  });

  // Fire-and-forget upsell trigger. Never await — must not slow the response.
  void triggerPostAddUpsell({
    sessionId: id,
    tableId: cart.tableId,
    addedBy: body.addedBy,
    addedMenuItemId: addedLine.menuItem.id,
    addedMenuItemName: addedLine.menuItem.name,
  });

  return jsonOk({ cart, addedLine }, { status: 201 });
});
