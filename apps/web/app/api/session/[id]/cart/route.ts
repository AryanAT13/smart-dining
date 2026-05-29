import { z } from 'zod';

import { cartService } from '@smart-dining/core/services';
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
  return jsonOk({ cart, addedLine }, { status: 201 });
});
