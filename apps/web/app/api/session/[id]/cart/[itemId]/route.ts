import { z } from 'zod';

import { cartService } from '@smart-dining/core/services';
import { UpdateCartItemRequestSchema } from '@smart-dining/shared';

import { jsonOk, parseBody, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
});

export const PATCH = withErrors<{ id: string; itemId: string }>(async (req, { params }) => {
  const { itemId } = ParamsSchema.parse(params);
  const body = await parseBody(req, UpdateCartItemRequestSchema);
  const updatedBy = req.headers.get('X-Display-Name') ?? 'Guest';

  const cart = await cartService.updateItem(
    {
      cartItemId: itemId,
      expectedVersion: body.expectedVersion,
      ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
      ...(body.specialInstructions !== undefined
        ? { specialInstructions: body.specialInstructions }
        : {}),
    },
    updatedBy,
  );
  return jsonOk({ cart });
});

export const DELETE = withErrors<{ id: string; itemId: string }>(async (req, { params }) => {
  const { itemId } = ParamsSchema.parse(params);
  const removedBy = req.headers.get('X-Display-Name') ?? 'Guest';
  const cart = await cartService.removeItem(itemId, removedBy);
  return jsonOk({ cart });
});
