import { z } from 'zod';

import type { AgentContext } from './context.js';
import { toolRegistry } from './registry.js';

const ArgsSchema = z.object({
  cartItemId: z.string().uuid().describe('cart_items.id — NOT the menu item id'),
});

export interface RemoveFromCartResult {
  removed: boolean;
  cartSubtotal: number;
  cartTotal: number;
}

async function handler(
  args: z.infer<typeof ArgsSchema>,
  ctx: AgentContext,
): Promise<RemoveFromCartResult> {
  const cart = await ctx.services.cart.removeItem(args.cartItemId, ctx.addedBy);
  return { removed: true, cartSubtotal: cart.subtotal, cartTotal: cart.total };
}

toolRegistry.register({
  name: 'remove_from_cart',
  description:
    'Remove a specific cart line. Only call after the user has confirmed removal. Use get_cart first to look up the cartItemId.',
  argsSchema: ArgsSchema,
  allowedAgents: ['orchestrator'],
  handler,
});
